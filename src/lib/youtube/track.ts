import type { PlayableTrack } from "@/lib/library";

/** Id trong hàng đợi của bài YouTube: "yt:<videoId>". Giữ ở đây để client và server dùng chung. */
export const YOUTUBE_ID_PREFIX = "yt:";

export function youtubeTrackId(videoId: string): string {
  return YOUTUBE_ID_PREFIX + videoId;
}

/** "yt:abc" -> "abc"; id thư viện (uuid) -> null. */
export function parseYoutubeTrackId(id: string): string | null {
  return id.startsWith(YOUTUBE_ID_PREFIX)
    ? id.slice(YOUTUBE_ID_PREFIX.length)
    : null;
}

/** Row của bảng youtube_tracks (chỉ nhận field cần, không import type từ db). */
export function toPlayableTrack(row: {
  videoId: string;
  title: string;
  artistName: string | null;
  channelTitle: string | null;
  durationSec: number | null;
}): PlayableTrack {
  return {
    id: youtubeTrackId(row.videoId),
    source: "youtube",
    youtubeVideoId: row.videoId,
    title: row.title,
    artistId: null,
    artistName: row.artistName ?? row.channelTitle,
    albumId: null,
    albumName: null,
    coverUrl: `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg`,
    durationSec: row.durationSec,
    trackNo: null,
    discNo: null,
    provider: null,
    codec: null,
    bitrate: null,
  };
}
