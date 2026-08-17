import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { optionalUserId } from "@/lib/auth";
import { appOrigin, jsonError, toErrorResponse } from "@/lib/http";
import { stateCookieName } from "@/lib/oauth-state";
import {
  buildYoutubeAuthUrl,
  isYoutubeOauthConfigured,
} from "@/lib/youtube/account";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    // Route này mở trong browser hệ thống nên xác thực bằng cookie phiên web. Cookie
    // hết hạn hay bị xoá thì đẩy qua `/login` như `/api/native/authorize`: một tab
    // trình duyệt in ra JSON lỗi là ngõ cụt, người dùng không có đường nào đi tiếp.
    const userId = await optionalUserId();
    if (!userId) {
      const login = new URL("/login", appOrigin(request));
      login.searchParams.set("callbackUrl", "/api/youtube/oauth/authorize");
      return Response.redirect(login, 302);
    }

    if (!isYoutubeOauthConfigured()) {
      return jsonError(
        "Chưa cấu hình AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET",
        503,
      );
    }

    // Cùng cơ chế state chống CSRF như kho lưu trữ: ngẫu nhiên, gửi sang Google
    // và lưu song song vào cookie httpOnly để callback đối chiếu.
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set(stateCookieName("youtube"), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const redirectUri = `${appOrigin(request)}/api/youtube/oauth/callback`;
    return Response.redirect(buildYoutubeAuthUrl(state, redirectUri), 302);
  } catch (error) {
    return toErrorResponse(error);
  }
}
