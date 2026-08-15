import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { appendToPlaylist, reorderPlaylist } from "@/lib/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nối bài vào cuối playlist. `ids` là `PlayableTrack.id`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = (await request.json()) as { ids?: string[] };

    const ids = (body.ids ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (ids.length === 0) return jsonError("Thiếu danh sách bài", 400);

    const added = await appendToPlaylist(userId, id, ids);
    return Response.json({ added });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Ghi lại thứ tự. `itemIds` phải là đúng tập item đang có, chỉ khác thứ tự. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = (await request.json()) as { itemIds?: string[] };

    const itemIds = (body.itemIds ?? []).filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    if (itemIds.length === 0) return jsonError("Thiếu thứ tự mới", 400);

    await reorderPlaylist(userId, id, itemIds);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
