import {
  MAX_RESEED_ATTEMPTS,
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
  let reseeds = 0;
  let last: PlayedTrack | null = null;

  const refill = async (seedId: string, exclude: string[]) => {
    refilling = true;
    const before = store.usePlayer.getState().queue.length;
    try {
      await client.refillRadio(seedId, exclude);
      const state = store.usePlayer.getState();

      if (state.radio?.status === "error") {
        failures += 1;
        retryAt = now() + radioRetryDelayMs(failures);
        return;
      }
      failures = 0;
      retryAt = 0;

      // Lô về ngắn = kho ứng viên của seed này đang cạn. Xoay seed sang bài đang phát
      // TRƯỚC khi cạn hẳn. Kho phía server được cache theo seed và hữu hạn (~100 id),
      // nên nạp mãi bằng seed gốc là một phiên nghe có trần cứng — đó là "nghe chục
      // bài rồi không next được nữa".
      //
      // Nhưng chỉ xoay khi lô về ngắn, không xoay mỗi lần: mỗi seed mới là một lần
      // trượt cache, tức một lần đào InnerTube phía server. Xoay mỗi lần nạp biến 1
      // lần đào/phiên thành ~15, trên đúng dải IP vốn đã bị LOGIN_REQUIRED.
      const gained = store.usePlayer.getState().queue.length - before;

      // Trần đếm số lần gieo lại LIÊN TIẾP MÀ KHÔNG RA BÀI NÀO, không phải tổng số
      // lần gieo lại trong phiên. Đếm tổng thì một phiên đủ dài chắc chắn chạm trần
      // rồi chết — chỉ là chết muộn hơn, ở bài 243 thay vì bài 160, mà vẫn chết.
      // Cái cần chặn là vòng lặp rỗng vô ích, không phải việc xoay seed nhiều lần:
      // xoay được bài mới nghĩa là nó đang làm đúng việc của nó.
      if (gained > 0) reseeds = 0;

      if (gained > REFILL_THRESHOLD) return;
      const current = state.queue[state.order[state.position]] ?? null;
      if (current && current.id !== seedId && reseeds < MAX_RESEED_ATTEMPTS) {
        if (gained === 0) reseeds += 1;
        store.usePlayer.getState().rotateRadioSeed(current);
      }
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
        if (last) client.reportPlayed(last);
        last = track ? snapshot(track) : null;
      } else if (last) {
        last.time = state.currentTime;
      }

      const { radio, order, position, queue } = state;
      const ready = !refilling && !starting && now() >= retryAt;

      if (
        radio &&
        !radio.exhausted &&
        radio.status !== "loading" &&
        ready &&
        order.length - 1 - position <= REFILL_THRESHOLD
      ) {
        void refill(
          radio.seedId,
          queue.map((t) => t.id),
        );
        return;
      }

      // Autoplay: hàng đợi thường sắp hết → biến nó thành radio. Cũng là đường thoát
      // khi radio đã cạn — nhưng có trần, vì không có trần thì cạn → gieo lại → lô
      // rỗng → cạn lặp vô hạn, mỗi vòng một lần đào server.
      if (!ready) return;
      if (state.radio?.exhausted && reseeds >= MAX_RESEED_ATTEMPTS) return;

      const seed = autoplaySeed(state);
      if (!seed) return;
      if (state.radio?.exhausted) reseeds += 1;

      options.onAutoplayTrigger?.();
      starting = true;
      void client.startRadioFor(seed).finally(() => {
        starting = false;
      });
    },
  };
}
