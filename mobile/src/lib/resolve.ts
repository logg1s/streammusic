import {
  createYoutubeResolver,
  parseYoutubeTrackId,
  type PlayableTrack,
  type ResolvedAudio,
  type YoutubeResolver,
} from "@vong/shared";
import { ORIGIN, authHeaderPairs } from "@/lib/api";
import type { VongAudioItem } from "../../modules/vong-audio";

/**
 * Cầu nối giữa một `PlayableTrack` và một item của hàng đợi native.
 *
 * URL audio của YouTube phải được xin NGAY TRÊN THIẾT BỊ: YouTube chặn IP của máy chủ
 * (đo 2026-08: `POST /youtubei/v1/player` từ Vercel trả `LOGIN_REQUIRED` 3/3 video),
 * chỉ IP dân dụng của người dùng mới nhận được `OK`. Vì vậy không có endpoint nào của
 * Vọng trả về URL googlevideo — máy tự đi lấy.
 */

/**
 * Một phiên khách InnerTube cho cả lần chạy app.
 *
 * `createYoutubeResolver` giữ `visitorData` xin từ `/sw.js_data` và chỉ xin lại khi
 * YouTube thu hồi. Tạo resolver mới cho mỗi bài là thêm một round-trip vào đúng quãng
 * người dùng đang chờ tiếng.
 */
let resolver: YoutubeResolver | null = null;

/** URL audio thật của một video, đã dùng lại phiên khách đang có. */
export function resolveYoutube(videoId: string): Promise<ResolvedAudio> {
  // `fetch` của React Native (OkHttp) không tự thêm `Origin` như WebView, nên gọi
  // thẳng InnerTube được — không cần lớp bọc nào như vỏ Tauri.
  resolver ??= createYoutubeResolver(fetch);
  return resolver.resolve(videoId);
}

/**
 * Dựng item cho `VongAudio.setQueue`.
 *
 * Truyền `audio` khi đã resolve sẵn ở chỗ khác để không đi mạng lần hai.
 *
 * KHÔNG khai `totalBytes` hay `mimeType`: native đọc chúng từ header của response.
 * Con số resolve được là của lần resolve đó, gửi xuống rồi URL cấp lại là sai lệch.
 */
export async function toNativeItem(
  track: PlayableTrack,
  audio?: ResolvedAudio,
): Promise<VongAudioItem> {
  if (track.source === "youtube") {
    const videoId = track.youtubeVideoId ?? parseYoutubeTrackId(track.id);
    if (!videoId) {
      throw new Error("Bài YouTube này thiếu mã video nên không phát được.");
    }
    const resolved = audio ?? (await resolveYoutube(videoId));
    return {
      id: track.id,
      url: resolved.url,
      // Rỗng có chủ ý: googlevideo là máy chủ của Google, gửi Bearer của Vọng sang đó
      // là đưa phiên đăng nhập cho bên thứ ba. Native tự cắm `Range` — thứ header duy
      // nhất mà request byte cần.
      headers: [],
      title: track.title,
      artist: track.artistName ?? resolved.channelTitle,
      album: track.albumName ?? undefined,
      artworkUrl: track.coverUrl ?? undefined,
      durationSec: track.durationSec ?? resolved.durationSec,
    };
  }

  return {
    id: track.id,
    url: `${ORIGIN}/api/stream/${track.id}`,
    // Bài thư viện đi qua máy chủ của Vọng nên BẮT BUỘC có Bearer: không có header này
    // `/api/stream/<id>` trả 401 và native chỉ thấy một bài im lặng.
    headers: await authHeaderPairs(),
    title: track.title,
    artist: track.artistName ?? "",
    album: track.albumName ?? undefined,
    artworkUrl: track.coverUrl ?? undefined,
    durationSec: track.durationSec ?? undefined,
  };
}
