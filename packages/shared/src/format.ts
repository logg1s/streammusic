/**
 * Định dạng chuỗi hiển thị dùng chung cho cả ba vỏ (web, desktop, mobile).
 *
 * Tiếng Việt không chia số nhiều nên mọi hàm ở đây chỉ nối số với danh từ. Trước đây
 * web tự dựng lại các chuỗi này inline (số không nhóm nghìn, tổng thời lượng làm tròn
 * về "X giờ" mất phút, lại còn lệch giữa các trang) còn mobile giữ bản chuẩn ở
 * `mobile/src/lib/format.ts`. Gom về đây để hai bên đọc CÙNG một cách.
 */

/** 245 -> "4:05", 3725 -> "1:02:05". Đồng hồ đếm — dùng cho thời lượng MỘT bài. */
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

/**
 * Tổng thời lượng (thư viện, album, playlist): đọc theo giờ/phút chứ không phải đồng
 * hồ đếm. Không làm tròn về giờ chẵn — "1 giờ 31 phút" thay vì "2 giờ".
 */
export function formatLongDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "0 phút";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours === 0) return `${Math.max(1, minutes)} phút`;
  return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

/**
 * Phân cách nghìn bằng dấu chấm theo lối Việt.
 *
 * Tự cắt chứ không gọi `toLocaleString("vi-VN")`: Hermes build cho Android mặc định
 * không nhúng ICU đầy đủ nên locale lạ sẽ âm thầm rơi về "en-US" (dấu phẩy). Web thì
 * dùng được `Intl` nhưng để hai vỏ ra kết quả byte-khớp thì dùng chung một hàm.
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
