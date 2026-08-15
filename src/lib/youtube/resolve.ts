import { Innertube } from "youtubei.js";
import type { Misc, Types } from "youtubei.js";
import type { Flags } from "youtube-dl-exec";
import {
  VideoUnplayableError,
  YoutubeBlockedError,
} from "@/lib/youtube/errors";
import { LANGUAGE_CODE, REGION_CODE } from "@/lib/youtube/locale";

/**
 * Lấy URL audio thật của một video YouTube (chỉ chạy phía server).
 *
 * Vì sao là `VISIONOS` rồi `ANDROID_VR`, và vì sao KHÔNG gắn cookie:
 * - Hai client này trả `url` thuần (không `signatureCipher`, không `ump=`/`sabr=`)
 *   và không cần PO token.
 * - `ANDROID_VR` đã bị YouTube siết từ 2026-07: đo được URL của nó chỉ phục vụ đúng
 *   1 MiB đầu rồi trả `403` cho mọi byte sau đó (yt-dlp cũng đánh dấu client này là
 *   "cần PO token" trên master). `VISIONOS` chưa bị siết: cùng bài, cùng máy, quét
 *   hết 4 MB đều `206`. Nên VISIONOS đứng trước, ANDROID_VR chỉ còn là lưới hứng.
 * - `IOS`/`ANDROID` trả URL khoá IP và cũng chỉ ~1 MiB đầu → vô dụng.
 * - Gắn cookie sẽ loại bỏ đúng hai client này (chúng không hỗ trợ cookie) và đẩy
 *   sang `web`/`tv` — kéo theo DRM, SABR, PO token. Instance này không bao giờ nhận cookie.
 *
 * Thứ tự này là thứ YouTube đang siết dần từng client, nên coi nó là cấu hình sống:
 * client nào hỏng thì đổi chỗ, đừng chôn thêm giả định vào chỗ khác.
 */

/** Thứ tự thử. Hết danh sách mà vẫn bị chặn thì ném `YoutubeBlockedError`. */
const CLIENTS: readonly Types.InnerTubeClient[] = ["VISIONOS", "ANDROID_VR"];

/** URL hết hạn sau ~6 giờ; dùng mốc này khi query `expire` không có. */
const FALLBACK_TTL_MS = 5 * 3600_000;

/** itag 140 là AAC ~130 kbps — `<audio>` ở mọi trình duyệt đọc được, khác opus. */
const PREFERRED_ITAG = 140;

export interface ResolvedAudio {
  url: string;
  itag: number;
  mimeType: string;
  /** Thiếu khi googlevideo không khai báo `contentLength`. */
  totalBytes: number | null;
  durationSec: number;
  title: string;
  channelTitle: string;
  expiresAt: number;
  client: string;
}

let cached: Innertube | null = null;
let cachedVisitorData: string | undefined;

/**
 * `retrieve_player: false` bỏ hẳn việc tải + eval player JS — đúng vì hai client
 * trên đã trả `url` thuần. `visitorData` khách là thứ biến `LOGIN_REQUIRED`
 * thành `OK`, nên giữ lại giữa các lần gọi.
 *
 * `lang`/`location` ghim theo `locale.ts`: InnerTube đoán vùng theo IP máy gọi, nên
 * máy chủ ở Mỹ sẽ trả gợi ý Mỹ. Ghim để chạy ở đâu cũng ra cùng thứ nhạc.
 */
export async function innertube(): Promise<Innertube> {
  if (cached) return cached;
  const yt = await Innertube.create({
    lang: LANGUAGE_CODE,
    location: REGION_CODE,
    retrieve_player: false,
    generate_session_locally: false,
    enable_session_cache: false,
    visitor_data: cachedVisitorData,
  });
  cachedVisitorData = yt.session.context.client.visitorData;
  cached = yt;
  return yt;
}

export function resetInnertube(): void {
  cached = null;
  cachedVisitorData = undefined;
}

/**
 * Chỉ nhận format audio có `url` thuần: `is_drc` là bản nén loudness (nghe tệ),
 * còn `ump`/`sabr`/`n` trong query nghĩa là URL cần giải mã hoặc streaming riêng.
 */
function pickAudio(formats: Misc.Format[]): Misc.Format | null {
  const clean = formats.filter(
    (f) =>
      f.has_audio &&
      f.mime_type.startsWith("audio") &&
      f.url !== undefined &&
      !f.is_drc &&
      !/[?&](ump|sabr|n)=/.test(f.url),
  );
  if (clean.length === 0) return null;
  return (
    clean.find((f) => f.itag === PREFERRED_ITAG) ??
    clean.reduce((best, f) => (f.bitrate > best.bitrate ? f : best))
  );
}

function expiresAtOf(url: string): number {
  const expire = Number(new URL(url).searchParams.get("expire"));
  return expire > 0 ? expire * 1000 : Date.now() + FALLBACK_TTL_MS;
}

async function resolveOnce(videoId: string): Promise<ResolvedAudio> {
  const yt = await innertube();
  let blocked = false;

  for (const client of CLIENTS) {
    const info = await yt.getBasicInfo(videoId, { client });
    const status = info.playability_status?.status ?? "UNKNOWN";
    if (status !== "OK") {
      // LOGIN_REQUIRED là chặn tạm (bot check); còn lại là video thật sự không phát được.
      if (status === "LOGIN_REQUIRED") blocked = true;
      continue;
    }

    const format = pickAudio(info.streaming_data?.adaptive_formats ?? []);
    // Không truyền Player nên `decipher()` trả thẳng `url` — đúng nhánh url thuần.
    const url = format ? await format.decipher() : "";
    if (!format || !url) continue;

    return {
      url,
      itag: format.itag,
      mimeType: format.mime_type,
      totalBytes: format.content_length ?? null,
      durationSec: Math.round(format.approx_duration_ms / 1000),
      title: info.basic_info.title ?? videoId,
      channelTitle: info.basic_info.author ?? "",
      expiresAt: expiresAtOf(url),
      client,
    };
  }

  if (blocked) {
    throw new YoutubeBlockedError("YouTube đòi đăng nhập cho video này");
  }
  throw new VideoUnplayableError("Video này không phát được");
}

export async function resolveAudio(videoId: string): Promise<ResolvedAudio> {
  if (process.env.YT_RESOLVER === "ytdlp") return resolveWithYtdlp(videoId);

  try {
    return await resolveOnce(videoId);
  } catch (error) {
    if (!(error instanceof YoutubeBlockedError)) throw error;
    // `visitorData` cũ có thể đã bị thu hồi: xin phiên khách mới rồi thử lại đúng một lần.
    resetInnertube();
    return resolveOnce(videoId);
  }
}

/* ------------------------------------------------------------------ */
/* Nhánh dự phòng: yt-dlp (YT_RESOLVER=ytdlp)                          */
/* ------------------------------------------------------------------ */

interface YtdlpJson {
  url?: string;
  filesize?: number;
  filesize_approx?: number;
  duration?: number;
  title?: string;
  channel?: string;
  uploader?: string;
  format_id?: string;
  acodec?: string;
}

/**
 * Chỉ thử `android_vr`: `visionos` chưa có trong bản release 2026.07.04.
 * yt-dlp không trả trường hết hạn nên `expiresAt` vẫn parse từ query `expire`.
 */
async function resolveWithYtdlp(videoId: string): Promise<ResolvedAudio> {
  // Import động có chủ ý: youtube-dl-exec là optionalDependency (cần binary yt-dlp
  // + Python), chỉ có trên host chạy nhánh này; import tĩnh sẽ vỡ ở build Vercel.
  const { exec } = await import("youtube-dl-exec");

  // `dargs` đổi camelCase thành --kebab-case nên extractorArgs chạy được ở runtime;
  // chỉ type Flags của thư viện là chưa khai báo khoá đó.
  const flags: Flags & { extractorArgs: string } = {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    format: "bestaudio[protocol=https]",
    extractorArgs: "youtube:player_client=android_vr",
  };

  const result = await exec(videoId, flags);
  const info = JSON.parse(result.stdout) as YtdlpJson;
  if (!info.url) {
    throw new VideoUnplayableError("yt-dlp không tìm được URL audio");
  }

  return {
    url: info.url,
    itag: Number(info.format_id) || 0,
    mimeType: info.acodec?.startsWith("opus") ? "audio/webm" : "audio/mp4",
    totalBytes: info.filesize ?? info.filesize_approx ?? null,
    durationSec: Math.round(info.duration ?? 0),
    title: info.title ?? videoId,
    channelTitle: info.channel ?? info.uploader ?? "",
    expiresAt: expiresAtOf(info.url),
    client: "android_vr",
  };
}
