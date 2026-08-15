import { UnauthorizedError } from "@/lib/auth";
import { ProviderApiError, ReauthRequiredError } from "@/lib/providers";
import {
  YoutubeApiError,
  YoutubeNotConfiguredError,
  YoutubeQuotaError,
} from "@/lib/youtube/api";
import { YoutubeReauthError } from "@/lib/youtube/account";

/**
 * Origin công khai của app, dùng để dựng redirect_uri của OAuth.
 *
 * Ưu tiên AUTH_URL (do bạn tự đặt và phải khớp chính xác với giá trị đã đăng ký
 * ở cổng developer), sau đó mới suy ra từ header của request — vì sau proxy của
 * Vercel thì `request.url` có thể là host nội bộ.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export function oauthRedirectUri(request: Request, provider: string): string {
  return `${appOrigin(request)}/api/connections/oauth/${provider}/callback`;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * Đầu vào sai của người dùng (tên rỗng, danh sách không khớp…) → 400 kèm nguyên văn.
 * Khai báo ở đây để `src/lib/playlists.ts` không phải kéo cả lớp HTTP vào, và để
 * `src/lib/http.ts` vẫn không phụ thuộc gì nặng.
 */
export class PlaylistInputError extends Error {}

/** Chuyển exception thành HTTP response nhất quán cho mọi route handler. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return jsonError("Chưa đăng nhập", 401);
  }
  if (error instanceof PlaylistInputError) {
    return jsonError(error.message, 400);
  }
  if (error instanceof ReauthRequiredError) {
    return Response.json(
      {
        error: error.message,
        code: "REAUTH_REQUIRED",
        provider: error.provider,
      },
      { status: 409 },
    );
  }
  if (error instanceof YoutubeNotConfiguredError) {
    return jsonError(
      "Chưa cấu hình YouTube — thêm YOUTUBE_API_KEY hoặc nối tài khoản YouTube",
      503,
    );
  }
  if (error instanceof YoutubeQuotaError) {
    return jsonError("Hết quota YouTube hôm nay, thử lại sau", 429);
  }
  if (error instanceof YoutubeReauthError) {
    return Response.json(
      { error: error.message, code: "YOUTUBE_REAUTH" },
      { status: 409 },
    );
  }
  if (error instanceof YoutubeApiError) {
    // Thân lỗi của Google có key, id video, chi tiết nội bộ — chỉ ghi log, không trả ra.
    console.error(error);
    return jsonError(`YouTube trả lỗi ${error.status}, thử lại sau`, 502);
  }
  if (error instanceof ProviderApiError) {
    console.error(error);
    // 4xx của provider thường do quyền/tham số → phản ánh lại; 5xx thì là lỗi phía họ.
    const status = error.status >= 400 && error.status < 500 ? 502 : 503;
    return jsonError(`Lỗi từ ${error.provider}: ${error.status}`, status);
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Lỗi không xác định";
  return jsonError(message, 500);
}
