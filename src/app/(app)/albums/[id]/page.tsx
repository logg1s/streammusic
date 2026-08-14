import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/library/cover";
import { PlayAllButton, TrackList } from "@/components/library/track-list";
import { requireUserId } from "@/lib/auth";
import { getAlbum } from "@/lib/library";
import { formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;

  const result = await getAlbum(userId, id);
  if (!result) notFound();

  const { album, tracks } = result;
  const totalSeconds = tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);

  return (
    <>
      <header className="mb-8 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div className="relative size-40 shrink-0 sm:size-52">
          <Cover
            url={album.coverUrl}
            title={album.title}
            size={208}
            fill
            priority
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="eyebrow">Album</p>
          <h1 className="mt-1.5 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {album.title}
          </h1>

          {album.artistId ? (
            <Link
              href={`/artists/${album.artistId}`}
              className="mt-3 inline-block text-sm text-muted-foreground transition-colors hover:text-accent-text"
            >
              {album.artistName}
            </Link>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Không rõ nghệ sĩ</p>
          )}

          <p className="readout mt-2">
            {[
              album.year ? String(album.year) : null,
              `${tracks.length} bài`,
              formatDuration(totalSeconds),
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>

          <div className="mt-5">
            <PlayAllButton tracks={tracks} />
          </div>
        </div>
      </header>

      <TrackList tracks={tracks} variant="numbered" />
    </>
  );
}
