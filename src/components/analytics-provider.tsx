"use client";

import { useEffect } from "react";
import { getAnalytics } from "@/lib/analytics";

/**
 * Vòng đời telemetry của vỏ web: khởi tạo, đánh dấu mở app, đẩy bộ đệm định kỳ và
 * chốt phiên khi người dùng rời đi.
 *
 * Không render gì. Đặt trong layout của khu vực đã đăng nhập nên nó sống suốt phiên,
 * không dựng lại mỗi lần điều hướng — App Router giữ layout, còn page thì không.
 */

/** Đẩy bộ đệm mỗi ngần này. Đủ thưa để không quấy request, đủ dày để mất ít khi crash. */
const FLUSH_MS = 30_000;

export function AnalyticsProvider() {
  useEffect(() => {
    const analytics = getAnalytics();
    if (!analytics) return;

    const startedAt = Date.now();
    let cancelled = false;

    void analytics.init().then(() => {
      // Trang mở lại từ bfcache không phải một lần mở "lạnh"; ở đây luôn là lạnh vì
      // effect chỉ chạy khi layout được gắn mới.
      if (!cancelled) analytics.track("app_open", { cold: true });
    });

    // Khai bằng const chứ không phải `function`: khai báo hàm bị hoist lên trước phép
    // kiểm null ở trên, nên TypeScript không giữ được kết quả thu hẹp kiểu.
    const endSession = () => {
      analytics.track("session_end", {
        sec: Math.round((Date.now() - startedAt) / 1000),
      });
      void analytics.flush();
    };

    const onVisibility = () => {
      // `visibilitychange` là tín hiệu đáng tin duy nhất trên mobile: tab bị đóng hay
      // app bị chuyển nền thường không kịp chạy `beforeunload`.
      if (document.visibilityState === "hidden") endSession();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", endSession);
    const timer = window.setInterval(() => void analytics.flush(), FLUSH_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", endSession);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
