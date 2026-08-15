import type { PlayableTrack, StorageProviderId } from "@vong/shared";

/**
 * Định dạng chuỗi hiển thị. Tiếng Việt không chia số nhiều nên mọi hàm ở đây chỉ nối
 * số với danh từ — đừng thêm "s" như bản web tiếng Anh nào khác.
 */

/** 245 -> "4:05", 3725 -> "1:02:05". Giữ khớp `formatDuration` của web. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "--:--";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** Tổng thời lượng thư viện: đọc theo giờ/phút chứ không phải đồng hồ đếm. */
export function formatLongDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "0 phút";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours === 0) return `${Math.max(1, minutes)} phút`;
  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

export interface LibraryStats {
  trackCount: number;
  albumCount: number;
  artistCount: number;
  totalSeconds: number;
}

/** Dải thông số dưới tiêu đề trang: "1.204 bài · 87 album · 41 nghệ sĩ · 82 giờ". */
export function formatLibraryStats(stats: LibraryStats): string {
  return [
    `${formatNumber(stats.trackCount)} bài`,
    `${formatNumber(stats.albumCount)} album`,
    `${formatNumber(stats.artistCount)} nghệ sĩ`,
    formatLongDuration(stats.totalSeconds),
  ].join("  ·  ");
}

/**
 * Phân cách nghìn bằng dấu chấm theo lối Việt.
 *
 * Tự cắt chứ không gọi `toLocaleString("vi-VN")`: Hermes build cho Android mặc định
 * không nhúng ICU đầy đủ nên locale lạ sẽ âm thầm rơi về "en-US" (dấu phẩy).
 */
export function formatNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.abs(Math.trunc(value)).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ".";
    out += digits[i];
  }
  return sign + out;
}

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
