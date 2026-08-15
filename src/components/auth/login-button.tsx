"use client";

import { useState } from "react";
import { isTauri } from "@/components/player/native-audio-engine";

/**
 * Nút đăng nhập, hai đường tuỳ vỏ.
 *
 * ── VÌ SAO VỎ NATIVE PHẢI ĐI ĐƯỜNG KHÁC ──────────────────────────────────────
 * Google chặn OAuth trong webview nhúng (`disallowed_useragent`), mà cửa sổ Tauri chính
 * là một webview. Nên trong app: mở **browser hệ thống** tới `/api/native/authorize`,
 * đăng nhập ở đó, rồi server trả về `vong://auth?code=…` — Rust bắt link đó và đưa
 * WebView tới `/api/native/adopt` để nhận cookie phiên.
 *
 * Trên web thì không có chuyện đó: cứ `signIn` của Auth.js như thường.
 */
export function LoginButton({
  signInWithGoogle,
}: {
  signInWithGoogle: () => Promise<void>;
}) {
  const [native] = useState(isTauri);
  const [waiting, setWaiting] = useState(false);

  if (native) {
    return (
      <button
        type="button"
        disabled={waiting}
        onClick={async () => {
          setWaiting(true);
          try {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl(`${window.location.origin}/api/native/authorize`);
          } finally {
            // Người dùng có thể tắt tab browser mà không đăng nhập, nên nút phải
            // bấm lại được ngay chứ không chờ deep link.
            setWaiting(false);
          }
        }}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
      >
        Đăng nhập bằng Google
      </button>
    );
  }

  return (
    <form action={signInWithGoogle}>
      <button
        type="submit"
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.02]"
      >
        Đăng nhập bằng Google
      </button>
    </form>
  );
}
