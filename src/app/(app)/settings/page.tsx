import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tracks, youtubeTasteArtists, youtubeTasteVideos } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import {
  SettingsLinkRow,
  SettingsRow,
  SettingsSection,
} from "@/components/settings/settings-ui";
import { TelemetryToggle } from "@/components/settings/telemetry-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUserId } from "@/lib/auth";
import { listConnections } from "@/lib/connections";
import { formatNumber } from "@/lib/utils";
import {
  getYoutubeAccount,
  isYoutubeOauthConfigured,
} from "@/lib/youtube/account";

export const dynamic = "force-dynamic";

/**
 * Cài đặt chung.
 *
 * Dựng theo đúng thứ tự mục của bản Android (`mobile/app/settings.tsx`) để hai vỏ đọc
 * ra cùng một màn hình: Phát nhạc → Giao diện → Riêng tư → Kho lưu trữ → YouTube →
 * Đăng xuất. "Giao diện" chỉ có ở đây vì Android hiện chưa có bảng màu sáng.
 *
 * Phần quản lý kho lưu trữ (nối tài khoản, chọn thư mục, quét) ở lại
 * `/settings/connections` — đó là một luồng nhiều bước, không phải một hàng cài đặt.
 */
export default async function SettingsPage() {
  const userId = await requireUserId();

  const connections = await listConnections(userId);
  const db = getDb();

  const [ytAccount, [trackCount], [likedCount], [artistCount]] =
    await Promise.all([
      getYoutubeAccount(userId),
      db
        .select({ value: count() })
        .from(tracks)
        .where(eq(tracks.userId, userId)),
      db
        .select({ value: count() })
        .from(youtubeTasteVideos)
        .where(eq(youtubeTasteVideos.userId, userId)),
      db
        .select({ value: count() })
        .from(youtubeTasteArtists)
        .where(eq(youtubeTasteArtists.userId, userId)),
    ]);

  const storageReadout = `${formatNumber(connections.length)} kết nối  ·  ${formatNumber(trackCount?.value ?? 0)} bài đã lập chỉ mục`;

  const youtubeHint = !isYoutubeOauthConfigured()
    ? "Máy chủ chưa cấu hình OAuth YouTube, nên chỉ tìm và phát được bài công khai."
    : ytAccount?.status === "active"
      ? `${formatNumber(likedCount?.value ?? 0)} bài đã thích · ${formatNumber(artistCount?.value ?? 0)} nghệ sĩ trong gu`
      : ytAccount?.status === "needs_reauth"
        ? "Cần nối lại tài khoản để tiếp tục đồng bộ gu nhạc."
        : "Chưa nối tài khoản YouTube. Nối để gợi ý ăn theo gu nhạc của bạn.";

  return (
    <>
      <PageHeader eyebrow="Vọng" title="Cài đặt" readout={storageReadout} />

      <SettingsSection label="Giao diện">
        <SettingsRow
          title="Chủ đề"
          hint="Sáng, Tối, hoặc theo cài đặt của hệ thống."
          control={<ThemeToggle />}
        />
      </SettingsSection>

      <SettingsSection label="Riêng tư">
        <TelemetryToggle />
      </SettingsSection>

      <SettingsSection label="Kho lưu trữ">
        <SettingsLinkRow
          href="/settings/connections"
          title="Kết nối và quét thư mục"
          hint="Nối Drive, Dropbox hay OneDrive rồi chọn thư mục nhạc để lập chỉ mục."
          readout={storageReadout}
        />
      </SettingsSection>

      <SettingsSection label="YouTube">
        <SettingsLinkRow
          href="/settings/connections"
          title={
            ytAccount?.status === "active"
              ? (ytAccount.channelTitle ?? "Đã nối tài khoản")
              : "Tài khoản YouTube"
          }
          hint={youtubeHint}
        />
      </SettingsSection>

      <Link
        href="/api/auth/signout"
        className="block rounded-full border border-border py-3 text-center text-sm font-semibold text-accent-text transition-colors hover:bg-surface"
      >
        Đăng xuất
      </Link>
    </>
  );
}
