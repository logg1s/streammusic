import { TrackList } from "@/components/library/track-list";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { listFavorites } from "@/lib/favorites";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const favoriteList = await listFavorites(await requireUserId());

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Yêu thích"
        readout={
          favoriteList.tracks.length > 0
            ? `${favoriteList.tracks.length} bài`
            : undefined
        }
      />
      {favoriteList.tracks.length === 0 ? (
        <EmptyState title="Chưa có bài yêu thích">
          <p>Bấm biểu tượng trái tim ở một bài để lưu vào danh sách này.</p>
        </EmptyState>
      ) : (
        <TrackList tracks={favoriteList.tracks} hideUnfavorited />
      )}
    </>
  );
}
