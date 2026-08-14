import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

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
  providers: [Google],
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

/** Dùng trong route handler: trả về userId hoặc ném UnauthorizedError. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new UnauthorizedError();
  return userId;
}
