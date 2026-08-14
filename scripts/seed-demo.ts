/**
 * Nạp dữ liệu demo để kiểm chứng thư viện + player mà chưa cần OAuth.
 *
 * Nhạc là thật: lấy từ kho file công khai Borewit/test-audio, đọc tag thật bằng
 * range request thật, ảnh bìa upload lên Blob thật. Thứ duy nhất giả là bản ghi
 * `connections` — thay vì gọi provider để xin link tạm thời, ta ghi sẵn URL công
 * khai vào `streamUrlCache`, đúng nhánh mà endpoint stream dùng cho Dropbox/OneDrive.
 *
 *   npm run seed:demo          nạp dữ liệu, in ra cookie phiên để đăng nhập
 *   npm run seed:demo -- --clean   xoá sạch user demo
 */
import { eq } from "drizzle-orm";
import { encode } from "@auth/core/jwt";
import { getDb } from "../src/db";
import { albums, artists, connections, tracks, users } from "../src/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { hashPicture, uploadCover } from "../src/lib/cover-art";
import { readRemoteMetadata } from "../src/lib/metadata";

const DEMO_EMAIL = "demo@vong.local";
const REPO = "Borewit/test-audio";
const MAX_FILES = 8;

interface GhEntry {
  name: string;
  size: number;
  type: string;
  path: string;
  download_url: string | null;
}

async function listDir(path: string): Promise<GhEntry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { "User-Agent": "streammusic-seed" } },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return (await res.json()) as GhEntry[];
}

async function clean() {
  const db = getDb();
  const deleted = await db
    .delete(users)
    .where(eq(users.email, DEMO_EMAIL))
    .returning({ id: users.id });
  console.log(
    deleted.length
      ? `Đã xoá user demo và toàn bộ dữ liệu kèm theo (cascade).`
      : "Không có user demo nào để xoá.",
  );
}

async function seed() {
  const db = getDb();

  const [user] = await db
    .insert(users)
    .values({ name: "Người nghe demo", email: DEMO_EMAIL })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: "Người nghe demo" },
    })
    .returning();

  const [connection] = await db
    .insert(connections)
    .values({
      userId: user.id,
      provider: "dropbox",
      providerAccountId: "demo-account",
      label: "demo@vong.local (dữ liệu mẫu)",
      // Token giả — không bao giờ được dùng vì mọi track đều đã có streamUrlCache.
      accessTokenEnc: encryptSecret("demo-token-khong-dung-den"),
      refreshTokenEnc: null,
      expiresAt: null,
      scope: "demo",
    })
    .onConflictDoUpdate({
      target: [
        connections.userId,
        connections.provider,
        connections.providerAccountId,
      ],
      set: { label: "demo@vong.local (dữ liệu mẫu)" },
    })
    .returning();

  // Gom file nhạc công khai từ hai album mẫu.
  const dirs = (await listDir("")).filter((e) => e.type === "dir");
  const files: GhEntry[] = [];
  for (const dir of dirs) {
    for (const file of await listDir(dir.name)) {
      if (file.type === "file" && /\.(mp3|m4a|flac|ogg)$/i.test(file.name)) {
        files.push(file);
      }
      if (files.length >= MAX_FILES) break;
    }
    if (files.length >= MAX_FILES) break;
  }

  console.log(`Đọc tag của ${files.length} file…\n`);

  // Link công khai không hết hạn, nhưng vẫn đặt hạn xa để đúng hình dạng dữ liệu thật.
  const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const artistCache = new Map<string, string>();
  const albumCache = new Map<string, string>();

  for (const file of files) {
    const metadata = await readRemoteMetadata({
      url: file.download_url!,
      sizeBytes: file.size,
      mimeType: null,
      fileName: file.name,
    });

    const artistName = metadata.albumArtist ?? metadata.artist ?? "Không rõ";
    const albumName = metadata.album ?? "Không rõ";

    let artistId = artistCache.get(artistName.toLowerCase());
    if (!artistId) {
      const [row] = await db
        .insert(artists)
        .values({ userId: user.id, name: artistName })
        .onConflictDoNothing()
        .returning({ id: artists.id });
      artistId =
        row?.id ??
        (
          await db
            .select({ id: artists.id })
            .from(artists)
            .where(eq(artists.name, artistName))
            .limit(1)
        )[0].id;
      artistCache.set(artistName.toLowerCase(), artistId);
    }

    const albumKey = `${artistId}::${albumName.toLowerCase()}`;
    let albumId = albumCache.get(albumKey);
    if (!albumId) {
      let coverUrl: string | null = null;
      let coverHash: string | null = null;
      if (metadata.picture) {
        coverHash = hashPicture(metadata.picture.data);
        coverUrl = await uploadCover(
          metadata.picture.data,
          metadata.picture.format,
          coverHash,
        );
      }
      const [row] = await db
        .insert(albums)
        .values({
          userId: user.id,
          artistId,
          title: albumName,
          year: metadata.year,
          coverUrl,
          coverHash,
        })
        .onConflictDoNothing()
        .returning({ id: albums.id });
      albumId =
        row?.id ??
        (
          await db
            .select({ id: albums.id })
            .from(albums)
            .where(eq(albums.title, albumName))
            .limit(1)
        )[0].id;
      albumCache.set(albumKey, albumId);
      console.log(`  album: ${albumName} ${coverUrl ? "(có bìa)" : "(không bìa)"}`);
    }

    await db
      .insert(tracks)
      .values({
        userId: user.id,
        connectionId: connection.id,
        remoteId: file.path,
        remoteRev: String(file.size),
        path: file.path,
        fileName: file.name,
        mimeType: metadata.codec?.includes("MPEG 1") ? "audio/mpeg" : "audio/mp4",
        sizeBytes: file.size,
        title: metadata.title ?? file.name,
        artistId,
        albumId,
        artistName: metadata.artist,
        albumName,
        trackNo: metadata.trackNo,
        discNo: metadata.discNo,
        durationSec: metadata.durationSec,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
        genre: metadata.genre,
        year: metadata.year,
        streamUrlCache: file.download_url,
        streamUrlExpiresAt: farFuture,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [tracks.connectionId, tracks.remoteId],
        set: {
          streamUrlCache: file.download_url,
          streamUrlExpiresAt: farFuture,
          title: metadata.title ?? file.name,
        },
      });

    console.log(`    ${metadata.artist ?? "?"} — ${metadata.title ?? file.name}`);
  }

  // Tạo cookie phiên hợp lệ để mở app mà không cần đi qua Google.
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET");
  const cookieName = "authjs.session-token";
  const token = await encode({
    salt: cookieName,
    secret,
    token: { sub: user.id, name: user.name, email: user.email },
  });

  console.log(`\nuserId: ${user.id}`);
  console.log(`\nĐể đăng nhập, dán vào Console của trình duyệt ở localhost:3000:`);
  console.log(`document.cookie = "${cookieName}=${token}; path=/"`);
  console.log(`\nDọn dẹp sau khi thử xong:  npm run seed:demo -- --clean`);
}

const args = process.argv.slice(2);
(args.includes("--clean") ? clean() : seed()).catch((error) => {
  console.error(error);
  process.exit(1);
});
