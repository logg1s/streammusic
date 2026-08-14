"use client";

import { create } from "zustand";
import type { PlayableTrack } from "@/lib/library";

export type RepeatMode = "off" | "all" | "one";

/**
 * Thẻ <audio> ĐANG PHÁT, do AudioEngine đăng ký.
 *
 * Giữ tham chiếu ở tầng module thay vì trong state: tua nhạc và chỉnh âm lượng
 * là lệnh trực tiếp lên phần tử DOM, còn state chỉ phản ánh những gì phần tử
 * báo lại qua sự kiện. Một chiều duy nhất, không có vòng lặp cập nhật.
 *
 * AudioEngine giữ hai thẻ và luân phiên chúng để đệm sẵn bài kế, nên giá trị này
 * đổi mỗi lần sang bài mới.
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
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;

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
  setError: (message: string | null) => void;
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

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  order: [],
  position: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
  error: null,

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
    set({ queue: [], order: [], position: 0, isPlaying: false, currentTime: 0 });
  },

  syncTime(currentTime, duration) {
    set({ currentTime, duration: Number.isFinite(duration) ? duration : 0 });
  },

  syncPlaying(isPlaying) {
    set({ isPlaying });
  },

  setError(error) {
    set({ error, isPlaying: false });
  },
}));

/** Bài đang phát, hoặc null nếu hàng đợi rỗng. */
export function useCurrentTrack(): PlayableTrack | null {
  return usePlayer((s) => s.queue[s.order[s.position]] ?? null);
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

/** Bài này có đang được phát không — dùng để tô sáng dòng trong danh sách. */
export function useIsCurrentTrack(trackId: string): boolean {
  return usePlayer((s) => s.queue[s.order[s.position]]?.id === trackId);
}
