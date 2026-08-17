import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";
import type { PlayableTrack, RadioState, RepeatMode, TrackSource } from "./types";

/**
 * Ruột của store phát nhạc, dùng chung cho cả ba vỏ.
 *
 * Là FACTORY chứ không phải một instance: `persist` mặc định lấy
 * `window.localStorage` (zustand/middleware.js), thứ không tồn tại trong React
 * Native. Mỗi vỏ tự cắm storage của mình — web `localStorage`, Expo
 * `AsyncStorage` — rồi dùng cùng một bộ hành vi.
 *
 * `sinks` nằm TRONG factory chứ không phải biến module: hai instance trong cùng một
 * tiến trình (không xảy ra trong app, nhưng test thì có) không được dùng lẫn đích tua
 * của nhau.
 */

/**
 * Đích nhận lệnh tua của một nguồn phát.
 *
 * Mỗi nguồn có engine riêng — hồ <audio> cho bài thư viện, iframe cho bài YouTube,
 * hoặc player native — nên store không thể giữ thẳng một phần tử DOM. Nó chỉ biết
 * "bài hiện tại thuộc nguồn nào" rồi chuyển lệnh cho engine đã đăng ký cho nguồn đó.
 *
 * Âm lượng KHÔNG đi qua đây: mỗi engine tự có effect theo volume/muted.
 */
export interface PlaybackSink {
  seek(seconds: number): void;
}

export type { RadioState, RepeatMode };

export interface PlayerState {
  /** Danh sách gốc, giữ nguyên thứ tự album. */
  queue: PlayableTrack[];
  /** Thứ tự phát: mảng chỉ số trỏ vào `queue`. Xáo bài chỉ đảo mảng này. */
  order: number[];
  position: number;

  isPlaying: boolean;
  /**
   * Đang chờ dữ liệu để phát.
   *
   * Có riêng vì `isPlaying` bật lên ngay lúc bấm, trong khi tiếng chỉ ra sau ~3 giây
   * (TTFB của Google Drive). Không có trạng thái này thì giao diện im lìm suốt quãng
   * đó và người dùng không phân biệt được đang tải hay đã đơ.
   */
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /**
   * Tự nối radio khi hàng đợi thường sắp hết (kiểu "Autoplay" của Spotify): bật thì
   * một album/playlist/bài lẻ nghe hết sẽ tự chảy tiếp bằng bài đề xuất thay vì dừng.
   * RadioController là nơi đọc cờ này; store chỉ giữ và lưu nó.
   */
  autoplay: boolean;
  error: string | null;
  /**
   * Vị trí cần tua tới ngay khi bài nạp xong, dùng để khôi phục sau khi tải lại trang.
   * AudioEngine tiêu thụ rồi xoá về null. Không thể tua ngay lúc khôi phục vì thẻ
   * <audio> chưa có metadata nên `currentTime` sẽ bị bỏ qua.
   */
  pendingSeek: number | null;
  /** Radio đang chạy trên hàng đợi này; null khi hàng đợi là album/playlist thường. */
  radio: RadioState | null;
  /**
   * Đếm số lần `next()` được gọi mà không đi đâu được — bấm next, không có gì xảy ra.
   *
   * Là bộ đếm tăng dần chứ không phải cờ, vì telemetry đọc store qua subscription và
   * một cờ bật/tắt sẽ bị bỏ lỡ giữa hai lần quan sát. Cố tình KHÔNG lưu xuống đĩa:
   * đây là chuyện của phiên hiện tại, không phải trạng thái cần khôi phục.
   */
  advanceFailures: number;

  playQueue: (tracks: PlayableTrack[], startIndex?: number) => void;
  playTrackAt: (position: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  handleEnded: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setAutoplay: (value: boolean) => void;
  clearQueue: () => void;

  startRadio: (seed: PlayableTrack) => void;
  stopRadio: () => void;
  /** Đổi seed radio tại chỗ, giữ nguyên hàng đợi. Xem ghi chú ở phần cài đặt. */
  rotateRadioSeed: (seed: PlayableTrack) => void;
  setRadioStatus: (
    status: RadioState["status"],
    exhausted?: boolean,
    message?: string | null,
    errorKind?: RadioState["errorKind"],
  ) => void;
  /** Nối thêm bài vào cuối hàng đợi, bỏ bài đã có. */
  appendTracks: (tracks: PlayableTrack[]) => void;
  /** Chèn ngay sau bài đang phát. Bỏ qua nếu bài đã có trong hàng đợi. */
  insertNext: (track: PlayableTrack) => void;
  removeAt: (orderPos: number) => void;
  moveToNext: (orderPos: number) => void;

  /** Chỉ AudioEngine gọi — đồng bộ state theo sự kiện của thẻ <audio>. */
  syncTime: (currentTime: number, duration: number) => void;
  syncPlaying: (isPlaying: boolean) => void;
  setBuffering: (value: boolean) => void;
  setError: (message: string | null) => void;
  consumePendingSeek: () => number | null;
}

/** Đúng những trường được ghi ra storage — xem `partialize` bên dưới. */
export type PersistedPlayerState = Pick<
  PlayerState,
  | "queue"
  | "order"
  | "position"
  | "volume"
  | "muted"
  | "shuffle"
  | "repeat"
  | "autoplay"
  | "currentTime"
  | "radio"
>;

export interface PlayerStoreOptions {
  /**
   * Nơi giữ hàng đợi giữa các phiên. Bỏ trống thì `persist` tự lấy
   * `window.localStorage` — chỉ đúng trên web.
   */
  storage?: PersistStorage<PersistedPlayerState>;
  /** Khoá trong storage. Đổi tên là mất hàng đợi cũ của người dùng. */
  name?: string;
}

export interface PlayerStore {
  usePlayer: UseBoundStore<StoreApi<PlayerState>>;
  registerSink(source: TrackSource, sink: PlaybackSink | null): void;
  useCurrentTrack(): PlayableTrack | null;
  peekCurrentTrack(): PlayableTrack | null;
  peekNextTrack(): PlayableTrack | null;
  peekPrevTrack(): PlayableTrack | null;
  peekNeighbourIds(radius: number): string[];
  useIsCurrentTrack(trackId: string): boolean;
}

function shuffledOrder(length: number, keepFirst: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter(
    (i) => i !== keepFirst,
  );
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return keepFirst >= 0 ? [keepFirst, ...rest] : rest;
}

export function createPlayerStore(
  options: PlayerStoreOptions = {},
): PlayerStore {
  const sinks: Partial<Record<TrackSource, PlaybackSink | null>> = {};

  function registerSink(source: TrackSource, sink: PlaybackSink | null) {
    sinks[source] = sink;
  }

  function activeSink(): PlaybackSink | null {
    const track = peekCurrentTrack();
    return track ? (sinks[track.source] ?? null) : null;
  }

  const usePlayer = create<PlayerState>()(
    persist(
      (set, get) => ({
        queue: [],
        order: [],
        position: 0,
        isPlaying: false,
        isBuffering: false,
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        shuffle: false,
        repeat: "off",
        autoplay: true,
        error: null,
        pendingSeek: null,
        advanceFailures: 0,
        radio: null,

        playQueue(tracks, startIndex = 0) {
          if (tracks.length === 0) return;
          const identity = Array.from({ length: tracks.length }, (_, i) => i);
          const order = get().shuffle
            ? shuffledOrder(tracks.length, startIndex)
            : identity;
          set({
            queue: tracks,
            order,
            position: get().shuffle ? 0 : startIndex,
            currentTime: 0,
            duration: 0,
            error: null,
            isPlaying: true,
            // Mở một album là kết thúc radio: hàng đợi mới không còn liên quan tới seed cũ.
            radio: null,
          });
        },

        playTrackAt(position) {
          const { order } = get();
          if (position < 0 || position >= order.length) return;
          set({
            position,
            currentTime: 0,
            duration: 0,
            error: null,
            isPlaying: true,
          });
        },

        toggle() {
          if (get().isPlaying) get().pause();
          else get().play();
        },

        play() {
          if (get().queue.length === 0) return;
          set({ isPlaying: true, error: null });
        },

        pause() {
          set({ isPlaying: false });
        },

        next() {
          const { position, order, repeat } = get();
          if (order.length === 0) return;
          if (position + 1 < order.length) {
            get().playTrackAt(position + 1);
            return;
          }
          if (repeat === "all") {
            get().playTrackAt(0);
            return;
          }
          // Đây CHÍNH LÀ khoảnh khắc "bấm next mà không có gì xảy ra". Trước đây nó
          // im lặng tuyệt đối: `queue_end` chỉ bắn khi `trackId` thành null, mà ở đây
          // bài cuối vẫn đang được chọn — nên sự kiện mang đúng cái tên của tình
          // huống này chưa từng bắn một lần nào trong chính tình huống đó. Người dùng
          // bực bội và người dùng nghe xong hài lòng để lại dấu vết giống hệt nhau.
          set({
            isPlaying: false,
            currentTime: 0,
            advanceFailures: get().advanceFailures + 1,
          });
        },

        previous() {
          const { position, currentTime } = get();
          // Quy ước quen thuộc: quá 3 giây thì nút "lùi" quay về đầu bài hiện tại.
          if (currentTime > 3) {
            get().seek(0);
            return;
          }
          if (position > 0) get().playTrackAt(position - 1);
          else get().seek(0);
        },

        handleEnded() {
          if (get().repeat === "one") {
            get().seek(0);
            set({ isPlaying: true });
            return;
          }
          get().next();
        },

        seek(seconds) {
          activeSink()?.seek(seconds);
          set({ currentTime: seconds });
        },

        setVolume(volume) {
          const clamped = Math.min(1, Math.max(0, volume));
          set({ volume: clamped, muted: clamped === 0 });
        },

        toggleMute() {
          const muted = !get().muted;
          set({ muted });
        },

        toggleShuffle() {
          const { shuffle, queue, order, position } = get();
          const currentTrackIndex = order[position] ?? 0;

          if (shuffle) {
            // Tắt xáo: quay lại thứ tự gốc, giữ nguyên bài đang nghe.
            set({
              shuffle: false,
              order: Array.from({ length: queue.length }, (_, i) => i),
              position: currentTrackIndex,
            });
          } else {
            set({
              shuffle: true,
              order: shuffledOrder(queue.length, currentTrackIndex),
              position: 0,
            });
          }
        },

        cycleRepeat() {
          const next: Record<RepeatMode, RepeatMode> = {
            off: "all",
            all: "one",
            one: "off",
          };
          set({ repeat: next[get().repeat] });
        },

        setAutoplay(value) {
          set({ autoplay: value });
        },

        clearQueue() {
          set({
            queue: [],
            order: [],
            position: 0,
            isPlaying: false,
            isBuffering: false,
            currentTime: 0,
            radio: null,
          });
        },

        startRadio(seed) {
          const { queue, order, position } = get();
          const radio: RadioState = {
            seedId: seed.id,
            seedLabel: seed.title,
            status: "loading",
            exhausted: false,
            message: null,
            errorKind: null,
          };
          // Xáo và lặp đều đánh nhau với việc nạp thêm: repeat "all" quay về đầu hàng đợi
          // thay vì để RadioController kéo lô tiếp theo.
          if (queue[order[position]]?.id === seed.id) {
            // Bấm Radio ngay trên bài đang phát — không cắt tiếng đang chạy.
            set({ radio, shuffle: false, repeat: "off" });
            return;
          }
          set({
            queue: [seed],
            order: [0],
            position: 0,
            currentTime: 0,
            duration: 0,
            error: null,
            isPlaying: true,
            shuffle: false,
            repeat: "off",
            radio,
          });
        },

        stopRadio() {
          // Chỉ thôi nạp thêm; những bài đã gợi ý vẫn nằm trong hàng đợi.
          set({ radio: null });
        },

        rotateRadioSeed(seed) {
          // Chuyển seed sang bài khác mà KHÔNG đụng tới hàng đợi.
          //
          // Tồn tại riêng vì `startRadio` không làm được việc này an toàn: nếu bài
          // truyền vào không đúng bài đang phát, nó rơi xuống nhánh dưới và thay sạch
          // queue/order/position — xoá hàng đợi giữa phiên nghe. Controller chạy trên
          // subscription của store nên rất dễ cầm nhầm một bài đã cũ.
          //
          // Vì sao cần xoay seed: kho ứng viên phía server được cache theo seed và tối
          // đa ~100 id. Nạp mãi bằng seed gốc là một phiên nghe có trần cứng. Nhưng
          // xoay ở MỌI lần nạp thì mỗi lần nạp là một lần trượt cache, tức một lần đào
          // InnerTube phía server — ~15 lần trong phiên 2 giờ thay vì 1, trên đúng dải
          // IP vốn đã bị LOGIN_REQUIRED. Nên chỉ gọi khi lô về ngắn hoặc rỗng.
          const radio = get().radio;
          if (!radio || radio.seedId === seed.id) return;
          set({
            radio: {
              ...radio,
              seedId: seed.id,
              seedLabel: seed.title,
              exhausted: false,
              status: "idle",
              message: null,
            },
          });
        },

        setRadioStatus(status, exhausted, message, errorKind) {
          const radio = get().radio;
          if (!radio) return;
          set({
            radio: {
              ...radio,
              status,
              exhausted: exhausted ?? radio.exhausted,
              message: message ?? (status === "error" ? radio.message : null),
              errorKind:
                status === "error" ? (errorKind ?? radio.errorKind) : null,
            },
          });
        },

        appendTracks(tracks) {
          const { queue, order } = get();
          // Lô sau có thể trùng lô trước (server chỉ loại theo `exclude` client gửi lên).
          const seen = new Set(queue.map((t) => t.id));
          const fresh: PlayableTrack[] = [];
          for (const track of tracks) {
            if (seen.has(track.id)) continue;
            seen.add(track.id);
            fresh.push(track);
          }
          if (fresh.length === 0) return;
          set({
            queue: [...queue, ...fresh],
            order: [...order, ...fresh.map((_, i) => queue.length + i)],
          });
        },

        insertNext(track) {
          const { queue, order, position } = get();
          if (queue.some((t) => t.id === track.id)) return;
          // Bài mới nằm ở cuối `queue`; chỉ `order` mới quyết định thứ tự phát.
          set({
            queue: [...queue, track],
            order: [
              ...order.slice(0, position + 1),
              queue.length,
              ...order.slice(position + 1),
            ],
          });
        },

        removeAt(orderPos) {
          const { queue, order, position } = get();
          if (orderPos < 0 || orderPos >= order.length) return;

          const removedQueueIndex = order[orderPos];
          const newQueue = queue.filter((_, i) => i !== removedQueueIndex);
          // Bỏ một phần tử khỏi `queue` làm mọi chỉ số phía sau tụt một bậc, nên `order`
          // phải dịch theo, nếu không hàng đợi trỏ nhầm bài.
          const newOrder = order
            .filter((_, p) => p !== orderPos)
            .map((qi) => (qi > removedQueueIndex ? qi - 1 : qi));

          const nextPosition =
            orderPos < position
              ? position - 1
              : orderPos === position
                ? // Bài kế trượt vào đúng chỗ đang phát nên phát tiếp ngay.
                  Math.min(position, newOrder.length - 1)
                : position;

          set({
            queue: newQueue,
            order: newOrder,
            position: Math.max(0, nextPosition),
            ...(newOrder.length === 0
              ? { isPlaying: false, currentTime: 0 }
              : null),
          });
        },

        moveToNext(orderPos) {
          const { order, position } = get();
          if (orderPos <= position || orderPos >= order.length) return;
          // Chỉ đảo thứ tự phát; `queue` giữ nguyên nên chỉ số trong `order` vẫn đúng.
          const newOrder = [...order];
          const [moved] = newOrder.splice(orderPos, 1);
          newOrder.splice(position + 1, 0, moved);
          set({ order: newOrder });
        },

        syncTime(currentTime, duration) {
          set({
            currentTime,
            duration: Number.isFinite(duration) ? duration : 0,
          });
        },

        syncPlaying(isPlaying) {
          set({ isPlaying });
        },

        setBuffering(isBuffering) {
          set({ isBuffering });
        },

        setError(error) {
          set({ error, isPlaying: false, isBuffering: false });
        },

        consumePendingSeek() {
          const value = get().pendingSeek;
          if (value !== null) set({ pendingSeek: null });
          return value;
        },
      }),
      {
        // Chỉ lưu thứ đáng khôi phục. isPlaying cố tình không lưu: trình duyệt chặn
        // tự phát khi chưa có tương tác, khôi phục nó sẽ luôn ném NotAllowedError.
        partialize: (s) => ({
          queue: s.queue,
          order: s.order,
          position: s.position,
          volume: s.volume,
          muted: s.muted,
          shuffle: s.shuffle,
          repeat: s.repeat,
          autoplay: s.autoplay,
          currentTime: s.currentTime,
          radio: s.radio,
        }),
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          // Mở lại trang thì đứng yên ở đúng chỗ cũ, chờ người dùng bấm phát.
          state.isPlaying = false;
          state.isBuffering = false;
          state.error = null;
          state.pendingSeek = state.currentTime > 1 ? state.currentTime : null;
          // Lô đang tải dở lúc đóng trang không còn nữa; để "loading" thì RadioController
          // tưởng có request đang chạy và không bao giờ nạp thêm.
          //
          // `errorKind` được thêm sau nên bản ghi cũ trên đĩa không có nó — điền `null`
          // ở đây thay vì bump `version` của persist, vì bump là vứt luôn hàng đợi mà
          // người dùng đang nghe dở, một cái giá quá đắt cho một trường mới.
          if (state.radio) {
            state.radio = {
              ...state.radio,
              status: "idle",
              errorKind: state.radio.errorKind ?? null,
            };
          }
        },
        storage: options.storage,
        name: options.name ?? "vong-player",
      },
    ),
  );

  /** Bài đang phát, hoặc null nếu hàng đợi rỗng. */
  function useCurrentTrack(): PlayableTrack | null {
    return usePlayer((s) => s.queue[s.order[s.position]] ?? null);
  }

  /**
   * Bài hiện tại, đọc ngoài React. AudioEngine cần bản không-hook này để `reconcile()`
   * lấy được trạng thái mới nhất mà không phụ thuộc vào chu kỳ render.
   */
  function peekCurrentTrack(): PlayableTrack | null {
    const { queue, order, position } = usePlayer.getState();
    return queue[order[position]] ?? null;
  }

  /**
   * Bài sẽ phát tiếp theo, không thay đổi state gì cả.
   *
   * AudioEngine dùng cái này để nạp sẵn bài kế vào thẻ audio dự phòng. Trả null khi
   * đang ở bài cuối và không lặp — lúc đó không có gì để nạp trước.
   */
  function peekNextTrack(): PlayableTrack | null {
    const { queue, order, position, repeat } = usePlayer.getState();
    if (order.length === 0) return null;

    if (position + 1 < order.length) return queue[order[position + 1]] ?? null;
    if (repeat === "all") return queue[order[0]] ?? null;
    return null;
  }

  /**
   * Bài liền trước, không thay đổi state gì cả.
   *
   * AudioEngine dùng để biết thẻ nào cần GIỮ LẠI thay vì tái dùng. Bài vừa phát xong
   * vẫn còn nguyên trong thẻ cũ, nên chỉ cần không hi sinh thẻ đó là prev tức thì mà
   * không tốn thêm một byte băng thông nào.
   */
  function peekPrevTrack(): PlayableTrack | null {
    const { queue, order, position, repeat } = usePlayer.getState();
    if (order.length === 0) return null;

    if (position > 0) return queue[order[position - 1]] ?? null;
    if (repeat === "all") return queue[order[order.length - 1]] ?? null;
    return null;
  }

  /**
   * Id các bài quanh bài đang nghe, xếp theo thứ tự ưu tiên: hiện tại, +1, −1, +2, −2…
   *
   * AudioEngine dùng làm "bộ cần giữ": thẻ nào đang ôm một trong các id này thì không
   * được tái dùng. Thứ tự ưu tiên cũng chính là thứ tự hi sinh khi phải chọn thẻ —
   * bỏ bài xa nhất trước.
   */
  function peekNeighbourIds(radius: number): string[] {
    const { queue, order, position, repeat } = usePlayer.getState();
    if (order.length === 0) return [];

    const ids: string[] = [];
    const push = (pos: number) => {
      let p = pos;
      if (repeat === "all") {
        p = ((p % order.length) + order.length) % order.length;
      } else if (p < 0 || p >= order.length) {
        return;
      }
      const id = queue[order[p]]?.id;
      if (id && !ids.includes(id)) ids.push(id);
    };

    push(position);
    for (let d = 1; d <= radius; d++) {
      push(position + d);
      push(position - d);
    }
    return ids;
  }

  /** Bài này có đang được phát không — dùng để tô sáng dòng trong danh sách. */
  function useIsCurrentTrack(trackId: string): boolean {
    return usePlayer((s) => s.queue[s.order[s.position]]?.id === trackId);
  }

  return {
    usePlayer,
    registerSink,
    useCurrentTrack,
    peekCurrentTrack,
    peekNextTrack,
    peekPrevTrack,
    peekNeighbourIds,
    useIsCurrentTrack,
  };
}
