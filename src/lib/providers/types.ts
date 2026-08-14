import type { StorageProviderId } from "@/db/schema";

export interface TokenSet {
  accessToken: string;
  /** Microsoft xoay refresh_token mỗi lần refresh → luôn ghi đè giá trị mới nếu có. */
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
}

export interface AccountIdentity {
  /** ID ổn định phía provider — dùng để chặn nối trùng cùng một tài khoản. */
  accountId: string;
  /** Email hoặc tên hiển thị, chỉ dùng để hiện lên UI. */
  label: string;
}

export interface RemoteEntry {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
}

export interface RemoteFile {
  id: string;
  name: string;
  path: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** md5Checksum (Drive) · content_hash (Dropbox) · eTag (OneDrive) */
  rev: string | null;
}

/**
 * Cách lấy byte nhạc về cho trình duyệt.
 *
 * - `redirect`: provider cho URL tạm thời tự xác thực → trả 302, byte không đi qua server mình.
 * - `proxy`:    bắt buộc gửi header Authorization → server phải làm trung gian và chuyển tiếp header Range.
 */
export type StreamTarget =
  | { kind: "redirect"; url: string; expiresAt: Date }
  | { kind: "proxy"; url: string; headers: Record<string, string> };

export interface StorageProvider {
  readonly id: StorageProviderId;
  readonly displayName: string;
  /** remoteId đại diện cho thư mục gốc trong folder picker. */
  readonly rootFolderId: string;
  readonly scopes: string;

  /** false nếu thiếu client id/secret trong env → UI ẩn provider này đi. */
  isConfigured(): boolean;

  buildAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  getIdentity(accessToken: string): Promise<AccountIdentity>;

  /** Một cấp thư mục, dùng cho folder picker. */
  listFolder(accessToken: string, folderId: string): Promise<RemoteEntry[]>;
  /** Duyệt đệ quy, chỉ trả file audio. Generator để không giữ toàn bộ danh sách trong RAM. */
  listAudioFiles(
    accessToken: string,
    rootId: string,
  ): AsyncGenerator<RemoteFile>;

  resolveStream(accessToken: string, remoteId: string): Promise<StreamTarget>;
}

/* ------------------------------------------------------------------ */
/* Lỗi                                                                 */
/* ------------------------------------------------------------------ */

/** Refresh token đã bị thu hồi/hết hạn — user phải cấp quyền lại. */
export class ReauthRequiredError extends Error {
  constructor(
    public readonly provider: StorageProviderId,
    cause?: unknown,
  ) {
    super(`Kết nối ${provider} cần được cấp quyền lại`);
    this.name = "ReauthRequiredError";
    this.cause = cause;
  }
}

export class ProviderApiError extends Error {
  constructor(
    public readonly provider: string,
    public readonly status: number,
    public readonly body: string,
    url: string,
  ) {
    super(`[${provider}] ${status} khi gọi ${url}: ${body.slice(0, 400)}`);
    this.name = "ProviderApiError";
  }
}

/* ------------------------------------------------------------------ */
/* Tiện ích dùng chung                                                 */
/* ------------------------------------------------------------------ */

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "m4b",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "wma",
  "aiff",
  "aif",
  "ape",
  "wv",
  "mpc",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  wma: "audio/x-ms-wma",
  aiff: "audio/aiff",
  aif: "audio/aiff",
  ape: "audio/x-ape",
  wv: "audio/x-wavpack",
  mpc: "audio/x-musepack",
};

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isAudioFile(name: string, mimeType?: string | null): boolean {
  if (mimeType?.startsWith("audio/")) return true;
  return AUDIO_EXTENSIONS.has(fileExtension(name));
}

/** Provider hay trả mime rỗng hoặc `application/octet-stream` → suy ra từ đuôi file. */
export function guessMimeType(
  name: string,
  reported?: string | null,
): string | null {
  if (reported && reported !== "application/octet-stream") return reported;
  return MIME_BY_EXTENSION[fileExtension(name)] ?? reported ?? null;
}

export async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<không đọc được body>";
  }
}

/** Nhận diện lỗi "refresh token không còn hiệu lực" của cả ba provider. */
export function isInvalidGrant(status: number, body: string): boolean {
  if (status !== 400 && status !== 401) return false;
  return /invalid_grant|invalid_request_token|expired_token|AADSTS700082|AADSTS50173/i.test(
    body,
  );
}
