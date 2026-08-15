import Link from "next/link";
import { AlbumGrid } from "@/components/library/album-grid";
import { TrackList } from "@/components/library/track-list";
import { EmptyState, PageHeader } from "@/components/page-header";
import { YoutubeRows } from "@/components/library/youtube-rows";
import { requireUserId } from "@/lib/auth";
import {
  getAlbums,
  getLibraryStats,
  getRecentlyPlayed,
  getRecentTracks,
} from "@/lib/library";
import { formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await requireUserId();
  const [played, recent, albums, stats] = await Promise.all([
    getRecentlyPlayed(userId, 12),
    getRecentTracks(userId, 12),
    getAlbums(userId),
    getLibraryStats(userId),
  ]);

  const hours = Math.round(stats.totalSeconds / 3600);
  const readout = [
    `${stats.trackCount} bài`,
    `${stats.albumCount} album`,
    `${stats.artistCount} nghệ sĩ`,
    hours > 0 ? `${hours} giờ` : formatDuration(stats.totalSeconds),
  ].join("  ·  ");

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Mới thêm"
        readout={stats.trackCount > 0 ? readout : undefined}
      />

      {stats.trackCount === 0 && played.length === 0 && (
        <EmptyState title="Thư viện còn trống">
          <p>
            Nhạc của bạn vẫn nằm nguyên trên Drive, Dropbox hay OneDrive. Nối
            một tài khoản rồi quét thư mục nhạc để bắt đầu nghe — hoặc tìm thẳng
            bài trên YouTube ở mục Tìm kiếm.
          </p>
          <Link
            href="/settings/connections"
            className="mt-5 inline-flex rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.03]"
          >
            Nối kho lưu trữ
          </Link>
        </EmptyState>
      )}

      <div className="space-y-12">
        {played.length > 0 && (
          <section>
            <h2 className="eyebrow mb-3">Nghe gần đây</h2>
            <TrackList tracks={played} />
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="eyebrow mb-3">Vừa thêm vào</h2>
            <TrackList tracks={recent} />
          </section>
        )}

        {albums.length > 0 && (
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="eyebrow">Album</h2>
              <Link
                href="/albums"
                className="text-xs text-muted-foreground transition-colors hover:text-accent-text"
              >
                Xem tất cả
              </Link>
            </div>
            <AlbumGrid albums={albums.slice(0, 10)} />
          </section>
        )}

        <YoutubeRows />
      </div>
    </>
  );
}
