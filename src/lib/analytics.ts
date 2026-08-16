"use client";

import { createAnalytics, type Analytics, type AnalyticsShell } from "@vong/shared";
import { APP_VERSION } from "@/lib/version";

/**
 * Một thể hiện telemetry duy nhất cho vỏ web.
 *
 * Vỏ Tauri nạp thẳng origin của web nên nó cũng chạy đúng file này — chỉ khác giá trị
 * `shell`, nhờ vậy Windows có số liệu mà không phải viết lớp riêng. Đây cũng là lý do
 * không được đọc `navigator.userAgent` để phân loại: bên trong Tauri nó vẫn là WebView.
 *
 * Là singleton lười vì `installId` phải sống xuyên suốt phiên; dựng lại mỗi lần render
 * sẽ sinh id mới và mọi phép đếm theo phiên trở nên vô nghĩa.
 */

let instance: Analytics | null = null;

function detectShell(): AnalyticsShell {
  // Giống hệt phép kiểm trong native-audio-engine.tsx — cùng một tín hiệu, cố ý không
  // import chéo để module này không kéo theo cả engine phát nhạc.
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    ? "windows"
    : "web";
}

/** `null` khi chạy phía server — mọi lời gọi phải chịu được điều đó. */
export function getAnalytics(): Analytics | null {
  if (typeof window === "undefined") return null;
  instance ??= createAnalytics({
    shell: detectShell(),
    appVersion: APP_VERSION,
    fetch: (url, init) => window.fetch(url, init),
    storage: {
      getItem: (key) => {
        try {
          return window.localStorage.getItem(key);
        } catch {
          // Chế độ riêng tư chặn localStorage — chạy tiếp với id trong bộ nhớ.
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* như trên */
        }
      },
    },
  });
  return instance;
}
