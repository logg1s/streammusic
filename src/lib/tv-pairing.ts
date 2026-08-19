import { createHash, randomBytes } from "node:crypto";
import { and, eq, like, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { verificationTokens } from "@/db/schema";
import { mintForUser } from "@/lib/native-handoff";
import type { MintedToken } from "@/lib/session-token";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_PER_CLIENT = 6;
const RATE_GLOBAL = 120;
const PENDING_PREFIX = "tv-pairing:pending:";
const APPROVED_PREFIX = "tv-pairing:approved:";
const RATE_PREFIX = "tv-pairing:rate:";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export class TvPairingCodeError extends Error {
  constructor() {
    super("Mã ghép nối không hợp lệ hoặc đã hết hạn");
    this.name = "TvPairingCodeError";
  }
}

export class TvPairingRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Quá nhiều yêu cầu ghép nối TV, vui lòng thử lại sau");
    this.name = "TvPairingRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface TvPairingChallenge {
  deviceCode: string;
  userCode: string;
  displayCode: string;
  expiresAt: number;
}

function hashDeviceCode(deviceCode: string): string {
  return createHash("sha256").update(deviceCode).digest("base64url");
}

export function normalizeTvPairingCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function createUserCode(): string {
  const bytes = randomBytes(10);
  let result = "";
  for (let index = 0; index < 10; index += 1) {
    result += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return result;
}

function pairingClientKey(headers: Headers): string {
  // Vercel overwrites this header at its edge, preventing callers from spoofing
  // another address. The fallback keeps local/self-hosted development bounded too.
  const forwarded =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("x-forwarded-for") ??
    "unknown";
  const address = forwarded.split(",", 1)[0].trim().slice(0, 128) || "unknown";
  return createHash("sha256").update(address).digest("base64url");
}

async function claimRateSlot(
  identifier: string,
  slots: number,
  expires: Date,
): Promise<boolean> {
  const db = getDb();
  for (let slot = 0; slot < slots; slot += 1) {
    const inserted = await db
      .insert(verificationTokens)
      .values({ identifier, token: String(slot), expires })
      .onConflictDoNothing()
      .returning({ token: verificationTokens.token });
    if (inserted.length === 1) return true;
  }
  return false;
}

async function enforcePairingStartRateLimit(headers: Headers): Promise<void> {
  const now = Date.now();
  const bucket = Math.floor(now / RATE_WINDOW_MS);
  const expiresAt = (bucket + 2) * RATE_WINDOW_MS;
  const expires = new Date(expiresAt);
  const retryAfterSeconds = Math.max(1, Math.ceil(((bucket + 1) * RATE_WINDOW_MS - now) / 1000));

  const clientIdentifier = `${RATE_PREFIX}client:${pairingClientKey(headers)}:${bucket}`;
  if (!(await claimRateSlot(clientIdentifier, RATE_PER_CLIENT, expires))) {
    throw new TvPairingRateLimitError(retryAfterSeconds);
  }

  const globalIdentifier = `${RATE_PREFIX}global:${bucket}`;
  if (!(await claimRateSlot(globalIdentifier, RATE_GLOBAL, expires))) {
    throw new TvPairingRateLimitError(retryAfterSeconds);
  }
}

export async function startTvPairing(
  requestHeaders: Headers = new Headers(),
): Promise<TvPairingChallenge> {
  const db = getDb();
  const now = new Date();

  await db
    .delete(verificationTokens)
    .where(
      and(
        like(verificationTokens.identifier, "tv-pairing:%"),
        lt(verificationTokens.expires, now),
      ),
    );

  await enforcePairingStartRateLimit(requestHeaders);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = createUserCode();
    const identifier = PENDING_PREFIX + userCode;
    const existing = await db
      .select({ token: verificationTokens.token })
      .from(verificationTokens)
      .where(eq(verificationTokens.identifier, identifier))
      .limit(1);
    if (existing.length > 0) continue;

    const deviceCode = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    await db.insert(verificationTokens).values({
      identifier,
      token: hashDeviceCode(deviceCode),
      expires: new Date(expiresAt),
    });
    return {
      deviceCode,
      userCode,
      displayCode: `${userCode.slice(0, 5)}-${userCode.slice(5)}`,
      expiresAt,
    };
  }

  throw new Error("Không thể tạo mã ghép nối TV");
}

export async function approveTvPairing(
  userId: string,
  rawCode: string,
): Promise<void> {
  const userCode = normalizeTvPairingCode(rawCode);
  if (userCode.length !== 10) throw new TvPairingCodeError();

  const db = getDb();
  const identifier = PENDING_PREFIX + userCode;
  const rows = await db
    .select({
      token: verificationTokens.token,
      expires: verificationTokens.expires,
    })
    .from(verificationTokens)
    .where(eq(verificationTokens.identifier, identifier))
    .limit(2);

  if (rows.length !== 1 || rows[0].expires.getTime() <= Date.now()) {
    throw new TvPairingCodeError();
  }

  const updated = await db
    .update(verificationTokens)
    .set({ identifier: APPROVED_PREFIX + userId })
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, rows[0].token),
      ),
    )
    .returning({ token: verificationTokens.token });
  if (updated.length !== 1) throw new TvPairingCodeError();
}

export async function consumeTvPairing(
  requestHeaders: Headers,
  deviceCode: string,
): Promise<(MintedToken & { userId: string }) | null> {
  if (deviceCode.length < 32 || deviceCode.length > 128) return null;

  const db = getDb();
  const tokenHash = hashDeviceCode(deviceCode);
  const [row] = await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, tokenHash),
        or(
          like(verificationTokens.identifier, `${APPROVED_PREFIX}%`),
          and(
            like(verificationTokens.identifier, `${PENDING_PREFIX}%`),
            lt(verificationTokens.expires, new Date()),
          ),
        ),
      ),
    )
    .returning({
      identifier: verificationTokens.identifier,
      expires: verificationTokens.expires,
    });

  if (!row?.identifier.startsWith(APPROVED_PREFIX)) return null;
  if (row.expires.getTime() <= Date.now()) return null;

  const userId = row.identifier.slice(APPROVED_PREFIX.length);
  if (!userId) return null;
  const minted = await mintForUser(requestHeaders, userId);
  return { ...minted, userId };
}
