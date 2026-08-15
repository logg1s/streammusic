import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  youtubeAccounts,
  youtubeTasteArtists,
  youtubeTasteVideos,
  type YoutubeAccount,
} from "@/db/schema";
import { decryptOptional, decryptSecret, encryptSecret } from "@/lib/crypto";
import { isInvalidGrant, readErrorBody, type TokenSet } from "@/lib/providers";

/**
 * Nối tài khoản YouTube của user để radio bám theo gu nhạc thật.
 *
 * Cùng khuôn refresh/needs_reauth với `src/lib/connections.ts`, nhưng khoá theo
 * `userId` và bảng riêng: `youtube_accounts` không phải kho lưu trữ nên không
 * lọt vào `ALL_PROVIDERS` của trang Kho lưu trữ.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Chỉ đọc: đủ cho video đã thích, kênh đã đăng ký và playlist riêng. */
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";

/** Refresh sớm 60 giây để token không chết ngay giữa lúc đang đồng bộ gu. */
const REFRESH_MARGIN_MS = 60_000;

/** Refresh token bị thu hồi (Google Testing mode: 7 ngày) → UI hiện "Cấp quyền lại". */
export class YoutubeReauthError extends Error {}

/** Access token đã giải mã, giữ trong RAM theo userId — xem lý do ở connections.ts. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheToken(userId: string, token: string, expiresAt: Date | null) {
  // Không rõ hạn thì giữ 5 phút cho an toàn.
  const until = expiresAt
    ? expiresAt.getTime() - REFRESH_MARGIN_MS
    : Date.now() + 300_000;
  if (until > Date.now()) tokenCache.set(userId, { token, expiresAt: until });
}

function credentials() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Thiếu AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET");
  }
  return { clientId, clientSecret };
}

async function tokenRequest(
  params: Record<string, string>,
  { forRefresh }: { forRefresh: boolean },
): Promise<TokenSet> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await readErrorBody(res);
    if (forRefresh && isInvalidGrant(res.status, body)) {
      throw new YoutubeReauthError("Liên kết YouTube cần được cấp quyền lại");
    }
    throw new Error(
      `[youtube] ${res.status} khi đổi token: ${body.slice(0, 400)}`,
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scope: json.scope ?? null,
  };
}

export function isYoutubeOauthConfigured(): boolean {
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET } = process.env;
  return Boolean(AUTH_GOOGLE_ID && AUTH_GOOGLE_SECRET);
}

export function buildYoutubeAuthUrl(state: string, redirectUri: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    // offline + consent: Google chỉ cấp refresh_token khi user bấm đồng ý.
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export async function exchangeYoutubeCode(
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: redirectUri },
    { forRefresh: false },
  );
}

export async function linkYoutubeAccount(
  userId: string,
  tokens: TokenSet,
  channel: { channelId: string; channelTitle: string },
): Promise<void> {
  const accessTokenEnc = encryptSecret(tokens.accessToken);
  const refreshTokenEnc = tokens.refreshToken
    ? encryptSecret(tokens.refreshToken)
    : null;
  tokenCache.delete(userId);

  await getDb()
    .insert(youtubeAccounts)
    .values({
      userId,
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      status: "active",
    })
    .onConflictDoUpdate({
      target: youtubeAccounts.userId,
      set: {
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        accessTokenEnc,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        status: "active",
        // Nối lại lần hai Google thường không cấp refresh_token nữa → giữ cái đang có.
        ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
      },
    });
}

export async function getYoutubeAccount(
  userId: string,
): Promise<YoutubeAccount | null> {
  const [row] = await getDb()
    .select()
    .from(youtubeAccounts)
    .where(eq(youtubeAccounts.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Đánh dấu để trang Cài đặt hiện nút "Cấp quyền lại" và radio thôi cá nhân hoá. */
export async function markYoutubeNeedsReauth(userId: string): Promise<void> {
  tokenCache.delete(userId);
  await getDb()
    .update(youtubeAccounts)
    .set({ status: "needs_reauth" })
    .where(eq(youtubeAccounts.userId, userId));
}

/**
 * Access token còn hiệu lực của user, tự refresh khi cần.
 *
 * `null` = chưa nối tài khoản (caller chạy chế độ không cá nhân hoá).
 * Ném `YoutubeReauthError` khi refresh chết — lúc đó gu nhạc cũ vẫn còn trong DB.
 */
export async function getYoutubeAccessToken(
  userId: string,
): Promise<string | null> {
  const cached = tokenCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const account = await getYoutubeAccount(userId);
  if (!account) return null;

  const notExpiringSoon =
    account.expiresAt !== null &&
    account.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;

  if (notExpiringSoon && account.status === "active") {
    const token = decryptSecret(account.accessTokenEnc);
    cacheToken(userId, token, account.expiresAt);
    return token;
  }

  const refreshToken = decryptOptional(account.refreshTokenEnc);
  if (!refreshToken && account.expiresAt === null && account.status === "active") {
    // Không có refresh token: chỉ dùng tiếp được khi access token không có hạn.
    return decryptSecret(account.accessTokenEnc);
  }
  return refreshAccessToken(userId, account);
}

/**
 * Xin access token mới bất kể `expiresAt` trong DB nói gì.
 *
 * Dùng khi Google trả 401 cho token đang lưu: hạn ghi trong DB có thể sai, hoặc
 * riêng access token bị thu hồi trong khi refresh token vẫn sống. `null` = chưa nối.
 */
export async function refreshYoutubeAccessToken(
  userId: string,
): Promise<string | null> {
  tokenCache.delete(userId);
  const account = await getYoutubeAccount(userId);
  if (!account) return null;
  return refreshAccessToken(userId, account);
}

async function refreshAccessToken(
  userId: string,
  account: YoutubeAccount,
): Promise<string> {
  const refreshToken = decryptOptional(account.refreshTokenEnc);
  if (!refreshToken) {
    await markYoutubeNeedsReauth(userId);
    throw new YoutubeReauthError("Liên kết YouTube cần được cấp quyền lại");
  }

  try {
    const tokens = await tokenRequest(
      { grant_type: "refresh_token", refresh_token: refreshToken },
      { forRefresh: true },
    );
    await getDb()
      .update(youtubeAccounts)
      .set({
        accessTokenEnc: encryptSecret(tokens.accessToken),
        expiresAt: tokens.expiresAt,
        status: "active",
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        ...(tokens.refreshToken
          ? { refreshTokenEnc: encryptSecret(tokens.refreshToken) }
          : {}),
      })
      .where(eq(youtubeAccounts.userId, userId));
    cacheToken(userId, tokens.accessToken, tokens.expiresAt);
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof YoutubeReauthError) await markYoutubeNeedsReauth(userId);
    throw error;
  }
}

export async function unlinkYoutubeAccount(userId: string): Promise<void> {
  const account = await getYoutubeAccount(userId);
  tokenCache.delete(userId);
  if (!account) return;

  try {
    const token =
      decryptOptional(account.refreshTokenEnc) ??
      decryptSecret(account.accessTokenEnc);
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
    });
  } catch (error) {
    // Token có thể đã bị thu hồi từ trước; dữ liệu phía mình vẫn phải xoá.
    console.warn("Không thu hồi được token YouTube", error);
  }

  const db = getDb();
  await db
    .delete(youtubeTasteVideos)
    .where(eq(youtubeTasteVideos.userId, userId));
  await db
    .delete(youtubeTasteArtists)
    .where(eq(youtubeTasteArtists.userId, userId));
  await db.delete(youtubeAccounts).where(eq(youtubeAccounts.userId, userId));
}
