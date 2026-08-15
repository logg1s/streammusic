import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { buildRadioBatch, loadSeed } from "@/lib/radio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

/** Một lô "bài tương tự" cho seed — client gọi lại mỗi khi hàng đợi gần cạn. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      seedId?: string;
      exclude?: string[];
      limit?: number;
    };
    if (!body.seedId) return jsonError("Thiếu seedId", 400);

    const seed = await loadSeed(userId, body.seedId);
    if (!seed) return jsonError("Không tìm thấy bài gốc", 404);

    const requested = Number(body.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested)))
      : DEFAULT_LIMIT;

    const tracks = await buildRadioBatch({
      userId,
      seed,
      exclude: body.exclude ?? [],
      limit,
    });
    return Response.json({ seed, tracks });
  } catch (error) {
    return toErrorResponse(error);
  }
}
