/**
 * Telemetry ẩn danh dùng chung cho cả ba shell (web, Android, Windows).
 *
 * Ba ràng buộc định hình toàn bộ file này:
 *
 *  1. **Ẩn danh thật.** Sự kiện gắn với `installId` sinh tại máy, không bao giờ gắn
 *     userId. Số liệu sản phẩm và danh tính người dùng phải nằm ở hai bảng khác nhau —
 *     `play_events` mới là lịch sử nghe có chủ, còn bảng này chỉ để đếm.
 *  2. **Không lọt nội dung.** `sanitizeProps` chặn chuỗi dài và các khoá mang nội dung
 *     (truy vấn tìm kiếm, tên bài). Chặn ở tầng dùng chung nên cả client lẫn API route
 *     đều đi qua đúng một bộ luật; thêm sự kiện mới không thể vô tình mở đường rò.
 *  3. **Không bao giờ làm hỏng việc phát nhạc.** Mọi lỗi gửi đều nuốt. Telemetry hỏng
 *     thì mất số liệu, không được mất tiếng nhạc.
 */

import type { FetchLike } from "./types";

/** Shell nào gửi sự kiện — cùng tập giá trị với enum `analytics_shell` dưới DB. */
export type AnalyticsShell = "web" | "android" | "windows";

/**
 * Danh mục sự kiện v1. Đây là allowlist: tên không nằm đây thì client bỏ qua và API
 * route trả 400. Lý do dùng allowlist thay vì tự do — một danh mục đóng là thứ duy
 * nhất khiến bản mô tả "app thu những gì" không bao giờ nói dối, vì mảng này CHÍNH LÀ
 * bản mô tả đó: mỗi mục có ghi chú props ngay bên trên, và không có đường nào gửi được
 * một sự kiện không nằm ở đây.
 */
export const ANALYTICS_EVENTS = [
  /** Mở app. props: cold (boolean) */
  "app_open",
  /** Kết thúc phiên. props: sec, tracks */
  "session_end",
  /** Bắt đầu phát. props: source, origin, ttfaMs */
  "play_start",
  /** Dừng/chuyển bài. props: playedSec, durationSec, completed, skippedEarly */
  "play_end",
  /** Radio được gieo mầm. props: trigger ('tap' | 'autoplay' | 'button') */
  "radio_seed",
  /** Radio nạp thêm lô. props: added */
  "radio_refill",
  /** Hàng đợi chạy hết mà không nối tiếp. props: depth, reason */
  "queue_end",
  /**
   * Bấm next mà không đi đâu được. props: reason, depth, queueLength
   *
   * `depth` đếm số bài đã kết thúc trong hàng đợi này, KHÔNG tính bài đang được chọn
   * lúc bấm hụt — nên "chết ở bài thứ N" là `depth + 1`.
   *
   * Tồn tại vì `queue_end` không đủ: nó chỉ bắn khi hàng đợi bị xoá sạch, còn cách
   * hàng đợi chết trong thực tế là bài cuối vẫn được chọn mà phía sau không còn gì.
   * Không có sự kiện này thì "người dùng bấm next và không có gì xảy ra" trông giống
   * hệt "người dùng nghe xong rồi tắt app".
   */
  "advance_failed",
  /** Resolve URL YouTube thất bại. props: reason */
  "resolve_fail",
  /** Lỗi phát. props: stage, code */
  "playback_error",
  /** Đã chạy một lần tìm kiếm — CHỈ đếm, không kèm từ khoá. props: results, hasYoutube */
  "search_run",
  /** Đổi cài đặt. props: key, value */
  "setting_change",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);

export function isAnalyticsEvent(name: string): name is AnalyticsEventName {
  return EVENT_SET.has(name);
}

export type AnalyticsPropValue = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsPropValue>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  props: AnalyticsProps;
  /** ISO 8601 theo đồng hồ máy người dùng; server ghi thêm mốc thời gian của mình. */
  clientTs: string;
  sessionId: string;
}

/** Gói gửi lên `POST /api/events`. */
export interface AnalyticsBatch {
  installId: string;
  shell: AnalyticsShell;
  appVersion: string | null;
  events: AnalyticsEvent[];
}

/* ------------------------------------------------------------------ */
/* Làm sạch props                                                      */
/* ------------------------------------------------------------------ */

/** Tối đa ngần này khoá mỗi sự kiện — chặn việc nhét cả một object trạng thái vào. */
const MAX_PROP_KEYS = 12;

/**
 * Chuỗi dài hơn ngần này bị cắt bỏ hẳn (không cắt ngắn).
 *
 * Cắt ngắn thì "Chúng ta của tương lai — Sơn Tùng M-TP" vẫn còn nhận ra được, tức là
 * vẫn là dữ liệu nghe nhạc cá nhân. Props hợp lệ đều là nhãn ngắn ('youtube', 'tap',
 * 'login_required') nên ngưỡng này không cản trở gì.
 */
const MAX_STRING_LEN = 48;

/**
 * Khoá mang nội dung do người dùng nhập hoặc nội dung bài hát. Chặn theo tên vì đây
 * là những cái tên mà một người thêm sự kiện mới sẽ vô thức đặt.
 */
const DENIED_KEYS = new Set([
  "q",
  "query",
  "term",
  "keyword",
  "search",
  "text",
  "title",
  "artist",
  "album",
  "track",
  "name",
  "label",
  "url",
  "path",
  "email",
  "user",
  "userid",
  "user_id",
  "token",
]);

/**
 * Giữ lại đúng phần props an toàn. Bỏ im lặng thay vì ném lỗi: một sự kiện thiếu vài
 * thuộc tính vẫn đáng đếm, còn ném lỗi ở đây sẽ dội ngược vào luồng phát nhạc.
 */
export function sanitizeProps(input: unknown): AnalyticsProps {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const out: AnalyticsProps = {};
  for (const [rawKey, value] of Object.entries(input)) {
    if (Object.keys(out).length >= MAX_PROP_KEYS) break;

    const key = rawKey.trim();
    if (!key || key.length > 32) continue;
    if (DENIED_KEYS.has(key.toLowerCase())) continue;

    if (value === null) {
      out[key] = null;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      // NaN/Infinity không tồn tại trong JSON — để lọt sẽ hỏng cả gói khi stringify.
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed.length <= MAX_STRING_LEN) out[key] = trimmed;
    }
    // Object/array lồng nhau bị bỏ: chúng là đường rò nội dung khó soi nhất.
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

/**
 * Kho lưu tối thiểu. Cố ý không dùng `PersistStorage` của zustand: mobile đưa vào
 * AsyncStorage (bất đồng bộ), web đưa localStorage (đồng bộ), và analytics không cần
 * gì hơn hai phép này.
 */
export interface AnalyticsStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

export interface AnalyticsOptions {
  shell: AnalyticsShell;
  appVersion?: string | null;
  /** Mặc định `/api/events`; shell native truyền URL tuyệt đối tới origin của web. */
  endpoint?: string;
  /** `FetchLike` chứ không phải `fetch` của DOM: gói dùng chung không có lib DOM. */
  fetch: FetchLike;
  storage: AnalyticsStorage;
  /** Gói đủ ngần này sự kiện thì tự gửi. */
  batchSize?: number;
  /** Sinh UUID — cho phép test bơm hàm tất định. */
  uuid?: () => string;
  /** Mốc thời gian — cho phép test bơm đồng hồ tất định. */
  now?: () => Date;
}

export interface Analytics {
  /** Ghi nhận một sự kiện. Không bao giờ ném lỗi, không bao giờ chờ. */
  track(name: AnalyticsEventName, props?: Record<string, unknown>): void;
  /** Đẩy hết những gì đang giữ trong bộ đệm. Gọi khi app ẩn đi hoặc thoát. */
  flush(): Promise<void>;
  /** Người dùng tắt/bật trong Cài đặt. Tắt là xoá luôn bộ đệm đang chờ. */
  setEnabled(value: boolean): Promise<void>;
  isEnabled(): boolean;
  /** Đọc cờ đã lưu + installId. Gọi một lần lúc khởi động. */
  init(): Promise<void>;
}

const KEY_INSTALL = "vong.analytics.installId";
const KEY_ENABLED = "vong.analytics.enabled";

function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  // Chỉ chạm nhánh này trên WebView cũ; ngẫu nhiên yếu vẫn đủ cho một khoá đếm.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const {
    shell,
    appVersion = null,
    endpoint = "/api/events",
    fetch: fetchImpl,
    storage,
    batchSize = 20,
    uuid = randomUuid,
    now = () => new Date(),
  } = options;

  // Mặc định BẬT (opt-out) — quyết định của chủ sản phẩm, có công tắc trong Cài đặt
  // và danh mục đầy đủ ở `ANALYTICS_EVENTS` phía trên.
  let enabled = true;
  let installId: string | null = null;
  const sessionId = uuid();
  let buffer: AnalyticsEvent[] = [];
  let sending: Promise<void> = Promise.resolve();

  async function readStorage(): Promise<void> {
    try {
      const [savedId, savedEnabled] = await Promise.all([
        storage.getItem(KEY_INSTALL),
        storage.getItem(KEY_ENABLED),
      ]);
      installId = savedId ?? uuid();
      if (!savedId) await storage.setItem(KEY_INSTALL, installId);
      if (savedEnabled !== null) enabled = savedEnabled !== "false";
    } catch {
      // Storage hỏng (chế độ riêng tư, quota) — chạy tiếp với id trong bộ nhớ.
      installId ??= uuid();
    }
  }

  async function send(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    // Có thể tới đây trước khi `init()` xong (storage của mobile là bất đồng bộ, còn
    // flush thì chạy theo hẹn giờ). Đọc bù ở đây thay vì vứt lô — mất sự kiện đầu
    // phiên chính là mất `app_open`, thứ dùng làm mẫu số cho mọi tỉ lệ.
    if (!installId) await readStorage();
    if (!installId || !enabled) return;
    const batch: AnalyticsBatch = { installId, shell, appVersion, events };
    try {
      await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
        // Sự kiện mất còn hơn giữ kết nối sống khi người dùng đang rời đi.
        keepalive: true,
      });
    } catch {
      // Mất mạng thì bỏ luôn lô này. Giữ lại để gửi sau nghe hợp lý nhưng sẽ làm
      // lệch số liệu theo múi giờ và phình storage — không đáng cho dữ liệu đếm.
    }
  }

  function enqueueFlush(): void {
    const pending = buffer;
    buffer = [];
    sending = sending.then(() => send(pending));
  }

  return {
    async init() {
      await readStorage();
    },

    isEnabled() {
      return enabled;
    },

    async setEnabled(value) {
      enabled = value;
      if (!value) buffer = [];
      try {
        await storage.setItem(KEY_ENABLED, value ? "true" : "false");
      } catch {
        // Không lưu được thì chỉ mất lựa chọn sau khi khởi động lại, không sao.
      }
    },

    track(name, props) {
      if (!enabled) return;
      if (!isAnalyticsEvent(name)) return;
      buffer.push({
        name,
        props: sanitizeProps(props),
        clientTs: now().toISOString(),
        sessionId,
      });
      if (buffer.length >= batchSize) enqueueFlush();
    },

    async flush() {
      if (buffer.length > 0) enqueueFlush();
      await sending;
    },
  };
}
