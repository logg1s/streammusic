import { AlbumGrid } from "@/components/library/album-grid";
import { TrackList } from "@/components/library/track-list";
import { YoutubeSearch } from "@/components/library/youtube-search";
import { SearchBox } from "@/components/library/search-box";
import { SearchDiscovery } from "@/components/library/search-discovery";
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
        eyebrow="Thư viện · YouTube"
        title="Tìm kiếm"
        readout={
          query
            ? `“${query}”  ·  ${found} kết quả trong thư viện`
            : "Tên bài, nghệ sĩ hoặc album"
        }
      />

      <SearchBox key={query} initialQuery={query} />

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
            <TrackList tracks={results.tracks} radioOnTap />
          </section>
        )}

        {query ? <YoutubeSearch key={query} query={query} /> : <SearchDiscovery />}
      </div>
    </>
  );
}
