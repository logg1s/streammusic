import {
  parseContentRange,
  tokenizer as createRangeTokenizer,
  type IHeadRequestInfo,
  type IRangeRequestClient,
  type IRangeRequestResponse,
} from "@tokenizer/range";
import { parseBuffer, parseFromTokenizer, type IPicture } from "music-metadata";

/** Nguồn đọc: URL + header (Drive cần Authorization, Dropbox/OneDrive thì không). */
export interface RemoteAudioSource {
  url: string;
  headers?: Record<string, string>;
  sizeBytes: number | null;
  mimeType?: string | null;
  fileName: string;
}

export interface TrackMetadata {
  title: string | null;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  durationSec: number | null;
  bitrate: number | null;
  codec: string | null;
  picture: { data: Uint8Array; format: string } | null;
}

/** Nếu tag không đủ để suy ra thời lượng thì fetch tối đa chừng này rồi thôi. */
const FALLBACK_HEAD_BYTES = 512 * 1024;

/** Lô đầu tiên — đủ để trùm ID3v2 kèm ảnh bìa của hầu hết file. */
const INITIAL_CHUNK_BYTES = 128 * 1024;
/** Cận dưới cho mỗi lô tiếp theo, để không sinh ra hàng chục request tí hon. */
const MINIMUM_CHUNK_BYTES = 64 * 1024;

/**
 * Hạn thời gian cho MỘT range request.
 *
 * Bắt buộc phải có: Google Drive thỉnh thoảng ngừng trả byte giữa chừng mà không
 * đóng kết nối. Không có timeout thì một file như vậy treo vĩnh viễn cả lô quét,
 * và người dùng chỉ thấy thanh tiến độ đứng im mãi mãi.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Client range-request cho @tokenizer/range.
 *
 * Điểm mấu chốt: music-metadata chỉ đọc đúng vài KB nó cần (header ở đầu file,
 * và nhảy về cuối file cho ID3v1 / MP4 có `moov` ở cuối). Với 2000 bài, đây là
 * khác biệt giữa vài MB và vài GB băng thông mỗi lần quét.
 */
function createRangeClient(
  source: RemoteAudioSource,
  size: number,
): IRangeRequestClient {
  const controller = new AbortController();

  const headInfo: IHeadRequestInfo = {
    size,
    mimeType: source.mimeType ?? undefined,
    url: source.url,
    path: source.fileName,
    acceptPartialRequests: true,
  };

  return {
    // Đã biết size/mimeType từ lúc liệt kê file → khỏi tốn thêm một HEAD request.
    async getHeadInfo() {
      return headInfo;
    },

    async getResponse(
      method: string,
      range?: [number, number],
    ): Promise<IRangeRequestResponse> {
      const headers = new Headers(source.headers);
      if (range) headers.set("Range", `bytes=${range[0]}-${range[1]}`);

      const res = await fetch(source.url, {
        method,
        headers,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      });
      if (!res.ok) {
        throw new Error(
          `Range request thất bại (${res.status}) cho ${source.fileName}`,
        );
      }

      const contentRange = res.headers.get("content-range");
      return {
        ...headInfo,
        mimeType: res.headers.get("content-type") ?? headInfo.mimeType,
        contentRange: contentRange ? parseContentRange(contentRange) : undefined,
        arrayBuffer: async () => new Uint8Array(await res.arrayBuffer()),
      };
    },

    abort() {
      controller.abort();
    },
  };
}

function pickPicture(pictures: IPicture[] | undefined) {
  if (!pictures?.length) return null;
  // Ưu tiên ảnh bìa trước (type 3 = Cover front), nếu không thì lấy ảnh đầu tiên.
  const cover =
    pictures.find((p) => p.type?.toLowerCase().includes("cover (front)")) ??
    pictures.find((p) => p.type?.toLowerCase().includes("cover")) ??
    pictures[0];
  return { data: cover.data, format: cover.format ?? "image/jpeg" };
}

function firstNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Đọc tag từ file nằm trên cloud, không tải toàn bộ nội dung về. */
export async function readRemoteMetadata(
  source: RemoteAudioSource,
): Promise<TrackMetadata> {
  const metadata = await parseRemote(source);

  const { common, format } = metadata;
  const durationFromTag = firstNumber(format.duration);
  const bitrate = firstNumber(format.bitrate);

  return {
    title: common.title?.trim() || null,
    artist: common.artist?.trim() || common.artists?.[0]?.trim() || null,
    albumArtist: common.albumartist?.trim() || null,
    album: common.album?.trim() || null,
    trackNo: firstNumber(common.track?.no),
    discNo: firstNumber(common.disk?.no),
    year: firstNumber(common.year),
    genre: common.genre?.[0]?.trim() || null,
    // Khi tag không có sẵn thời lượng (MP3 CBR không có Xing header), ước lượng
    // từ kích thước file và bitrate thay vì quét toàn bộ frame.
    durationSec:
      durationFromTag ??
      (source.sizeBytes && bitrate ? (source.sizeBytes * 8) / bitrate : null),
    bitrate: bitrate ? Math.round(bitrate) : null,
    codec: format.codec ?? format.container ?? null,
    picture: pickPicture(common.picture),
  };
}

async function parseRemote(source: RemoteAudioSource) {
  const options = {
    // duration:false = không quét hết file để tính thời lượng. Định dạng nào ghi
    // sẵn thời lượng trong header (FLAC, MP4, Xing) thì vẫn có; còn lại ước lượng ở trên.
    duration: false,
    skipPostHeaders: true,
  } as const;

  if (source.sizeBytes && source.sizeBytes > 0) {
    const client = createRangeClient(source, source.sizeBytes);
    try {
      const tokenizer = await createRangeTokenizer(client, {
        avoidHeadRequests: true,
        // Mặc định của thư viện là chunk rất nhỏ → hàng chục request mỗi file.
        // Với vài nghìn file thì đó là đường ngắn nhất tới rate limit của provider.
        // Đổi lấy vài chục KB thừa để giảm số request xuống một chữ số.
        initialChunkSize: INITIAL_CHUNK_BYTES,
        minimumChunkSize: MINIMUM_CHUNK_BYTES,
      });
      return await parseFromTokenizer(tokenizer, options);
    } catch (error) {
      client.abort();
      // Có provider/CDN không trả 206 đúng chuẩn. Rơi về cách thô: tải phần đầu file.
      console.warn(
        `Range tokenizer lỗi với ${source.fileName}, thử đọc phần đầu file:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return parseBufferFallback(source);
}

/**
 * Dự phòng: tải ~512KB đầu file rồi parse.
 * Đủ cho MP3/FLAC/OGG (tag nằm ở đầu). MP4/M4A có `moov` ở cuối sẽ thất bại —
 * lúc đó ta chấp nhận và suy metadata từ tên file ở tầng trên.
 */
async function parseBufferFallback(source: RemoteAudioSource) {
  const end = Math.min(
    FALLBACK_HEAD_BYTES,
    source.sizeBytes ?? FALLBACK_HEAD_BYTES,
  );
  const headers = new Headers(source.headers);
  headers.set("Range", `bytes=0-${end - 1}`);

  const res = await fetch(source.url, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Không tải được phần đầu file (${res.status})`);
  }

  return parseBuffer(
    new Uint8Array(await res.arrayBuffer()),
    {
      mimeType: source.mimeType ?? undefined,
      size: source.sizeBytes ?? undefined,
      path: source.fileName,
    },
    { duration: false, skipPostHeaders: true },
  );
}

/* ------------------------------------------------------------------ */
/* Suy metadata từ tên file khi file không có tag                      */
/* ------------------------------------------------------------------ */

/** "03 - Trịnh Công Sơn - Diễm Xưa.mp3" → { trackNo: 3, artist, title } */
export function inferFromPath(
  fileName: string,
  path: string,
): { title: string; artist: string | null; album: string | null; trackNo: number | null } {
  const base = fileName.replace(/\.[^.]+$/, "").trim();

  let trackNo: number | null = null;
  let rest = base;

  const numbered = base.match(/^(\d{1,3})\s*[-._)\]]\s*(.+)$/);
  if (numbered) {
    trackNo = Number(numbered[1]);
    rest = numbered[2].trim();
  }

  let artist: string | null = null;
  let title = rest;
  const dashed = rest.split(/\s+-\s+/);
  if (dashed.length >= 2) {
    artist = dashed[0].trim() || null;
    title = dashed.slice(1).join(" - ").trim();
  }

  // Quy ước thư mục phổ biến: .../<Nghệ sĩ>/<Album>/<bài hát>.mp3
  const segments = path.split("/").filter(Boolean);
  const folders = segments.slice(0, -1);
  const album = folders.at(-1) ?? null;
  if (!artist && folders.length >= 2) artist = folders.at(-2) ?? null;

  return { title: title || base, artist, album, trackNo };
}
