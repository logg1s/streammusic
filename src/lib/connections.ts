import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, type Connection, type StorageProviderId } from "@/db/schema";
import { decryptOptional, decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  getProvider,
  ReauthRequiredError,
  type AccountIdentity,
  type TokenSet,
} from "@/lib/providers";

/** Refresh sớm 60 giây để không bị hết hạn ngay giữa lúc đang stream. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Token đã giải mã, giữ trong RAM theo connectionId.
 *
 * Một bài nhạc được tải thành nhiều lô; không có cache này thì mỗi lô lại giải mã
 * AES-GCM và có thể gọi refresh. Hạn của mục cache luôn ngắn hơn hạn thật của token
 * nên không bao giờ trả về token đã chết.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheToken(connectionId: string, token: string, expiresAt: Date | null) {
  // Không rõ hạn thì giữ 5 phút cho an toàn.
  const until = expiresAt
    ? expiresAt.getTime() - REFRESH_MARGIN_MS
    : Date.now() + 300_000;
  if (until > Date.now()) tokenCache.set(connectionId, { token, expiresAt: until });
}

export function forgetCachedToken(connectionId: string) {
  tokenCache.delete(connectionId);
}

export async function listConnections(userId: string): Promise<Connection[]> {
  return getDb()
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .orderBy(connections.createdAt);
}

/** Lấy connection và đồng thời kiểm tra quyền sở hữu. Trả null nếu không phải của user. */
export async function loadConnection(
  userId: string,
  connectionId: string,
): Promise<Connection | null> {
  const [row] = await getDb()
    .select()
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertConnection(
  userId: string,
  provider: StorageProviderId,
  tokens: TokenSet,
  identity: AccountIdentity,
): Promise<Connection> {
  const values = {
    userId,
    provider,
    providerAccountId: identity.accountId,
    label: identity.label,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : null,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    status: "active" as const,
  };

  const [row] = await getDb()
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [
        connections.userId,
        connections.provider,
        connections.providerAccountId,
      ],
      // Nối lại cùng một tài khoản = cập nhật token, giữ nguyên id để không mất track đã quét.
      set: {
        label: values.label,
        accessTokenEnc: values.accessTokenEnc,
        expiresAt: values.expiresAt,
        scope: values.scope,
        status: "active",
        // Giữ refresh token cũ nếu lần này provider không cấp cái mới.
        ...(values.refreshTokenEnc
          ? { refreshTokenEnc: values.refreshTokenEnc }
          : {}),
      },
    })
    .returning();

  return row;
}

async function markNeedsReauth(connectionId: string): Promise<void> {
  forgetCachedToken(connectionId);
  await getDb()
    .update(connections)
    .set({ status: "needs_reauth" })
    .where(eq(connections.id, connectionId));
}

/**
 * Trả về access token còn hiệu lực, tự refresh khi cần.
 *
 * Nếu refresh token đã bị thu hồi (hay gặp với Google Drive ở chế độ Testing —
 * refresh token chỉ sống 7 ngày), connection được đánh dấu `needs_reauth`
 * và ném ReauthRequiredError để UI hiện nút "Kết nối lại".
 */
export async function getValidAccessToken(
  connection: Connection,
): Promise<string> {
  const cached = tokenCache.get(connection.id);
  if (cached && cached.expiresAt > Date.now() && connection.status === "active") {
    return cached.token;
  }

  const notExpiringSoon =
    connection.expiresAt !== null &&
    connection.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;

  if (notExpiringSoon && connection.status === "active") {
    const token = decryptSecret(connection.accessTokenEnc);
    cacheToken(connection.id, token, connection.expiresAt);
    return token;
  }

  const refreshToken = decryptOptional(connection.refreshTokenEnc);
  if (!refreshToken) {
    // Không có refresh token: chỉ dùng được khi access token vĩnh viễn (expiresAt null).
    if (connection.expiresAt === null && connection.status === "active") {
      return decryptSecret(connection.accessTokenEnc);
    }
    await markNeedsReauth(connection.id);
    throw new ReauthRequiredError(connection.provider);
  }

  try {
    const tokens = await getProvider(connection.provider).refresh(refreshToken);
    await getDb()
      .update(connections)
      .set({
        accessTokenEnc: encryptSecret(tokens.accessToken),
        expiresAt: tokens.expiresAt,
        status: "active",
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        // Microsoft cấp refresh_token mới mỗi lần — không lưu là lần sau hỏng.
        ...(tokens.refreshToken
          ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) }
          : {}),
      })
      .where(eq(connections.id, connection.id));
    cacheToken(connection.id, tokens.accessToken, tokens.expiresAt);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      await markNeedsReauth(connection.id);
    }
    throw error;
  }
}

/** Tiện dụng: nạp connection + lấy token trong một bước. */
export async function connectionWithToken(
  userId: string,
  connectionId: string,
): Promise<{ connection: Connection; accessToken: string } | null> {
  const connection = await loadConnection(userId, connectionId);
  if (!connection) return null;
  return { connection, accessToken: await getValidAccessToken(connection) };
}
