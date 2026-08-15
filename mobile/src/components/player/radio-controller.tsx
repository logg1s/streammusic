import { useEffect, useRef } from "react";
import {
  REFILL_THRESHOLD,
  createRadioClient,
  type PlayableTrack,
  type PlayedTrack,
  type PlayerState,
} from "@vong/shared";
import { ORIGIN, getSessionToken } from "@/lib/api";
import { playerStore, usePlayer } from "@/store/player";

/**
 * Bộ não của "playlist linh hoạt" trên máy: theo dõi hàng đợi, nạp thêm bài trước khi
 * hết, và báo về server bài nào bị bỏ qua sớm.
 *
 * Không render gì. `PlaybackEngine` mount nó để cả hai sống cùng một vòng đời — hàng
 * đợi phải tự dài ra kể cả khi người dùng đang ở tab khác.
 *
 * Ngưỡng nạp thêm và cách tính "nghe hết" nằm ở `@vong/shared`: web chạy đúng logic
 * này, lệch nhau là lịch sử nghe của cùng một người trôi khác nhau theo thiết bị.
 */

/**
 * `Authorization` hiện tại, giữ ở dạng đồng bộ.
 *
 * `RadioClientOptions.authHeader` là hàm ĐỒNG BỘ (web chỉ cần cookie), còn token của
 * app nằm trong SecureStore — một lời gọi async. Nên phải có bản đệm này, được làm mới
 * lúc mount và mỗi lần đổi bài; đăng nhập giữa phiên nhờ đó cũng vào đúng lô kế tiếp.
 */
let cachedAuth: string | null = null;

async function primeAuth(): Promise<void> {
  const token = await getSessionToken();
  cachedAuth = token ? `Bearer ${token}` : null;
}

/**
 * Lớp gọi API radio của vỏ Expo.
 *
 * `keepalive: false` — cờ đó chỉ có nghĩa trên web (giữ request sống khi tab đóng) và
 * `fetch` của React Native ném khi thấy nó.
 */
const radio = createRadioClient(playerStore, {
  baseUrl: ORIGIN,
  authHeader: () => cachedAuth,
  keepalive: false,
});

/** Màn hình nào cần "Radio từ bài này" thì dùng đúng client này, đừng tạo client thứ hai. */
export const { startRadioFor, reportBlocked } = radio;

const { refillRadio, reportPlayed } = radio;

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
  const lastRef = useRef<PlayedTrack | null>(null);

  useEffect(() => {
    void primeAuth();

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
        // Đổi bài là mốc rẻ nhất để làm mới token: một lần đọc Keystore mỗi bài.
        void primeAuth();
      } else if (last) {
        last.time = state.currentTime;
      }

      const { radio: radioState, order, position, queue } = state;
      if (
        radioState &&
        !radioState.exhausted &&
        radioState.status !== "loading" &&
        !refillingRef.current &&
        order.length - 1 - position <= REFILL_THRESHOLD
      ) {
        void refill(
          radioState.seedId,
          queue.map((t) => t.id),
        );
      }
    };

    handle(usePlayer.getState());
    return usePlayer.subscribe(handle);
  }, []);

  return null;
}
