import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  albums,
  artists,
  connections,
  playEvents,
  tracks,
  youtubeTracks,
} from "@/db/schema";
import { toPlayableTrack } from "@vong/shared";
import type {
  AlbumSummary,
  PlayableTrack,
  TrackSource,
} from "@vong/shared";

/*
  Hình dạng dữ liệu (`PlayableTrack`, `AlbumSummary`, `TrackSource`) nằm ở
  `@vong/shared` vì vỏ Expo và Tauri cũng đọc đúng những DTO này qua API. File này chỉ
  còn truy vấn.

  `StorageProviderId` trong shared là union khai tay; nếu `storageProviderEnum` ở
  `src/db/schema.ts` thay đổi thì `trackColumns.provider` bên dưới không compile —
  đó là chốt chặn duy nhất giữ hai bên khớp nhau.
*/

/**
 * Chặn chuỗi rác trước khi nó tới Postgres: cột id là `uuid`, so sánh với chuỗi không
 * đúng khuôn làm Postgres ném lỗi cast **trước khi** `WHERE` kịp chạy — tức là URL kiểu
 * `/albums/abc` trả 500 thay vì 404. Mọi hàm nhận id từ URL phải đi qua đây.
 */
export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

/**
 * Bộ cột dựng nên PlayableTrack. Export vì `src/lib/playlists.ts` cũng select nó,
 * nhưng bắt đầu câu truy vấn từ playlist_items nên không dùng lại được `trackQuery()`.
 */
export const trackColumns = {
  id: tracks.id,
  source: sql<TrackSource>`'library'::text`,
  youtubeVideoId: sql<string | null>`null::text`,
  title: tracks.title,
  artistId: tracks.artistId,
  artistName: sql<
    string | null
  >`coalesce(${artists.name}, ${tracks.artistName})`,
  albumId: tracks.albumId,
  albumName: sql<string | null>`coalesce(${albums.title}, ${tracks.albumName})`,
  coverUrl: albums.coverUrl,
  durationSec: tracks.durationSec,
  trackNo: tracks.trackNo,
  discNo: tracks.discNo,
  provider: connections.provider,
  codec: tracks.codec,
  bitrate: tracks.bitrate,
};

function trackQuery() {
  return getDb()
    .select(trackColumns)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(connections, eq(tracks.connectionId, connections.id));
}

export async function getRecentTracks(
  userId: string,
  limit = 24,
): Promise<PlayableTrack[]> {
  return trackQuery()
    .where(eq(tracks.userId, userId))
    .orderBy(desc(tracks.addedAt))
    .limit(limit);
}

/**
 * "Nghe gần đây" — khác `getRecentTracks` (xếp theo lúc THÊM vào thư viện). Gộp
 * trùng theo bài, giữ đúng thứ tự lần nghe cuối, và trộn cả bài thư viện lẫn bài
 * YouTube vì hàng đợi cũng trộn hai nguồn đó.
 */
export async function getRecentlyPlayed(
  userId: string,
  limit = 24,
): Promise<PlayableTrack[]> {
  const db = getDb();
  const lastAt = sql<string>`max(${playEvents.startedAt})`;
  const recent = await db
    .select({
      trackId: playEvents.trackId,
      videoId: playEvents.youtubeVideoId,
    })
    .from(playEvents)
    .where(eq(playEvents.userId, userId))
    .groupBy(playEvents.trackId, playEvents.youtubeVideoId)
    .orderBy(desc(lastAt))
    .limit(limit);
  if (recent.length === 0) return [];

  const trackIds = recent
    .map((row) => row.trackId)
    .filter((id): id is string => id !== null);
  const videoIds = recent
    .map((row) => row.videoId)
    .filter((id): id is string => id !== null);

  const [libraryRows, youtubeRows] = await Promise.all([
    trackIds.length > 0 ? getTracksByIds(userId, trackIds) : [],
    videoIds.length > 0
      ? db
          .select({
            videoId: youtubeTracks.videoId,
            title: youtubeTracks.title,
            artistName: youtubeTracks.artistName,
            channelTitle: youtubeTracks.channelTitle,
            durationSec: youtubeTracks.durationSec,
          })
          .from(youtubeTracks)
          .where(inArray(youtubeTracks.videoId, videoIds))
      : [],
  ]);

  const byTrackId = new Map(libraryRows.map((track) => [track.id, track]));
  const byVideoId = new Map(
    youtubeRows.map((row) => [row.videoId, toPlayableTrack(row)]),
  );

  // Bài đã bị xoá khỏi thư viện vẫn còn trong play_events — bỏ qua, không dựng
  // dòng rỗng.
  const out: PlayableTrack[] = [];
  for (const row of recent) {
    const track = row.trackId
      ? byTrackId.get(row.trackId)
      : row.videoId
        ? byVideoId.get(row.videoId)
        : undefined;
    if (track) out.push(track);
  }
  return out;
}

/** Quét ngần này lần nghe gần nhất để tìm đủ nghệ sĩ khác nhau. */
const RECENT_PLAYS_SCANNED = 60;

export interface PlaySeed {
  videoId: string;
  artistName: string;
}

/**
 * Bài YouTube nghe gần đây, mỗi nghệ sĩ một bài, mới nhất trước — dùng làm hạt
 * giống cho hàng "Vì bạn nghe …" trên trang chủ.
 *
 * Phải tự gộp theo nghệ sĩ ở JS: `artist_key` nằm trên `play_events` nhưng videoId
 * cần lấy từ đúng lần nghe mới nhất, mà `max()` không mang theo cột khác được.
 */
export async function getRecentPlaySeeds(
  userId: string,
  limit: number,
): Promise<PlaySeed[]> {
  const db = getDb();
  const rows = await db
    .select({
      videoId: playEvents.youtubeVideoId,
      artistKey: playEvents.artistKey,
      artistName: youtubeTracks.artistName,
      channelTitle: youtubeTracks.channelTitle,
    })
    .from(playEvents)
    .innerJoin(
      youtubeTracks,
      eq(playEvents.youtubeVideoId, youtubeTracks.videoId),
    )
    .where(eq(playEvents.userId, userId))
    .orderBy(desc(playEvents.startedAt))
    .limit(RECENT_PLAYS_SCANNED);

  const seeds: PlaySeed[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = row.artistName ?? row.channelTitle;
    const key = row.artistKey ?? row.videoId;
    // Không có tên thì không dựng được tiêu đề "Vì bạn nghe …" — bỏ hạt giống đó.
    if (!row.videoId || key === null || name === null || seen.has(key))
      continue;
    seen.add(key);
    seeds.push({ videoId: row.videoId, artistName: name });
    if (seeds.length >= limit) break;
  }
  return seeds;
}

export async function getAllTracks(
  userId: string,
  limit = 200,
  offset = 0,
): Promise<PlayableTrack[]> {
  return trackQuery()
    .where(eq(tracks.userId, userId))
    .orderBy(asc(tracks.title))
    .limit(limit)
    .offset(offset);
}

export async function getTrackById(
  userId: string,
  trackId: string,
): Promise<PlayableTrack | null> {
  const [row] = await trackQuery()
    .where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Thứ tự trả về không đảm bảo — caller tự sắp lại nếu cần. */
export async function getTracksByIds(
  userId: string,
  ids: string[],
): Promise<PlayableTrack[]> {
  if (ids.length === 0) return [];
  return trackQuery().where(
    and(eq(tracks.userId, userId), inArray(tracks.id, ids)),
  );
}

export async function getAlbums(userId: string): Promise<AlbumSummary[]> {
  return getDb()
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      coverUrl: albums.coverUrl,
      artistId: albums.artistId,
      artistName: artists.name,
      trackCount: count(tracks.id),
    })
    .from(albums)
    .leftJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(tracks, eq(tracks.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .groupBy(albums.id, artists.name)
    .orderBy(asc(albums.title));
}

/** Album vừa được đưa vào thư viện trước — dùng cho dải tổng quan, không thay thứ tự A–Z của trang Album. */
export async function getRecentAlbums(
  userId: string,
  limit = 12,
): Promise<AlbumSummary[]> {
  return getDb()
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      coverUrl: albums.coverUrl,
      artistId: albums.artistId,
      artistName: artists.name,
      trackCount: count(tracks.id),
    })
    .from(albums)
    .leftJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(tracks, eq(tracks.albumId, albums.id))
    .where(eq(albums.userId, userId))
    .groupBy(albums.id, artists.name)
    .orderBy(desc(albums.createdAt), asc(albums.title))
    .limit(limit);
}

export async function getAlbum(userId: string, albumId: string) {
  if (!isUuid(albumId)) return null;
  const [album] = await getDb()
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      coverUrl: albums.coverUrl,
      artistId: albums.artistId,
      artistName: artists.name,
    })
    .from(albums)
    .leftJoin(artists, eq(albums.artistId, artists.id))
    .where(and(eq(albums.id, albumId), eq(albums.userId, userId)))
    .limit(1);

  if (!album) return null;

  const albumTracks = await trackQuery()
    .where(and(eq(tracks.userId, userId), eq(tracks.albumId, albumId)))
    .orderBy(asc(tracks.discNo), asc(tracks.trackNo), asc(tracks.title));

  return { album, tracks: albumTracks };
}

export async function getArtists(userId: string) {
  return getDb()
    .select({
      id: artists.id,
      name: artists.name,
      trackCount: count(tracks.id),
    })
    .from(artists)
    .leftJoin(tracks, eq(tracks.artistId, artists.id))
    .where(eq(artists.userId, userId))
    .groupBy(artists.id)
    .orderBy(asc(artists.name));
}

export async function getArtist(userId: string, artistId: string) {
  if (!isUuid(artistId)) return null;
  const [artist] = await getDb()
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(and(eq(artists.id, artistId), eq(artists.userId, userId)))
    .limit(1);

  if (!artist) return null;

  const artistAlbums = await getDb()
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      coverUrl: albums.coverUrl,
      artistId: albums.artistId,
      artistName: artists.name,
      trackCount: count(tracks.id),
    })
    .from(albums)
    .leftJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(tracks, eq(tracks.albumId, albums.id))
    .where(and(eq(albums.userId, userId), eq(albums.artistId, artistId)))
    .groupBy(albums.id, artists.name)
    .orderBy(desc(albums.year), asc(albums.title));

  // Bài lẻ: thuộc nghệ sĩ này nhưng không gắn album nào.
  const singles = await trackQuery()
    .where(
      and(
        eq(tracks.userId, userId),
        eq(tracks.artistId, artistId),
        isNull(tracks.albumId),
      ),
    )
    .orderBy(asc(tracks.title));

  return { artist, albums: artistAlbums, singles };
}

/** `unaccent(x) ILIKE unaccent(term)` — so khớp bỏ dấu ở cả hai phía. */
function foldedLike(column: AnyColumn, term: string) {
  return sql`unaccent(${column}) ILIKE unaccent(${term})`;
}

export async function searchLibrary(
  userId: string,
  query: string,
): Promise<{ tracks: PlayableTrack[]; albums: AlbumSummary[] }> {
  const term = `%${query.trim()}%`;
  if (query.trim().length === 0) return { tracks: [], albums: [] };

  // Người Việt gõ không dấu là chuyện thường ("xau" phải ra "Xấu"), nên mọi vế so
  // khớp đều qua unaccent (extension tạo ở `npm run db:index`). Thư viện cỡ vài
  // nghìn dòng, seq scan sau khi lọc theo user vẫn dưới một mili giây - không cần
  // index biểu thức riêng.
  const foundTracks = await trackQuery()
    .where(
      and(
        eq(tracks.userId, userId),
        or(
          foldedLike(tracks.title, term),
          foldedLike(tracks.artistName, term),
          foldedLike(tracks.albumName, term),
          foldedLike(artists.name, term),
          foldedLike(albums.title, term),
        ),
      ),
    )
    .orderBy(asc(tracks.title))
    .limit(100);

  const foundAlbums = await getDb()
    .select({
      id: albums.id,
      title: albums.title,
      year: albums.year,
      coverUrl: albums.coverUrl,
      artistId: albums.artistId,
      artistName: artists.name,
      trackCount: count(tracks.id),
    })
    .from(albums)
    .leftJoin(artists, eq(albums.artistId, artists.id))
    .leftJoin(tracks, eq(tracks.albumId, albums.id))
    .where(
      and(
        eq(albums.userId, userId),
        or(foldedLike(albums.title, term), foldedLike(artists.name, term)),
      ),
    )
    .groupBy(albums.id, artists.name)
    .orderBy(asc(albums.title))
    .limit(40);

  return { tracks: foundTracks, albums: foundAlbums };
}

export async function getLibraryStats(userId: string) {
  const [row] = await getDb()
    .select({
      trackCount: sql<number>`count(distinct ${tracks.id})::int`,
      totalSeconds: sql<number>`coalesce(sum(${tracks.durationSec}), 0)::int`,
    })
    .from(tracks)
    .where(eq(tracks.userId, userId));

  const [albumRow] = await getDb()
    .select({ albumCount: sql<number>`count(*)::int` })
    .from(albums)
    .where(eq(albums.userId, userId));

  const [artistRow] = await getDb()
    .select({ artistCount: sql<number>`count(*)::int` })
    .from(artists)
    .where(eq(artists.userId, userId));

  return {
    trackCount: row?.trackCount ?? 0,
    totalSeconds: row?.totalSeconds ?? 0,
    albumCount: albumRow?.albumCount ?? 0,
    artistCount: artistRow?.artistCount ?? 0,
  };
}
