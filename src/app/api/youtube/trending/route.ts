import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import type { PlayableTrack } from "@/lib/library";
import { listTrendingMusic, REGION_CODE } from "@/lib/youtube/api";
import { persistHits } from "@/lib/youtube/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bảng xếp hạng đổi theo ngày, giữ 6 giờ là đủ tươi mà gần như không tốn quota. */
const TTL_MS = 6 * 60 * 60 * 1000;
const LIMIT = 50;

let cache: { at: number; tracks: PlayableTrack[] } | null = null;

/**
 * "Đang thịnh hành" — nguồn duy nhất còn phải đi qua Data API (1 unit/lần) nên chỉ
 * bật khi có `YOUTUBE_API_KEY`. Không có khoá thì trả rỗng: trang chủ đã có các
 * hàng gợi ý của YouTube Music, vốn cũng chứa top vùng.
 */
export async function GET() {
  try {
    await requireUserId();
    if (!process.env.YOUTUBE_API_KEY) return Response.json({ tracks: [] });

    if (cache && Date.now() - cache.at < TTL_MS) {
      return Response.json({ tracks: cache.tracks });
    }

    const videos = await listTrendingMusic(REGION_CODE, LIMIT);
    const tracks = await persistHits(
      videos.map((video) => ({
        videoId: video.videoId,
        rawTitle: video.rawTitle,
        channelTitle: video.channelTitle,
        durationSec: video.durationSec,
      })),
    );
    cache = { at: Date.now(), tracks };
    return Response.json({ tracks });
  } catch (error) {
    return toErrorResponse(error);
  }
}
