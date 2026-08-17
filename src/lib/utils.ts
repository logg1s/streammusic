import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Định dạng số/thời lượng dùng chung với mobile — nguồn ở `@vong/shared/format`.
 * Trước đây web tự dựng lại inline (số không nhóm nghìn, tổng thời lượng làm tròn về
 * "X giờ" mất phút, lệch giữa các trang); giờ đọc cùng một bản với các vỏ khác.
 */
export {
  formatDuration,
  formatLibraryStats,
  formatLongDuration,
  formatNumber,
} from "@vong/shared";
export type { LibraryStats } from "@vong/shared";

/*
  DD/MM/YYYY theo giờ VN, dùng chung cho ngày tạo playlist và ngày đồng bộ gu YouTube —
  trước đây hai chỗ format khác nhau ("17/08/2026" vs "15/8/2026"). Múi giờ ghim để
  server và client render CÙNG một chuỗi, tránh React báo lệch hydrate.
*/
const VN_DATE = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
export function formatVnDate(date: Date): string {
  return VN_DATE.format(date);
}

/**
 * music-metadata trả tên codec dài dòng ("MPEG 1 Layer 3", "MPEG-4/AAC").
 * Dải thông số ở thanh phát chỉ có vài chục pixel nên rút về tên người ta hay gọi.
 */
export function shortCodec(codec: string | null | undefined): string | null {
  if (!codec) return null;
  const c = codec.toLowerCase();
  if (c.includes("layer 3") || c.includes("mp3")) return "MP3";
  if (c.includes("aac")) return "AAC";
  if (c.includes("flac")) return "FLAC";
  if (c.includes("opus")) return "OPUS";
  if (c.includes("vorbis")) return "VORBIS";
  if (c.includes("alac")) return "ALAC";
  if (c.includes("pcm") || c.includes("wav")) return "WAV";
  return codec.toUpperCase().slice(0, 8);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}
