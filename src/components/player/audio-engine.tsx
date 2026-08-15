"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  peekCurrentTrack,
  peekNeighbourIds,
  registerAudioElement,
  useCurrentTrack,
  usePlayer,
} from "@/store/player";

/**
 * Hồ thẻ <audio>, là toàn bộ phần phát nhạc của ứng dụng.
 *
 * Component này BẮT BUỘC nằm trong layout, không phải trong page: App Router giữ
 * nguyên layout khi điều hướng, nên các thẻ không bao giờ bị unmount và nhạc chạy
 * liên tục lúc người dùng chuyển từ trang album sang trang nghệ sĩ.
 *
 * Vì sao nhiều thẻ: một bài lấy từ Google Drive mất ~3 giây mới ra byte đầu tiên và đó`n * là trần cứng của Drive. Giữ sẵn ±2 bài quanh bài đang nghe thì next lẫn prev đều`n * gần như tức thì. Bài vừa phát xong vẫn còn nguyên trong thẻ cũ, nên "giữ sẵn prev"`n * chỉ là không tái dùng thẻ đó — không tốn thêm byte nào.
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

/**
 * Năm thẻ: đủ giữ bài hiện tại cùng ±2 bài quanh nó, nên bấm next/prev liên tục
 * theo thứ tự thì hầu như lúc nào cũng gặp bài đã nằm sẵn trong hồ.
 *
 * Không nâng cao hơn nữa vì thư viện này toàn FLAC, trung bình 19 MB/bài — mỗi thẻ
 * ôm sẵn vài MB đệm, bảy thẻ trở lên là nặng bộ nhớ trên điện thoại mà đổi lại
 * chẳng được bao nhiêu.
 */
const SLOT_COUNT = 5;
/** Bán kính bộ cần giữ: hiện tại, ±1, ±2. */
const KEEP_RADIUS = 2;

/**
 * Lịch nạp sẵn sau khi đổi bài, tính bằng ms.
 *
 * Mốc đầu hoãn một chút để bấm next liên tục không sinh một loạt lượt tải cho những
 * bài chỉ lướt qua. Mốc sau nạp thêm bài thứ hai phía trước: Drive mất ~2,3 giây mới
 * ra byte đầu, nên chỉ giữ sẵn một bài là không đủ khi người dùng bấm next đều đặn.
 *
 * Nghe tuần tự thì bài thứ hai không hề phí — trước sau gì cũng tới lượt nó.
 */
const PREFETCH_SCHEDULE_MS = [400, 3500];
/** Nạp sẵn tối đa ngần này bài phía trước. */
const PREFETCH_AHEAD = 2;

export function AudioEngine() {
  /** Các phần tử trong hồ, gán qua callback ref. */
  const els = useRef<(HTMLAudioElement | null)[]>(
    Array.from({ length: SLOT_COUNT }, () => null),
  );
  /** Thẻ nào đang giữ bài nào. */
  const holds = useRef<(string | null)[]>(
    Array.from({ length: SLOT_COUNT }, () => null),
  );
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

  /**
   * Chọn thẻ để tái dùng. `keep` xếp theo thứ tự ưu tiên, nên khi buộc phải hi sinh
   * một thẻ đang giữ bài cần thiết thì bỏ bài xa nhất trước.
   */
  const pickVictim = useCallback((keep: string[]) => {
    const empty = holds.current.findIndex((held) => held === null);
    if (empty !== -1) return empty;

    const keepSet = new Set(keep);
    const spare = holds.current.findIndex((held) => !keepSet.has(held!));
    if (spare !== -1) return spare;

    // Cả hồ đều đang giữ bài cần thiết: bỏ bài có ưu tiên thấp nhất, nhưng tuyệt
    // đối không đụng vào thẻ đang phát.
    let victim = -1;
    let worst = -1;
    holds.current.forEach((held, i) => {
      if (i === currentSlot.current) return;
      const rank = keep.indexOf(held!);
      if (rank > worst) {
        worst = rank;
        victim = i;
      }
    });
    return victim;
  }, []);

  /**
   * Nguồn sự thật duy nhất ghi vào DOM. Chạy được nhiều lần liên tiếp mà không đổi
   * kết quả, nên gọi thừa vẫn an toàn.
   */
  const reconcile = useCallback(() => {
    const state = usePlayer.getState();
    const currentId = peekCurrentTrack()?.id ?? null;
    const keep = peekNeighbourIds(KEEP_RADIUS);

    const previousSlot = currentSlot.current;

    // 1. Tìm thẻ đang giữ bài hiện tại, chưa có thì cấp phát.
    let slot = currentId ? holds.current.indexOf(currentId) : -1;
    let freshlyLoaded = false;

    if (currentId && slot === -1) {
      slot = pickVictim(keep);
      const victim = slot === -1 ? null : els.current[slot];
      if (victim) {
        // Khi vừa khôi phục sau khi tải lại trang, người dùng chưa bấm gì và ta sắp
        // tua tới giữa bài. Kéo sẵn 6MB từ đầu file lúc đó là phí — chỉ lấy metadata,
        // phần dữ liệu thật sẽ tải từ đúng vị trí tua.
        victim.preload = state.pendingSeek !== null ? "metadata" : "auto";
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

  /**
   * Nạp sẵn bài phía trước gần nhất mà chưa có trong hồ.
   * Mỗi lần gọi chỉ nạp MỘT bài, để không mở nhiều kết nối tới Drive cùng lúc.
   */
  const prefetchAhead = useCallback(() => {
    const { queue, order, position, repeat } = usePlayer.getState();
    if (order.length === 0) return;

    for (let d = 1; d <= PREFETCH_AHEAD; d++) {
      let p = position + d;
      if (repeat === "all") p = p % order.length;
      else if (p >= order.length) break;

      const id = queue[order[p]]?.id;
      if (!id || holds.current.includes(id)) continue;

      const slot = pickVictim(peekNeighbourIds(KEEP_RADIUS));
      if (slot === -1 || slot === currentSlot.current) return;

      const el = els.current[slot];
      if (!el || !el.paused) return;

      el.preload = "auto";
      el.src = `/api/stream/${id}`;
      el.load();
      holds.current[slot] = id;
      return;
    }
  }, [pickVictim]);

  // Effect DUY NHẤT điều khiển phát nhạc.
  useEffect(() => {
    reconcile();
  }, [trackId, isPlaying, reconcile]);

  // Sau khi đổi bài, nạp sẵn dần các bài phía trước theo lịch. Đổi bài lần nữa thì
  // huỷ lịch cũ, nên bấm next liên tục không kéo về một loạt bài chỉ lướt qua.
  useEffect(() => {
    if (!trackId) return;
    const timers = PREFETCH_SCHEDULE_MS.map((delay) =>
      setTimeout(prefetchAhead, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [trackId, prefetchAhead]);

  useEffect(() => {
    return () => registerAudioElement(null);
  }, []);

  // Âm lượng áp cho cả hồ, để thẻ đệm sẵn không phát to bất ngờ khi tới lượt.
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
      prefetchAhead();
    },
    [prefetchAhead],
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

      // Khôi phục sau khi tải lại trang: chỉ tua được khi đã có metadata, đặt
      // currentTime sớm hơn thì trình duyệt bỏ qua.
      const resume = usePlayer.getState().consumePendingSeek();
      if (resume !== null && Number.isFinite(el.duration)) {
        el.currentTime = Math.min(resume, Math.max(0, el.duration - 1));
      }

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
