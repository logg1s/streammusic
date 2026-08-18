import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  albums,
  artists,
  connections,
  favorites,
  tracks,
  youtubeTracks,
} from "@/db/schema";
import { isUuid, trackColumns } from "@/lib/library";
import type { PlayableTrack } from "@vong/shared";
import { parseYoutubeTrackId, toPlayableTrack } from "@vong/shared";

export interface FavoriteList {
  ids: string[];
  tracks: PlayableTrack[];
}

/** Danh sách mới thích trước, ghép đúng thứ tự dù bài đến từ hai bảng khác nhau. */
export async function listFavorites(userId: string): Promise<FavoriteList> {
  const db = getDb();
  const refs = await db
    .select({
      trackId: favorites.trackId,
      youtubeVideoId: favorites.youtubeVideoId,
    })
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));

  const trackIds = refs.flatMap((row) => (row.trackId ? [row.trackId] : []));
  const videoIds = refs.flatMap((row) =>
    row.youtubeVideoId ? [row.youtubeVideoId] : [],
  );
  const [libraryRows, youtubeRows] = await Promise.all([
    trackIds.length
      ? db
          .select(trackColumns)
          .from(tracks)
          .leftJoin(artists, eq(tracks.artistId, artists.id))
          .leftJoin(albums, eq(tracks.albumId, albums.id))
          .leftJoin(connections, eq(tracks.connectionId, connections.id))
          .where(
            and(eq(tracks.userId, userId), inArray(tracks.id, trackIds)),
          )
      : Promise.resolve([]),
    videoIds.length
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
      : Promise.resolve([]),
  ]);

  const byId = new Map<string, PlayableTrack>(
    libraryRows.map((track) => [track.id, track]),
  );
  for (const row of youtubeRows) {
    const track = toPlayableTrack(row);
    byId.set(track.id, track);
  }

  const ids = refs.map((row) => row.trackId ?? `yt:${row.youtubeVideoId}`);
  return {
    ids,
    tracks: ids.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    }),
  };
}

/** Thêm idempotent; không cho user đánh dấu bài thư viện của người khác. */
export async function addFavorite(
  userId: string,
  id: string,
): Promise<boolean> {
  const db = getDb();
  const videoId = parseYoutubeTrackId(id);
  if (videoId) {
    const [video] = await db
      .select({ id: youtubeTracks.videoId })
      .from(youtubeTracks)
      .where(eq(youtubeTracks.videoId, videoId))
      .limit(1);
    if (!video) return false;
    await db
      .insert(favorites)
      .values({ userId, youtubeVideoId: videoId })
      .onConflictDoNothing();
    return true;
  }
  if (!isUuid(id)) return false;
  const [track] = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(and(eq(tracks.id, id), eq(tracks.userId, userId)))
    .limit(1);
  if (!track) return false;
  await db
    .insert(favorites)
    .values({ userId, trackId: id })
    .onConflictDoNothing();
  return true;
}

/** Xoá idempotent và luôn kèm userId trong chính câu DELETE. */
export async function removeFavorite(userId: string, id: string): Promise<void> {
  const videoId = parseYoutubeTrackId(id);
  const subject = videoId
    ? eq(favorites.youtubeVideoId, videoId)
    : isUuid(id)
      ? eq(favorites.trackId, id)
      : null;
  if (!subject) return;
  await getDb()
    .delete(favorites)
    .where(and(eq(favorites.userId, userId), subject));
}
