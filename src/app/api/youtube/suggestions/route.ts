import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { searchSuggestions } from "@/lib/youtube/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireUserId();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!query) return Response.json({ suggestions: [] });
    if (query.length > 120) return jsonError("Từ khóa quá dài", 400);
    const suggestions = await searchSuggestions(query, 8);
    return Response.json({ suggestions });
  } catch (error) {
    return toErrorResponse(error);
  }
}
