"use client";

import { useSyncExternalStore } from "react";
import { SettingsRow, SettingsSwitch } from "@/components/settings/settings-ui";
import { usePlayer } from "@/store/player";

/**
 * Công tắc "Tự phát tiếp" ở trang Cài đặt.
 *
 * Cho tới nay trên web nó chỉ nằm trong ngăn hàng đợi, và chỉ hiện khi hàng đợi có bài
 * (`queue-panel.tsx`) — người chưa từng mở hàng đợi thì không có đường nào thấy nó.
 * Bản Android đã để nó ở đầu màn hình Cài đặt từ trước; đây là bản web của đúng hàng đó.
 *
 * Giá trị nằm trong store dùng chung (đã `persist`), nên hai chỗ bật/tắt luôn cùng đọc
 * một nguồn — không có bản sao nào để lệch.
 */
export function AutoplayToggle() {
  const autoplay = usePlayer((s) => s.autoplay);
  const setAutoplay = usePlayer((s) => s.setAutoplay);

  // Store được `persist` từ localStorage nên server render ra giá trị mặc định còn
  // client render ra giá trị đã lưu. Giữ `null` cho tới khi hydrate xong để công tắc
  // không nháy một nhịp sai ngay lúc tải trang.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <SettingsRow
      title="Tự phát tiếp"
      hint="Hết album/playlist thì tự phát bài đề xuất theo gu."
      control={
        <SettingsSwitch
          label="Tự phát tiếp"
          checked={hydrated ? autoplay : null}
          onChange={setAutoplay}
        />
      }
    />
  );
}
