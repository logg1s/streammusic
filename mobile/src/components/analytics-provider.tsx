import { useEffect } from "react";
import { AppState } from "react-native";
import { getAnalytics } from "@/lib/analytics";

/**
 * Vòng đời telemetry của vỏ Android. Không render gì.
 *
 * Đặt ngoài cổng đăng nhập trong `_layout.tsx` vì `app_open` phải đếm cả những lần mở
 * app rồi thoát ở màn hình đăng nhập — nếu chỉ đếm sau khi đăng nhập thì mọi tỉ lệ đều
 * mất mẫu số và trông đẹp hơn thực tế.
 */

const FLUSH_MS = 30_000;

export function AnalyticsProvider() {
  useEffect(() => {
    const analytics = getAnalytics();
    const startedAt = Date.now();
    let cancelled = false;

    void analytics.init().then(() => {
      if (!cancelled) analytics.track("app_open", { cold: true });
    });

    // Android giết app nền mà không báo trước, nên chốt phiên ngay lúc chuyển nền chứ
    // không đợi lúc thoát hẳn — lúc đó thường không còn cơ hội chạy code nào.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "background") return;
      analytics.track("session_end", {
        sec: Math.round((Date.now() - startedAt) / 1000),
      });
      void analytics.flush();
    });

    const timer = setInterval(() => void analytics.flush(), FLUSH_MS);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  return null;
}
