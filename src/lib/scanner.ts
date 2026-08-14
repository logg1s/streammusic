import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  albums,
  artists,
  connections,
  scanItems,
  scanJobs,
  scanRoots,
  tracks,
  type Connection,
  type ScanItem,
} from "@/db/schema";
import { getValidAccessToken } from "@/lib/connections";
import { hashPicture, uploadCover } from "@/lib/cover-art";
import { inferFromPath, readRemoteMetadata } from "@/lib/metadata";
import { getProvider, type RemoteFile } from "@/lib/providers";

/** Số file đọc tag song song trong một lô. Chủ yếu chờ mạng nên để cao được. */
const READ_CONCURRENCY = 8;
/**
 * Hạn thời gian cho toàn bộ việc đọc tag của MỘT file.
 *
 * Lớp phòng thủ thứ hai sau timeout từng request trong metadata.ts: một file
 * bệnh sẽ bị đánh dấu failed và lần quét đi tiếp, thay vì treo cả lô.
 */
const PER_FILE_TIMEOUT_MS = 45_000;
/** Chặn trên số file mỗi lần quét, tránh một job chạy vô tận. */
const MAX_FILES_PER_SCAN = 20_000;

/* ------------------------------------------------------------------ */
/* Bắt đầu một lần quét                                                */
/* ------------------------------------------------------------------ */

export async function startScan(
  userId: string,
  connection: Connection,
): Promise<{ jobId: string; totalFiles: number }> {
  const db = getDb();

  const [job] = await db
    .insert(scanJobs)
    .values({ userId, connectionId: connection.id, status: "listing" })
    .returning();

  try {
    const roots = await db
      .select()
      .from(scanRoots)
      .where(eq(scanRoots.connectionId, connection.id));

    const provider = getProvider(connection.provider);
    // Chưa chọn thư mục nào thì quét từ gốc.
    const rootIds =
      roots.length > 0
        ? roots.map((r) => r.remoteId)
        : [provider.rootFolderId];

    const accessToken = await getValidAccessToken(connection);
    const seen = new Set<string>();
    let buffer: RemoteFile[] = [];
    let total = 0;

    const flush = async () => {
      if (buffer.length === 0) return;
      await db.insert(scanItems).values(
        buffer.map((f) => ({
          jobId: job.id,
          remoteId: f.id,
          remoteRev: f.rev,
          path: f.path,
          fileName: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
        })),
      );
      buffer = [];
    };

    outer: for (const rootId of rootIds) {
      for await (const file of provider.listAudioFiles(accessToken, rootId)) {
        // Thư mục gốc có thể chồng lấn nhau → chặn trùng file.
        if (seen.has(file.id)) continue;
        seen.add(file.id);

        buffer.push(file);
        total++;
        if (buffer.length >= 500) await flush();
        if (total >= MAX_FILES_PER_SCAN) break outer;
      }
    }
    await flush();

    await db
      .update(scanJobs)
      .set({ status: "processing", totalFiles: total })
      .where(eq(scanJobs.id, job.id));

    return { jobId: job.id, totalFiles: total };
  } catch (error) {
    await db
      .update(scanJobs)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      })
      .where(eq(scanJobs.id, job.id));
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Xử lý một lô                                                        */
/* ------------------------------------------------------------------ */

export interface BatchResult {
  processed: number;
  skipped: number;
  failed: number;
  remaining: number;
  done: boolean;
}

export async function processBatch(
  userId: string,
  jobId: string,
  batchSize: number,
): Promise<BatchResult> {
  const db = getDb();

  const [job] = await db
    .select()
    .from(scanJobs)
    .where(and(eq(scanJobs.id, jobId), eq(scanJobs.userId, userId)))
    .limit(1);
  if (!job) throw new Error("Không tìm thấy job quét");

  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, job.connectionId))
    .limit(1);
  if (!connection) throw new Error("Kết nối đã bị xoá");

  const items = await db
    .select()
    .from(scanItems)
    .where(and(eq(scanItems.jobId, jobId), eq(scanItems.state, "pending")))
    .limit(batchSize);

  if (items.length === 0) {
    await finishJob(jobId);
    return { processed: 0, skipped: 0, failed: 0, remaining: 0, done: true };
  }

  const provider = getProvider(connection.provider);
  const accessToken = await getValidAccessToken(connection);

  // Bài đã có trong DB với cùng remoteRev thì bỏ qua — đây là thứ làm lần quét
  // thứ hai nhanh hơn hẳn lần đầu.
  const existing = await db
    .select({
      remoteId: tracks.remoteId,
      remoteRev: tracks.remoteRev,
    })
    .from(tracks)
    .where(
      and(
        eq(tracks.connectionId, connection.id),
        inArray(
          tracks.remoteId,
          items.map((i) => i.remoteId),
        ),
      ),
    );
  const existingRev = new Map(existing.map((t) => [t.remoteId, t.remoteRev]));

  const outcomes = await mapWithConcurrency(
    items,
    READ_CONCURRENCY,
    async (item) => {
      const previousRev = existingRev.get(item.remoteId);
      if (previousRev !== undefined && previousRev === item.remoteRev) {
        return { item, state: "skipped" as const };
      }
      try {
        const target = await provider.resolveStream(accessToken, item.remoteId);
        const metadata = await withTimeout(
          readRemoteMetadata({
            url: target.url,
            headers: target.kind === "proxy" ? target.headers : undefined,
            sizeBytes: item.sizeBytes,
            mimeType: item.mimeType,
            fileName: item.fileName,
          }),
          PER_FILE_TIMEOUT_MS,
          `Quá hạn khi đọc tag của ${item.fileName}`,
        );
        return { item, state: "done" as const, metadata };
      } catch (error) {
        return {
          item,
          state: "failed" as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  // Ghi DB tuần tự: tránh hai file cùng album chạy đua tạo trùng bản ghi album.
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const outcome of outcomes) {
    if (outcome.state === "skipped") {
      skipped++;
      await markItem(outcome.item.id, "skipped");
      continue;
    }
    if (outcome.state === "failed") {
      failed++;
      await markItem(outcome.item.id, "failed", outcome.error);
      continue;
    }
    try {
      await upsertTrack(userId, connection.id, outcome.item, outcome.metadata);
      processed++;
      await markItem(outcome.item.id, "done");
    } catch (error) {
      failed++;
      await markItem(
        outcome.item.id,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  await db
    .update(scanJobs)
    .set({
      processedFiles: job.processedFiles + processed,
      skippedFiles: job.skippedFiles + skipped,
      failedFiles: job.failedFiles + failed,
    })
    .where(eq(scanJobs.id, jobId));

  const [{ count: remaining }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scanItems)
    .where(and(eq(scanItems.jobId, jobId), eq(scanItems.state, "pending")));

  if (remaining === 0) await finishJob(jobId);

  return { processed, skipped, failed, remaining, done: remaining === 0 };
}

async function markItem(
  itemId: string,
  state: ScanItem["state"],
  error?: string,
) {
  await getDb()
    .update(scanItems)
    .set({ state, error: error?.slice(0, 500) ?? null })
    .where(eq(scanItems.id, itemId));
}

async function finishJob(jobId: string) {
  await getDb()
    .update(scanJobs)
    .set({ status: "completed", finishedAt: new Date() })
    .where(eq(scanJobs.id, jobId));
}

/* ------------------------------------------------------------------ */
/* Ghi vào thư viện                                                    */
/* ------------------------------------------------------------------ */

type Metadata = Awaited<ReturnType<typeof readRemoteMetadata>>;

async function upsertTrack(
  userId: string,
  connectionId: string,
  item: ScanItem,
  metadata: Metadata,
) {
  const inferred = inferFromPath(item.fileName, item.path);

  const title = metadata.title ?? inferred.title;
  const artistName = metadata.albumArtist ?? metadata.artist ?? inferred.artist;
  const albumName = metadata.album ?? inferred.album;

  const artistId = artistName ? await getOrCreateArtist(userId, artistName) : null;
  const albumId = albumName
    ? await getOrCreateAlbum(userId, artistId, albumName, metadata.year, metadata.picture)
    : null;

  const values = {
    userId,
    connectionId,
    remoteId: item.remoteId,
    remoteRev: item.remoteRev,
    path: item.path,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    title,
    artistId,
    albumId,
    artistName: metadata.artist ?? artistName,
    albumName,
    trackNo: metadata.trackNo ?? inferred.trackNo,
    discNo: metadata.discNo,
    durationSec: metadata.durationSec,
    bitrate: metadata.bitrate,
    codec: metadata.codec,
    genre: metadata.genre,
    year: metadata.year,
    updatedAt: new Date(),
  };

  await getDb()
    .insert(tracks)
    .values(values)
    .onConflictDoUpdate({
      target: [tracks.connectionId, tracks.remoteId],
      set: {
        ...values,
        // Metadata đổi thì link stream cache cũ vẫn dùng được, nhưng xoá cho chắc.
        streamUrlCache: null,
        streamUrlExpiresAt: null,
      },
    });
}

async function getOrCreateArtist(
  userId: string,
  name: string,
): Promise<string> {
  const db = getDb();
  const trimmed = name.trim().slice(0, 300);

  const [found] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(
      and(eq(artists.userId, userId), sql`lower(${artists.name}) = lower(${trimmed})`),
    )
    .limit(1);
  if (found) return found.id;

  const [created] = await db
    .insert(artists)
    .values({ userId, name: trimmed })
    .onConflictDoNothing()
    .returning({ id: artists.id });
  if (created) return created.id;

  // Bị chen ngang bởi một lần ghi song song → đọc lại.
  const [race] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(
      and(eq(artists.userId, userId), sql`lower(${artists.name}) = lower(${trimmed})`),
    )
    .limit(1);
  if (!race) throw new Error(`Không tạo được nghệ sĩ: ${trimmed}`);
  return race.id;
}

async function getOrCreateAlbum(
  userId: string,
  artistId: string | null,
  title: string,
  year: number | null,
  picture: Metadata["picture"],
): Promise<string> {
  const db = getDb();
  const trimmed = title.trim().slice(0, 300);

  const matchAlbum = and(
    eq(albums.userId, userId),
    artistId ? eq(albums.artistId, artistId) : sql`${albums.artistId} is null`,
    sql`lower(${albums.title}) = lower(${trimmed})`,
  );

  const [found] = await db
    .select({ id: albums.id, coverHash: albums.coverHash })
    .from(albums)
    .where(matchAlbum)
    .limit(1);

  if (found) {
    // Album đã có nhưng chưa có bìa và bài này lại kèm ảnh → bổ sung.
    if (!found.coverHash && picture) {
      await attachCover(found.id, picture);
    }
    return found.id;
  }

  const cover = picture ? await resolveCover(picture) : null;

  const [created] = await db
    .insert(albums)
    .values({
      userId,
      artistId,
      title: trimmed,
      year,
      coverUrl: cover?.url ?? null,
      coverHash: cover?.hash ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: albums.id });
  if (created) return created.id;

  const [race] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(matchAlbum)
    .limit(1);
  if (!race) throw new Error(`Không tạo được album: ${trimmed}`);
  return race.id;
}

async function attachCover(albumId: string, picture: NonNullable<Metadata["picture"]>) {
  const cover = await resolveCover(picture);
  if (!cover) return;
  await getDb()
    .update(albums)
    .set({ coverUrl: cover.url, coverHash: cover.hash })
    .where(eq(albums.id, albumId));
}

/** Cùng một ảnh bìa (theo hash) chỉ upload lên Blob một lần duy nhất. */
async function resolveCover(
  picture: NonNullable<Metadata["picture"]>,
): Promise<{ url: string; hash: string } | null> {
  const hash = hashPicture(picture.data);

  const [existing] = await getDb()
    .select({ coverUrl: albums.coverUrl })
    .from(albums)
    .where(eq(albums.coverHash, hash))
    .limit(1);
  if (existing?.coverUrl) return { url: existing.coverUrl, hash };

  const url = await uploadCover(picture.data, picture.format, hash);
  return url ? { url, hash } : null;
}

/* ------------------------------------------------------------------ */

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}
