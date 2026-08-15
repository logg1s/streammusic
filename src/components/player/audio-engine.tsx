"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  peekNextTrack,
  registerAudioElement,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";

/**
 * Hai thẻ <audio> luân phiên, là toàn bộ phần phát nhạc của ứng dụng.
 *
 * Component này BẮT BUỘC nằm trong layout, không phải trong page: App Router giữ
 * nguyên layout khi điều hướng, nên thẻ <audio> không bao giờ bị unmount và nhạc
 * chạy liên tục lúc người dùng chuyển từ trang album sang trang nghệ sĩ.
 *
 * Vì sao hai thẻ chứ không phải một: một bài lấy từ Google Drive mất ~2,8 giây mới
 * ra byte đầu tiên, và đó là trần cứng của Drive, không tối ưu code nào bỏ được.
 * Cách duy nhất để chuyển bài không bị khựng là nạp sẵn bài kế vào thẻ thứ hai
 * trong lúc bài hiện tại còn đang chạy, rồi đổi vai trò khi hết bài.
 */

/** Nạp trước bài kế khi bài hiện tại đã qua ngần này — đủ sớm để kịp đệm. */
const PRELOAD_AT = 0.7;

type Slot = 0 | 1;

export function AudioEngine() {
  const slotA = useRef<HTMLAudioElement>(null);
  const slotB = useRef<HTMLAudioElement>(null);

  /** Thẻ nào đang phát. Thẻ còn lại dùng để đệm sẵn bài kế. */
  const [active, setActive] = useState<Slot>(0);
  /** Bài nào đang nằm trong từng thẻ, để biết có thể đổi vai trò hay phải nạp mới. */
  const loaded = useRef<[string | null, string | null]>([null, null]);

  const track = useCurrentTrack();
  const trackId = track?.id ?? null;

  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  const idle: Slot = active === 0 ? 1 : 0;

  const elementAt = useCallback(
    (slot: Slot) => (slot === 0 ? slotA.current : slotB.current),
    [],
  );

  // Store chỉ được điều khiển thẻ đang phát.
  useEffect(() => {
    registerAudioElement(elementAt(active));
    return () => registerAudioElement(null);
  }, [active, elementAt]);

  // Đổi bài: đổi vai trò nếu bài đó đã đệm sẵn, không thì nạp vào thẻ đang phát.
  useEffect(() => {
    const activeEl = elementAt(active);
    if (!activeEl) return;

    if (!trackId) {
      activeEl.removeAttribute("src");
      activeEl.load();
      loaded.current[active] = null;
      return;
    }

    // Đây là trường hợp đáng giá: bài kế đã đệm xong ở thẻ kia → chỉ việc đổi vai trò.
    if (loaded.current[idle] === trackId && elementAt(idle)) {
      activeEl.pause();
      setActive(idle);
      return;
    }

    if (loaded.current[active] !== trackId) {
      activeEl.src = `/api/stream/${trackId}`;
      activeEl.load();
      loaded.current[active] = trackId;
    }

    // Đặt trạng thái đệm theo readyState thật thay vì đoán. Nhờ vậy bài đã đệm sẵn
    // ở thẻ kia (chuyển bài chỉ mất ~136ms) không bị nháy hiệu ứng tải, còn bài nạp
    // mới thì hiện ngay từ lúc bấm.
    usePlayer
      .getState()
      .setBuffering(activeEl.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
  }, [trackId, active, idle, elementAt]);

  // Đồng bộ trạng thái phát. Phụ thuộc cả trackId để bài mới tự chạy tiếp.
  useEffect(() => {
    const el = elementAt(active);
    if (!el || !trackId) return;

    if (isPlaying) {
      el.play().catch((error: DOMException) => {
        // AbortError xảy ra khi đổi bài quá nhanh — vô hại, bỏ qua.
        if (error.name === "AbortError") return;
        usePlayer
          .getState()
          .setError(
            error.name === "NotAllowedError"
              ? "Trình duyệt chặn tự phát. Bấm nút phát để bắt đầu."
              : "Không phát được bài này.",
          );
      });
    } else {
      el.pause();
    }
  }, [isPlaying, trackId, active, elementAt]);

  // Âm lượng áp cho CẢ HAI thẻ, để thẻ đệm sẵn không phát to bất ngờ khi tới lượt.
  useEffect(() => {
    for (const el of [slotA.current, slotB.current]) {
      if (el) {
        el.volume = volume;
        el.muted = muted;
      }
    }
  }, [volume, muted]);

  /** Gọi từ timeupdate: qua mốc PRELOAD_AT thì nạp sẵn bài kế vào thẻ rảnh. */
  const maybePreloadNext = useCallback(
    (currentTime: number, duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (currentTime / duration < PRELOAD_AT) return;

      const next = peekNextTrack();
      if (!next || loaded.current[idle] === next.id) return;

      const idleEl = elementAt(idle);
      if (!idleEl) return;

      idleEl.src = `/api/stream/${next.id}`;
      idleEl.load();
      loaded.current[idle] = next.id;
    },
    [idle, elementAt],
  );

  // Media Session: phím media trên bàn phím, tai nghe, và màn hình khoá điện thoại.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artistName ?? "Không rõ nghệ sĩ",
      album: track.albumName ?? "",
      artwork: track.coverUrl
        ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => usePlayer.getState().play()],
      ["pause", () => usePlayer.getState().pause()],
      ["previoustrack", () => usePlayer.getState().previous()],
      ["nexttrack", () => usePlayer.getState().next()],
      [
        "seekto",
        (details) => {
          if (details.seekTime != null) usePlayer.getState().seek(details.seekTime);
        },
      ],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Trình duyệt không hỗ trợ action này — không sao.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [track]);

  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  /** Chỉ thẻ đang phát mới được cập nhật store — thẻ đệm phải im lặng. */
  const audioProps = (slot: Slot) => ({
    preload: "auto" as const,
    onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (slot !== active) return;
      const el = e.currentTarget;
      usePlayer.getState().syncTime(el.currentTime, el.duration);
      maybePreloadNext(el.currentTime, el.duration);
    },
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (slot !== active) return;
      usePlayer
        .getState()
        .syncTime(e.currentTarget.currentTime, e.currentTarget.duration);
    },
    onPlay: () => {
      if (slot === active) usePlayer.getState().syncPlaying(true);
    },
    onPause: () => {
      if (slot === active) usePlayer.getState().syncPlaying(false);
    },
    onEnded: () => {
      if (slot === active) usePlayer.getState().handleEnded();
    },

    /* Vòng đời đệm. `waiting` là lúc trình duyệt hết dữ liệu để phát tiếp (tua vào
       vùng chưa tải, hoặc mạng chậm), `stalled` là lúc không nhận được byte nào. */
    onWaiting: () => {
      if (slot === active) usePlayer.getState().setBuffering(true);
    },
    onStalled: () => {
      if (slot === active) usePlayer.getState().setBuffering(true);
    },
    onCanPlay: () => {
      if (slot === active) usePlayer.getState().setBuffering(false);
    },
    onPlaying: () => {
      if (slot === active) usePlayer.getState().setBuffering(false);
    },
    onError: () => {
      if (slot !== active) return;
      usePlayer
        .getState()
        .setError(
          "Không tải được bài hát. Kết nối kho lưu trữ có thể cần cấp quyền lại.",
        );
    },
  });

  return (
    <>
      <audio ref={slotA} {...audioProps(0)} />
      <audio ref={slotB} {...audioProps(1)} />
    </>
  );
}
