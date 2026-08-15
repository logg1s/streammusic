"use client";

import { useState } from "react";
import { AudioEngine } from "@/components/player/audio-engine";
import {
  isTauri,
  NativeAudioEngine,
} from "@/components/player/native-audio-engine";
import { YouTubeEngine } from "@/components/player/youtube-engine";

/**
 * Chọn engine phát nhạc đúng cho môi trường đang chạy.
 *
 * ── VÌ SAO ĐỌC MỘT LẦN TRONG `useState` ──────────────────────────────────────
 * Đổi engine giữa phiên là mất tiếng: bên bị unmount mang theo cả `<audio>`/iframe hoặc
 * sink Rust đang giữ bài, còn bên mới không biết bài nào đang phát tới đâu. Vì vậy quyết
 * định được chốt ở lần render đầu và không bao giờ xét lại.
 *
 * Trên web: hồ `<audio>` cho bài thư viện, iframe cho bài YouTube (mất phát nền — đã
 * chấp nhận). Trong vỏ Tauri: cả hai đi qua Rust, nên thu nhỏ cửa sổ hay khoá máy nhạc
 * vẫn chạy.
 */
export function PlaybackEngines() {
  const [native] = useState(isTauri);

  if (native) return <NativeAudioEngine />;

  return (
    <>
      <AudioEngine />
      {/* Iframe luôn mount: bài YouTube phát bằng IFrame Player API, và player được
          dựng sẵn từ đầu phiên để cú bấm đầu tiên ra tiếng ngay. */}
      <YouTubeEngine />
    </>
  );
}
