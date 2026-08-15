import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getToken } from "@auth/core/jwt";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { sessionCookieName } from "@/lib/session-token";

/**
 * Đăng nhập ứng dụng. Cố tình KHÔNG xin scope Drive ở đây —
 * quyền truy cập kho lưu trữ đi qua luồng OAuth riêng ở /api/connections/*,
 * để user có thể dùng app mà chưa cần cấp quyền đọc file, và để mình
 * tự kiểm soát việc lưu + refresh token.
 *
 * Dùng dạng khởi tạo lười (truyền hàm) để `getDb()` không chạy lúc build.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [
    Google({
      // Không có `prompt`, Google im lặng dùng lại phiên đang có trên máy và trả về
      // ngay — người dùng thấy như bị "tự động đăng nhập". Ép hiện màn hình chọn
      // tài khoản để trên máy dùng chung, mỗi người tự chọn đúng tài khoản của mình.
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
}));

export class UnauthorizedError extends Error {
  constructor() {
    super("Chưa đăng nhập");
    this.name = "UnauthorizedError";
  }
}

/**
 * userId của phiên hiện tại, hoặc `null` nếu chưa đăng nhập.
 *
 * Đọc bằng `getToken()` chứ không `auth()` để nhận **cả** cookie (web) lẫn header
 * `Authorization: Bearer` (vỏ Tauri/Expo) — `@auth/core/jwt.js` thử cookie trước, thiếu
 * thì lấy Bearer. Nhờ vậy 25 route handler hiện có không phải sửa dòng nào.
 *
 * `headers()` của `next/headers` đủ cho `getToken`: nó chỉ đọc `req.headers`, không cần
 * `cookies()` riêng. `salt` để mặc định = tên cookie phiên, và tên đó phải khớp sơ đồ
 * http/https của request — xem `sessionCookieName`.
 */
export async function optionalUserId(): Promise<string | null> {
  const requestHeaders = await headers();
  const token = await getToken({
    req: { headers: requestHeaders },
    secret: process.env.AUTH_SECRET,
    cookieName: sessionCookieName(requestHeaders),
  });
  return token?.sub ?? null;
}

/** Dùng trong route handler: trả về userId hoặc ném UnauthorizedError. */
export async function requireUserId(): Promise<string> {
  const userId = await optionalUserId();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
