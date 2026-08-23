import type { PlayableTrack } from "./types";

/** Dữ liệu nhẹ của một rail khám phá, dùng chung cho mọi vỏ ứng dụng. */
export interface DiscoveryHomeSection {
  title: string;
  tracks: PlayableTrack[];
}

const NEW_RELEASES = /\b(moi phat hanh|phat hanh moi|new releases?|latest releases?)\b/i;

/**
 * Tiêu đề shelf do YouTube trả theo locale. Chuẩn hoá dấu tiếng Việt để cùng nhận
 * "Mới phát hành" lẫn "Moi phat hanh", nhưng không gán nhãn sai cho một shelf
 * gợi ý bất kỳ khi nguồn chưa có nội dung phát hành mới.
 */
export function isNewReleaseTitle(title: string) {
  const normalized = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  return NEW_RELEASES.test(normalized);
}

export function findNewReleaseSection(sections: DiscoveryHomeSection[]) {
  return sections.find(
    (section) =>
      section.tracks.length > 0 && isNewReleaseTitle(section.title),
  );
}
