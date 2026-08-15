import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import type { PlayableTrack } from "@vong/shared";
import { getRecentPlaySeeds } from "@/lib/library";
import { homeSections, persistHits, relatedSongs } from "@/lib/youtube/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Section {
  title: string;
  tracks: PlayableTrack[];
}

/** Trang chủ YouTube Music đổi chậm, mà mỗi lần lấy phải mở vài playlist. */
const TTL_MS = 6 * 60 * 60 * 1000;
const SECTIONS = 5;

/**
 * Hàng cá nhân sống ngắn hơn: nghe thêm vài bài là hạt giống đã khác. Cache theo
 * user vì hai người không bao giờ dùng chung hàng này.
 */
const PERSONAL_TTL_MS = 30 * 60 * 1000;
const PERSONAL_SEEDS = 2;
const PERSONAL_HITS = 20;

let cache: { at: number; sections: Section[] } | null = null;
const personalCache = new Map<string, { at: number; sections: Section[] }>();

/**
 * Hàng gợi ý chung của YouTube Music. Lấy được thì cache 6 giờ cho cả app.
 *
 * Lưu ý đã đo trên bản deploy: YouTube vẫn chọn nội dung theo IP máy chủ dù
 * `location` đã ghim VN — máy chủ ở Mỹ thì hàng chung ra playlist Mỹ. Vì vậy hàng
 * cá nhân bên dưới mới là thứ giữ đúng gu, còn hàng chung chỉ để mở rộng.
 */
async function globalSections(): Promise<Section[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.sections;

  const raw = await homeSections(SECTIONS);
  const sections: Section[] = [];
  for (const section of raw) {
    const tracks = await persistHits(section.hits);
    if (tracks.length > 0) sections.push({ title: section.title, tracks });
  }

  cache = { at: Date.now(), sections };
  return sections;
}

/**
 * "Vì bạn nghe …" — dựng từ `play_events` của app, nên không phụ thuộc vùng IP của
 * máy chủ và không cần credential YouTube nào.
 */
async function personalSections(userId: string): Promise<Section[]> {
  const hit = personalCache.get(userId);
  if (hit && Date.now() - hit.at < PERSONAL_TTL_MS) return hit.sections;

  const seeds = await getRecentPlaySeeds(userId, PERSONAL_SEEDS);
  const sections: Section[] = [];
  for (const seed of seeds) {
    // Một hạt giống hỏng (video bị xoá, khu vực khoá) không được kéo cả trang xuống.
    try {
      const tracks = await persistHits(
        await relatedSongs(seed.videoId, PERSONAL_HITS),
      );
      if (tracks.length > 0) {
        sections.push({ title: `Vì bạn nghe ${seed.artistName}`, tracks });
      }
    } catch {
      continue;
    }
  }

  personalCache.set(userId, { at: Date.now(), sections });
  return sections;
}

/**
 * Các hàng gợi ý cho trang chủ: hàng theo gu của chính user trước, rồi tới hàng
 * chung của YouTube Music. Có `YT_MUSIC_COOKIE` thì hàng chung cũng cá nhân hoá
 * theo tài khoản đó.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const [personal, global] = await Promise.all([
      personalSections(userId),
      globalSections(),
    ]);
    return Response.json({ sections: [...personal, ...global] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
