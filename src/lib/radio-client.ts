"use client";

import { createRadioClient } from "@vong/shared";
import { playerStore } from "@/store/player";

/**
 * Bản dựng cho web của lớp gọi API radio.
 *
 * Không truyền `baseUrl` (đường dẫn tương đối là đủ) và không truyền `authHeader`
 * (trình duyệt tự mang cookie phiên). `keepalive` bật vì chuyển bài hay đi kèm việc
 * đóng tab — React Native không có nên mặc định của shared là tắt.
 */
export const {
  startRadioFor,
  refillRadio,
  reportPlayed,
  reportBlocked,
} = createRadioClient(playerStore, { keepalive: true });
