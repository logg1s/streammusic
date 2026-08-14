import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 245 -> "4:05", 3725 -> "1:02:05" */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
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
