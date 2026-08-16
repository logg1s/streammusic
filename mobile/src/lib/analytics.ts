import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  createAnalytics,
  createPlaybackAnalytics,
  type Analytics,
  type PlaybackAnalytics,
} from "@vong/shared";
import { ORIGIN } from "@/lib/api";

/**
 * Telemetry ẩn danh của vỏ Android.
 *
 * Dùng AsyncStorage chứ không phải SecureStore: `installId` là khoá đếm ẩn danh, không
 * phải bí mật — cất vào Keystore chỉ làm chậm khởi động mà không bảo vệ gì.
 *
 * Endpoint là URL tuyệt đối tới máy chủ web, và cố ý KHÔNG đi qua `apiFetch`: mọi thứ
 * qua đó đều kèm `Authorization: Bearer`, tức là gắn số liệu vào một danh tính — đúng
 * điều thiết kế này tránh. Sự kiện đi bằng fetch trần, không đăng nhập.
 */

let instance: Analytics | null = null;
let playback: PlaybackAnalytics | null = null;

export function getAnalytics(): Analytics {
  instance ??= createAnalytics({
    shell: "android",
    appVersion: Constants.expoConfig?.version ?? null,
    endpoint: `${ORIGIN}/api/events`,
    fetch: (url, init) => fetch(url, init),
    storage: {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    },
  });
  return instance;
}

/**
 * Bộ suy diễn sự kiện phát nhạc, dùng chung một thể hiện.
 *
 * Phải là singleton: nó giữ ảnh chụp trạng thái trước để so sánh, nên hai thể hiện song
 * song sẽ đếm mỗi lần đổi bài thành hai lần.
 */
export function getPlaybackAnalytics(): PlaybackAnalytics {
  playback ??= createPlaybackAnalytics({ analytics: getAnalytics() });
  return playback;
}
