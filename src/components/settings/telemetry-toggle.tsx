"use client";

import { useEffect, useState } from "react";
import { SettingsRow, SettingsSwitch } from "@/components/settings/settings-ui";
import { getAnalytics } from "@/lib/analytics";

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

  const toggle = (next: boolean) => {
    const analytics = getAnalytics();
    if (!analytics) return;
    setEnabled(next);
    void analytics.setEnabled(next);
    // Ghi lại việc bật lên, không ghi việc tắt đi — gửi một sự kiện ngay sau khi người
    // dùng vừa từ chối thu thập là đúng thứ họ vừa nói không.
    if (next) analytics.track("setting_change", { key: "telemetry", value: "on" });
  };

  return (
    <SettingsRow
      title="Gửi số liệu ẩn danh"
      hint="Giúp biết tính năng nào thật sự được dùng. Không gửi từ khoá tìm kiếm, không gửi tên bài hát, không gắn với tài khoản của bạn."
      control={
        <SettingsSwitch
          label="Gửi số liệu ẩn danh"
          checked={enabled}
          onChange={toggle}
        />
      }
    />
  );
}
