import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { unlinkYoutubeAccount } from "@/lib/youtube/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    await unlinkYoutubeAccount(await requireUserId());
    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
