import type { PlayerState, PlayerStore } from "./player-store";
import type {
  FetchLike,
  PlayableTrack,
  RadioState,
  TrackSource,
} from "./types";

/**
 * Lớp gọi API radio, dùng chung cho web và vỏ native.
 *
 * Là factory vì ba vỏ khác nhau ở đúng hai điểm: web gọi đường dẫn tương đối và
 * mang cookie sẵn, còn Expo/Tauri phải gọi URL tuyệt đối kèm
 * `Authorization: Bearer`. Mọi thứ còn lại — ngưỡng nạp thêm, cách ghi lịch sử nghe,
 * và tombstone chặn lại trong phiên — phải giống nhau giữa các thiết bị.
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
  if (!state.autoplay || state.repeat !== "off") return null;
  // Có radio đang chạy thì RadioController lo phần nạp thêm — trừ khi nó đã cạn.
  // Radio cạn mà vẫn chặn ở đây chính là cái bẫy cũ: hàng đợi chết, và đường thoát
  // duy nhất cũng bị khoá bởi chính cái trạng thái chết đó, kể cả sau khi mở lại app.
  if (state.radio && !state.radio.exhausted) return null;
  const { queue, order, position } = state;
  if (order.length === 0) return null;
  if (order.length - 1 - position > REFILL_THRESHOLD) return null;
  const seed = queue[order[position]] ?? null;
  return seed?.source === "youtube" ? seed : null;
}
const REFILL_BATCH = 10;

/**
 * Lỗi nạp gợi ý phải lùi dần trước khi thử lại.
 *
 * Trước đây `exhausted` là cái phanh duy nhất của nhánh nạp thêm — và vì nó không bao
 * giờ nhả nên "phanh" thực chất là "đứng hẳn". Bỏ chốt đó mà không thay bằng gì thì
 * cổng nạp mở lại ở MỌI lần store phát state: web ~2.5 lần/giây, Android mỗi 400ms,
 * đập vào một route động có đào InnerTube. Một lỗi treo thành một vòng lặp request.
 *
 * 1s, 2s, 4s… trần 60s. Trần tồn tại để một sự cố server kéo dài không biến mỗi thiết
 * bị đang mở thành một máy phát request.
 */
export const RADIO_RETRY_CAP_MS = 60_000;
export function radioRetryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(1000 * 2 ** (consecutiveFailures - 1), RADIO_RETRY_CAP_MS);
}

/**
 * Bao nhiêu lần gieo lại radio liên tiếp mà vẫn ra lô rỗng thì thôi.
 *
 * Vòng lặp bị chặn: exhausted → autoplaySeed → startRadio đặt lại exhausted:false →
 * xin lô đầu với seedKey mới (một lần đào server) → trả rỗng → exhausted lại → lặp mãi.
 * `startingRef` chỉ chặn được request đang bay, không chặn được chu kỳ.
 */
export const MAX_RESEED_ATTEMPTS = 3;
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

/**
 * Vì sao lượt nghe kết thúc. Phân biệt này quyết định một bài YouTube có bị chặn lại
 * trong radio session hiện tại hay không.
 *
 * Suy ra "bỏ qua" từ mỗi thời lượng nghe là sai ở đúng chỗ đắt nhất — bài không phát
 * được có time = 0, tức là trông y hệt một cú skip dứt khoát. Nếu không phân biệt,
 * continuation sau sẽ loại nhầm bài chỉ vì engine tự nhảy khi mất mạng hoặc resolve
 * thất bại.
 *
 * Quy tắc: chỉ con người mới được dạy mô hình. Máy tự nhảy bài thì không.
 */
export type PlayEndReason =
  /** Người dùng bấm next/previous, chọn bài khác, hoặc bài chạy hết. */
  | "user"
  /** Vỏ tự nhảy vì bài không phát được (resolve hỏng, 403, chặn nhúng, decoder lỗi). */
  | "error";

/** Một lượt nghe vừa kết thúc, đủ thông tin để báo về server. */
export interface PlayedTrack {
  id: string;
  source: TrackSource;
  videoId: string | null;
  artistName: string | null;
  durationSec: number | null;
  /** Vị trí nghe gần nhất. */
  time: number;
  /**
   * Mặc định "user" để vỏ chưa cập nhật vẫn giữ hành vi cũ. Mọi đường xử lý lỗi
   * PHẢI truyền "error" — quên là quay lại đúng cái bug đã đo được ở trên.
   */
  reason?: PlayEndReason;
}

export interface RadioClient {
  startRadioFor(seed: PlayableTrack): Promise<void>;
  refillRadio(continuation: string, exclude: string[]): Promise<void>;
  /** Ghi lịch sử nghe; skip chủ động đồng thời tạo tombstone trong phiên. */
  reportPlayed(last: PlayedTrack): void;
  /** Bài không phát được (id hỏng, bị chặn nhúng) → đừng gợi ý lại trong phiên. */
  reportBlocked(videoId: string): void;
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

  /** Lỗi có mang theo nhãn đóng để đếm được. Xem `RadioState.errorKind`. */
  class RadioFetchError extends Error {
    constructor(
      message: string,
      readonly kind: NonNullable<RadioState["errorKind"]>,
    ) {
      super(message);
    }
  }

  interface RadioPage {
    tracks: PlayableTrack[];
    continuation: string | null;
    playlistId: string | null;
  }

  const fetchBatch = async (
    page: { seedId: string } | { continuation: string },
    exclude: string[],
    limit: number,
  ): Promise<RadioPage> => {
    const res = await post("/api/radio", { ...page, exclude, limit });
    const body = (await res.json()) as {
      tracks?: PlayableTrack[];
      continuation?: string | null;
      playlistId?: string | null;
      error?: string;
    };
    if (!res.ok) {
      // 429 = hết quota YouTube trong ngày. Phải phân biệt được với kho ứng viên cạn:
      // hai nguyên nhân này cho ra cùng một triệu chứng, và chu kỳ này tồn tại vì
      // một triệu chứng không phân biệt được nguồn gốc thì không sửa được.
      throw new RadioFetchError(
        body.error ?? "Không lấy được gợi ý.",
        res.status === 429 ? "quota" : "network",
      );
    }
    return {
      tracks: body.tracks ?? [],
      continuation: body.continuation ?? null,
      playlistId: body.playlistId ?? null,
    };
  };

  /**
   * Lỗi gợi ý KHÔNG được làm đứt bài đang phát — chỉ ghi vào trạng thái radio.
   *
   * Trước đây hàm này bật luôn `exhausted`, gộp "mạng lỗi" với "hết bài để gợi ý".
   * Hai thứ đó khác nhau về hệ quả: `exhausted` được ghi xuống đĩa, không có gì tắt
   * nó, và `autoplaySeed()` từ chối gieo lại khi đã có radio — nên đúng MỘT lần
   * timeout là app không bao giờ tự phát tiếp được nữa, qua cả những lần mở lại sau.
   * Một lỗi tạm thời phải để lại một trạng thái tạm thời.
   */
  const failRadio = (error: unknown) => {
    store.usePlayer
      .getState()
      .setRadioStatus(
        "error",
        false,
        error instanceof Error ? error.message : "Không lấy được gợi ý.",
        error instanceof RadioFetchError ? error.kind : "other",
      );
  };

  return {
    async startRadioFor(seed) {
      // File thư viện/Drive là hàng đợi hữu hạn: phát xong thì dừng, không gợi ý.
      if (seed.source !== "youtube" || !seed.youtubeVideoId) return;
      // Đổi hàng đợi TRƯỚC khi gọi API: bài gốc phát ngay, không chờ mạng.
      store.usePlayer.getState().startRadio(seed);
      // Loại CẢ hàng đợi, không chỉ seed. Khi autoplay biến một playlist/album thành
      // radio, `startRadio` giữ nguyên hàng đợi đang nghe (nhánh keep) — xin lô đầu mà
      // chỉ loại seed thì server trả về chính những bài vừa nghe: lô đầu vừa thiếu bài
      // (client lọc trùng bỏ đi) vừa lặp lại bài vừa bỏ qua. Đối xứng với `refillRadio`.
      const current = store.usePlayer.getState();
      const exclude = [
        ...current.queue.map((t) => t.id),
        ...(current.radio?.blockedIds ?? []),
      ];
      try {
        const page = await fetchBatch({ seedId: seed.id }, exclude, FIRST_BATCH);
        store.usePlayer.getState().appendTracks(page.tracks);
        store.usePlayer
          .getState()
          .setRadioPage(page.continuation, page.playlistId);
        store.usePlayer
          .getState()
          .setRadioStatus("idle", page.continuation === null);
      } catch (error) {
        failRadio(error);
      }
    },

    async refillRadio(continuation, exclude) {
      store.usePlayer.getState().setRadioStatus("loading");
      try {
        const page = await fetchBatch(
          { continuation },
          exclude,
          REFILL_BATCH,
        );
        store.usePlayer.getState().appendTracks(page.tracks);
        store.usePlayer
          .getState()
          .setRadioPage(page.continuation, page.playlistId);
        store.usePlayer
          .getState()
          .setRadioStatus("idle", page.continuation === null);
      } catch (error) {
        failRadio(error);
      }
    },

    reportPlayed(last) {
      const full = last.durationSec ?? FALLBACK_DURATION_SEC;
      const finished = last.time >= FINISH_RATIO * full;
      const byError = last.reason === "error";

      // Một cú bỏ qua chủ động là quyết định của phiên hiện tại. Giữ tombstone cục
      // bộ để continuation sau không thể đưa bài vừa bỏ trở lại cuối hàng đợi.
      if (!byError && last.source === "youtube" && !finished) {
        store.usePlayer.getState().blockRadioTrack(last.id);
      }

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

      // Thứ tự radio do YouTube up-next quyết định. Không gửi skip/finish vào
      // compatibility endpoint của bộ xếp hạng cũ.
    },

    reportBlocked(videoId) {
      store.usePlayer.getState().blockRadioTrack(`yt:${videoId}`);
    },
  };
}
