import { randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { users, verificationTokens } from "@/db/schema";
import { mintSessionToken, type MintedToken } from "@/lib/session-token";

/**
 * Mã trao tay một lần giữa browser hệ thống và vỏ native.
 *
 * Luồng: `/api/native/authorize` (đã đăng nhập bằng cookie) phát mã → mở
 * `vong://auth?code=…` → vỏ đổi mã lấy phiên (`/token` cho Expo, `/adopt` cho Tauri).
 *
 * ── VÌ SAO LƯU DB CHỨ KHÔNG PHÁT JWT NGẮN HẠN ────────────────────────────────
 * Mã này đi qua deep link, tức là qua tay hệ điều hành: trên Android mọi app khai cùng
 * scheme đều nhận được, log hệ thống cũng thấy. JWT hạn 120 giây vẫn **dùng lại được**
 * trong 120 giây đó — ai chộp được là vào được tài khoản. `DELETE … RETURNING` của
 * Postgres thì đổi mã lấy phiên đúng một lần, kẻ thứ hai không còn gì để đổi.
 *
 * Dùng lại bảng `verificationToken` (Auth.js) vì đúng hình dạng cần: khoá chính
 * `(identifier, token)`, có `expires`. Provider email không bật nên không ai tranh chỗ;
 * tiền tố `identifier` vẫn tách riêng để sau này bật cũng không lẫn.
 */

/** Đủ để người dùng bấm qua màn hình app, ngắn để mã kịp hết hạn trước khi bị lợi dụng. */
const CODE_TTL_MS = 120_000;

const IDENTIFIER_PREFIX = "native-handoff:";

export class HandoffCodeError extends Error {
  constructor() {
    super("Mã đăng nhập không hợp lệ hoặc đã dùng rồi");
  }
}

export async function issueHandoffCode(userId: string): Promise<string> {
  const db = getDb();
  const code = randomBytes(32).toString("base64url");

  // Dọn mã hết hạn của chính user này: mỗi lần đăng nhập lại là một mã, không dọn thì
  // bảng phình theo số lần bấm.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, IDENTIFIER_PREFIX + userId),
        lt(verificationTokens.expires, new Date()),
      ),
    );

  await db.insert(verificationTokens).values({
    identifier: IDENTIFIER_PREFIX + userId,
    token: code,
    expires: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

/**
 * Đổi mã lấy phiên. Xoá-rồi-trả nên gọi lần hai luôn ném — kể cả khi hai request tới
 * cùng lúc, Postgres chỉ để một cái thấy dòng đó.
 */
export async function consumeHandoffCode(
  requestHeaders: Headers,
  code: string,
): Promise<MintedToken & { userId: string }> {
  if (!code) throw new HandoffCodeError();

  const [row] = await getDb()
    .delete(verificationTokens)
    .where(eq(verificationTokens.token, code))
    .returning({
      identifier: verificationTokens.identifier,
      expires: verificationTokens.expires,
    });

  if (!row?.identifier.startsWith(IDENTIFIER_PREFIX)) throw new HandoffCodeError();
  if (row.expires.getTime() < Date.now()) throw new HandoffCodeError();

  const userId = row.identifier.slice(IDENTIFIER_PREFIX.length);
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new HandoffCodeError();

  const minted = await mintSessionToken(requestHeaders, user);
  return { ...minted, userId };
}

/** Phát phiên cho user đang đăng nhập (không qua mã) — dùng cho `/api/native/session-token`. */
export async function mintForUser(
  requestHeaders: Headers,
  userId: string,
): Promise<MintedToken> {
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new HandoffCodeError();
  return mintSessionToken(requestHeaders, user);
}
