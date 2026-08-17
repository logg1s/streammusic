import type { PlayableTrack, StorageProviderId } from "@vong/shared";
import { formatNumber } from "@vong/shared";

/**
 * Các hàm định dạng số/thời lượng đã chuyển sang `@vong/shared` để web dùng chung một
 * bản. Re-export ở đây nên mọi màn hình mobile vẫn `import … from "@/lib/format"` như
 * cũ. Phần còn lại của file là các nhãn/dòng phụ riêng của mobile.
 */
export {
  formatDuration,
  formatLibraryStats,
  formatLongDuration,
  formatNumber,
} from "@vong/shared";
export type { LibraryStats } from "@vong/shared";

/** Dòng phụ của một bài: nghệ sĩ, rồi album nếu có. */
export function trackSubtitle(track: PlayableTrack): string {
  const parts = [track.artistName ?? "Không rõ nghệ sĩ"];
  if (track.albumName) parts.push(track.albumName);
  return parts.join("  ·  ");
}

/** Dòng phụ của một album: nghệ sĩ, năm, số bài. */
export function albumSubtitle(album: {
  artistName: string | null;
  year: number | null;
  trackCount: number;
}): string {
  const parts = [album.artistName ?? "Không rõ nghệ sĩ"];
  if (album.year !== null) parts.push(String(album.year));
  parts.push(`${formatNumber(album.trackCount)} bài`);
  return parts.join("  ·  ");
}

export const PROVIDER_LABEL: Record<StorageProviderId, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
};

/** Khớp `connections.status` trong `src/db/schema.ts`. */
export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động",
  needs_reauth: "Cần nối lại",
};
