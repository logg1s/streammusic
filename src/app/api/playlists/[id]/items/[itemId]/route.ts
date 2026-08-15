import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { removePlaylistItem } from "@/lib/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id, itemId } = await params;

    const deleted = await removePlaylistItem(userId, id, itemId);
    if (!deleted) return jsonError("Không tìm thấy bài trong playlist", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
