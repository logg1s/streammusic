import { AlbumGrid } from "@/components/library/album-grid";
import { TrackList } from "@/components/library/track-list";
import { YoutubeSearch } from "@/components/library/youtube-search";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { searchLibrary } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const userId = await requireUserId();
  const { q = "" } = await searchParams;
  const query = q.trim();

  const results = query
    ? await searchLibrary(userId, query)
    : { tracks: [], albums: [] };

  const found = results.tracks.length + results.albums.length;

  return (
    <>
      <PageHeader
        eyebrow="Thư viện và YouTube"
        title="Tìm kiếm"
        readout={
          query
            ? `“${query}”  ·  ${found} kết quả trong thư viện`
            : "Tên bài, nghệ sĩ hoặc album"
        }
      />

      <form action="/search" method="get" className="mb-10">
        <label htmlFor="q" className="sr-only">
          Từ khoá
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          autoFocus
          placeholder="Nhập tên bài, nghệ sĩ hoặc album"
          className="w-full max-w-xl rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
        />
      </form>

      {query && found === 0 && (
        <p className="mb-8 text-sm text-muted-foreground">
          Thư viện không có kết quả cho “{query}”. Xem mục “Trên YouTube” bên
          dưới, hoặc quét lại kho lưu trữ nếu bài hát mới được thêm.
        </p>
      )}

      <div className="space-y-12">
        {results.albums.length > 0 && (
          <section>
            <h2 className="eyebrow mb-4">Album</h2>
            <AlbumGrid albums={results.albums} />
          </section>
        )}

        {results.tracks.length > 0 && (
          <section>
            <h2 className="eyebrow mb-3">Bài hát</h2>
            <TrackList tracks={results.tracks} />
          </section>
        )}

        <YoutubeSearch key={query} query={query} />
      </div>
    </>
  );
}
