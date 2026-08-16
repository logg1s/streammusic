import type { PlayerState, PlayerStore } from "./player-store";
import type { FetchLike, PlayableTrack, TrackSource } from "./types";

/**
 * Lớp gọi API radio, dùng chung cho web và vỏ native.
 *
 * Là factory vì ba vỏ khác nhau ở đúng hai điểm: web gọi đường dẫn tương đối và
 * mang cookie sẵn, còn Expo/Tauri phải gọi URL tuyệt đối kèm
 * `Authorization: Bearer`. Mọi thứ còn lại — ngưỡng nạp thêm, cách tính "nghe hết",
 * hai bảng feedback — phải giống nhau, nếu không lịch sử nghe của một người dùng sẽ
 * lệch nhau giữa các thiết bị.
 */

/** Lô đầu tiên xin nhiều hơn lô nạp thêm: người dùng vừa bấm Radio nên muốn thấy ngay một danh sách. */
const FIRST_BATCH = 12;
/** Còn ngần này bài phía sau thì đi xin lô tiếp theo. */
export const REFILL_THRESHOLD = 2;

/**
 * "Autoplay" kiểu Spotify: khi nào nên tự biến một hàng đợi thường (album/playlist/bài
 * lẻ) thành radio để nghe không đứt quãng. Trả về bài dùng làm seed, hoặc null nếu chưa
 * tới lúc. Cả web và app gọi đúng hàm này — lệch nhau là hai vỏ có hành vi khác nhau.
 *
 * Điều kiện: người dùng bật autoplay, chưa có radio nào chạy (radio đã có RadioController
 * tự nạp thêm), KHÔNG đang lặp (lặp thì hàng đợi không bao giờ "hết" nên đừng cắt ngang),
 * đang có bài phát, và đã tới sát cuối. Seed là bài đang phát ở khúc cuối đó — gu người
 * dùng (taste profile phía server) lo phần "hợp với cả playlist".
 */
export function autoplaySeed(state: PlayerState): PlayableTrack | null {
  if (!state.autoplay || state.radio || state.repeat !== "off") return null;
  const { queue, order, position } = state;
  if (order.length === 0) return null;
  if (order.length - 1 - position > REFILL_THRESHOLD) return null;
  return queue[order[position]] ?? null;
}
const REFILL_BATCH = 10;
/** Nghe được ngần này phần bài thì tính là "nghe hết", ít hơn là "bỏ qua". */
const FINISH_RATIO = 0.6;
/** Video không khai báo thời lượng: lấy độ dài một bài hát thường thấy làm mốc. */
const FALLBACK_DURATION_SEC = 180;

export interface RadioClientOptions {
  /** Rỗng = đường dẫn tương đối (web). Vỏ native phải truyền origin đầy đủ. */
  baseUrl?: string;
  /**
   * Trả về `Authorization` hiện tại, hoặc null khi chưa đăng nhập. Là hàm chứ không
   * phải chuỗi vì token có thể được cấp lại giữa phiên.
   */
  authHeader?: () => string | null;
  fetchImpl?: FetchLike;
  /**
   * `keepalive` giữ request sống khi tab đóng — chỉ có nghĩa trên web. React Native
   * không hỗ trợ và sẽ ném, nên mặc định tắt.
   */
  keepalive?: boolean;
}

/** Một lượt nghe vừa kết thúc, đủ thông tin để báo về server. */
export interface PlayedTrack {
  id: string;
  source: TrackSource;
  videoId: string | null;
  artistName: string | null;
  durationSec: number | null;
  /** Vị trí nghe gần nhất. */
  time: number;
}

export interface RadioClient {
  startRadioFor(seed: PlayableTrack): Promise<void>;
  refillRadio(seedId: string, exclude: string[]): Promise<void>;
  /** Ghi lịch sử nghe + tín hiệu skip/finish cho radio. */
  reportPlayed(last: PlayedTrack): void;
  /** Bài không phát được (id hỏng, bị chặn nhúng) → đừng gợi ý lại. */
  reportBlocked(videoId: string, artistName: string | null): void;
}

export function createRadioClient(
  store: PlayerStore,
  options: RadioClientOptions = {},
): RadioClient {
  const base = options.baseUrl?.replace(/\/$/, "") ?? "";
  // `fetch` toàn cục có trên cả ba runtime; ép kiểu để tsconfig của shared khỏi nạp DOM.
  const doFetch =
    options.fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch;
  if (!doFetch) throw new Error("Không có fetch trong runtime này.");

  const post = (path: string, body: unknown, keepalive = false) => {
    const auth = options.authHeader?.() ?? null;
    return doFetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: auth } : null),
      },
      body: JSON.stringify(body),
      ...(keepalive && options.keepalive ? { keepalive: true } : null),
    });
  };

  const fetchBatch = async (
    seedId: string,
    exclude: string[],
    limit: number,
  ): Promise<PlayableTrack[]> => {
    const res = await post("/api/radio", { seedId, exclude, limit });
    const body = (await res.json()) as {
      tracks?: PlayableTrack[];
      error?: string;
    };
    if (!res.ok) throw new Error(body.error ?? "Không lấy được gợi ý.");
    return body.tracks ?? [];
  };

  /** Lỗi gợi ý KHÔNG được làm đứt bài đang phát — chỉ ghi vào trạng thái radio. */
  const failRadio = (error: unknown) => {
    store.usePlayer
      .getState()
      .setRadioStatus(
        "error",
        true,
        error instanceof Error ? error.message : "Không lấy được gợi ý.",
      );
  };

  return {
    async startRadioFor(seed) {
      // Đổi hàng đợi TRƯỚC khi gọi API: bài gốc phát ngay, không chờ mạng.
      store.usePlayer.getState().startRadio(seed);
      try {
        const tracks = await fetchBatch(seed.id, [seed.id], FIRST_BATCH);
        store.usePlayer.getState().appendTracks(tracks);
        store.usePlayer.getState().setRadioStatus("idle", tracks.length === 0);
      } catch (error) {
        failRadio(error);
      }
    },

    async refillRadio(seedId, exclude) {
      store.usePlayer.getState().setRadioStatus("loading");
      try {
        const tracks = await fetchBatch(seedId, exclude, REFILL_BATCH);
        store.usePlayer.getState().appendTracks(tracks);
        store.usePlayer.getState().setRadioStatus("idle", tracks.length === 0);
      } catch (error) {
        // Đánh dấu cạn để thôi gọi lại — người dùng bấm Radio lần nữa là thử lại.
        failRadio(error);
      }
    },

    reportPlayed(last) {
      const full = last.durationSec ?? FALLBACK_DURATION_SEC;
      const finished = last.time >= FINISH_RATIO * full;

      // Chuyển bài có thể đi kèm việc đóng tab; keepalive để request vẫn đi tiếp.
      void post(
        "/api/plays",
        {
          trackId: last.source === "library" ? last.id : undefined,
          videoId: last.videoId ?? undefined,
          artistName: last.artistName,
          playedSec: Math.round(last.time),
          durationSec: last.durationSec,
          completed: finished,
        },
        true,
      ).catch(() => {});

      // Hai request tách nhau vì hai bảng có vòng đời khác nhau: `play_events` giữ
      // mãi, `radio_feedback` chỉ để xếp hạng.
      if (last.source !== "youtube" || !last.videoId) return;
      void post(
        "/api/radio/feedback",
        {
          videoId: last.videoId,
          artistName: last.artistName,
          signal: finished ? "finish" : "skip",
        },
        true,
      ).catch(() => {});
    },

    reportBlocked(videoId, artistName) {
      void post("/api/radio/feedback", {
        videoId,
        artistName,
        signal: "block",
      }).catch(() => {});
    },
  };
}
