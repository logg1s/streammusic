"use client";

import { createJSONStorage } from "zustand/middleware";
import { createPlayerStore, type PersistedPlayerState } from "@vong/shared";

/**
 * Bản dựng cho web của store phát nhạc.
 *
 * Hành vi nằm hết trong `@vong/shared` để vỏ Expo và Tauri dùng lại y nguyên; ở đây
 * chỉ cắm storage của trình duyệt. Truyền tường minh chứ không dựa vào mặc định của
 * `persist` (`window.localStorage`) để hai bên đọc code thấy cùng một hình dạng.
 */
const store = createPlayerStore({
  storage: createJSONStorage<PersistedPlayerState>(() => localStorage),
});

export const {
  usePlayer,
  registerSink,
  useCurrentTrack,
  peekCurrentTrack,
  peekNextTrack,
  peekPrevTrack,
  peekNeighbourIds,
  useIsCurrentTrack,
} = store;

export { store as playerStore };
export type {
  PlaybackSink,
  PlayerState,
  RadioState,
  RepeatMode,
} from "@vong/shared";
