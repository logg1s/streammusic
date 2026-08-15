"use client";

import { useEffect, useRef, useState } from "react";
import {
  peekCurrentTrack,
  registerSink,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";
import { cn } from "@/lib/utils";

/**
 * Engine phát bài YouTube, song song với hồ <audio> của AudioEngine.
 *
 * Dùng IFrame Player API chính thức: video phát trong một iframe nhìn thấy được,
 * đúng điều khoản của YouTube (không bóc luồng, không giấu player 1×1).
 *
 * Component này BẮT BUỘC nằm trong layout cùng AudioEngine. Iframe bị unmount hoặc
 * bị chuyển sang node cha khác là mất phiên phát, nên node DOM chứa player luôn được
 * render — lúc không có video chỉ thêm class `hidden`.
 *
 * ── BẤT BIẾN ─────────────────────────────────────────────────────────────────
 * Không có bài YouTube nào đang phát thì iframe phải im. AudioEngine ép phía kia:
 * gặp bài YouTube nó tạm dừng cả hồ thẻ. Hai chiều cộng lại giữ đúng một nguồn tiếng.
 */

/** YT không bắn timeupdate — muốn scrubber chạy thì phải tự hỏi getCurrentTime(). */
const POLL_MS = 400;
/** Sau playVideo() mà player vẫn chưa chạy trong ngần này thì coi như bị chặn tự phát. */
const AUTOPLAY_CHECK_MS = 1500;

const YT_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/** Script chỉ nạp một lần cho cả phiên, kể cả khi effect chạy lại. */
let apiPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise<void>((resolve) => {
    // Script báo sẵn sàng bằng đúng hàm toàn cục này, không có sự kiện nào thay được.
    window.onYouTubeIframeAPIReady = () => resolve();
    const script = document.createElement("script");
    script.src = IFRAME_API_SRC;
    document.head.append(script);
  });
  return apiPromise;
}

export function YouTubeEngine() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  /**
   * Player chỉ nhận lệnh sau onReady. Là state chứ không phải ref để các effect điều
   * khiển chạy lại đúng lúc player sẵn sàng — nếu không, bài đầu tiên đứng im.
   */
  const [ready, setReady] = useState(false);

  const track = useCurrentTrack();
  const videoId = track?.source === "youtube" ? track.youtubeVideoId : null;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  useEffect(() => {
    if (!videoId) {
      if (ready) playerRef.current?.pauseVideo();
      registerSink("youtube", null);
      return;
    }

    if (playerRef.current) {
      // Chưa ready thì thôi: effect này chạy lại ngay khi `ready` bật, lúc đó
      // `videoId` mới nhất sẽ được nạp.
      if (!ready) return;
      // cueVideoById nạp mà không phát, nên đổi bài lúc đang tạm dừng không tự bật tiếng.
      if (usePlayer.getState().isPlaying)
        playerRef.current.loadVideoById(videoId);
      else playerRef.current.cueVideoById(videoId);
      return;
    }

    let cancelled = false;

    void loadYoutubeApi().then(() => {
      const host = hostRef.current;
      if (cancelled || playerRef.current || !host || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(host, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          // Phím tắt của app (space, mũi tên) không được để iframe nuốt mất.
          disablekb: 1,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            registerSink("youtube", {
              seek: (seconds) => playerRef.current?.seekTo(seconds, true),
            });
            const state = usePlayer.getState();
            e.target.setVolume(Math.round(state.volume * 100));
            if (state.muted) e.target.mute();
            else e.target.unMute();
            // Engine này chỉ mount khi proxy audio đã hỏng giữa bài — vào đúng chỗ
            // đang nghe thay vì phát lại từ đầu.
            if (state.currentTime > 1) e.target.seekTo(state.currentTime, true);
            setReady(true);
          },
          onStateChange: (e) => {
            // Đổi sang bài thư viện là engine này gọi pauseVideo(), và iframe bắn
            // PAUSED ngay sau đó. Không chặn ở đây thì tiếng vừa bật của hồ <audio>
            // bị store tắt oan — tương tự ENDED sẽ nhảy bài của engine kia.
            if (peekCurrentTrack()?.source !== "youtube") return;
            const player = usePlayer.getState();
            switch (e.data) {
              case YT_STATE.BUFFERING:
                player.setBuffering(true);
                break;
              case YT_STATE.PLAYING:
                player.setBuffering(false);
                player.syncPlaying(true);
                break;
              case YT_STATE.PAUSED:
                player.syncPlaying(false);
                break;
              case YT_STATE.ENDED:
                player.handleEnded();
                break;
              default:
                break;
            }
          },
          onError: () => {
            // 2/5/100/101/150: id hỏng, video bị gỡ, hoặc chủ kênh chặn nhúng. Ghi lại
            // để lô sau không gặp lại nữa rồi đi tiếp — KHÔNG gọi setError, vì nó tắt
            // isPlaying và radio sẽ đứng im giữa chừng.
            const current = peekCurrentTrack();
            if (current?.source !== "youtube" || !current.youtubeVideoId)
              return;
            void fetch("/api/radio/feedback", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                videoId: current.youtubeVideoId,
                artistName: current.artistName,
                signal: "block",
              }),
            }).catch(() => {});
            usePlayer.getState().next();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [videoId, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !videoId) return;

    if (!isPlaying) {
      player.pauseVideo();
      return;
    }

    player.playVideo();
    // Trình duyệt chặn tự phát thì playVideo() im lặng không làm gì; chỉ có cách hỏi
    // lại trạng thái một lúc sau mới biết.
    const timer = setTimeout(() => {
      const live = usePlayer.getState();
      if (!live.isPlaying) return;
      const state = playerRef.current?.getPlayerState();
      if (
        state === YT_STATE.UNSTARTED ||
        state === YT_STATE.CUED ||
        state === YT_STATE.PAUSED
      ) {
        live.setError("Trình duyệt chặn tự phát. Bấm nút phát để bắt đầu.");
      }
    }, AUTOPLAY_CHECK_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, videoId, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    player.setVolume(Math.round(volume * 100));
    if (muted) player.mute();
    else player.unMute();
  }, [volume, muted, ready]);

  useEffect(() => {
    if (!ready || !videoId || !isPlaying) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      usePlayer
        .getState()
        .syncTime(player.getCurrentTime(), player.getDuration());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [ready, videoId, isPlaying]);

  useEffect(() => {
    return () => {
      registerSink("youtube", null);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed right-3 z-30 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-xl",
        "bottom-[8.5rem] md:bottom-[5.75rem] md:right-4",
        !videoId && "hidden",
      )}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="eyebrow">YouTube</span>
        {videoId && (
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-accent-text"
          >
            Mở
          </a>
        )}
      </div>
      <div className="aspect-video w-full">
        <div ref={hostRef} className="size-full" />
      </div>
    </div>
  );
}
