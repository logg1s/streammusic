import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { resolveAudio, type ResolvedAudio } from "@/lib/youtube/resolve";

// Node runtime: cần streaming body và fetch có header Range tuỳ ý.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Proxy chuẩn hoá byte-range cho audio YouTube.
 *
 * Vì sao phải có nó, đo được:
 * - googlevideo trả `403` cho request KHÔNG có `Range` và cho range mở (`bytes=0-`).
 *   Thẻ `<audio>` của Chrome lại gửi đúng `bytes=0-` → cắm URL trực tiếp là `error 4`.
 * - googlevideo không có `access-control-allow-origin` nên Service Worker cũng không
 *   đọc được body để tự dựng `206`. Chỉ server làm được.
 *
 * Cách cắt lô giống `/api/stream/[trackId]`: mỗi response là MỘT lượt fetch có biên,
 * không giữ kết nối sống suốt bài (Vercel cắt ở 300s và tính tiền theo thời gian).
 */

/** Lô đầu lớn để Chrome đủ dữ liệu phát ngay; audio ~4 MB nên thường là cả bài. */
const FIRST_CHUNK_BYTES = 6 * 1024 * 1024;
/** Các lô sau chỉ để buffer đi trước. */
const NEXT_CHUNK_BYTES = 2 * 1024 * 1024;

/** Resolve lại trước khi URL hết hạn 10 phút — tránh vỡ giữa bài. */
const EXPIRY_MARGIN_MS = 600_000;

const cache = new Map<string, ResolvedAudio>();

function cached(videoId: string): ResolvedAudio | null {
  const hit = cache.get(videoId);
  if (!hit) return null;
  if (hit.expiresAt - EXPIRY_MARGIN_MS < Date.now()) {
    cache.delete(videoId);
    return null;
  }
  return hit;
}

/**
 * `content_length` là trường tuỳ chọn. Thiếu thì hỏi đúng 1 byte đầu: googlevideo
 * trả `content-range: bytes 0-0/<total>` nên vẫn biết được tổng kích thước.
 */
async function totalBytesOf(audio: ResolvedAudio): Promise<number | null> {
  if (audio.totalBytes !== null) return audio.totalBytes;

  const probe = await fetch(audio.url, {
    headers: { range: "bytes=0-0" },
    cache: "no-store",
  });
  void probe.body?.cancel();
  const total = Number(
    /\/(\d+)$/.exec(probe.headers.get("content-range") ?? "")?.[1],
  );
  if (!Number.isFinite(total) || total <= 0) return null;

  audio.totalBytes = total;
  return total;
}

async function load(videoId: string): Promise<ResolvedAudio> {
  const audio = cached(videoId) ?? (await resolveAudio(videoId));
  cache.set(videoId, audio);
  await totalBytesOf(audio);
  return audio;
}

/** Chỉ một khoảng đơn — đúng thứ thẻ media gửi. Dạng hậu tố `bytes=-500` cũng nhận. */
function parseRange(
  header: string | null,
  total: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (rawStart === "") {
    return { start: Math.max(0, total - Number(rawEnd)), end: total - 1 };
  }
  return {
    start: Number(rawStart),
    end: rawEnd === "" ? total - 1 : Math.min(Number(rawEnd), total - 1),
  };
}

/**
 * googlevideo `403` cả range mở lẫn range phủ đúng cả file (đo được: `bytes=0-` và
 * `bytes=0-<total-1>` đều 403, `bytes=0-1048575` thì `206`). Nên mọi lượt lên
 * upstream đều cắt thành lô nhỏ, rồi nối lại thành một response duy nhất.
 */
const UPSTREAM_CHUNK_BYTES = 1024 * 1024;

/** Một lô byte từ googlevideo. `null` = vẫn bị chặn sau khi resolve lại một lần. */
async function fetchChunk(
  videoId: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array> | null> {
  const audio = await load(videoId);
  let upstream = await fetch(audio.url, {
    headers: { range: `bytes=${start}-${end}` },
    cache: "no-store",
  });

  if (upstream.status !== 206 && upstream.status !== 200) {
    // URL có thể vừa hết hạn hoặc bị thu hồi → resolve lại đúng một lần.
    void upstream.body?.cancel();
    cache.delete(videoId);
    const fresh = await load(videoId);
    upstream = await fetch(fresh.url, {
      headers: { range: `bytes=${start}-${end}` },
      cache: "no-store",
    });
  }

  if (upstream.status !== 206 && upstream.status !== 200) {
    void upstream.body?.cancel();
    console.warn(
      `googlevideo ${upstream.status} cho ${videoId} bytes=${start}-${end}`,
    );
    return null;
  }
  return upstream.body;
}

/**
 * Nối các lô upstream thành một dòng byte liền mạch cho đúng khoảng đã hứa trong
 * `content-range`. Hết lô mà chưa tới `end` thì tự hỏi lô kế tiếp.
 */
function stitchChunks(
  videoId: string,
  first: ReadableStream<Uint8Array>,
  start: number,
  end: number,
): ReadableStream<Uint8Array> {
  let reader = first.getReader();
  let offset = start;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (!done) {
          offset += value.byteLength;
          controller.enqueue(value);
          return;
        }
        if (offset > end) {
          controller.close();
          return;
        }
        const next = await fetchChunk(
          videoId,
          offset,
          Math.min(end, offset + UPSTREAM_CHUNK_BYTES - 1),
        );
        if (!next) {
          controller.error(new Error("YouTube ngắt giữa bài"));
          return;
        }
        reader = next.getReader();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    await requireUserId();
    const { videoId } = await params;

    const audio = await load(videoId);
    const total = audio.totalBytes;
    if (total === null) {
      return jsonError("YouTube không cho biết kích thước file", 502);
    }

    const requested = parseRange(request.headers.get("range"), total) ?? {
      start: 0,
      end: total - 1,
    };
    if (requested.start >= total) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${total}` },
      });
    }

    const budget = requested.start === 0 ? FIRST_CHUNK_BYTES : NEXT_CHUNK_BYTES;
    const start = requested.start;
    const end = Math.min(requested.end, start + budget - 1, total - 1);

    const firstEnd = Math.min(end, start + UPSTREAM_CHUNK_BYTES - 1);
    const first = await fetchChunk(videoId, start, firstEnd);
    if (!first) return jsonError("YouTube từ chối trả byte audio", 502);

    return new Response(stitchChunks(videoId, first, start, end), {
      status: 206,
      headers: {
        "content-type": audio.mimeType,
        "accept-ranges": "bytes",
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${total}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Trình duyệt đôi khi thăm dò bằng HEAD trước khi phát — trả từ cache, không gọi byte. */
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    await requireUserId();
    const { videoId } = await params;
    const audio = await load(videoId);

    const headers = new Headers({
      "content-type": audio.mimeType,
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    if (audio.totalBytes !== null) {
      headers.set("content-length", String(audio.totalBytes));
    }
    return new Response(null, { status: 200, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
