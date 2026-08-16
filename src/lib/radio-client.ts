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
export const radioClient = createRadioClient(playerStore, { keepalive: true });

/**
 * Dạng rời cho các chỗ gọi lẻ (nút Radio, đường xử lý lỗi của engine phát).
 *
 * Chỉ hai cái này. `refillRadio`/`reportPlayed` cố tình KHÔNG được bày ra: chúng là
 * việc riêng của `radioEngine`, và gọi thẳng từ ngoài là qua mặt bộ lùi-dần cùng bộ
 * đếm gieo lại — tức là dựng lại đúng vòng lặp request mà cả chu kỳ này vừa xoá.
 */
export const { startRadioFor, reportBlocked } = radioClient;
