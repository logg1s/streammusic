import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import {
  getLibraryStats,
  getRecentAlbums,
  getRecentlyPlayed,
  getRecentTracks,
} from "@/lib/library";

export const runtime = "nodejs";

/**
 * Dữ liệu trang chủ cho vỏ native.
 *
 * Web đọc thẳng DB trong Server Component (`src/app/(app)/page.tsx`) nên không cần route
 * này; app mobile thì không với tới DB được. Endpoint chỉ gọi lại **đúng** những hàm
 * trang web gọi, cùng tham số — không viết lại truy vấn nào, để hai bên không bao giờ
 * lệch dữ liệu.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const [played, recent, albums, stats] = await Promise.all([
      getRecentlyPlayed(userId, 12),
      getRecentTracks(userId, 12),
      getRecentAlbums(userId),
      getLibraryStats(userId),
    ]);
    return Response.json({ played, recent, albums, stats });
  } catch (error) {
    return toErrorResponse(error);
  }
}
