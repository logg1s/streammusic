import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { youtubeTracks } from "@/db/schema";

export interface YoutubeTrackInput {
  videoId: string;
  title: string;
  artistName: string | null;
  channelTitle: string | null;
  durationSec: number | null;
}

/**
 * Ghi metadata video vào bộ nhớ đệm dùng chung.
 *
 * Cột `blocked` không bao giờ bị ghi đè: nó do IFrame player báo về (lỗi
 * 101/150) và phải sống lâu hơn mọi lần làm mới metadata.
 */
export async function upsertYoutubeTracks(
  rows: YoutubeTrackInput[],
): Promise<void> {
  // Postgres từ chối ON CONFLICT chạm cùng một hàng hai lần trong một câu lệnh.
  const unique = new Map<string, YoutubeTrackInput>();
  for (const row of rows) unique.set(row.videoId, row);
  if (unique.size === 0) return;

  await getDb()
    .insert(youtubeTracks)
    .values([...unique.values()])
    .onConflictDoUpdate({
      target: youtubeTracks.videoId,
      set: {
        title: sql`excluded.title`,
        artistName: sql`excluded.artist_name`,
        channelTitle: sql`excluded.channel_title`,
        durationSec: sql`excluded.duration_sec`,
        fetchedAt: sql`now()`,
      },
    });
}
