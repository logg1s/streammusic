import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUserId } from "@/lib/auth";
import { getArtists } from "@/lib/library";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ArtistsPage() {
  const userId = await requireUserId();
  const artists = await getArtists(userId);

  return (
    <>
      <PageHeader
        eyebrow="Thư viện"
        title="Nghệ sĩ"
        readout={artists.length > 0 ? `${formatNumber(artists.length)} nghệ sĩ` : undefined}
      />

      {artists.length === 0 ? (
        <p className="py-8 text-sm text-muted-foreground">
          Chưa có nghệ sĩ nào. Quét một thư mục nhạc để bắt đầu.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {artists.map((artist) => (
            <li key={artist.id}>
              <Link
                href={`/artists/${artist.id}`}
                className="flex items-baseline justify-between gap-4 py-3 transition-colors hover:text-accent-text"
              >
                <span className="truncate text-sm text-foreground transition-colors hover:text-accent-text">
                  {artist.name}
                </span>
                <span className="tnum shrink-0 text-xs text-subtle">
                  {formatNumber(artist.trackCount)} bài
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
