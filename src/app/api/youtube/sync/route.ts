import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { getYoutubeAccessToken } from "@/lib/youtube/account";
import { syncYoutubeTaste } from "@/lib/youtube/taste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await requireUserId();
    const accessToken = await getYoutubeAccessToken(userId);
    if (!accessToken) return jsonError("Chưa nối YouTube", 409);

    return Response.json(await syncYoutubeTaste(userId, accessToken));
  } catch (error) {
    return toErrorResponse(error);
  }
}
