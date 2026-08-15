import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { searchLibrary } from "@/lib/library";

export const runtime = "nodejs";

/**
 * Tìm trong thư viện. Chỉ phần thư viện — nhánh YouTube của trang tìm kiếm đã có route
 * riêng (`/api/youtube/search`), vỏ native gọi song song hai cái rồi ghép.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!query) return Response.json({ tracks: [], albums: [] });
    return Response.json(await searchLibrary(userId, query));
  } catch (error) {
    return toErrorResponse(error);
  }
}
