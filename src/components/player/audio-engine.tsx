"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  peekCurrentTrack,
  peekNextTrack,
  peekPrevTrack,
  registerAudioElement,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";

/**
 * Hồ ba thẻ <audio>, là toàn bộ phần phát nhạc của ứng dụng.
 *
 * Component này BẮT BUỘC nằm trong layout, không phải trong page: App Router giữ
 * nguyên layout khi điều hướng, nên các thẻ không bao giờ bị unmount và nhạc chạy
 * liên tục lúc người dùng chuyển từ trang album sang trang nghệ sĩ.
 *
 * Vì sao ba thẻ: một bài lấy từ Google Drive mất ~3 giây mới ra byte đầu tiên và đó
 * là trần cứng của Drive. Giữ sẵn bài trước + bài hiện tại + bài kế thì cả next lẫn
 * prev đều tức thì. Bài vừa phát xong vẫn còn nguyên trong thẻ cũ, nên "giữ sẵn prev"
 * chỉ là không tái dùng thẻ đó — không tốn thêm byte nào.
 *
 * ── BẤT BIẾN ─────────────────────────────────────────────────────────────────
 * Tại mọi thời điểm, NHIỀU NHẤT MỘT thẻ ở trạng thái không tạm dừng, và đó luôn là
 * thẻ giữ bài hiện tại.
 *
 * Bản trước chia việc ghi DOM ra bốn effect rời rạc nên thứ tự chạy giữa chúng quyết
 * định kết quả — đúng định nghĩa lỗi đua, và hậu quả là hai bài phát chồng lên nhau.
 * Ở đây chỉ `reconcile()` được phép ghi vào DOM, và nó ép bất biến trên ở một chỗ.
 */

/** Nạp trước bài kế khi bài hiện tại đã qua ngần này. */
const PRELOAD_AT = 0.7;
const SLOT_COUNT = 3;

export function AudioEngine() {
  /** Ba phần tử, gán qua callback ref. */
  const els = useRef<(HTMLAudioElement | null)[]>([null, null, null]);
  /** Thẻ nào đang giữ bài nào. */
  const holds = useRef<(string | null)[]>([null, null, null]);
  /** Chỉ số thẻ đang phát. Cập nhật đồng bộ trong reconcile nên không bao giờ cũ. */
  const currentSlot = useRef(-1);

  const track = useCurrentTrack();
  const trackId = track?.id ?? null;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  const setSlotRef = (index: number) => (el: HTMLAudioElement | null) => {
    els.current[index] = el;
  };

  /** Chọn thẻ để tái dùng: không đụng vào thẻ đang giữ bài cần thiết. */
  const pickVictim = useCallback((keep: (string | null)[]) => {
    const keepSet = new Set(keep.filter((id): id is string => Boolean(id)));

    const empty = holds.current.findIndex((held) => held === null);
    if (empty !== -1) return empty;

    const spare = holds.current.findIndex((held) => !keepSet.has(held!));
    if (spare !== -1) return spare;

    // Không xảy ra với 3 thẻ (bộ cần giữ nhiều nhất là 2 khi bài hiện tại chưa nằm
    // trong hồ), nhưng vẫn cần một lối thoát xác định thay vì trả -1.
    return holds.current.findIndex((_, i) => i !== currentSlot.current);
  }, []);

  /**
   * Nguồn sự thật duy nhất ghi vào DOM. Chạy được nhiều lần liên tiếp mà không đổi
   * kết quả, nên gọi thừa vẫn an toàn.
   */
  const reconcile = useCallback(() => {
    const state = usePlayer.getState();
    const currentId = peekCurrentTrack()?.id ?? null;
    const nextId = peekNextTrack()?.id ?? null;
    const prevId = peekPrevTrack()?.id ?? null;

    const previousSlot = currentSlot.current;

    // 1. Tìm thẻ đang giữ bài hiện tại, chưa có thì cấp phát.
    let slot = currentId ? holds.current.indexOf(currentId) : -1;
    let freshlyLoaded = false;

    if (currentId && slot === -1) {
      slot = pickVictim([currentId, nextId, prevId]);
      const victim = els.current[slot];
      if (victim) {
        victim.src = `/api/stream/${currentId}`;
        victim.load();
        holds.current[slot] = currentId;
        freshlyLoaded = true;
      }
    }

    currentSlot.current = slot;

    // 2. Tạm dừng MỌI thẻ khác, vô điều kiện. Đây là chỗ ép bất biến — không phụ
    //    thuộc vào việc đường đi nào dẫn tới đây.
    els.current.forEach((el, i) => {
      if (el && i !== slot) el.pause();
    });

    const el = slot === -1 ? null : els.current[slot];
    if (!currentId || !el) {
      registerAudioElement(null);
      return;
    }

    registerAudioElement(el);

    // 3. Thẻ tái dùng có thể đang nằm ở cuối bài cũ. Không đưa về 0 thì `ended` bắn
    //    ngay khi phát, kéo theo handleEnded -> next, và prev bị bập bênh vô hạn.
    if (!freshlyLoaded && slot !== previousSlot) el.currentTime = 0;

    // 4. Phát hoặc dừng, có canh giữ cho promise resolve muộn.
    if (state.isPlaying) {
      el.play().then(
        () => {
          // Khi promise resolve, hỏi lại: thẻ này CÒN phải phát nữa không?
          //
          // Không so sánh "lệnh có cũ không" — reconcile hoàn toàn có thể chạy lại
          // cho chính thẻ này (isPlaying dao động theo sự kiện play/pause), và khi đó
          // lệnh cũ sẽ tự tạm dừng một thẻ đang đúng, kéo theo onPause -> isPlaying
          // false -> đứng im hẳn.
          const live = usePlayer.getState();
          const stillCurrent = els.current[currentSlot.current] === el;
          if (!stillCurrent || !live.isPlaying) el.pause();
        },
        (error: DOMException) => {
          // AbortError xảy ra khi đổi bài quá nhanh — vô hại.
          if (error.name === "AbortError") return;
          usePlayer
            .getState()
            .setError(
              error.name === "NotAllowedError"
                ? "Trình duyệt chặn tự phát. Bấm nút phát để bắt đầu."
                : "Không phát được bài này.",
            );
        },
      );
    } else {
      el.pause();
    }

    // 5. Trạng thái đệm theo readyState thật, để bài đã nạp sẵn không nháy hiệu ứng.
    usePlayer
      .getState()
      .setBuffering(el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA);
  }, [pickVictim]);

  // Effect DUY NHẤT điều khiển phát nhạc.
  useEffect(() => {
    reconcile();
  }, [trackId, isPlaying, reconcile]);

  useEffect(() => {
    return () => registerAudioElement(null);
  }, []);

  // Âm lượng áp cho cả ba thẻ, để thẻ đệm sẵn không phát to bất ngờ khi tới lượt.
  useEffect(() => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const el = els.current[i];
      if (!el) continue;
      el.volume = volume;
      el.muted = muted;
    }
  }, [volume, muted]);

  /** Gọi từ timeupdate: qua mốc PRELOAD_AT thì nạp sẵn bài kế vào thẻ rảnh. */
  const maybePreloadNext = useCallback(
    (currentTime: number, duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (currentTime / duration < PRELOAD_AT) return;

      const nextId = peekNextTrack()?.id ?? null;
      if (!nextId || holds.current.includes(nextId)) return;

      const currentId = peekCurrentTrack()?.id ?? null;
      const prevId = peekPrevTrack()?.id ?? null;
      const slot = pickVictim([currentId, nextId, prevId]);

      // Không bao giờ ghi đè lên thẻ đang phát. Bản trước giữ chỉ số thẻ rảnh trong
      // closure, nên một sự kiện timeupdate bắn ngay sau khi đổi thẻ sẽ ghi `src` đè
      // lên chính bài đang kêu.
      if (slot === currentSlot.current) return;

      const el = els.current[slot];
      if (!el || !el.paused) return;

      el.src = `/api/stream/${nextId}`;
      el.load();
      holds.current[slot] = nextId;
    },
    [pickVictim],
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
  const isCurrent = (el: HTMLAudioElement) => el === els.current[currentSlot.current];

  const audioProps = {
    preload: "auto" as const,
    onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (!isCurrent(el)) return;
      usePlayer.getState().syncTime(el.currentTime, el.duration);
      maybePreloadNext(el.currentTime, el.duration);
    },
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      const el = e.currentTarget;
      if (!isCurrent(el)) return;
      usePlayer.getState().syncTime(el.currentTime, el.duration);
    },
    onPlay: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().syncPlaying(true);
    },
    onPause: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().syncPlaying(false);
    },
    onEnded: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (!isCurrent(e.currentTarget)) return;
      usePlayer.getState().handleEnded();
      // Với repeat="one", handleEnded chỉ tua về 0 mà không đổi trackId hay isPlaying,
      // nên effect ở trên không chạy lại. Gọi thẳng để thẻ phát tiếp.
      reconcile();
    },
    onWaiting: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().setBuffering(true);
    },
    onStalled: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().setBuffering(true);
    },
    onCanPlay: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().setBuffering(false);
    },
    onPlaying: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (isCurrent(e.currentTarget)) usePlayer.getState().setBuffering(false);
    },
    onError: (e: React.SyntheticEvent<HTMLAudioElement>) => {
      if (!isCurrent(e.currentTarget)) return;
      usePlayer
        .getState()
        .setError(
          "Không tải được bài hát. Kết nối kho lưu trữ có thể cần cấp quyền lại.",
        );
    },
  };

  return (
    <>
      {Array.from({ length: SLOT_COUNT }, (_, i) => (
        <audio key={i} ref={setSlotRef(i)} {...audioProps} />
      ))}
    </>
  );
}
