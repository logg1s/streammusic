import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { appOrigin, jsonError, toErrorResponse } from "@/lib/http";
import { stateCookieName } from "@/lib/oauth-state";
import {
  buildYoutubeAuthUrl,
  isYoutubeOauthConfigured,
} from "@/lib/youtube/account";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUserId();
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
