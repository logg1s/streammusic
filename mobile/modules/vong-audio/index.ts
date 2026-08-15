/**
 * `vong-audio` — phát nhạc nền bằng `androidx.media3`, cầu nối JS ↔ native.
 *
 * Vì sao tự viết thay vì dùng thư viện có sẵn: cần đúng ba thứ mà không thư viện nào cho
 * cùng lúc — (1) ép `Range: bytes=<pos>-` lên MỌI request (thiếu header đó googlevideo
 * bóp băng thông còn ~32 KiB/s), (2) hàng đợi thật của `MediaSession` để Next/Previous
 * hiện trên màn hình khoá, (3) header `Authorization: Bearer` riêng cho từng bài.
 *
 * Hàng đợi native chỉ giữ bài hiện tại + bài kế. `trackChanged` là lúc JS resolve URL bài
 * kế rồi gọi `setQueue` lại: URL của googlevideo hết hạn sau ~6 giờ nên nạp sẵn cả hàng
 * đợi là tự tay tạo ra bài chết.
 */
import { NativeModule, requireNativeModule } from "expo";

/** Một bài trong hàng đợi native. */
export interface VongAudioItem {
  /** Id của app, gửi lại nguyên văn trong event để JS biết bài nào. */
  id: string;
  url: string;
  /** Cặp `[tên, giá trị]` — native gắn nguyên văn vào request. */
  headers: [string, string][];
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  /** Thời lượng theo metadata, dùng cho thanh thời gian trước khi player đọc xong moov. */
  durationSec?: number;
}

export interface VongAudioState {
  index: number;
  positionSec: number;
  durationSec: number;
  playing: boolean;
  buffering: boolean;
}

export type VongAudioEvents = {
  /** Nhịp trạng thái, ~400 ms một lần khi đang phát. */
  state: (state: VongAudioState) => void;
  /** Hết bài cuối trong hàng đợi native. */
  ended: () => void;
  /** Player nhảy sang item khác (tự hết bài, hoặc người dùng bấm Next trên khoá máy). */
  trackChanged: (event: { index: number; id: string }) => void;
};

declare class VongAudioModuleType extends NativeModule<VongAudioEvents> {
  /**
   * Thay toàn bộ hàng đợi. `startIndex`/`positionSec` để khôi phục đúng chỗ đang nghe —
   * gọi lại với cùng item hiện tại thì native giữ nguyên tiếng, chỉ đổi phần đuôi.
   */
  setQueue(options: {
    items: VongAudioItem[];
    startIndex: number;
    positionSec: number;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSec: number): Promise<void>;
  skipNext(): Promise<void>;
  skipPrev(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  /** Trạng thái tức thời, dùng khi app quay lại foreground và cần đồng bộ ngay. */
  getState(): Promise<VongAudioState>;
}

export const VongAudio = requireNativeModule<VongAudioModuleType>("VongAudio");
