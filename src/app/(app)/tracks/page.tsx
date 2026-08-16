import Link from "next/link";
import { TrackList } from "@/components/library/track-list";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { getAllTracks, getLibraryStats } from "@/lib/library";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export default async function TracksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const userId = await requireUserId();
  const { page } = await searchParams;

  const pageNumber = Math.max(1, Number(page) || 1);
  const [tracks, stats] = await Promise.all([
    getAllTracks(userId, PAGE_SIZE, (pageNumber - 1) * PAGE_SIZE),
    getLibraryStats(userId),
  ]);

  const totalPages = Math.max(1, Math.ceil(stats.trackCount / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Bài hát"
        readout={
          stats.trackCount > 0
            ? `${stats.trackCount} bài  ·  trang ${pageNumber}/${totalPages}`
            : undefined
        }
      />

      <TrackList
        tracks={tracks}
        emptyMessage="Chưa có bài nào. Quét một thư mục nhạc để bắt đầu."
      />

      {totalPages > 1 && (
        <nav
          aria-label="Phân trang"
          className="mt-8 flex items-center justify-between border-t border-border pt-4 text-sm"
        >
          {/*
            Phải là `next/link`, không được là `<a>`. Thẻ `a` thường là một lần điều
            hướng tài liệu đầy đủ: cả cây React bị dỡ, kéo theo `PlaybackEngines` gắn
            trong layout `(app)` — tức là đang nghe nhạc mà bấm sang trang 2 thì nhạc
            đứt. Trên Windows còn tệ hơn: engine Rust giữ tiếng độc lập với WebView,
            nên tiếng có thể vẫn chạy vào một giao diện đã quên mất nó.
          */}
          {pageNumber > 1 ? (
            <Link
              href={`/tracks?page=${pageNumber - 1}`}
              className="text-muted-foreground transition-colors hover:text-accent-text"
            >
              ← Trang trước
            </Link>
          ) : (
            <span />
          )}
          {pageNumber < totalPages && (
            <Link
              href={`/tracks?page=${pageNumber + 1}`}
              className="text-muted-foreground transition-colors hover:text-accent-text"
            >
              Trang sau →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
