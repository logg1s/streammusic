/**
 * Hình dạng dữ liệu ba vỏ (web Next.js, Tauri Windows, Expo Android) đều nói.
 *
 * TS THUẦN: file này và cả package không được import gì của Node hay DOM — Metro của
 * Expo và `rustc` không có `pg`, `next`, `drizzle-orm`. Vì vậy `StorageProviderId`
 * khai lại thành union thay vì suy từ `pgEnum` của `src/db/schema.ts`; hai chỗ lệch
 * nhau thì `src/lib/library.ts` không compile (nó gán giá trị enum vào type này).
 */

/**
 * Cửa sổ hẹp nhất của `fetch` mà package này cần.
 *
 * Khai riêng thay vì dùng `typeof fetch` để tsconfig của shared không phải nạp lib
 * `DOM` — nạp vào là hôm sau có người gọi `document` trong đây. `fetch` thật của cả
 * ba runtime đều gán được vào type này.
 */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    keepalive?: boolean;
  },
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Bài phát ra từ đâu: file trong kho đám mây, hay video YouTube. */
export type TrackSource = "library" | "youtube";

/** Phải khớp `storageProviderEnum` trong `src/db/schema.ts`. */
export type StorageProviderId = "google_drive" | "dropbox" | "onedrive";

export type RepeatMode = "off" | "all" | "one";

/** Hình dạng tối thiểu mà player cần — dùng chung giữa server, web và vỏ native. */
export interface PlayableTrack {
  /** Thư viện: uuid. YouTube: "yt:<videoId>" — id phải duy nhất vì hồ <audio> và panel hàng đợi khoá theo nó. */
  id: string;
  source: TrackSource;
  youtubeVideoId: string | null;
  title: string;
  artistId: string | null;
  artistName: string | null;
  albumId: string | null;
  albumName: string | null;
  coverUrl: string | null;
  durationSec: number | null;
  trackNo: number | null;
  discNo: number | null;
  /* Ba trường dưới đây nuôi dải thông số ở thanh phát:
     cho thấy byte đang chảy về từ đâu và ở chất lượng nào. */
  provider: StorageProviderId | null;
  codec: string | null;
  bitrate: number | null;
}

export interface AlbumSummary {
  id: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  artistId: string | null;
  artistName: string | null;
  trackCount: number;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  /** Có giá trị khi playlist được tạo từ một phiên radio. */
  seedLabel: string | null;
  createdAt: Date;
  itemCount: number;
}

export interface RadioState {
  seedId: string;
  /** Hiện ở panel hàng đợi, ví dụ "Radio · Chúng Ta Của Hiện Tại". */
  seedLabel: string;
  status: "idle" | "loading" | "error";
  /** Hết bài gợi ý (hoặc lỗi không hồi phục) → RadioController thôi gọi API. */
  exhausted: boolean;
  /**
   * Lý do lỗi để panel hàng đợi hiện nguyên văn (hết quota, thiếu API key…).
   *
   * Nằm ở đây chứ không đi qua `setError`: lỗi gợi ý không phải lỗi phát nhạc, mà
   * `setError` lại tắt `isPlaying` — bài đang phát sẽ đứt oan.
   */
  message: string | null;
}
