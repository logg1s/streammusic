import { cookies } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { upsertConnection } from "@/lib/connections";
import { getProvider, isProviderId } from "@/lib/providers";
import { appOrigin, jsonError, oauthRedirectUri } from "@/lib/http";
import { stateCookieName } from "@/lib/oauth-state";

export const runtime = "nodejs";

function backToSettings(request: Request, query: Record<string, string>) {
  const url = new URL("/settings/connections", appOrigin(request));
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  if (!isProviderId(providerId)) return jsonError("Provider không hợp lệ", 404);

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookieName(providerId))?.value;
  cookieStore.delete(stateCookieName(providerId));

  if (error) {
    return backToSettings(request, {
      error: url.searchParams.get("error_description") ?? error,
    });
  }
  if (!code) return backToSettings(request, { error: "Thiếu mã uỷ quyền" });
  if (!state || !expectedState || state !== expectedState) {
    return backToSettings(request, {
      error: "State không khớp — hãy thử kết nối lại",
    });
  }

  try {
    const userId = await requireUserId();
    const provider = getProvider(providerId);
    const tokens = await provider.exchangeCode(
      code,
      oauthRedirectUri(request, providerId),
    );
    const identity = await provider.getIdentity(tokens.accessToken);

    if (!tokens.refreshToken) {
      // Không có refresh token thì kết nối sẽ chết sau khi access token hết hạn.
      // Với Google, nguyên nhân thường là user đã từng cấp quyền trước đó.
      console.warn(
        `[${providerId}] không nhận được refresh_token cho ${identity.label}`,
      );
    }

    await upsertConnection(userId, providerId, tokens, identity);
    return backToSettings(request, { connected: provider.displayName });
  } catch (err) {
    console.error(err);
    return backToSettings(request, {
      error: err instanceof Error ? err.message : "Kết nối thất bại",
    });
  }
}
