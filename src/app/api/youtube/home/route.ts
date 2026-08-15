import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import type { PlayableTrack } from "@/lib/library";
import { homeSections, persistHits } from "@/lib/youtube/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Trang chủ YouTube Music đổi chậm, mà mỗi lần lấy phải mở vài playlist. */
const TTL_MS = 6 * 60 * 60 * 1000;
const SECTIONS = 5;

let cache: {
  at: number;
  sections: { title: string; tracks: PlayableTrack[] }[];
} | null = null;

/**
 * Các hàng gợi ý của YouTube Music. Có `YT_MUSIC_COOKIE` thì là gợi ý cá nhân hoá
 * theo tài khoản đó; không thì là gợi ý chung theo vùng.
 */
export async function GET() {
  try {
    await requireUserId();
    if (cache && Date.now() - cache.at < TTL_MS) {
      return Response.json({ sections: cache.sections });
    }

    const raw = await homeSections(SECTIONS);
    const sections = [];
    for (const section of raw) {
      const tracks = await persistHits(section.hits);
      if (tracks.length > 0) sections.push({ title: section.title, tracks });
    }

    cache = { at: Date.now(), sections };
    return Response.json({ sections });
  } catch (error) {
    return toErrorResponse(error);
  }
}
