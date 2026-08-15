import { getDb } from "@/db";
import { playEvents } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { normalizeKey } from "@/lib/youtube/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bài chỉ nghe được ngần này thì tính như bỏ qua, không phải một lượt nghe thật. */
const SKIP_RATIO = 0.2;

/**
 * Một lượt nghe của app. Đây là dữ liệu duy nhất dùng để xếp hạng gợi ý — không lấy
 * số liệu nào của YouTube, vì điều khoản Data API cấm lưu/suy diễn dữ liệu người
 * dùng của họ.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      trackId?: string;
      videoId?: string;
      artistName?: string | null;
      playedSec?: number;
      durationSec?: number | null;
      completed?: boolean;
    };

    const trackId = body.trackId ?? null;
    const videoId = body.videoId ?? null;
    // Check constraint ép đúng một nguồn; chặn ở đây để lỗi là 400 chứ không phải 500.
    if ((trackId === null) === (videoId === null)) {
      return jsonError("Cần đúng một trong trackId hoặc videoId", 400);
    }

    const playedSec = Math.max(0, Math.trunc(Number(body.playedSec ?? 0)));
    const durationSec =
      typeof body.durationSec === "number" && body.durationSec > 0
        ? Math.trunc(body.durationSec)
        : null;

    // Vừa bấm rồi bỏ ngay không phải một lượt nghe — ghi vào chỉ làm nhiễu điểm gu.
    if (durationSec !== null && playedSec < SKIP_RATIO * durationSec) {
      return new Response(null, { status: 204 });
    }

    await getDb()
      .insert(playEvents)
      .values({
        userId,
        trackId,
        youtubeVideoId: videoId,
        artistKey: normalizeKey(body.artistName ?? null),
        playedSec,
        durationSec,
        completed: body.completed === true,
      });

    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
