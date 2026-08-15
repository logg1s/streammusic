import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  scanRoots,
  tracks,
  youtubeTasteArtists,
  youtubeTasteVideos,
} from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { toErrorResponse } from "@/lib/http";
import { ALL_PROVIDERS } from "@/lib/providers";
import {
  getYoutubeAccount,
  isYoutubeOauthConfigured,
} from "@/lib/youtube/account";

export const runtime = "nodejs";

/**
 * Trang cài đặt kết nối, dạng JSON cho vỏ native.
 *
 * Gộp đúng những gì `(app)/settings/connections/page.tsx` gộp: kết nối + số bài + thư
 * mục đã quét, danh sách provider đã cấu hình, và trạng thái tài khoản YouTube.
 *
 * KHÔNG trả token hay refresh token: `listConnections` chỉ chọn cột hiển thị, và
 * `getYoutubeAccount` cũng vậy — vỏ native chỉ cần biết "đã nối chưa".
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const db = getDb();
    const connections = await listConnections(userId);

    const views = await Promise.all(
      connections.map(async (connection) => {
        const [roots, [trackCount]] = await Promise.all([
          db
            .select()
            .from(scanRoots)
            .where(eq(scanRoots.connectionId, connection.id)),
          db
            .select({ value: count() })
            .from(tracks)
            .where(eq(tracks.connectionId, connection.id)),
        ]);

        return {
          id: connection.id,
          provider: connection.provider,
          label: connection.label,
          status: connection.status,
          trackCount: trackCount?.value ?? 0,
          roots: roots.map((r) => ({
            id: r.id,
            remoteId: r.remoteId,
            name: r.name,
            path: r.path,
          })),
        };
      }),
    );

    const [ytAccount, [likedCount], [artistCount]] = await Promise.all([
      getYoutubeAccount(userId),
      db
        .select({ value: count() })
        .from(youtubeTasteVideos)
        .where(eq(youtubeTasteVideos.userId, userId)),
      db
        .select({ value: count() })
        .from(youtubeTasteArtists)
        .where(eq(youtubeTasteArtists.userId, userId)),
    ]);

    return Response.json({
      connections: views,
      available: ALL_PROVIDERS.filter((p) => p.isConfigured()).map((p) => ({
        id: p.id,
        displayName: p.displayName,
      })),
      youtube: {
        configured: isYoutubeOauthConfigured(),
        connected: Boolean(ytAccount),
        channelTitle: ytAccount?.channelTitle ?? null,
        needsReauth: ytAccount?.status === "needs_reauth",
        likedCount: likedCount?.value ?? 0,
        artistCount: artistCount?.value ?? 0,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
