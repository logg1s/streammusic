import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { getArtists } from "@/lib/library";

export const runtime = "nodejs";

export async function GET() {
  try {
    const artists = await getArtists(await requireUserId());
    return Response.json({ artists });
  } catch (error) {
    return toErrorResponse(error);
  }
}
