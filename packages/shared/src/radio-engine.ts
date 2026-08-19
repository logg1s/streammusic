import {
  REFILL_THRESHOLD,
  autoplaySeed,
  radioRetryDelayMs,
} from "./radio-client";
import type { PlayedTrack, RadioClient } from "./radio-client";
import type { PlayerState, PlayerStore } from "./player-store";
import type { PlayableTrack } from "./types";

/**
 * Bộ não của "playlist linh hoạt", tách khỏi vỏ.
 *
 * Trước đây toàn bộ quyết định này nằm trong `RadioController` của web và một bản
 * chép tay trong app Android. Hai bản đã lệch nhau ở đúng đường xử lý lỗi — chỗ tốn
 * kém nhất để lệch — và không bản nào test được, vì cả hai đều là component.
 *
 * Ở đây nó là một đối tượng thường: đưa vào một `PlayerState`, nó quyết định có gọi
 * mạng hay không. Nhờ vậy soak test tier 1 chạy được ĐÚNG mã mà người dùng chạy, chứ
 * không phải một bản mô phỏng của nó — bản mô phỏng thì luôn xanh, kể cả khi mã thật
 * đã chết sau mười bài.
 *
 * Ba trạng thái nó giữ, và vì sao mỗi cái tồn tại:
 * - `failures`/`retryAt`: lùi dần khi lỗi. Xem `radioRetryDelayMs`.
 * - `reseeds`: trần cho việc gieo lại, chặn vòng cạn → gieo → rỗng → cạn.
 * - `last`: lượt nghe đang diễn ra, để báo về server khi nó kết thúc.
 */

export interface RadioEngineOptions {
  /** Cho test bơm đồng hồ vào. Mặc định `Date.now`. */
  now?: () => number;
  /**
   * Gọi khi radio được tự bật (không phải do người dùng bấm). Web dùng để đếm chỉ số
   * kiểm chứng cho quyết định autoplay-mặc-định.
   */
  onAutoplayTrigger?: () => void;
}

export interface RadioEngine {
  /** Đưa vào mỗi lần store phát state. An toàn khi gọi dồn dập. */
  handle(state: PlayerState): void;
  /**
   * Đánh dấu lượt nghe hiện tại kết thúc vì LỖI, không phải vì người dùng.
   * Vỏ phải gọi cái này ngay trước khi tự nhảy bài trên đường xử lý lỗi — nếu không,
   * cú nhảy đó bị ghi thành "người dùng không thích bài này", vĩnh viễn.
   */
  noteError(trackId: string): void;
  /** Chỉ dùng cho test/gỡ lỗi. */
  peek(): { failures: number; reseeds: number; retryAt: number };
}

function snapshot(track: PlayableTrack): PlayedTrack {
  return {
    id: track.id,
    source: track.source,
    videoId: track.youtubeVideoId,
    artistName: track.artistName,
    durationSec: track.durationSec,
    time: 0,
    reason: "user",
  };
}

export function createRadioEngine(
  store: PlayerStore,
  client: RadioClient,
  options: RadioEngineOptions = {},
): RadioEngine {
  const now = options.now ?? (() => Date.now());

  let refilling = false;
  let starting = false;
  let failures = 0;
  let retryAt = 0;
  const reseeds = 0;
  let last: PlayedTrack | null = null;

  const refill = async (continuation: string, exclude: string[]) => {
    refilling = true;
    try {
      await client.refillRadio(continuation, exclude);
      const state = store.usePlayer.getState();

      if (state.radio?.status === "error") {
        failures += 1;
        retryAt = now() + radioRetryDelayMs(failures);
        return;
      }
      failures = 0;
      retryAt = 0;
    } finally {
      refilling = false;
    }
  };

  return {
    noteError(trackId) {
      if (last?.id === trackId) last.reason = "error";
    },

    peek() {
      return { failures, reseeds, retryAt };
    },

    handle(state) {
      const track = state.queue[state.order[state.position]] ?? null;

      if (last?.id !== track?.id) {
        const finished = last;
        // Đổi snapshot TRƯỚC khi report: reportPlayed có thể ghi tombstone vào store,
        // phát state đồng bộ và gọi lại handle ngay trong cùng call stack.
        last = track ? snapshot(track) : null;
        if (finished) client.reportPlayed(finished);
      } else if (last) {
        last.time = state.currentTime;
      }

      const { radio, order, position, queue } = state;
      const ready = !refilling && !starting && now() >= retryAt;

      if (
        radio &&
        radio.continuation &&
        !radio.exhausted &&
        radio.status !== "loading" &&
        ready &&
        order.length - 1 - position <= REFILL_THRESHOLD
      ) {
        void refill(
          radio.continuation,
          [...queue.map((t) => t.id), ...radio.blockedIds],
        );
        return;
      }

      // Chỉ hàng đợi YouTube mới có thể mở radio. Thư viện/Drive luôn dừng ở cuối.
      if (!ready) return;

      const seed = autoplaySeed(state);
      if (!seed) return;

      options.onAutoplayTrigger?.();
      starting = true;
      void client.startRadioFor(seed).finally(() => {
        starting = false;
      });
    },
  };
}
