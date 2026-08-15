/**
 * Khai báo cho IFrame Player API của YouTube (nạp động từ https://www.youtube.com/iframe_api).
 *
 * Chỉ khai những gì YouTubeEngine thật sự gọi — gói @types/youtube đầy đủ nhưng kéo
 * theo cả bộ API quảng cáo và playlist mà app không dùng.
 *
 * File ambient: không có import/export, nếu không TypeScript coi đây là module và
 * `window.YT` sẽ không được mở rộng.
 */

declare namespace YT {
  /** Dạng đối tượng là cách duy nhất truyền `startSeconds` (khôi phục chỗ đang nghe). */
  interface LoadVideoArgs {
    videoId: string;
    startSeconds?: number;
  }

  interface Player {
    loadVideoById(id: string | LoadVideoArgs): void;
    cueVideoById(id: string | LoadVideoArgs): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(v: number): void;
    mute(): void;
    unMute(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }

  interface PlayerEvent {
    target: Player;
    /** Mã trạng thái với onStateChange, mã lỗi với onError. */
    data: number;
  }

  interface PlayerOptions {
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: PlayerEvent) => void;
      onStateChange?: (e: PlayerEvent) => void;
      onError?: (e: PlayerEvent) => void;
    };
  }
}

interface Window {
  YT?: {
    Player: new (host: HTMLElement, options: YT.PlayerOptions) => YT.Player;
  };
  /** API gọi lại đúng một lần khi script đã sẵn sàng. */
  onYouTubeIframeAPIReady?: () => void;
}
