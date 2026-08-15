"use client";

import { YouTubeEngine } from "@/components/player/youtube-engine";
import { usePlayer } from "@/store/player";

/**
 * Chỉ mount iframe của YouTube khi đường phát chính đã thất bại.
 *
 * Đường chính là proxy `/api/youtube/audio/<videoId>` chạy qua hồ <audio> —
 * chỉ có nó phát nền được khi khoá máy (Chromium chỉ tạm dừng media ẩn khi có
 * video; iOS chỉ cho web app standalone phát nền media của CHÍNH app, không phải
 * media trong iframe cross-origin).
 *
 * Layout là server component nên cần cầu nối client này để đọc store.
 */
export function YoutubeFallbackGate() {
  const ytFallback = usePlayer((s) => s.ytFallback);
  return ytFallback ? <YouTubeEngine /> : null;
}
