"use client";

import { createRadioEngine } from "@vong/shared";
import { getPlaybackAnalytics } from "@/lib/analytics";
import { radioClient } from "@/lib/radio-client";
import { playerStore } from "@/store/player";

/**
 * Bản dựng cho web của bộ não radio.
 *
 * Là singleton cấp module chứ không nằm trong `RadioController`, vì các engine phát
 * nhạc cũng cần chạm tới nó: khi một bài không phát được và engine tự nhảy bài, nó
 * PHẢI báo `noteError` trước, nếu không cú nhảy đó bị coi là skip chủ động và tạo
 * tombstone sai trong radio session hiện tại.
 */
export const radioEngine = createRadioEngine(playerStore, radioClient, {
  // Store không phân biệt được radio tự bật với radio do người dùng bấm, mà đó lại
  // chính là con số kiểm chứng quyết định autoplay-mặc-định.
  onAutoplayTrigger: () => getPlaybackAnalytics()?.noteRadioTrigger("autoplay"),
});
