import { notFound } from "next/navigation";
import { PlaylistRename } from "@/components/library/playlist-rename";
import { PlaylistTracks } from "@/components/library/playlist-tracks";
import { PlayAllButton } from "@/components/library/track-list";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { getPlaylist } from "@/lib/playlists";
import { formatLongDuration, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlaylistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const result = await getPlaylist(userId, id);
  if (!result) notFound();

  const { playlist, items } = result;
  const tracks = items.map((item) => item.track);
  const totalSeconds = tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={
          playlist.seedLabel ? `Radio · ${playlist.seedLabel}` : "Playlist"
        }
        title={playlist.name}
        readout={`${formatNumber(tracks.length)} bài  ·  ${formatLongDuration(totalSeconds)}`}
        action={
          <div className="flex items-center gap-1">
            <PlaylistRename playlistId={playlist.id} name={playlist.name} />
            <PlayAllButton tracks={tracks} />
          </div>
        }
      />

      <PlaylistTracks playlistId={playlist.id} items={items} />
    </>
  );
}
