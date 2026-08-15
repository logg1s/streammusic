import { cookies } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { appOrigin } from "@/lib/http";
import { stateCookieName } from "@/lib/oauth-state";
import { getOwnChannel } from "@/lib/youtube/api";
import {
  exchangeYoutubeCode,
  linkYoutubeAccount,
} from "@/lib/youtube/account";
import { syncYoutubeTaste } from "@/lib/youtube/taste";

export const runtime = "nodejs";

function backToSettings(request: Request, query: Record<string, string>) {
  const url = new URL("/settings/connections", appOrigin(request));
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return Response.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(stateCookieName("youtube"))?.value;
  cookieStore.delete(stateCookieName("youtube"));

  if (error) {
    return backToSettings(request, {
      error: url.searchParams.get("error_description") ?? error,
    });
  }
  if (!code) return backToSettings(request, { error: "Thiếu mã uỷ quyền" });
  if (!state || !expectedState || state !== expectedState) {
    return backToSettings(request, {
      error: "State không khớp — hãy thử nối lại",
    });
  }

  try {
    const userId = await requireUserId();
    const tokens = await exchangeYoutubeCode(
      code,
      `${appOrigin(request)}/api/youtube/oauth/callback`,
    );
    const channel = await getOwnChannel(tokens.accessToken);

    if (!tokens.refreshToken) {
      // Không có refresh token thì liên kết chết sau khi access token hết hạn.
      // Với Google, nguyên nhân thường là user đã từng cấp quyền trước đó.
      console.warn(
        `[youtube] không nhận được refresh_token cho ${channel.channelTitle}`,
      );
    }

    await linkYoutubeAccount(userId, tokens, channel);

    try {
      await syncYoutubeTaste(userId, tokens.accessToken);
    } catch (syncError) {
      // Gu nhạc chỉ là phần tăng thêm: hết quota hay lỗi mạng không được biến
      // một lần nối thành công thành thất bại — user bấm "Đồng bộ lại" là xong.
      console.error(syncError);
    }

    return backToSettings(request, { youtube: channel.channelTitle });
  } catch (err) {
    console.error(err);
    return backToSettings(request, {
      error: err instanceof Error ? err.message : "Nối YouTube thất bại",
    });
  }
}
