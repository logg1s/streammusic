import Link from "next/link";
import { AlbumGrid } from "@/components/library/album-grid";
import { TrackList } from "@/components/library/track-list";
import { HomeQuickGrid } from "@/components/library/home-quick-grid";
import { EmptyState } from "@/components/page-header";
import { YoutubeRows } from "@/components/library/youtube-rows";
import { requireUserId } from "@/lib/auth";
import {
  getAlbums,
  getLibraryStats,
  getRecentlyPlayed,
  getRecentTracks,
} from "@/lib/library";
import { formatLibraryStats } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await requireUserId();
  const [played, recent, albums, stats] = await Promise.all([
    getRecentlyPlayed(userId, 12),
    getRecentTracks(userId, 12),
    getAlbums(userId),
    getLibraryStats(userId),
  ]);

  const readout = formatLibraryStats(stats);

  return (
    <>
      <header className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(255,92,122,0.22),transparent_48%),linear-gradient(135deg,#202128,#111116)] px-5 py-7 sm:px-8 sm:py-9">
        <p className="eyebrow text-accent-text">Dành cho bạn</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
          Chào bạn
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Nhạc từ thư viện của bạn và các danh sách kết hợp do YouTube đề xuất.
        </p>
        {stats.trackCount > 0 && <p className="readout mt-4">{readout}</p>}
      </header>

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
        <HomeQuickGrid tracks={played} />

        {played.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold tracking-tight">Nghe gần đây</h2>
            <TrackList tracks={played} radioOnTap />
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold tracking-tight">Vừa thêm vào</h2>
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
