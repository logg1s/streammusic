import { optionalUserId } from "@/lib/auth";
import { appOrigin, toErrorResponse } from "@/lib/http";
import { issueHandoffCode } from "@/lib/native-handoff";

export const runtime = "nodejs";

/** Scheme deep link của vỏ native — khai trong `app.json` (Expo) và `tauri.conf.json`. */
const NATIVE_CALLBACK = "vong://auth";

/**
 * Cửa vào duy nhất cho việc đăng nhập của vỏ native.
 *
 * Vỏ mở URL này trong **browser hệ thống** (Custom Tabs / trình duyệt mặc định), không
 * phải WebView nhúng: Google từ chối OAuth từ embedded user-agent
 * (`disallowed_useragent`). Chưa đăng nhập thì đẩy qua `/login` với `callbackUrl` tương
 * đối — Auth.js chỉ nhận redirect nội bộ, URL tuyệt đối sang host khác sẽ bị chặn.
 *
 * Đăng nhập rồi thì phát mã một lần và bật về app qua `vong://auth?code=…`. Deep link
 * chạy được vì `Response.redirect` của Next chỉ kiểm `new URL(url)`, không đòi http(s).
 */
export async function GET(request: Request) {
  try {
    const userId = await optionalUserId();
    if (!userId) {
      const login = new URL("/login", appOrigin(request));
      login.searchParams.set("callbackUrl", "/api/native/authorize");
      return Response.redirect(login, 302);
    }

    const code = await issueHandoffCode(userId);
    return Response.redirect(`${NATIVE_CALLBACK}?code=${code}`, 302);
  } catch (error) {
    return toErrorResponse(error);
  }
}
