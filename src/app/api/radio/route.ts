import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import {
  persistHits,
  upNextContinuation,
  upNextQueue,
} from "@/lib/youtube/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_ITEMS = 50;
const MAX_CONTINUATION_LENGTH = 4_096;

/** Một lô "bài tương tự" cho seed — client gọi lại mỗi khi hàng đợi gần cạn. */
export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = (await request.json()) as {
      seedId?: string;
      continuation?: string;
      exclude?: string[];
      limit?: number;
    };
    if (body.seedId && body.continuation) {
      return jsonError("Chỉ gửi seedId hoặc continuation", 400);
    }
    if (!body.seedId && !body.continuation) {
      return jsonError("Thiếu seedId hoặc continuation", 400);
    }
    if (
      body.continuation &&
      body.continuation.length > MAX_CONTINUATION_LENGTH
    ) {
      return jsonError("Continuation không hợp lệ", 400);
    }

    const exclude = new Set(
      (body.exclude ?? []).filter((id): id is string => typeof id === "string"),
    );
    let playlistId: string | null = null;
    let continuation: string | null = null;
    let hits;

    if (body.seedId) {
      if (!body.seedId.startsWith("yt:") || body.seedId.length <= 3) {
        return jsonError("Radio chỉ hỗ trợ bài YouTube", 400);
      }
      const page = await upNextQueue(
        body.seedId.slice(3),
        MAX_PAGE_ITEMS,
      );
      playlistId = page.playlistId;
      continuation = page.continuation;
      hits = page.hits;
    } else {
      const page = await upNextContinuation(
        body.continuation as string,
        MAX_PAGE_ITEMS,
      );
      continuation = page.continuation;
      hits = page.hits;
    }

    // Giữ nguyên thứ tự YouTube trả về; chỉ lọc bài đã có/đã bỏ trong phiên.
    const tracks = (await persistHits(hits)).filter(
      (track) => !exclude.has(track.id),
    );
    return Response.json({
      tracks,
      continuation,
      playlistId,
      source: "youtube",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
