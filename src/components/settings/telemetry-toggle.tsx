"use client";

import { useEffect, useState } from "react";
import { getAnalytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Công tắc tắt/bật số liệu ẩn danh.
 *
 * Trạng thái đọc từ chính client telemetry chứ không giữ bản sao ở đâu khác: nguồn sự
 * thật là giá trị trong localStorage mà client đã đọc lúc `init()`, và một bản sao thứ
 * hai sớm muộn cũng lệch.
 *
 * Hiện `null` cho tới khi đọc xong để không nhấp nháy từ "Bật" sang "Tắt" ngay trước
 * mắt người vừa tắt nó đi.
 */
export function TelemetryToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const analytics = getAnalytics();
    if (!analytics) return;
    void analytics.init().then(() => setEnabled(analytics.isEnabled()));
  }, []);

  const toggle = async () => {
    const analytics = getAnalytics();
    if (!analytics || enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    await analytics.setEnabled(next);
    // Ghi lại việc bật lên, không ghi việc tắt đi — gửi một sự kiện ngay sau khi người
    // dùng vừa từ chối thu thập là đúng thứ họ vừa nói không.
    if (next) analytics.track("setting_change", { key: "telemetry", value: "on" });
  };

  return (
    <section className="mb-10">
      <h2 className="eyebrow mb-3">Riêng tư</h2>
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Gửi số liệu ẩn danh</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Giúp biết tính năng nào thật sự được dùng. Không gửi từ khoá tìm kiếm,
              không gửi tên bài hát, không gắn với tài khoản của bạn.
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={enabled === null}
            role="switch"
            aria-checked={enabled ?? false}
            aria-label="Gửi số liệu ẩn danh"
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full border border-border transition-colors",
              enabled ? "bg-accent" : "bg-surface-hover",
              enabled === null && "opacity-50",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-4 rounded-full bg-foreground transition-[left]",
                enabled ? "left-[1.5rem]" : "left-0.5",
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
