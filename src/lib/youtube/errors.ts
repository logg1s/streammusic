/**
 * Lỗi của nhánh phát YouTube. Để riêng, không phụ thuộc gì, vì `src/lib/http.ts`
 * được mọi route import — không muốn kéo cả `youtubei.js` vào từng route.
 */

/** YouTube đòi đăng nhập / xác minh không phải robot → nên rơi về player nhúng. */
export class YoutubeBlockedError extends Error {}

/** Video bị chặn hẳn (Made-for-Kids, riêng tư, gỡ) → bỏ bài, sang bài kế. */
export class VideoUnplayableError extends Error {}
