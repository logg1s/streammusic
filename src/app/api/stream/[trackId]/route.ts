import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tracks } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/connections";
import { jsonError, toErrorResponse } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { loadStreamSource, rememberStreamUrl } from "@/lib/stream-source";

// Bắt buộc Node runtime (Fluid Compute) — cần streaming body và node:crypto để giải mã token.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Số byte tối đa trả về trong MỘT response.
 *
 * Không có giới hạn này, thẻ <audio> gửi `Range: bytes=0-` và ta stream cả bài —
 * kết nối bị giữ mở suốt thời lượng bài hát (đo được một response sống 3,2 phút).
 * Trên Vercel `maxDuration` là 300s nên bài dài hơn 5 phút sẽ bị cắt giữa chừng,
 * và mỗi lượt nghe bị tính tiền bằng cả thời lượng bài.
 *
 * Lô ĐẦU phải lớn hơn hẳn: đo thực tế cho thấy cắt ngay ở 2MB khiến Chrome phải
 * gọi thêm một lô nữa mới đủ dữ liệu để bắt đầu phát, đội thời gian ra tiếng từ
 * 3,8s lên 7,0s. Mỗi lô tốn một vòng TTFB (~1,3s khi cache đã ấm), nên với lần
 * bấm đầu tiên thì một lô to đáng giá hơn hai lô nhỏ.
 */
const FIRST_CHUNK_BYTES = 6 * 1024 * 1024;
/** Các lô sau chỉ để giữ cho buffer luôn đi trước, không cần lớn. */
const NEXT_CHUNK_BYTES = 2 * 1024 * 1024;

/** Header cần chuyển tiếp nguyên vẹn từ provider về trình duyệt để tua bài chạy đúng. */
const FORWARDED_HEADERS = ["content-type", "etag", "last-modified"];

interface ParsedRange {
  start: number;
  end?: number;
}

/** Chỉ hỗ trợ một khoảng đơn — đúng thứ trình duyệt gửi cho thẻ media. */
function parseRange(header: string | null): ParsedRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // Dạng hậu tố "bytes=-500" (500 byte cuối) — hiếm, để nhánh gọi xử lý riêng.
  if (rawStart === "") return { start: -Number(rawEnd) };

  return {
    start: Number(rawStart),
    end: rawEnd === "" ? undefined : Number(rawEnd),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { trackId } = await params;

    // Một truy vấn join, có cache — thay cho hai lượt select tuần tự trước đây.
    const source = await loadStreamSource(userId, trackId);
    if (!source) return jsonError("Không tìm thấy bài hát", 404);

    const { track, connection } = source;

    // Link tạm thời còn hạn (Dropbox/OneDrive) → khỏi gọi lại API provider mỗi lần tua.
    if (
      track.streamUrlCache &&
      track.streamUrlExpiresAt &&
      track.streamUrlExpiresAt.getTime() > Date.now()
    ) {
      return Response.redirect(track.streamUrlCache, 302);
    }

    const accessToken = await getValidAccessToken(connection);
    const target = await getProvider(connection.provider).resolveStream(
      accessToken,
      track.remoteId,
    );

    if (target.kind === "redirect") {
      rememberStreamUrl(userId, source, target.url, target.expiresAt);
      await getDb()
        .update(tracks)
        .set({
          streamUrlCache: target.url,
          streamUrlExpiresAt: target.expiresAt,
        })
        .where(eq(tracks.id, track.id));
      return Response.redirect(target.url, 302);
    }

    /* Nhánh proxy — hiện chỉ Google Drive, vì Drive bắt buộc header Authorization
       nên thẻ <audio> không thể tự gọi thẳng. Toàn bộ byte đi qua function này. */
    const rawRange = request.headers.get("range");
    const size = track.sizeBytes ?? null;
    /*
      Không có header Range thì coi như client hỏi `bytes=0-`.

      Ban đầu tôi để nhánh này stream cả file vì theo RFC 7233, `206` chỉ hợp lệ khi
      client thực sự hỏi range. Nhưng log production cho thấy vẫn có request thật tới
      đây mà không kèm Range (`GET /api/stream/... 200 in 3.5s`) — nghĩa là đường
      không giới hạn vẫn với tới được, và đó đúng là thứ gây ra kết nối sống hàng
      phút mà cả cơ chế chia lô này sinh ra để loại bỏ. Trả 206 cho một request
      không hỏi range là lệch chuẩn một chút, nhưng mọi trình duyệt đều chấp nhận,
      và đổi lại là không còn đường nào giữ function mở vô hạn.
    */
    const requested = parseRange(rawRange) ?? (size ? { start: 0 } : null);

    const upstreamHeaders = new Headers(target.headers);
    let cappedEnd: number | null = null;
    let start = 0;

    if (requested && requested.start >= 0 && size) {
      start = Math.min(requested.start, size - 1);
      const budget = start === 0 ? FIRST_CHUNK_BYTES : NEXT_CHUNK_BYTES;
      // Giới hạn hai đầu: theo yêu cầu của client và theo trần của lô.
      cappedEnd = Math.min(
        requested.end ?? size - 1,
        start + budget - 1,
        size - 1,
      );
      upstreamHeaders.set("range", `bytes=${start}-${cappedEnd}`);
    } else if (rawRange) {
      // Không biết kích thước file, hoặc dạng range hậu tố → chuyển tiếp nguyên văn.
      upstreamHeaders.set("range", rawRange);
    }

    const upstream = await fetch(target.url, {
      headers: upstreamHeaders,
      // Bỏ cache của fetch: file nhạc lớn, không có lý do giữ trong bộ nhớ function.
      cache: "no-store",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return jsonError(
        `Provider trả về ${upstream.status} khi tải file`,
        upstream.status === 404 ? 404 : 502,
      );
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("content-type") && track.mimeType) {
      headers.set("content-type", track.mimeType);
    }
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=0, must-revalidate");

    if (cappedEnd !== null && size) {
      // Content-Range báo tổng kích thước thật, nên trình duyệt biết còn phần sau
      // và tự xin tiếp thay vì tưởng file đã hết.
      headers.set("content-range", `bytes ${start}-${cappedEnd}/${size}`);
      headers.set("content-length", String(cappedEnd - start + 1));
      return new Response(upstream.body, { status: 206, headers });
    }

    // Không cắt được (thiếu size hoặc client không hỏi range) → giữ hành vi cũ.
    for (const name of ["content-length", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Trả lời HEAD bằng thông tin đã có sẵn trong DB, không đụng tới provider.
 * Trình duyệt thỉnh thoảng thăm dò bằng HEAD trước khi phát.
 */
export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ trackId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { trackId } = await params;

    const source = await loadStreamSource(userId, trackId);
    if (!source) return new Response(null, { status: 404 });

    const headers = new Headers({
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=0, must-revalidate",
    });
    if (source.track.mimeType) {
      headers.set("content-type", source.track.mimeType);
    }
    if (source.track.sizeBytes) {
      headers.set("content-length", String(source.track.sizeBytes));
    }

    return new Response(null, { status: 200, headers });
  } catch (error) {
    return toErrorResponse(error);
  }
}
