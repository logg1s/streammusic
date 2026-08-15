import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { getAllTracks, getLibraryStats } from "@/lib/library";

export const runtime = "nodejs";

/** Bằng `PAGE_SIZE` của `src/app/(app)/tracks/page.tsx` — hai bên phân trang giống nhau. */
const PAGE_SIZE = 200;

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const page = Math.max(
      1,
      Number(new URL(request.url).searchParams.get("page")) || 1,
    );

    const [tracks, stats] = await Promise.all([
      getAllTracks(userId, PAGE_SIZE, (page - 1) * PAGE_SIZE),
      getLibraryStats(userId),
    ]);

    return Response.json({
      tracks,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(stats.trackCount / PAGE_SIZE)),
      stats,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
