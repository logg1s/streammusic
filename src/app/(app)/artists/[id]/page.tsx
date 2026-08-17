import { notFound } from "next/navigation";
import { AlbumGrid } from "@/components/library/album-grid";
import { TrackList } from "@/components/library/track-list";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { getArtist } from "@/lib/library";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ArtistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const result = await getArtist(userId, id);
  if (!result) notFound();

  const { artist, albums, singles } = result;
  const readout = [
    albums.length > 0 ? `${formatNumber(albums.length)} album` : null,
    singles.length > 0 ? `${formatNumber(singles.length)} bài lẻ` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <>
      <PageHeader
        eyebrow="Nghệ sĩ"
        title={artist.name}
        readout={readout || undefined}
      />

      <div className="space-y-12">
        {albums.length > 0 && (
          <section>
            <h2 className="eyebrow mb-4">Album</h2>
            <AlbumGrid albums={albums} />
          </section>
        )}

        {singles.length > 0 && (
          <section>
            <h2 className="eyebrow mb-3">Bài lẻ</h2>
            <TrackList tracks={singles} />
          </section>
        )}

        {albums.length === 0 && singles.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            Nghệ sĩ này chưa có bài nào trong thư viện.
          </p>
        )}
      </div>
    </>
  );
}
