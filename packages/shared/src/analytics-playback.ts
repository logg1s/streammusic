/**
 * Suy ra sự kiện telemetry từ trạng thái của player store.
 *
 * Vì sao suy ra từ store chứ không gọi thẳng trong các engine: chạm vào
 * `audio-engine.tsx`, `youtube-engine.tsx`, `native-audio-engine.tsx` và
 * `playback-engine.tsx` là chạm vào đúng vùng mà BẤT BIẾN 1 (chỉ một nguồn tiếng) sống,
 * và cũng là vùng mà script tripwire không nhìn thấy gì — nó chỉ khớp văn bản. Một
 * subscriber đọc store thì không thể vô tình tạo ra nguồn phát thứ hai.
 *
 * Đây cũng là cách `RadioController` đã làm sẵn trong repo này, nên không phát minh
 * thêm khuôn mẫu mới.
 *
 * Logic nằm ở gói dùng chung để ba vỏ đếm giống hệt nhau. Số liệu lệch nhau theo thiết
 * bị còn tệ hơn không có số liệu: nó tạo ra những so sánh sai mà trông vẫn có căn cứ.
 */

import type { Analytics } from "./analytics";
import type { TrackSource } from "./types";

/** Ảnh chụp trạng thái phát, đủ để suy ra mọi sự kiện dưới đây. */
export interface PlaybackSnapshot {
  trackId: string | null;
  source: TrackSource | null;
  durationSec: number | null;
  currentTime: number;
  isPlaying: boolean;
  queueLength: number;
  /** Hàng đợi hiện tại là radio hay album/playlist thường. */
  radioActive: boolean;
  radioSeedId: string | null;
  /** Thông báo lỗi của store. KHÔNG bao giờ được gửi đi nguyên văn — xem `classify`. */
  error: string | null;
}

/** Nghe dưới ngần này giây tính là bỏ sớm — tín hiệu trực tiếp cho "gợi ý sai". */
const SKIP_EARLY_SEC = 10;

/** Nghe tới ngần này phần thời lượng coi như nghe hết; chừa phần outro người ta hay tua. */
const COMPLETE_RATIO = 0.9;

/**
 * Quy lỗi về nhãn có giới hạn.
 *
 * Tuyệt đối không gửi `error.message`: thông báo lỗi trong app này có thể chứa URL
 * googlevideo, id video, thậm chí tên bài. Một nhãn đóng vừa an toàn vừa đếm được;
 * chuỗi tự do thì không đếm được mà lại rò nội dung.
 */
function classify(message: string): { name: "resolve_fail" | "playback_error"; props: Record<string, string> } {
  const m = message.toLowerCase();
  if (m.includes("login") || m.includes("đăng nhập")) {
    return { name: "resolve_fail", props: { reason: "login_required" } };
  }
  if (m.includes("unplayable") || m.includes("101") || m.includes("150")) {
    return { name: "resolve_fail", props: { reason: "unplayable" } };
  }
  if (m.includes("403")) {
    return { name: "resolve_fail", props: { reason: "forbidden" } };
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout") || m.includes("mạng")) {
    return { name: "resolve_fail", props: { reason: "network" } };
  }
  return { name: "playback_error", props: { stage: "playback", code: "other" } };
}

export interface PlaybackAnalytics {
  /** Gọi mỗi lần store đổi trạng thái. */
  observe(snapshot: PlaybackSnapshot): void;
  /**
   * Cho biết lần bật radio sắp tới do đâu mà có.
   *
   * Store không phân biệt được "tự phát tiếp" với "người dùng bấm Radio", mà đó lại
   * chính là con số kiểm chứng quyết định autoplay-mặc-định. Nên nhánh autoplay trong
   * RadioController tự khai báo; mọi đường khác mặc định là chủ động.
   */
  noteRadioTrigger(trigger: "autoplay" | "manual"): void;
}

export function createPlaybackAnalytics(options: {
  analytics: Analytics;
  now?: () => number;
}): PlaybackAnalytics {
  const { analytics, now = () => Date.now() } = options;

  let prev: PlaybackSnapshot | null = null;
  /** Mốc bắt đầu chờ tiếng của bài hiện tại, để tính time-to-first-audio. */
  let selectedAt = now();
  /** Đã phát ra tiếng chưa — `play_start` chỉ bắn khi đồng hồ thật sự nhúc nhích. */
  let started = false;
  /** Số bài đã phát trong hàng đợi hiện tại, dùng cho `queue_end`. */
  let depth = 0;
  let nextTrigger: "autoplay" | "manual" = "manual";

  function originOf(s: PlaybackSnapshot): string {
    // Store chỉ phân biệt được tới mức này. Tách nhỏ hơn (search / recent / album) cần
    // sửa ở từng nơi bấm phát; radio-vs-tự-chọn đã là lát cắt mà metrics cần nhất.
    return s.radioActive ? "radio" : "queue";
  }

  function emitPlayEnd(last: PlaybackSnapshot): void {
    const playedSec = Math.max(0, Math.round(last.currentTime));
    const durationSec = last.durationSec ?? null;
    analytics.track("play_end", {
      playedSec,
      durationSec,
      origin: originOf(last),
      source: last.source,
      completed:
        durationSec !== null && durationSec > 0
          ? playedSec >= COMPLETE_RATIO * durationSec
          : false,
      skippedEarly: playedSec < SKIP_EARLY_SEC,
    });
  }

  return {
    noteRadioTrigger(trigger) {
      nextTrigger = trigger;
    },

    observe(s) {
      const last = prev;
      prev = s;

      if (!last) {
        selectedAt = now();
        return;
      }

      // ── Đổi bài ────────────────────────────────────────────────────────────
      if (s.trackId !== last.trackId) {
        if (last.trackId) {
          emitPlayEnd(last);
          depth += 1;
        }

        // Hàng đợi chạy hết mà không nối tiếp được — chính là thứ autoplay sinh ra để
        // ngăn, nên phải đếm.
        if (s.trackId === null && last.trackId !== null) {
          analytics.track("queue_end", { depth });
          depth = 0;
        }

        selectedAt = now();
        started = false;
      }

      // ── Ra tiếng lần đầu ───────────────────────────────────────────────────
      // Điều kiện là đồng hồ đã chạy, không phải `isPlaying`: cờ đó bật ngay lúc bấm,
      // trong khi tiếng có thể còn vài giây nữa mới ra (TTFB của Drive, resolve YouTube).
      // Lấy theo `isPlaying` thì TTFA luôn bằng 0 và chỉ số trở nên vô nghĩa.
      if (!started && s.trackId && s.currentTime > 0) {
        started = true;
        analytics.track("play_start", {
          source: s.source,
          origin: originOf(s),
          ttfaMs: Math.max(0, now() - selectedAt),
        });
      }

      // ── Radio ──────────────────────────────────────────────────────────────
      const seeded =
        (s.radioActive && !last.radioActive) ||
        (s.radioActive && s.radioSeedId !== last.radioSeedId);
      if (seeded) {
        analytics.track("radio_seed", { trigger: nextTrigger });
        nextTrigger = "manual";
        depth = 0;
      } else if (s.radioActive && s.queueLength > last.queueLength) {
        analytics.track("radio_refill", { added: s.queueLength - last.queueLength });
      }

      // ── Lỗi ────────────────────────────────────────────────────────────────
      if (s.error && s.error !== last.error) {
        const { name, props } = classify(s.error);
        analytics.track(name, props);
      }
    },
  };
}
