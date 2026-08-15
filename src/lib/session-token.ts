import { encode } from "@auth/core/jwt";

/**
 * Phát và đọc session JWT cho vỏ native.
 *
 * Vỏ native không giữ được cookie httpOnly của Auth.js (Rust tải byte ngoài WebView,
 * React Native thì không có cookie jar dùng chung), nên nó gửi cùng chuỗi JWT đó qua
 * header `Authorization: Bearer`. `getToken()` của Auth.js đọc **cả hai** đường
 * (`@auth/core/jwt.js`: cookie trước, rồi `Authorization: Bearer`), nên phía server chỉ
 * cần một chỗ đọc duy nhất — `requireUserId()`.
 *
 * ── SALT PHẢI BẰNG TÊN COOKIE ────────────────────────────────────────────────
 * `encode`/`decode` dẫn khoá bằng HKDF với `salt`, và Auth.js luôn truyền `salt` = tên
 * cookie phiên (`@auth/core/lib/init.js:69` + `jwt.js`: `salt = cookieName`). Tên đó có
 * tiền tố `__Secure-` khi request là https. Mint bằng salt lệch tên cookie → `decode`
 * trả `null`, và không có lỗi nào để lần: request chỉ 401 im lặng.
 */

/**
 * Tên cookie phiên cho đúng sơ đồ (http/https) mà request này đang đi.
 *
 * Lặp lại đúng luật của Auth.js (`url.protocol === "https:"`) thay vì hằng số, vì cùng
 * một build chạy cả `localhost` http lẫn Vercel https.
 */
export function sessionCookieName(headers: Headers): string {
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const proto = configured
    ? new URL(configured).protocol
    : `${headers.get("x-forwarded-proto") ?? "http"}:`;
  return proto === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET");
  return secret;
}

/** Sống bằng ngần này giây — bằng `session.maxAge` mặc định của Auth.js (30 ngày). */
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export interface MintedToken {
  token: string;
  /** ms epoch, để vỏ native biết khi nào phải xin lại. */
  expiresAt: number;
}

/**
 * Phát session JWT cho một user — chuỗi này tương đương cookie đăng nhập, chỉ trao cho
 * vỏ đã qua được `/api/native/authorize`.
 */
export async function mintSessionToken(
  headers: Headers,
  user: { id: string; name?: string | null; email?: string | null; image?: string | null },
): Promise<MintedToken> {
  const salt = sessionCookieName(headers);
  const token = await encode({
    salt,
    secret: authSecret(),
    maxAge: SESSION_MAX_AGE_SEC,
    token: {
      sub: user.id,
      name: user.name ?? undefined,
      email: user.email ?? undefined,
      picture: user.image ?? undefined,
    },
  });
  return { token, expiresAt: Date.now() + SESSION_MAX_AGE_SEC * 1000 };
}
