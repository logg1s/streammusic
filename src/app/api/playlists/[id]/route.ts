import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { deletePlaylist, getPlaylist, renamePlaylist } from "@/lib/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chi tiết playlist. Trang web đọc thẳng DB (`(app)/playlists/[id]/page.tsx`); route này
 * là đường của vỏ native, gọi lại đúng `getPlaylist` nên không lệch dữ liệu.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const playlist = await getPlaylist(userId, id);
    if (!playlist) return jsonError("Không tìm thấy playlist", 404);
    return Response.json(playlist);
  } catch (error) {
    return toErrorResponse(error);
  }
}

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
