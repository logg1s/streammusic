import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { getAlbums } from "@/lib/library";

export const runtime = "nodejs";

export async function GET() {
  try {
    const albums = await getAlbums(await requireUserId());
    return Response.json({ albums });
  } catch (error) {
    return toErrorResponse(error);
  }
}
