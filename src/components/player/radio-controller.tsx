"use client";

import { useEffect, useRef } from "react";
import { REFILL_THRESHOLD, autoplaySeed } from "@vong/shared";
import type { PlayableTrack, PlayedTrack } from "@vong/shared";
import { refillRadio, reportPlayed, startRadioFor } from "@/lib/radio-client";
import { usePlayer, type PlayerState } from "@/store/player";

/**
 * Bộ não của "playlist linh hoạt": theo dõi hàng đợi, nạp thêm bài trước khi hết,
 * và báo về server bài nào bị bỏ qua sớm.
 *
 * Không render gì. Đặt trong layout để sống suốt phiên, giống KeyboardShortcuts —
 * hàng đợi phải tự dài ra kể cả khi người dùng đang ở trang khác.
 *
 * Ngưỡng nạp thêm và cách tính "nghe hết" nằm ở `@vong/shared`: app mobile chạy đúng
 * logic này, lệch nhau là lịch sử nghe của cùng một người trôi khác nhau theo thiết bị.
 */

function snapshot(track: PlayableTrack): PlayedTrack {
  return {
    id: track.id,
    source: track.source,
    videoId: track.youtubeVideoId,
    artistName: track.artistName,
    durationSec: track.durationSec,
    time: 0,
  };
}

export function RadioController() {
  /** Chặn hai request chồng nhau: store phát state nhiều lần trong lúc chờ mạng. */
  const refillingRef = useRef(false);
  /** Chặn nhiều lần tự-khởi-động radio trong lúc lô đầu đang về. */
  const startingRef = useRef(false);
  const lastRef = useRef<PlayedTrack | null>(null);

  useEffect(() => {
    const refill = async (seedId: string, exclude: string[]) => {
      refillingRef.current = true;
      try {
        await refillRadio(seedId, exclude);
      } finally {
        refillingRef.current = false;
      }
    };

    const handle = (state: PlayerState) => {
      const track = state.queue[state.order[state.position]] ?? null;

      const last = lastRef.current;
      if (last?.id !== track?.id) {
        if (last) reportPlayed(last);
        lastRef.current = track ? snapshot(track) : null;
      } else if (last) {
        last.time = state.currentTime;
      }

      const { radio, order, position, queue } = state;
      if (
        radio &&
        !radio.exhausted &&
        radio.status !== "loading" &&
        !refillingRef.current &&
        order.length - 1 - position <= REFILL_THRESHOLD
      ) {
        void refill(
          radio.seedId,
          queue.map((t) => t.id),
        );
      }

      // Autoplay: hàng đợi thường sắp hết → biến nó thành radio để nghe không đứt.
      // `startRadioFor(seed)` giữ nguyên bài đang phát (seed CHÍNH là nó) rồi nối lô đầu;
      // từ đó nhánh refill ở trên tự lo phần còn lại.
      if (!startingRef.current && !refillingRef.current) {
        const seed = autoplaySeed(state);
        if (seed) {
          startingRef.current = true;
          void startRadioFor(seed).finally(() => {
            startingRef.current = false;
          });
        }
      }
    };

    handle(usePlayer.getState());
    return usePlayer.subscribe(handle);
  }, []);

  return null;
}
