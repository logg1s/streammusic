import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { getProvider, isProviderId } from "@/lib/providers";
import { jsonError, oauthRedirectUri, toErrorResponse } from "@/lib/http";
import { stateCookieName } from "@/lib/oauth-state";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    await requireUserId();
    const { provider: providerId } = await params;
    if (!isProviderId(providerId)) return jsonError("Provider không hợp lệ", 404);

    const provider = getProvider(providerId);
    if (!provider.isConfigured()) {
      return jsonError(
        `Chưa cấu hình client id/secret cho ${provider.displayName}`,
        503,
      );
    }

    // State chống CSRF: sinh ngẫu nhiên, gửi kèm sang provider và đồng thời lưu
    // vào cookie httpOnly để callback đối chiếu.
    const state = randomBytes(24).toString("base64url");
    (await cookies()).set(stateCookieName(providerId), state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const redirectUri = oauthRedirectUri(request, providerId);
    return Response.redirect(provider.buildAuthUrl(state, redirectUri), 302);
  } catch (error) {
    return toErrorResponse(error);
  }
}
