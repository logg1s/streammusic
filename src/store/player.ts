"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlayableTrack } from "@/lib/library";

export type RepeatMode = "off" | "all" | "one";

/**
 * Thẻ <audio> ĐANG PHÁT, do AudioEngine đăng ký.
 *
 * Giữ tham chiếu ở tầng module thay vì trong state: tua nhạc và chỉnh âm lượng
 * là lệnh trực tiếp lên phần tử DOM, còn state chỉ phản ánh những gì phần tử
 * báo lại qua sự kiện. Một chiều duy nhất, không có vòng lặp cập nhật.
 *
 * AudioEngine giữ một hồ thẻ và đổi vai trò giữa chúng, nên giá trị này đổi mỗi
 * lần sang bài mới.
 */
let audioElement: HTMLAudioElement | null = null;

export function registerAudioElement(el: HTMLAudioElement | null) {
  audioElement = el;
}

export function getAudioElement(): HTMLAudioElement | null {
  return audioElement;
}

interface PlayerState {
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
  error: string | null;
  /**
   * Vị trí cần tua tới ngay khi bài nạp xong, dùng để khôi phục sau khi tải lại trang.
   * AudioEngine tiêu thụ rồi xoá về null. Không thể tua ngay lúc khôi phục vì thẻ
   * <audio> chưa có metadata nên `currentTime` sẽ bị bỏ qua.
   */
  pendingSeek: number | null;

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
  clearQueue: () => void;

  /** Chỉ AudioEngine gọi — đồng bộ state theo sự kiện của thẻ <audio>. */
  syncTime: (currentTime: number, duration: number) => void;
  syncPlaying: (isPlaying: boolean) => void;
  setBuffering: (value: boolean) => void;
  setError: (message: string | null) => void;
  consumePendingSeek: () => number | null;
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

export const usePlayer = create<PlayerState>()(
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
  error: null,
  pendingSeek: null,

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
    });
  },

  playTrackAt(position) {
    const { order } = get();
    if (position < 0 || position >= order.length) return;
    set({ position, currentTime: 0, duration: 0, error: null, isPlaying: true });
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
    set({ isPlaying: false, currentTime: 0 });
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
    if (audioElement) audioElement.currentTime = seconds;
    set({ currentTime: seconds });
  },

  setVolume(volume) {
    const clamped = Math.min(1, Math.max(0, volume));
    if (audioElement) audioElement.volume = clamped;
    set({ volume: clamped, muted: clamped === 0 });
  },

  toggleMute() {
    const muted = !get().muted;
    if (audioElement) audioElement.muted = muted;
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

  clearQueue() {
    set({
      queue: [],
      order: [],
      position: 0,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
    });
  },

  syncTime(currentTime, duration) {
    set({ currentTime, duration: Number.isFinite(duration) ? duration : 0 });
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
      name: "vong-player",
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
        currentTime: s.currentTime,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Mở lại trang thì đứng yên ở đúng chỗ cũ, chờ người dùng bấm phát.
        state.isPlaying = false;
        state.isBuffering = false;
        state.error = null;
        state.pendingSeek = state.currentTime > 1 ? state.currentTime : null;
      },
    },
  ),
);

/** Bài đang phát, hoặc null nếu hàng đợi rỗng. */
export function useCurrentTrack(): PlayableTrack | null {
  return usePlayer((s) => s.queue[s.order[s.position]] ?? null);
}

/**
 * Bài hiện tại, đọc ngoài React. AudioEngine cần bản không-hook này để `reconcile()`
 * lấy được trạng thái mới nhất mà không phụ thuộc vào chu kỳ render.
 */
export function peekCurrentTrack(): PlayableTrack | null {
  const { queue, order, position } = usePlayer.getState();
  return queue[order[position]] ?? null;
}

/**
 * Bài sẽ phát tiếp theo, không thay đổi state gì cả.
 *
 * AudioEngine dùng cái này để nạp sẵn bài kế vào thẻ audio dự phòng. Trả null khi
 * đang ở bài cuối và không lặp — lúc đó không có gì để nạp trước.
 */
export function peekNextTrack(): PlayableTrack | null {
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
export function peekPrevTrack(): PlayableTrack | null {
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
export function peekNeighbourIds(radius: number): string[] {
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
export function useIsCurrentTrack(trackId: string): boolean {
  return usePlayer((s) => s.queue[s.order[s.position]]?.id === trackId);
}
