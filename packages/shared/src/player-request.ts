import type { FetchLike } from "./types";

/**
 * Lấy URL audio thật của một video YouTube, chạy được ở MỌI vỏ.
 *
 * Chỉ dùng `fetch` — không `youtubei.js`: bundle browser của nó 1,5 MB và
 * **không tree-shake được** (`parser.js` là `import * as YTNodes`), còn field
 * `exports` đặt điều kiện `node` trước `browser` nên Metro kéo nhánh Node vào.
 *
 * ── VÌ SAO PHẢI CHẠY TRÊN THIẾT BỊ ───────────────────────────────────────────
 * `POST /youtubei/v1/player` từ IP máy chủ Vercel trả `LOGIN_REQUIRED` (đo 2026-08,
 * 3/3 video). Chỉ IP dân dụng của người dùng resolve được. Đây là bất biến chi phối
 * cả kiến trúc: server không bao giờ giữ URL audio.
 *
 * ── VISITORDATA PHẢI XIN TỪ YOUTUBE, KHÔNG ĐƯỢC TỰ SINH ──────────────────────
 * Đo 2026-08-15 trên IP dân dụng, cùng máy, cùng body: `visitorData` tự sinh cục bộ
 * (proto `{1: id 11 ký tự, 5: unix ts}` đúng như `youtubei.js` mã hoá) trả
 * `LOGIN_REQUIRED` — *"Đăng nhập để xác nhận bạn không phải là robot"* — cho **cả
 * hai** client. Cùng lúc đó, `visitorData` lấy từ `GET /sw.js_data` trả `OK` cho 3/3
 * video. Khác biệt không nằm ở khuôn dạng: chuỗi thật dài hơn nhiều vì mang thêm
 * field 50 (một chữ ký phía server). Nên `fetchVisitorData()` là bắt buộc.
 *
 * ── VÌ SAO KHÔNG CẦN PO TOKEN ────────────────────────────────────────────────
 * Hai client dưới đây (VISIONOS 101, ANDROID_VR 28) trả `url` thuần, không
 * `signatureCipher`, không `ump=`/`sabr=`. yt-dlp cũng ghi `android_vr` là "PO token:
 * Not required".
 *
 * ── PHẢI CÓ HEADER `RANGE`, NẾU KHÔNG BỊ BÓP BĂNG THÔNG ──────────────────────
 * Đo 2026-08-15, mỗi cách một video nguội (URL vừa resolve, CDN chưa ấm):
 *
 * | Request                  | Kết quả                          |
 * |--------------------------|----------------------------------|
 * | GET không `Range`        | `200`, **32 KiB/s** — 4,5 MB mất 141 giây |
 * | `Range: bytes=0-`        | `206`, **31 MiB/s** — cả file trong 132 ms |
 * | `Range: bytes=0-1048575` | `206`, cùng tốc độ đó            |
 *
 * Vậy KHÔNG có biên 1 MiB và không có `403` nào: googlevideo phục vụ mọi khoảng, kể
 * cả khoảng mở. Cái duy nhất bắt buộc là **có** header `Range` — thiếu nó thì server
 * nhả byte đúng bằng tốc độ nghe (~32 KiB/s), tua đi đâu cũng phải chờ.
 *
 * `origin`, `referer`, `user-agent` KHÔNG cần (đo cùng ngày, mỗi thứ một video nguội,
 * đều `206` full tốc). Đừng thêm vào cho "chắc": mỗi header vô nghĩa là một chỗ để
 * người sau tưởng là bắt buộc.
 */

/** Base của mọi request InnerTube. Không phải header — xem `audioRangeHeaders`. */
const YOUTUBE_ORIGIN = "https://www.youtube.com";

export interface ResolvedAudio {
  url: string;
  mimeType: string;
  itag: number;
  /** 0 khi googlevideo không khai `contentLength` — người gọi phải tự dò bằng Range. */
  totalBytes: number;
  durationSec: number;
  title: string;
  channelTitle: string;
  /** Mốc URL hết hạn (ms epoch), lấy từ query `expire`. */
  expiresAt: number;
  client: string;
}

/** YouTube đòi đăng nhập → đổi mạng (VPN/IP máy chủ) rồi thử lại. */
export class LoginRequiredError extends Error {}
/** Video bị gỡ, riêng tư, hoặc Made-for-Kids → bỏ bài, sang bài kế. */
export class VideoUnplayableError extends Error {}

interface ClientProfile {
  name: string;
  /** `X-Youtube-Client-Name` — trùng khít `INNERTUBE_CONTEXT_CLIENT_NAME` của yt-dlp. */
  id: number;
  version: string;
  context: Record<string, unknown>;
}

/**
 * Thứ tự có chủ ý: ANDROID_VR bị siết PO token từ 2026-07 (yt-dlp `69ea2000`,
 * PR #17261) nên URL của nó chỉ phục vụ ~1 MiB đầu rồi 403 — giữ làm lưới hứng.
 */
const CLIENTS: readonly ClientProfile[] = [
  {
    name: "VISIONOS",
    id: 101,
    version: "1.02",
    context: {
      clientName: "VISIONOS",
      clientVersion: "1.02",
      deviceMake: "Apple",
      deviceModel: "RealityDevice17,1",
      osName: "visionOS",
      osVersion: "26.5.23O471",
      clientFormFactor: "UNKNOWN_FORM_FACTOR",
    },
  },
  {
    name: "ANDROID_VR",
    id: 28,
    version: "1.65.10",
    context: {
      clientName: "ANDROID_VR",
      clientVersion: "1.65.10",
      deviceMake: "Oculus",
      deviceModel: "Quest 3",
      osName: "Android",
      osVersion: "12L",
      androidSdkVersion: 32,
    },
  },
];

/** itag 140 là AAC-LC ~130 kbps — đúng thứ `symphonia-codec-aac` và media3 đọc được. */
const PREFERRED_ITAG = 140;

/** URL hết hạn sau ~6 giờ; dùng mốc này khi query `expire` không có. */
const FALLBACK_TTL_MS = 5 * 3600_000;

const LOCALE = {
  hl: "vi",
  gl: "VN",
  timeZone: "Asia/Ho_Chi_Minh",
  utcOffsetMinutes: 420,
} as const;

/** Trang JSPB mà `sw.js` nạp — nơi xin được `visitorData` thật, không cần đăng nhập. */
const SW_DATA_URL = `${YOUTUBE_ORIGIN}/sw.js_data`;

function nth(node: unknown, index: number): unknown {
  return Array.isArray(node) ? (node as unknown[])[index] : undefined;
}

/**
 * Xin `visitorData` thật từ YouTube. Đây là thứ biến `LOGIN_REQUIRED` thành `OK`.
 *
 * `GET /sw.js_data` trả JSPB (mảng lồng mảng) mở đầu bằng `)]}'`. Toạ độ
 * `data[0][2][0][0][13]` lấy đúng theo `youtubei.js` (`Session.#getSessionData`): đi
 * theo nó thì khi YouTube đổi khuôn, hai bên hỏng cùng lúc và sửa cùng một chỗ.
 *
 * Một chuỗi dùng được cho cả phiên (~mọi request), nên vỏ xin một lần rồi giữ lại —
 * xem `createYoutubeResolver`.
 */
export async function fetchVisitorData(fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(SW_DATA_URL, {
    headers: {
      accept: "*/*",
      "accept-language": LOCALE.hl,
      referer: `${YOUTUBE_ORIGIN}/sw.js`,
    },
  });
  if (!res.ok) throw new Error(`Không xin được phiên YouTube (${res.status}).`);
  const text = await res.text();
  if (!text.startsWith(")]}'"))
    throw new Error("Phiên YouTube trả về khuôn dạng lạ.");
  const data: unknown = JSON.parse(text.slice(4));
  const visitorData = nth(nth(nth(nth(nth(data, 0), 2), 0), 0), 13);
  if (typeof visitorData !== "string" || !visitorData)
    throw new Error("Phiên YouTube không mang visitorData.");
  return visitorData;
}

interface PlayerFormat {
  itag: number;
  url?: string;
  mimeType: string;
  bitrate?: number;
  contentLength?: string;
  audioQuality?: string;
  isDrc?: boolean;
}

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  streamingData?: {
    adaptiveFormats?: PlayerFormat[];
    formats?: PlayerFormat[];
  };
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
  };
}

/**
 * Chỉ nhận format audio có `url` thuần: `isDrc` là bản nén loudness (nghe tệ), còn
 * `ump`/`sabr`/`n` trong query nghĩa là URL cần giải mã hoặc streaming riêng.
 */
function pickAudio(formats: PlayerFormat[]): PlayerFormat | null {
  const clean = formats.filter(
    (f) =>
      typeof f.url === "string" &&
      f.mimeType.startsWith("audio/mp4") &&
      !f.isDrc &&
      !/[?&](ump|sabr|n)=/.test(f.url),
  );
  if (clean.length === 0) return null;
  return (
    clean.find((f) => f.itag === PREFERRED_ITAG) ??
    clean.reduce((best, f) => ((f.bitrate ?? 0) > (best.bitrate ?? 0) ? f : best))
  );
}

/** Tự bóc query thay vì dùng `URL`: giữ package không phụ thuộc lib DOM/Node. */
function expiresAtOf(url: string): number {
  const expire = Number(/[?&]expire=(\d+)/.exec(url)?.[1] ?? 0);
  return expire > 0 ? expire * 1000 : Date.now() + FALLBACK_TTL_MS;
}

async function requestPlayer(
  videoId: string,
  client: ClientProfile,
  visitorData: string,
  fetchImpl: FetchLike,
): Promise<PlayerResponse> {
  const res = await fetchImpl(
    `${YOUTUBE_ORIGIN}/youtubei/v1/player?prettyPrint=false&alt=json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        "accept-language": "*",
        // Chuỗi từ `/sw.js_data` đã percent-encode sẵn — encode lần nữa là hỏng.
        "x-goog-visitor-id": visitorData,
        "x-youtube-client-name": String(client.id),
        "x-youtube-client-version": client.version,
      },
      body: JSON.stringify({
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
        // Bỏ ba trường này thì một số video trả `LOGIN_REQUIRED` dù visitorData đúng.
        playbackContext: {
          contentPlaybackContext: {
            vis: 0,
            splay: false,
            lactMilliseconds: "-1",
          },
        },
        context: {
          client: { ...client.context, ...LOCALE, visitorData },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new VideoUnplayableError(
      `InnerTube ${client.name} trả HTTP ${res.status}`,
    );
  }
  return (await res.json()) as PlayerResponse;
}

/**
 * Thử lần lượt từng client với một `visitorData` đã xin được.
 *
 * Dùng trực tiếp khi vỏ tự quản vòng đời phiên; còn không thì gọi
 * `createYoutubeResolver` để khỏi xin phiên lại mỗi bài.
 */
export async function resolveAudio(
  videoId: string,
  fetchImpl: FetchLike,
  visitorData: string,
): Promise<ResolvedAudio> {
  let loginRequired = false;
  let lastReason = "";

  for (const client of CLIENTS) {
    const body = await requestPlayer(videoId, client, visitorData, fetchImpl);
    const status = body.playabilityStatus?.status ?? "UNKNOWN";

    if (status !== "OK") {
      lastReason = body.playabilityStatus?.reason ?? status;
      if (status === "LOGIN_REQUIRED" || status === "AGE_VERIFICATION_REQUIRED") {
        loginRequired = true;
      }
      continue;
    }

    const formats = [
      ...(body.streamingData?.adaptiveFormats ?? []),
      ...(body.streamingData?.formats ?? []),
    ];
    const format = pickAudio(formats);
    if (!format?.url) {
      lastReason = "không có format audio nào dùng được";
      continue;
    }

    return {
      url: format.url,
      mimeType: format.mimeType,
      itag: format.itag,
      totalBytes: Number(format.contentLength ?? 0),
      durationSec: Number(body.videoDetails?.lengthSeconds ?? 0),
      title: body.videoDetails?.title ?? "",
      channelTitle: body.videoDetails?.author ?? "",
      expiresAt: expiresAtOf(format.url),
      client: client.name,
    };
  }

  if (loginRequired) {
    throw new LoginRequiredError(
      "YouTube đòi đăng nhập cho video này — thử đổi mạng rồi phát lại.",
    );
  }
  throw new VideoUnplayableError(
    `Video này không phát được${lastReason ? `: ${lastReason}` : ""}`,
  );
}

export interface YoutubeResolver {
  resolve(videoId: string): Promise<ResolvedAudio>;
  /** Bỏ phiên đang giữ; lần `resolve` sau sẽ xin phiên mới. */
  reset(): void;
}

/**
 * Bọc `resolveAudio` cùng một phiên khách dùng lại được.
 *
 * Vỏ nào cũng nên đi qua đây: xin `visitorData` mỗi bài là thêm một round-trip vào
 * đúng quãng người dùng đang chờ tiếng. Phiên hỏng (YouTube thu hồi, hết hạn) thì
 * `LOGIN_REQUIRED` bắn ra — bắt đúng nó, xin phiên mới, thử lại **một** lần: sai
 * visitorData và video thật sự cần đăng nhập cho cùng một mã lỗi, nên vòng lặp vô hạn
 * là rủi ro có thật.
 */
export function createYoutubeResolver(fetchImpl: FetchLike): YoutubeResolver {
  let session: Promise<string> | null = null;

  const visitorData = () => (session ??= fetchVisitorData(fetchImpl));

  return {
    async resolve(videoId) {
      try {
        return await resolveAudio(videoId, fetchImpl, await visitorData());
      } catch (error) {
        if (!(error instanceof LoginRequiredError)) throw error;
        session = null;
        return resolveAudio(videoId, fetchImpl, await visitorData());
      }
    },
    reset() {
      session = null;
    },
  };
}

/**
 * Header cho mọi request byte tới googlevideo. `startByte` là chỗ bắt đầu đọc.
 *
 * Một hàm cho một header vì cả ba vỏ (Rust, Kotlin, JS) đều gọi và không vỏ nào được
 * phép "quên": thiếu `Range` là tụt xuống 32 KiB/s, mà tụt thì nghe vẫn ra tiếng nên
 * lỗi này không lộ ở test nào cả — chỉ tua mới thấy.
 *
 * Khoảng mở (`bytes=N-`) là đúng ý: xin cả phần còn lại rồi đọc theo dòng, khỏi phải
 * cắt lô. Tua = mở request mới với `startByte` khác.
 */
export function audioRangeHeaders(startByte = 0): Record<string, string> {
  return { range: `bytes=${startByte}-` };
}
