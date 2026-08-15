import { and, count, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  albums,
  artists,
  connections,
  playlistItems,
  playlists,
  tracks,
  youtubeTracks,
  type Playlist,
} from "@/db/schema";
import type { PlayableTrack, PlaylistSummary } from "@vong/shared";
import { parseYoutubeTrackId, toPlayableTrack } from "@vong/shared";
import { isUuid, trackColumns } from "@/lib/library";
import { PlaylistInputError } from "@/lib/http";

export async function listPlaylists(
  userId: string,
): Promise<PlaylistSummary[]> {
  return getDb()
    .select({
      id: playlists.id,
      name: playlists.name,
      seedLabel: playlists.seedLabel,
      createdAt: playlists.createdAt,
      itemCount: count(playlistItems.id),
    })
    .from(playlists)
    .leftJoin(playlistItems, eq(playlistItems.playlistId, playlists.id))
    .where(eq(playlists.userId, userId))
    .groupBy(playlists.id)
    .orderBy(desc(playlists.createdAt));
}

/**
 * Đổi `PlayableTrack.id` (uuid thư viện hoặc "yt:<videoId>") thành cặp cột của
 * playlist_items, giữ nguyên thứ tự đầu vào. Id không thuộc user, hoặc video chưa
 * có trong bộ đệm, bị bỏ qua thay vì làm hỏng cả lần lưu.
 */
async function resolveItemRefs(
  userId: string,
  ids: string[],
): Promise<Array<{ trackId: string | null; youtubeVideoId: string | null }>> {
  const db = getDb();

  const videoIds: string[] = [];
  const trackIds: string[] = [];
  for (const id of ids) {
    const videoId = parseYoutubeTrackId(id);
    if (videoId) videoIds.push(videoId);
    else if (isUuid(id)) trackIds.push(id);
  }

  const [ownedTracks, cachedVideos] = await Promise.all([
    trackIds.length > 0
      ? db
          .select({ id: tracks.id })
          .from(tracks)
          .where(and(eq(tracks.userId, userId), inArray(tracks.id, trackIds)))
      : Promise.resolve([]),
    videoIds.length > 0
      ? db
          .select({ videoId: youtubeTracks.videoId })
          .from(youtubeTracks)
          .where(inArray(youtubeTracks.videoId, videoIds))
      : Promise.resolve([]),
  ]);

  const okTracks = new Set(ownedTracks.map((row) => row.id));
  const okVideos = new Set(cachedVideos.map((row) => row.videoId));

  const refs: Array<{ trackId: string | null; youtubeVideoId: string | null }> =
    [];
  for (const id of ids) {
    const videoId = parseYoutubeTrackId(id);
    if (videoId) {
      if (okVideos.has(videoId))
        refs.push({ trackId: null, youtubeVideoId: videoId });
    } else if (okTracks.has(id)) {
      refs.push({ trackId: id, youtubeVideoId: null });
    }
  }
  return refs;
}

/** Lưu hàng đợi thành playlist mới. */
export async function createPlaylist(
  userId: string,
  name: string,
  ids: string[],
  seedLabel: string | null,
): Promise<string> {
  const db = getDb();
  const refs = await resolveItemRefs(userId, ids);
  if (refs.length === 0) throw new Error("Không có bài nào lưu được");

  const playlistId = crypto.randomUUID();
  const items = refs.map((ref, position) => ({ playlistId, position, ...ref }));

  // neon-http không có transaction tương tác, chỉ có batch — hai câu insert đi
  // cùng một chuyến để không bao giờ tồn tại playlist rỗng.
  await db.batch([
    db.insert(playlists).values({ id: playlistId, userId, name, seedLabel }),
    db.insert(playlistItems).values(items),
  ]);

  return playlistId;
}

export async function getPlaylist(
  userId: string,
  id: string,
): Promise<{
  playlist: Playlist;
  items: Array<{ itemId: string; track: PlayableTrack }>;
} | null> {
  if (!isUuid(id)) return null;
  const db = getDb();

  const [playlist] = await db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .limit(1);
  if (!playlist) return null;

  // Hai nguồn, hai câu truy vấn: bài thư viện cần đủ join để ra PlayableTrack,
  // bài YouTube chỉ nằm trong bảng cache. Ghép lại theo `position` ở JS.
  const [libraryRows, youtubeRows] = await Promise.all([
    db
      .select({
        itemId: playlistItems.id,
        position: playlistItems.position,
        track: trackColumns,
      })
      .from(playlistItems)
      .innerJoin(
        tracks,
        and(eq(playlistItems.trackId, tracks.id), eq(tracks.userId, userId)),
      )
      .leftJoin(artists, eq(tracks.artistId, artists.id))
      .leftJoin(albums, eq(tracks.albumId, albums.id))
      .leftJoin(connections, eq(tracks.connectionId, connections.id))
      .where(eq(playlistItems.playlistId, id)),
    db
      .select({
        itemId: playlistItems.id,
        position: playlistItems.position,
        videoId: youtubeTracks.videoId,
        title: youtubeTracks.title,
        artistName: youtubeTracks.artistName,
        channelTitle: youtubeTracks.channelTitle,
        durationSec: youtubeTracks.durationSec,
      })
      .from(playlistItems)
      .innerJoin(
        youtubeTracks,
        eq(playlistItems.youtubeVideoId, youtubeTracks.videoId),
      )
      .where(eq(playlistItems.playlistId, id)),
  ]);

  const merged = [
    ...libraryRows.map((row) => ({
      position: row.position,
      itemId: row.itemId,
      track: row.track,
    })),
    ...youtubeRows.map((row) => ({
      position: row.position,
      itemId: row.itemId,
      track: toPlayableTrack(row),
    })),
  ].sort((a, b) => a.position - b.position);

  return {
    playlist,
    items: merged.map(({ itemId, track }) => ({ itemId, track })),
  };
}

export async function deletePlaylist(
  userId: string,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const deleted = await getDb()
    .delete(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });
  return deleted.length > 0;
}

export async function removePlaylistItem(
  userId: string,
  playlistId: string,
  itemId: string,
): Promise<boolean> {
  if (!isUuid(playlistId) || !isUuid(itemId)) return false;
  const db = getDb();

  // Quyền sở hữu nằm ở bảng playlists, nên điều kiện chủ sở hữu đi kèm ngay
  // trong câu DELETE thay vì kiểm tra rời rồi xoá.
  const deleted = await db
    .delete(playlistItems)
    .where(
      and(
        eq(playlistItems.id, itemId),
        eq(playlistItems.playlistId, playlistId),
        exists(
          db
            .select({ one: sql`1` })
            .from(playlists)
            .where(
              and(eq(playlists.id, playlistId), eq(playlists.userId, userId)),
            ),
        ),
      ),
    )
    .returning({ id: playlistItems.id });
  return deleted.length > 0;
}

/** Playlist có thuộc user này không. Mọi hàm ghi bên dưới đều phải hỏi trước. */
async function ownsPlaylist(userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const [row] = await getDb()
    .select({ id: playlists.id })
    .from(playlists)
    .where(and(eq(playlists.id, id), eq(playlists.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Nối bài vào cuối playlist. Trả về số bài thực sự thêm được: bài đã có trong
 * playlist bị bỏ qua, nên bấm "Thêm vào playlist" hai lần không tạo bản trùng.
 */
export async function appendToPlaylist(
  userId: string,
  playlistId: string,
  ids: string[],
): Promise<number> {
  if (!(await ownsPlaylist(userId, playlistId))) return 0;
  const db = getDb();

  const refs = await resolveItemRefs(userId, ids);
  if (refs.length === 0) return 0;

  const existing = await db
    .select({
      position: playlistItems.position,
      trackId: playlistItems.trackId,
      youtubeVideoId: playlistItems.youtubeVideoId,
    })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));

  const taken = new Set(
    existing.map((row) => row.trackId ?? `yt:${row.youtubeVideoId}`),
  );
  let position = existing.reduce(
    (max, row) => Math.max(max, row.position + 1),
    0,
  );

  const items = [];
  for (const ref of refs) {
    const key = ref.trackId ?? `yt:${ref.youtubeVideoId}`;
    if (taken.has(key)) continue;
    taken.add(key);
    items.push({ playlistId, position: position++, ...ref });
  }
  if (items.length === 0) return 0;

  await db.insert(playlistItems).values(items);
  return items.length;
}

/**
 * Ghi lại thứ tự: `itemIds` phải là đúng tập item đang có, chỉ khác thứ tự. Sai tập
 * nghĩa là client đang xem bản cũ — ghi tiếp sẽ làm mất bài, nên từ chối hẳn.
 */
export async function reorderPlaylist(
  userId: string,
  playlistId: string,
  itemIds: string[],
): Promise<void> {
  if (!(await ownsPlaylist(userId, playlistId))) {
    throw new PlaylistInputError("Không tìm thấy playlist");
  }
  const db = getDb();

  const existing = await db
    .select({ id: playlistItems.id })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));

  const current = new Set(existing.map((row) => row.id));
  const wanted = new Set(itemIds);
  const sameSet =
    current.size === wanted.size && itemIds.every((id) => current.has(id));
  if (!sameSet) throw new PlaylistInputError("Danh sách không khớp");

  // neon-http chỉ có batch: tất cả câu UPDATE đi cùng một chuyến nên không có
  // khoảnh khắc nào hai bài mang cùng một `position`.
  const updates = itemIds.map((id, position) =>
    db.update(playlistItems).set({ position }).where(eq(playlistItems.id, id)),
  );
  if (updates.length === 0) return;
  await db.batch([updates[0], ...updates.slice(1)]);
}

export async function renamePlaylist(
  userId: string,
  playlistId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new PlaylistInputError("Thiếu tên playlist");
  // Chuỗi rác làm Postgres ném lỗi cast trước khi WHERE kịp chạy.
  if (!isUuid(playlistId)) {
    throw new PlaylistInputError("Không tìm thấy playlist");
  }

  const updated = await getDb()
    .update(playlists)
    .set({ name: trimmed })
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .returning({ id: playlists.id });
  if (updated.length === 0)
    throw new PlaylistInputError("Không tìm thấy playlist");
}
