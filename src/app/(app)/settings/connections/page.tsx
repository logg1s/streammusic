import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { getDb } from "@/db";
import {
  scanRoots,
  tracks,
  youtubeTasteArtists,
  youtubeTasteVideos,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { ConnectionsManager } from "@/components/settings/connections-manager";
import { YoutubeLink } from "@/components/settings/youtube-link";
import { requireUserId } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { formatNumber, formatVnDate } from "@/lib/utils";
import { ALL_PROVIDERS } from "@/lib/providers";
import {
  getYoutubeAccount,
  isYoutubeOauthConfigured,
} from "@/lib/youtube/account";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; youtube?: string }>;
}) {
  const userId = await requireUserId();
  const { error, connected, youtube } = await searchParams;

  const connections = await listConnections(userId);
  const db = getDb();

  const views = await Promise.all(
    connections.map(async (connection) => {
      const [roots, [trackCount]] = await Promise.all([
        db.select().from(scanRoots).where(eq(scanRoots.connectionId, connection.id)),
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

  // Provider chưa điền client id/secret thì không hiện ra để khỏi dẫn vào ngõ cụt.
  const available = ALL_PROVIDERS.filter((p) => p.isConfigured()).map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));

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

  return (
    <>
      {/* Trang con của /settings — không có đường quay lại thì nó thành ngõ cụt. */}
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-accent-text"
      >
        <ChevronLeft className="size-4" />
        Cài đặt
      </Link>

      <PageHeader
        eyebrow="Cài đặt"
        title="Kho lưu trữ"
        readout={`${formatNumber(views.length)} kết nối  ·  ${formatNumber(views.reduce((s, v) => s + v.trackCount, 0))} bài đã lập chỉ mục`}
      />

      {error && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {connected && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-text"
        >
          Đã nối {connected}. Chọn thư mục nhạc rồi bấm quét.
        </p>
      )}
      {youtube && (
        <p
          role="status"
          className="mb-6 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent-text"
        >
          Đã nối YouTube: {youtube}. Gu nhạc đã được đồng bộ.
        </p>
      )}

      <YoutubeLink
        account={
          ytAccount
            ? {
                channelTitle: ytAccount.channelTitle,
                status: ytAccount.status,
                tasteSyncedAt: ytAccount.tasteSyncedAt
                  ? formatVnDate(ytAccount.tasteSyncedAt)
                  : null,
              }
            : null
        }
        likedCount={likedCount?.value ?? 0}
        artistCount={artistCount?.value ?? 0}
        configured={isYoutubeOauthConfigured()}
      />

      <ConnectionsManager connections={views} available={available} />
    </>
  );
}
