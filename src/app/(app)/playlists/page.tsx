import { PlaylistList } from "@/components/library/playlist-list";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { listPlaylists } from "@/lib/playlists";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  const userId = await requireUserId();
  const playlists = await listPlaylists(userId);

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Playlist"
        readout={
          playlists.length > 0 ? `${playlists.length} playlist` : undefined
        }
      />

      {playlists.length === 0 ? (
        <EmptyState title="Chưa có playlist nào">
          <p>
            Bấm Radio ở một bài rồi lưu hàng đợi lại — playlist sẽ nằm ở đây,
            nghe lại lúc nào cũng được.
          </p>
        </EmptyState>
      ) : (
        <PlaylistList playlists={playlists} />
      )}
    </>
  );
}
