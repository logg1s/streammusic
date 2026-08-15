import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { deletePlaylist, renamePlaylist } from "@/lib/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    // ON DELETE CASCADE lo phần playlist_items.
    const deleted = await deletePlaylist(userId, id);
    if (!deleted) return jsonError("Không tìm thấy playlist", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Đổi tên playlist. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = (await request.json()) as { name?: string };

    await renamePlaylist(userId, id, body.name ?? "");
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
