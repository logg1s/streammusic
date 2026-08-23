import Link from "next/link";
import {
  Disc3,
  Heart,
  ListMusic,
  ListPlus,
  Users,
} from "lucide-react";
import type { AlbumSummary } from "@vong/shared";
import { AlbumGrid } from "@/components/library/album-grid";
import { EmptyState } from "@/components/page-header";
import { formatNumber } from "@/lib/utils";

type ArtistSummary = { id: string; name: string; trackCount: number };

const COLLECTIONS = [
  { href: "/albums", label: "Album", icon: Disc3 },
  { href: "/artists", label: "Nghệ sĩ", icon: Users },
  { href: "/tracks", label: "Bài hát", icon: ListMusic },
  { href: "/favorites", label: "Yêu thích", icon: Heart },
  { href: "/playlists", label: "Playlist", icon: ListPlus },
] as const;

export function LibraryOverview({
  albums,
  artists,
  stats,
}: {
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  stats: { trackCount: number; albumCount: number; artistCount: number };
}) {
  const empty = stats.trackCount === 0;

  return (
    <div className="space-y-10 md:space-y-12">
      <header className="border-b border-border pb-6 md:pb-7">
        <h1 className="text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
          Thư viện
        </h1>
        {!empty && (
          <p className="readout mt-3">
            {formatNumber(stats.trackCount)} bài  ·  {formatNumber(stats.albumCount)} album  ·  {formatNumber(stats.artistCount)} nghệ sĩ
          </p>
        )}
      </header>

      <nav
        aria-label="Bộ sưu tập thư viện"
        className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-5 sm:divide-y-0"
      >
        {COLLECTIONS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-16 items-center gap-3 px-3 py-3 text-sm font-medium transition-colors first:pl-0 sm:min-h-14 sm:justify-center sm:px-4 sm:first:pl-4 hover:text-accent-text focus-visible:z-10"
          >
            <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-accent-text" />
            {label}
          </Link>
        ))}
      </nav>

      {empty ? (
        <EmptyState title="Thư viện còn trống">
          <p>
            Nối kho lưu trữ rồi quét thư mục nhạc để album, nghệ sĩ và bài hát của bạn xuất hiện ở đây.
          </p>
          <Link
            href="/settings/connections"
            className="mt-5 inline-flex rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.03]"
          >
            Nối kho lưu trữ
          </Link>
        </EmptyState>
      ) : (
        <>
          {albums.length > 0 && (
            <section aria-labelledby="recent-albums">
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 id="recent-albums" className="text-2xl font-bold tracking-tight">
                  Album gần đây
                </h2>
                <Link
                  href="/albums"
                  className="shrink-0 text-sm font-medium text-accent-text transition-colors hover:text-foreground"
                >
                  Xem tất cả
                </Link>
              </div>
              <AlbumGrid albums={albums.slice(0, 5)} />
            </section>
          )}

          {artists.length > 0 && (
            <section aria-labelledby="library-artists">
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 id="library-artists" className="text-2xl font-bold tracking-tight">
                  Nghệ sĩ trong thư viện
                </h2>
                <Link
                  href="/artists"
                  className="shrink-0 text-sm font-medium text-accent-text transition-colors hover:text-foreground"
                >
                  Xem tất cả
                </Link>
              </div>
              <ul className="grid grid-cols-3 gap-x-5 gap-y-7 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {artists.slice(0, 8).map((artist) => (
                  <li key={artist.id}>
                    <Link href={`/artists/${artist.id}`} className="group block text-center">
                      <span
                        aria-hidden
                        className="mx-auto grid aspect-square w-full max-w-28 place-items-center rounded-full border border-border bg-surface font-semibold text-muted-foreground transition-[border-color,color,transform] duration-200 group-hover:scale-[1.03] group-hover:border-accent group-hover:text-accent-text"
                      >
                        {artist.name.slice(0, 1).toLocaleUpperCase("vi-VN")}
                      </span>
                      <span className="mt-3 block truncate text-sm font-medium group-hover:text-accent-text">
                        {artist.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatNumber(artist.trackCount)} bài
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
