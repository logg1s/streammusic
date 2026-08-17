import * as WebBrowser from "expo-web-browser";
import { ORIGIN } from "@/lib/api";

/**
 * Mở một luồng OAuth của máy chủ trong browser hệ thống (Chrome Custom Tabs).
 *
 * Cùng lối với `signIn()` — Google từ chối OAuth từ WebView nhúng
 * (`disallowed_useragent`) nên bắt buộc phải là browser thật. Khác một chỗ quan
 * trọng: các route `authorize` này xác thực bằng **cookie phiên web**, không
 * đọc `Authorization: Bearer`. Cookie đó đã nằm sẵn trong browser hệ thống từ lúc
 * đăng nhập app, vì lượt đăng nhập ấy cũng chạy trong chính browser này.
 *
 * Không trả về kết quả: callback của provider kết thúc bằng redirect sang trang web
 * `/settings/connections`, nó không bật deep link `vong://` như luồng đăng nhập. Phiên
 * browser vì thế chỉ đóng khi người dùng tự đóng tab — nơi gọi phải tải lại dữ liệu
 * sau khi hàm này trả về chứ đừng suy ra thành công hay thất bại.
 */
export async function openOAuthFlow(path: string): Promise<void> {
  // `null` thay cho deep link: khai một URL không bao giờ được gọi tới chỉ khiến người
  // đọc sau tưởng luồng này bật ngược về app.
  await WebBrowser.openAuthSessionAsync(`${ORIGIN}${path}`, null);
}
