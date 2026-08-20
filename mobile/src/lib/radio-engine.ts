import { createRadioClient, createRadioEngine } from "@vong/shared";
import { getPlaybackAnalytics } from "@/lib/analytics";
import { ORIGIN, getSessionToken } from "@/lib/api";
import { playerStore } from "@/store/player";

/**
 * Bản dựng cho Expo của bộ não radio.
 *
 * Là singleton cấp module chứ không nằm trong `RadioController`, vì `PlaybackEngine`
 * cũng cần chạm tới nó: khi một bài không phát được và engine tự nhảy bài, nó PHẢI báo
 * `noteError` trước, nếu không cú nhảy đó bị coi là skip chủ động và tạo tombstone
 * sai trong radio session hiện tại.
 *
 * Toàn bộ quyết định radio nằm ở `@vong/shared`. Trước đây app này giữ một bản CHÉP TAY
 * của logic đó; hai bản đã lệch nhau ở đúng đường xử lý lỗi — chỗ đắt nhất để lệch.
 * Ở đây chỉ còn đúng phần khác biệt thật của vỏ Expo: URL tuyệt đối, `Authorization`,
 * và `keepalive` phải tắt.
 */

/**
 * `Authorization` hiện tại, giữ ở dạng đồng bộ.
 *
 * `RadioClientOptions.authHeader` là hàm ĐỒNG BỘ (web chỉ cần cookie), còn token của
 * app nằm trong SecureStore — một lời gọi async. Nên phải có bản đệm này, được làm mới
 * lúc mount và mỗi lần đổi bài; đăng nhập giữa phiên nhờ đó cũng vào đúng lô kế tiếp.
 */
let cachedAuth: string | null = null;

export async function primeAuth(): Promise<void> {
  const token = await getSessionToken();
  cachedAuth = token ? `Bearer ${token}` : null;
}

/**
 * Lớp gọi API radio của vỏ Expo.
 *
 * `keepalive: false` — cờ đó chỉ có nghĩa trên web (giữ request sống khi tab đóng) và
 * `fetch` của React Native ném khi thấy nó.
 */
const radioClient = createRadioClient(playerStore, {
  baseUrl: ORIGIN,
  authHeader: () => cachedAuth,
  keepalive: false,
});

export const radioEngine = createRadioEngine(playerStore, radioClient, {
  // Store không phân biệt được radio tự bật với radio do người dùng bấm, mà đó lại
  // chính là con số kiểm chứng quyết định autoplay-mặc-định.
  onAutoplayTrigger: () => getPlaybackAnalytics().noteRadioTrigger("autoplay"),
});

/** Màn hình nào cần "Radio từ bài này" thì dùng đúng client này, đừng tạo client thứ hai. */
export const { startRadioFor, reportBlocked } = radioClient;
