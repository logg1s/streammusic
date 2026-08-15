"use client";

import { useEffect, useRef, useState } from "react";
import {
  peekCurrentTrack,
  registerSink,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";
import { reportBlocked } from "@/lib/radio-client";
import { cn } from "@/lib/utils";

/**
 * Engine phát bài YouTube: mọi bài YouTube đều ra tiếng ở đây.
 *
 * Dùng IFrame Player API chính thức: video phát trong một iframe nhìn thấy được,
 * đúng điều khoản của YouTube (không bóc luồng, không giấu player 1×1). Máy chủ
 * Vercel bị YouTube trả `LOGIN_REQUIRED` ở `/youtubei/v1/player` nên web không có
 * đường tải byte nào khác — cái giá phải trả là mất phát nền, và đó là lý do có
 * hai vỏ native (Windows/Android) trong repo này.
 *
 * Component này BẮT BUỘC nằm trong layout cùng AudioEngine. Iframe bị unmount hoặc
 * bị chuyển sang node cha khác là mất phiên phát, nên node DOM chứa player luôn được
 * render — lúc không có video chỉ thêm class `hidden`.
 *
 * ── BẤT BIẾN ─────────────────────────────────────────────────────────────────
 * Player được dựng NGAY khi mount, không chờ có bài YouTube. Chờ tới lúc bấm mới
 * dựng thì cú bấm đầu phải gánh cả tải `iframe_api` + dựng iframe + buffer (đo được
 * 1–3 giây). Không có bài YouTube nào đang phát thì iframe phải im; AudioEngine ép
 * phía kia: gặp bài YouTube nó tạm dừng cả hồ thẻ.
 */

/** YT không bắn timeupdate — muốn scrubber chạy thì phải tự hỏi getCurrentTime(). */
const POLL_MS = 400;
/** Sau playVideo() mà player vẫn chưa chạy trong ngần này thì coi như bị chặn tự phát. */
const AUTOPLAY_CHECK_MS = 1500;
/**
 * Quãng bỏ qua PAUSED/ENDED sau một lệnh nạp bài.
 *
 * Đo được: `loadVideoById` trên player đang phát bắn PAUSED trước UNSTARTED của bài
 * mới, và BUFFERING tới sau đó ~60 ms. 4 giây là dư cho cả mạng chậm mà vẫn ngắn hơn
 * mọi khoảng người dùng kịp bấm tạm dừng trong iframe.
 */
const LOAD_GATE_MS = 4000;

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

  /**
   * Id đang nằm trong player. Cần vì effect đổi bài chạy lại cả khi `ready` bật —
   * không có nó thì bài vừa nạp trong `onReady` bị nạp lần hai và mất chỗ đang nghe.
   */
  const loadedRef = useRef<string | null>(null);
  /**
   * Đang nạp bài mới, chưa nghe player báo PLAYING/CUED cho nó.
   *
   * BẮT BUỘC phải có: `loadVideoById` trên player đang phát bắn PAUSED (đo được:
   * `onStateChange` 2 ngay trước UNSTARTED của bài mới). Không chặn thì store tưởng
   * người dùng bấm tạm dừng → `isPlaying` false → effect dưới gọi `pauseVideo()` và
   * bài mới đứng im vĩnh viễn. ENDED của bài cũ cũng phải chặn, nếu không nó nhảy
   * thêm một bài.
   */
  const loadingRef = useRef(false);
  /** Lưới an toàn: nạp hỏng không bao giờ báo gì thì cũng phải mở lại cổng. */
  const loadGuardRef = useRef(0);

  /** Ghi nhận đã ra lệnh nạp: mọi PAUSED/ENDED trong quãng này là của bài cũ. */
  const beginLoad = (id: string) => {
    loadedRef.current = id;
    loadingRef.current = true;
    clearTimeout(loadGuardRef.current);
    loadGuardRef.current = window.setTimeout(() => {
      loadingRef.current = false;
    }, LOAD_GATE_MS);
  };

  /** Player đã thật sự nhận bài mới — mở lại cổng cho PAUSED/ENDED. */
  const endLoad = () => {
    loadingRef.current = false;
    clearTimeout(loadGuardRef.current);
  };

  // Dựng player một lần duy nhất, KHÔNG chờ có bài YouTube: cú bấm đầu tiên không
  // phải gánh tải `iframe_api` + dựng iframe nữa.
  useEffect(() => {
    let cancelled = false;

    void loadYoutubeApi().then(() => {
      const host = hostRef.current;
      if (cancelled || playerRef.current || !host || !window.YT?.Player) return;

      playerRef.current = new window.YT.Player(host, {
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
            // Sink của nguồn "youtube" đăng ký một lần cho cả phiên: store chỉ tra nó
            // khi bài hiện tại là bài YouTube, nên không đụng gì tới hồ <audio>.
            registerSink("youtube", {
              seek: (seconds) => playerRef.current?.seekTo(seconds, true),
            });
            const state = usePlayer.getState();
            e.target.setVolume(Math.round(state.volume * 100));
            if (state.muted) e.target.mute();
            else e.target.unMute();

            // Hàng đợi có thể đã có bài YouTube trước khi player dựng xong (khôi phục
            // sau khi tải lại trang, hoặc người dùng bấm trong lúc script còn tải).
            // Nạp ngay tại đây: effect đổi bài ở dưới thấy `loadedRef` khớp nên không
            // nạp lại.
            const current = peekCurrentTrack();
            const videoId =
              current?.source === "youtube" ? current.youtubeVideoId : null;
            if (videoId) {
              // Tiêu thụ luôn `pendingSeek`: để lại thì bài thư viện phát sau đó sẽ
              // bị tua tới vị trí của bài này.
              const pending = state.consumePendingSeek();
              const startSeconds =
                pending ?? (state.currentTime > 1 ? state.currentTime : 0);
              beginLoad(videoId);
              if (state.isPlaying)
                e.target.loadVideoById({ videoId, startSeconds });
              else e.target.cueVideoById({ videoId, startSeconds });
            }
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
                endLoad();
                player.setBuffering(false);
                player.syncPlaying(true);
                break;
              case YT_STATE.CUED:
                endLoad();
                break;
              case YT_STATE.PAUSED:
                // PAUSED của bài CŨ, bắn ra vì `loadVideoById` vừa dỡ nó. Nghe theo là
                // tắt luôn ý định phát của bài mới.
                if (loadingRef.current) break;
                player.syncPlaying(false);
                break;
              case YT_STATE.ENDED:
                if (loadingRef.current) break;
                player.handleEnded();
                break;
              default:
                break;
            }
          },
          onError: () => {
            endLoad();
            // 2/5/100/101/150: id hỏng, video bị gỡ, hoặc chủ kênh chặn nhúng. Ghi lại
            // để lô sau không gặp lại nữa rồi đi tiếp — KHÔNG gọi setError, vì nó tắt
            // isPlaying và radio sẽ đứng im giữa chừng.
            const current = peekCurrentTrack();
            if (current?.source !== "youtube" || !current.youtubeVideoId)
              return;
            reportBlocked(current.youtubeVideoId, current.artistName);
            usePlayer.getState().next();
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Đổi bài. Chỉ ra lệnh, không bao giờ destroy player — iframe mất là mất phiên phát.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;

    if (!videoId) {
      // Sang bài thư viện: nhả tiếng cho hồ <audio>.
      if (loadedRef.current !== null) player.pauseVideo();
      return;
    }

    if (loadedRef.current === videoId) return;
    beginLoad(videoId);
    // cueVideoById nạp mà không phát, nên đổi bài lúc đang tạm dừng không tự bật tiếng.
    if (usePlayer.getState().isPlaying) player.loadVideoById(videoId);
    else player.cueVideoById(videoId);
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
      clearTimeout(loadGuardRef.current);
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
