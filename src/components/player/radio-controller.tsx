"use client";

import { useEffect, useRef } from "react";
import type { PlayableTrack, TrackSource } from "@/lib/library";
import { usePlayer, type PlayerState } from "@/store/player";

/**
 * Bộ não của "playlist linh hoạt": theo dõi hàng đợi, nạp thêm bài trước khi hết,
 * và báo về server bài nào bị bỏ qua sớm.
 *
 * Không render gì. Đặt trong layout để sống suốt phiên, giống KeyboardShortcuts —
 * hàng đợi phải tự dài ra kể cả khi người dùng đang ở trang khác.
 */

/** Còn ngần này bài phía sau thì đi xin lô tiếp theo. */
const REFILL_THRESHOLD = 2;
const REFILL_BATCH = 10;
/** Nghe được ngần này phần bài thì tính là "nghe hết", ít hơn là "bỏ qua". */
const FINISH_RATIO = 0.6;
/** Video không khai báo thời lượng: lấy độ dài một bài hát thường thấy làm mốc. */
const FALLBACK_DURATION_SEC = 180;

interface LastPlayed {
  id: string;
  source: TrackSource;
  videoId: string | null;
  artistName: string | null;
  durationSec: number | null;
  /** Vị trí nghe gần nhất, cập nhật theo từng lần store phát state. */
  time: number;
}

function snapshot(track: PlayableTrack): LastPlayed {
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
  const lastRef = useRef<LastPlayed | null>(null);

  useEffect(() => {
    const refill = async (seedId: string, exclude: string[]) => {
      refillingRef.current = true;
      usePlayer.getState().setRadioStatus("loading");
      try {
        const res = await fetch("/api/radio", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seedId, exclude, limit: REFILL_BATCH }),
        });
        const body = (await res.json()) as {
          tracks?: PlayableTrack[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? "Không lấy được gợi ý.");
        const tracks = body.tracks ?? [];
        usePlayer.getState().appendTracks(tracks);
        usePlayer.getState().setRadioStatus("idle", tracks.length === 0);
      } catch (error) {
        // Đánh dấu cạn để thôi gọi lại — người dùng bấm Radio lần nữa là thử lại.
        usePlayer
          .getState()
          .setRadioStatus(
            "error",
            true,
            error instanceof Error ? error.message : "Không lấy được gợi ý.",
          );
      } finally {
        refillingRef.current = false;
      }
    };

    /**
     * Một lượt nghe vừa kết thúc: ghi lịch sử nghe (mọi nguồn) và, nếu là bài
     * YouTube, cả tín hiệu skip/finish cho radio. Hai request tách nhau vì hai bảng
     * có vòng đời khác nhau: `play_events` giữ mãi, `radio_feedback` chỉ để xếp hạng.
     */
    const reportLast = (last: LastPlayed) => {
      const full = last.durationSec ?? FALLBACK_DURATION_SEC;
      const finished = last.time >= FINISH_RATIO * full;

      // Chuyển bài có thể đi kèm việc đóng tab; keepalive để request vẫn đi tiếp.
      void fetch("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          trackId: last.source === "library" ? last.id : undefined,
          videoId: last.videoId ?? undefined,
          artistName: last.artistName,
          playedSec: Math.round(last.time),
          durationSec: last.durationSec,
          completed: finished,
        }),
      }).catch(() => {});

      if (last.source !== "youtube" || !last.videoId) return;
      void fetch("/api/radio/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          videoId: last.videoId,
          artistName: last.artistName,
          signal: finished ? "finish" : "skip",
        }),
      }).catch(() => {});
    };

    const handle = (state: PlayerState) => {
      const track = state.queue[state.order[state.position]] ?? null;

      const last = lastRef.current;
      if (last?.id !== track?.id) {
        if (last) reportLast(last);
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
    };

    handle(usePlayer.getState());
    return usePlayer.subscribe(handle);
  }, []);

  return null;
}
