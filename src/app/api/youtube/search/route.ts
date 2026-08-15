import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import type { PlayableTrack } from "@vong/shared";
import { persistHits, searchSongs } from "@/lib/youtube/music";
import { normalizeKey } from "@vong/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;

/**
 * Cache RAM theo từ khoá. Tìm kiếm đi qua InnerTube nên không tốn quota, nhưng cùng
 * một từ khoá bị gõ lại liên tục (mỗi lần đổi trang, mỗi lần quay lại) — 6 giờ là đủ
 * lâu để khỏi gọi lại, đủ ngắn để bài mới lên vẫn thấy được.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map<string, { at: number; tracks: PlayableTrack[] }>();

/** Tìm bất cứ bài nào trên YouTube, không cần bài đó có trong thư viện. */
export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = (await request.json()) as { q?: string; limit?: number };
    const query = body.q?.trim() ?? "";
    if (query.length === 0) return jsonError("Thiếu từ khoá", 400);

    const requested = Number(body.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested)))
      : DEFAULT_LIMIT;

    const key = `${normalizeKey(query)}|${limit}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return Response.json({ tracks: hit.tracks });
    }

    const tracks = await persistHits(await searchSongs(query, limit));
    cache.set(key, { at: Date.now(), tracks });
    return Response.json({ tracks });
  } catch (error) {
    return toErrorResponse(error);
  }
}
