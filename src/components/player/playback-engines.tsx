"use client";

import { AudioEngine } from "@/components/player/audio-engine";
import { NativeAudioEngine } from "@/components/player/native-audio-engine";
import { YouTubeEngine } from "@/components/player/youtube-engine";
import { useTauriRuntime } from "@/lib/runtime";

/**
 * Chọn engine phát nhạc đúng cho môi trường đang chạy.
 *
 * ── VÌ SAO CHỈ CHỌN SAU HYDRATE ───────────────────────────────────────────────
 * Đổi engine giữa phiên là mất tiếng: bên bị unmount mang theo cả `<audio>`/iframe hoặc
 * sink Rust đang giữ bài, còn bên mới không biết bài nào đang phát tới đâu. Vì vậy quyết
 * định chỉ đọc từ snapshot runtime ổn định; HTML server không mount engine nào.
 *
 * Trên web: hồ `<audio>` cho bài thư viện, iframe cho bài YouTube (mất phát nền — đã
 * chấp nhận). Trong vỏ Tauri: cả hai đi qua Rust, nên thu nhỏ cửa sổ hay khoá máy nhạc
 * vẫn chạy.
 */
export function PlaybackEngines() {
  const native = useTauriRuntime();

  // Server và lượt hydrate đầu đều render rỗng. Sau hydrate chỉ một nhánh được
  // mount, nên không có khoảnh khắc hồ audio web và engine Rust cùng giữ bài.
  if (native === null) return null;

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
