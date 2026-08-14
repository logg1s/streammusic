import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  albums,
  artists,
  connections,
  tracks,
  type StorageProviderId,
} from "@/db/schema";

/** Hình dạng tối thiểu mà player cần — dùng chung giữa server và client. */
export interface PlayableTrack {
  id: string;
  title: string;
  artistId: string | null;
  artistName: string | null;
  albumId: string | null;
  albumName: string | null;
  coverUrl: string | null;
  durationSec: number | null;
  trackNo: number | null;
  discNo: number | null;
  /* Ba trường dưới đây nuôi dải thông số ở thanh phát:
     cho thấy byte đang chảy về từ đâu và ở chất lượng nào. */
  provider: StorageProviderId | null;
  codec: string | null;
  bitrate: number | null;
}

export interface AlbumSummary {
  id: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  artistId: string | null;
  artistName: string | null;
  trackCount: number;
}

const trackColumns = {
  id: tracks.id,
  title: tracks.title,
  artistId: tracks.artistId,
  artistName: sql<string | null>`coalesce(${artists.name}, ${tracks.artistName})`,
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

export async function getAlbum(userId: string, albumId: string) {
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

export async function searchLibrary(
  userId: string,
  query: string,
): Promise<{ tracks: PlayableTrack[]; albums: AlbumSummary[] }> {
  const term = `%${query.trim()}%`;
  if (query.trim().length === 0) return { tracks: [], albums: [] };

  const foundTracks = await trackQuery()
    .where(
      and(
        eq(tracks.userId, userId),
        or(
          ilike(tracks.title, term),
          ilike(tracks.artistName, term),
          ilike(tracks.albumName, term),
          ilike(artists.name, term),
          ilike(albums.title, term),
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
        or(ilike(albums.title, term), ilike(artists.name, term)),
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
