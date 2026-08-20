import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useSyncExternalStore } from "react";
import { VongAudio } from "../../modules/vong-audio";
import { usePlayer } from "../store/player";

/**
 * Lớp gọi API và giữ phiên đăng nhập của vỏ Expo.
 *
 * Toàn bộ app đi qua đây: màn hình không được tự `fetch` tới máy chủ, vì mỗi request
 * đều cần `Authorization: Bearer` và cần chung một chỗ xử lý 401 (hết phiên) — nếu
 * mỗi màn hình tự lo thì người dùng sẽ thấy app "im lặng rỗng" thay vì được hỏi đăng
 * nhập lại.
 */

/** Nơi máy chủ ở, khai trong `app.json` để đổi được giữa dev và production mà không sửa code. */
const configuredOrigin: unknown =
  process.env.EXPO_PUBLIC_VONG_ORIGIN ?? Constants.expoConfig?.extra?.origin;
if (typeof configuredOrigin !== "string" || configuredOrigin.length === 0) {
  throw new Error(
    "Thiếu `expo.extra.origin` trong app.json — vỏ Expo không biết gọi máy chủ nào.",
  );
}

export const ORIGIN: string = configuredOrigin.replace(/\/+$/, "");

/** Deep link mà `/api/native/authorize` bật về sau khi phát mã trao tay. */
const NATIVE_CALLBACK = "vong://auth";

/**
 * Khoá trong SecureStore. Đổi tên là mọi người dùng phải đăng nhập lại — giá trị cũ
 * vẫn nằm đó nhưng không ai đọc nữa.
 */
const TOKEN_KEY = "vong-session-token";

/**
 * Xin token mới khi còn ngần này thời gian là hết hạn. Đủ rộng để một lượt nghe dài
 * không bị đứt giữa chừng, đủ hẹp để không xin lại mỗi lần mở app.
 */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface StoredSession {
  token: string;
  /** ms epoch — đúng thứ `/api/native/token` và `/api/native/session-token` trả về. */
  expiresAt: number;
}

/** 401 tách riêng để màn hình phân biệt "hết phiên" với "máy chủ lỗi". */
export class UnauthorizedError extends Error {
  constructor(message = "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Bản sao trong bộ nhớ của phiên. SecureStore là I/O bất đồng bộ, mà mỗi request lại
 * cần token — đọc đĩa mỗi lần thì thanh phát sẽ giật khi cuộn danh sách.
 */
let session: StoredSession | null = null;
/** Đã đọc SecureStore lần nào chưa. Khác với `session === null` (đã đọc, chưa đăng nhập). */
let loaded = false;
let loadPromise: Promise<StoredSession | null> | null = null;
let refreshPromise: Promise<StoredSession | null> | null = null;

interface SessionSnapshot {
  token: string | null;
  loading: boolean;
}

/**
 * Ảnh chụp cho `useSession`. Giữ nguyên tham chiếu khi không có gì đổi vì
 * `useSyncExternalStore` so sánh bằng `Object.is` — trả object mới mỗi lần đọc là
 * vòng lặp render vô tận.
 */
let snapshot: SessionSnapshot = { token: null, loading: true };
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SessionSnapshot {
  return snapshot;
}

function broadcast(): void {
  const token = session?.token ?? null;
  if (snapshot.token === token && !snapshot.loading) return;
  snapshot = { token, loading: false };
  for (const listener of listeners) listener();
}

/** Đọc JSON không tin cậy (SecureStore, mạng) mà không để `any` lọt ra ngoài. */
function safeJsonParse(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw);
    return value;
  } catch {
    return null;
  }
}

/** Nhận dạng `{ token, expiresAt }`; mọi thứ khác coi như không có phiên. */
function parseSession(value: unknown): StoredSession | null {
  if (typeof value !== "object" || value === null) return null;
  const token = "token" in value ? value.token : null;
  const expiresAt = "expiresAt" in value ? value.expiresAt : null;
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  return { token, expiresAt };
}

async function readStored(): Promise<StoredSession | null> {
  /*
   * `null` ở đây là "chưa đăng nhập", không phải lỗi: cài lại app trên Android là mất
   * khoá Keystore, và expo-secure-store tự xoá giá trị khi giải mã hỏng
   * (`BadPaddingException`). Không bật `requireAuthentication` — người dùng không nên
   * bị hỏi vân tay mỗi lần mở app nghe nhạc.
   */
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) return null;

  const parsed = parseSession(safeJsonParse(raw));
  if (!parsed || parsed.expiresAt <= Date.now()) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return null;
  }
  return parsed;
}

async function loadSession(): Promise<StoredSession | null> {
  if (loaded) return session;
  if (!loadPromise) {
    loadPromise = readStored()
      .then((stored) => {
        session = stored;
        loaded = true;
        broadcast();
        return stored;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

async function saveSession(next: StoredSession): Promise<void> {
  session = next;
  loaded = true;
  await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(next));
  broadcast();
}

export interface TvPairingChallenge {
  deviceCode: string;
  userCode: string;
  displayCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  qrImageUri: string;
  expiresAt: number;
  intervalMs: number;
  target: "tv";
}

function parseTvPairingChallenge(value: unknown): TvPairingChallenge | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const requiredStrings = [
    "deviceCode",
    "userCode",
    "displayCode",
    "verificationUri",
    "verificationUriComplete",
    "qrImageUri",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof record[key] !== "string" || record[key].length === 0) {
      return null;
    }
  }
  const expiresAt = record.expiresAt;
  const intervalMs = record.intervalMs;
  if (record.target !== "tv") return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (typeof intervalMs !== "number" || !Number.isFinite(intervalMs))
    return null;
  return {
    deviceCode: record.deviceCode as string,
    userCode: record.userCode as string,
    displayCode: record.displayCode as string,
    verificationUri: record.verificationUri as string,
    verificationUriComplete: record.verificationUriComplete as string,
    qrImageUri: record.qrImageUri as string,
    expiresAt,
    intervalMs,
    target: "tv",
  };
}

/** Bắt đầu luồng đăng nhập cho thiết bị không có browser/nhập liệu thuận tiện. */
export async function startTvPairing(): Promise<TvPairingChallenge> {
  const response = await fetch(`${ORIGIN}/api/native/tv/start`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  const challenge = parseTvPairingChallenge(await response.json());
  if (!challenge) throw new Error("Máy chủ trả mã ghép nối TV không hợp lệ.");
  return challenge;
}

/** Hỏi trạng thái mã; khi được duyệt, lưu phiên và đánh thức cổng đăng nhập của app. */
export async function pollTvPairing(deviceCode: string): Promise<boolean> {
  const response = await fetch(`${ORIGIN}/api/native/tv/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceCode }),
  });
  if (response.status === 202) return false;
  if (!response.ok) throw new Error(await errorMessage(response));

  const body: unknown = await response.json();
  const minted = parseSession(body);
  if (!minted) throw new Error("Máy chủ trả phiên TV không hợp lệ.");
  await saveSession(minted);
  return true;
}

/**
 * Đổi mã trao tay đã được runner E2E phát sẵn. Hàm vẫn dùng đúng endpoint một-lần của
 * luồng đăng nhập thật; chỉ màn `auth` trong bundle E2E mới gọi thẳng nó, nên bản phát
 * hành không có đường tắt phiên hay token đóng cứng.
 */
export async function adoptE2EHandoff(code: string): Promise<void> {
  if (process.env.EXPO_PUBLIC_VONG_E2E !== "1") {
    throw new Error("Đăng nhập E2E không được bật trong bản dựng này.");
  }

  const response = await fetch(`${ORIGIN}/api/native/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const minted = parseSession(await response.json());
  if (!minted) throw new Error("Máy chủ trả phiên không hợp lệ.");
  await saveSession(minted);
}

async function clearSession(): Promise<void> {
  session = null;
  loaded = true;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  broadcast();
}

/**
 * Xin token mới bằng chính token cũ. Gọi `fetch` trần chứ không `apiFetch`: `apiFetch`
 * lại đi hỏi token nên sẽ quay vòng vô tận.
 */
async function requestRefresh(
  current: StoredSession,
): Promise<StoredSession | null> {
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}/api/native/session-token`, {
      headers: { authorization: `Bearer ${current.token}` },
    });
  } catch {
    // Mất mạng thì token cũ vẫn dùng được tới lúc hết hạn thật — đừng đá người dùng ra.
    return current.expiresAt > Date.now() ? current : null;
  }

  if (response.status === 401) {
    await clearSession();
    return null;
  }
  if (!response.ok) {
    return current.expiresAt > Date.now() ? current : null;
  }

  const minted = parseSession(await response.json());
  if (!minted) return current.expiresAt > Date.now() ? current : null;

  await saveSession(minted);
  return minted;
}

function refreshSession(current: StoredSession): Promise<StoredSession | null> {
  // Một request làm mới cho cả app: mở app là vài màn hình cùng gọi API một lúc.
  if (!refreshPromise) {
    refreshPromise = requestRefresh(current).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Lỗi máy chủ trả theo khuôn `{ error }` (xem `jsonError` phía web). */
async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.length > 0
  ) {
    return body.error;
  }
  return `Máy chủ trả lỗi ${response.status}.`;
}

/** Token dùng được ngay bây giờ, `null` khi chưa đăng nhập. Tự gia hạn khi sắp hết hạn. */
export async function getSessionToken(): Promise<string | null> {
  const current = await loadSession();
  if (!current) return null;
  if (current.expiresAt - Date.now() > REFRESH_MARGIN_MS) return current.token;
  const refreshed = await refreshSession(current);
  return refreshed?.token ?? null;
}

/**
 * Xin token mới NGAY, kể cả khi token đang giữ chưa tới hạn.
 *
 * `getSessionToken()` chỉ gia hạn khi sắp hết hạn, nên nó không cứu được trường hợp
 * server từ chối một token trông vẫn còn hạn (máy chủ khởi động lại, phiên bị thu hồi,
 * đồng hồ máy lệch). Vỏ native cần đúng cái đó: `/api/stream/<id>` trả 401 giữa bài là
 * token trong hàng đợi native đã chết, không phải bài hỏng.
 *
 * Trả `null` khi phiên thật sự hỏng — lúc đó phải mời đăng nhập lại, không phải thử lại.
 */
export async function forceRefreshSessionToken(): Promise<string | null> {
  const current = await loadSession();
  if (!current) return null;
  const refreshed = await refreshSession(current);
  return refreshed?.token ?? null;
}

/**
 * Header xác thực dưới dạng cặp — đúng hình dạng mà module native `vong-audio` nhận
 * cho mỗi item hàng đợi.
 */
export async function authHeaderPairs(): Promise<[string, string][]> {
  const token = await getSessionToken();
  return token ? [["authorization", `Bearer ${token}`]] : [];
}

/**
 * Gọi API kèm Bearer. Ném `UnauthorizedError` khi phiên hỏng (đã xoá token trước khi
 * ném, nên màn hình chỉ việc mời đăng nhập lại), ném `Error` kèm lời máy chủ cho các
 * mã lỗi còn lại.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getSessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  // Chỉ khai kiểu nội dung khi thật sự có body: GET kèm `content-type` làm hỏng cache.
  if (
    init.body !== undefined &&
    init.body !== null &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${ORIGIN}${path}`, { ...init, headers });

  if (response.status === 401) {
    await clearSession();
    throw new UnauthorizedError();
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  return response;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  const data: T = await response.json();
  return data;
}

/**
 * Đăng nhập qua browser hệ thống (Chrome Custom Tabs trên Android).
 *
 * Trả `false` khi người dùng đóng tab giữa chừng; ném khi đổi mã thất bại — hai chuyện
 * khác hẳn nhau nên không gộp làm một. Không đăng ký `Linking.addEventListener` cho
 * luồng này: `openAuthSessionAsync` đã tự nhận deep link, thêm listener chỉ gây tác
 * dụng phụ (đúng như docstring của Expo cảnh báo).
 */
export async function signIn(): Promise<boolean> {
  const result = await WebBrowser.openAuthSessionAsync(
    `${ORIGIN}/api/native/authorize`,
    NATIVE_CALLBACK,
  );
  if (result.type !== "success") return false;

  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("Không nhận được mã đăng nhập từ máy chủ.");
  }

  const response = await fetch(`${ORIGIN}/api/native/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));

  const minted = parseSession(await response.json());
  if (!minted) throw new Error("Máy chủ trả phiên không hợp lệ.");
  await saveSession(minted);
  return true;
}

export async function signOut(): Promise<void> {
  // Native Media3 owns a queue separate from Zustand and embeds per-item auth
  // headers. Clear it before dropping the session so logout cannot leave audio or
  // a bearer-backed next item alive in the service/MediaSession.
  await VongAudio.setQueue({ items: [], startIndex: 0, positionSec: 0 });
  usePlayer.getState().clearQueue();
  await clearSession();
}

export function useSession(): {
  token: string | null;
  loading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    // `loadSession` tự chống gọi trùng, nên nhiều màn hình cùng dùng hook vẫn đọc đĩa một lần.
    void loadSession();
  }, []);

  return { token: state.token, loading: state.loading, signIn, signOut };
}
