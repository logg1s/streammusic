import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { getArtist } from "@/lib/library";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const artist = await getArtist(userId, id);
    if (!artist) return jsonError("Không tìm thấy nghệ sĩ", 404);
    return Response.json(artist);
  } catch (error) {
    return toErrorResponse(error);
  }
}
