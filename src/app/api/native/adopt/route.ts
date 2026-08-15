import { headers } from "next/headers";
import { appOrigin, jsonError, toErrorResponse } from "@/lib/http";
import { HandoffCodeError, consumeHandoffCode } from "@/lib/native-handoff";
import { sessionCookieName } from "@/lib/session-token";

export const runtime = "nodejs";

/**
 * Đổi mã trao tay thành **cookie phiên** rồi trả về trang chủ.
 *
 * Đường của vỏ Tauri: nó nạp thẳng web app trong WebView2, nên chỉ cần cookie là mọi
 * trang và route handler chạy y như trên trình duyệt — không phải sửa một dòng UI nào.
 *
 * Cookie đặt tay chứ không qua Auth.js vì Auth.js chỉ set cookie trong luồng
 * signIn/callback của nó. Thuộc tính phải khớp `defaultCookies` của `@auth/core`
 * (`httpOnly`, `sameSite: lax`, `path: /`, `secure` khi https), và **tên** phải khớp
 * `salt` lúc mint — xem `sessionCookieName`.
 */
export async function GET(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const requestHeaders = await headers();
    const { token, expiresAt } = await consumeHandoffCode(requestHeaders, code);

    const name = sessionCookieName(requestHeaders);
    const secure = name.startsWith("__Secure-");
    const maxAge = Math.floor((expiresAt - Date.now()) / 1000);

    return new Response(null, {
      status: 302,
      headers: {
        location: appOrigin(request),
        "set-cookie": [
          `${name}=${token}`,
          "Path=/",
          "HttpOnly",
          "SameSite=Lax",
          `Max-Age=${maxAge}`,
          ...(secure ? ["Secure"] : []),
        ].join("; "),
      },
    });
  } catch (error) {
    if (error instanceof HandoffCodeError) return jsonError(error.message, 400);
    return toErrorResponse(error);
  }
}
