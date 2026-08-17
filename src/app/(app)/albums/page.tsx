import { AlbumGrid } from "@/components/library/album-grid";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { getAlbums } from "@/lib/library";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AlbumsPage() {
  const userId = await requireUserId();
  const albums = await getAlbums(userId);

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Album"
        readout={albums.length > 0 ? `${formatNumber(albums.length)} album` : undefined}
      />
      <AlbumGrid
        albums={albums}
        emptyMessage="Chưa có album nào. Quét một thư mục nhạc để dựng thư viện."
      />
    </>
  );
}
