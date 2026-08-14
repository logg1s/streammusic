import Link from "next/link";
import { Cover } from "@/components/library/cover";
import type { AlbumSummary } from "@/lib/library";

export function AlbumGrid({
  albums,
  emptyMessage = "Chưa có album nào.",
}: {
  albums: AlbumSummary[];
  emptyMessage?: string;
}) {
  if (albums.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {albums.map((album) => (
        <li key={album.id}>
          <Link href={`/albums/${album.id}`} className="group block">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg">
              <Cover
                url={album.coverUrl}
                title={album.title}
                size={400}
                fill
                className="transition-transform duration-300 group-hover:scale-[1.04]"
              />
            </div>
            <p className="mt-2.5 truncate text-sm font-medium transition-colors group-hover:text-accent-text">
              {album.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {album.artistName ?? "Không rõ nghệ sĩ"}
              {album.year ? ` · ${album.year}` : ""}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
