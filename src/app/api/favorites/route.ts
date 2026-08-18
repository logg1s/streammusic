import { requireUserId } from "@/lib/auth";
import { addFavorite, listFavorites, removeFavorite } from "@/lib/favorites";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listFavorites(await requireUserId()));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) {
      return jsonError("Thiếu bài hát", 400);
    }
    if (!(await addFavorite(await requireUserId(), body.id))) {
      return jsonError("Không tìm thấy bài hát", 404);
    }
    return Response.json({ favorite: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length === 0) {
      return jsonError("Thiếu bài hát", 400);
    }
    await removeFavorite(await requireUserId(), body.id);
    return Response.json({ favorite: false });
  } catch (error) {
    return toErrorResponse(error);
  }
}
