import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { getAlbum } from "@/lib/library";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const album = await getAlbum(userId, id);
    if (!album) return jsonError("Không tìm thấy album", 404);
    return Response.json(album);
  } catch (error) {
    return toErrorResponse(error);
  }
}
