import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage } from "zustand/middleware";
import { createPlayerStore, type PersistedPlayerState } from "@vong/shared";

/**
 * Bản dựng cho Expo của store phát nhạc.
 *
 * Hành vi nằm hết trong `@vong/shared` để web, Tauri và app này không lệch nhau; ở đây
 * chỉ cắm storage. Truyền storage là BẮT BUỘC chứ không phải cho đẹp: mặc định của
 * `persist` là `window.localStorage`, thứ không tồn tại trong React Native — bỏ trống
 * thì hàng đợi biến mất mỗi lần tắt app.
 */
const store = createPlayerStore({
  storage: createJSONStorage<PersistedPlayerState>(() => AsyncStorage),
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
