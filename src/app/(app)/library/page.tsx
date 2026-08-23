import { LibraryOverview } from "@/components/library/library-overview";
import { requireUserId } from "@/lib/auth";
import { getArtists, getLibraryStats, getRecentAlbums } from "@/lib/library";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const userId = await requireUserId();
  const [albums, artists, stats] = await Promise.all([
    getRecentAlbums(userId, 10),
    getArtists(userId),
    getLibraryStats(userId),
  ]);

  return <LibraryOverview albums={albums} artists={artists} stats={stats} />;
}
