"use client";

import { useEffect } from "react";
import { radioEngine } from "@/lib/radio-engine";
import { usePlayer } from "@/store/player";

/**
 * Cầu nối giữa store và bộ não radio.
 *
 * Toàn bộ quyết định — khi nào nạp thêm, lùi bao lâu sau lỗi, khi nào xoay seed, khi
 * nào tự bật radio — nằm ở `createRadioEngine` trong `@vong/shared`, không nằm ở đây.
 * Trước đây nó nằm trong chính component này, với một bản chép tay trong app Android;
 * hai bản đã lệch nhau ở đường xử lý lỗi, và không bản nào test được vì cả hai đều là
 * component. Component này giờ chỉ còn làm đúng việc của một component: gắn vào vòng
 * đời React và tháo ra khi unmount.
 *
 * Không render gì. Đặt trong layout để sống suốt phiên — hàng đợi phải tự dài ra kể
 * cả khi người dùng đang ở trang khác.
 */
export function RadioController() {
  useEffect(() => {
    radioEngine.handle(usePlayer.getState());
    return usePlayer.subscribe((state) => radioEngine.handle(state));
  }, []);

  return null;
}
