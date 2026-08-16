import { getDb } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { jsonError, toErrorResponse } from "@/lib/http";
import { isAnalyticsEvent, sanitizeProps } from "@vong/shared";
import type { AnalyticsShell } from "@vong/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nhận telemetry ẩn danh từ ba shell.
 *
 * Route này **không yêu cầu đăng nhập** — và đó là chủ đích, không phải thiếu sót:
 * bắt đăng nhập nghĩa là mọi sự kiện đều đi kèm một phiên có danh tính, đúng thứ mà
 * thiết kế này tránh. Đổi lại phải tự phòng thân: allowlist tên sự kiện, chặn kích
 * thước gói, và làm sạch props bằng đúng bộ luật mà client dùng (`@vong/shared`).
 */

/** Trên ngưỡng này thì không phải app thật đang gửi. */
const MAX_EVENTS_PER_BATCH = 50;
const MAX_BODY_BYTES = 32 * 1024;

const SHELLS = new Set<AnalyticsShell>(["web", "android", "windows"]);

/**
 * Đọc thân request nhưng dừng ngay khi vượt hạn mức.
 *
 * KHÔNG tin `content-length`: header đó do client khai, và một client bỏ trống nó sẽ đi
 * thẳng vào `request.json()` với thân không giới hạn. Trên một route cố tình không yêu
 * cầu đăng nhập thì đó là bề mặt tấn công thật, nên phải đếm byte thực nhận.
 *
 * Trả `null` khi vượt hạn mức, và huỷ luôn stream để không đọc nốt phần còn lại.
 */
async function readBounded(
  request: Request,
  limit: number,
): Promise<string | null> {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(joined);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Đồng hồ máy người dùng có thể lệch; ngoài khung này thì lấy giờ server. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function parseClientTs(value: unknown, receivedAt: Date): Date {
  if (typeof value !== "string") return receivedAt;
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return receivedAt;
  if (Math.abs(ts.getTime() - receivedAt.getTime()) > MAX_CLOCK_SKEW_MS) {
    return receivedAt;
  }
  return ts;
}

export async function POST(request: Request) {
  try {
    const raw = await readBounded(request, MAX_BODY_BYTES);
    if (raw === null) return jsonError("Gói quá lớn", 413);

    let body: {
      installId?: unknown;
      shell?: unknown;
      appVersion?: unknown;
      events?: unknown;
    };
    try {
      body = JSON.parse(raw);
    } catch {
      // JSON hỏng là lỗi của client, không phải lỗi server — đừng để nó thành 500.
      return jsonError("Thân request không phải JSON hợp lệ", 400);
    }
    if (!body || typeof body !== "object") return jsonError("Thân rỗng", 400);

    const installId =
      typeof body.installId === "string" && UUID_RE.test(body.installId)
        ? body.installId
        : null;
    if (!installId) return jsonError("installId không hợp lệ", 400);

    const shell = body.shell as AnalyticsShell;
    if (!SHELLS.has(shell)) return jsonError("shell không hợp lệ", 400);

    const appVersion =
      typeof body.appVersion === "string" && body.appVersion.length <= 32
        ? body.appVersion
        : null;

    if (!Array.isArray(body.events)) return jsonError("Thiếu events", 400);
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return jsonError("Quá nhiều sự kiện trong một gói", 413);
    }

    const receivedAt = new Date();
    const rows = [];
    for (const raw of body.events) {
      if (!raw || typeof raw !== "object") continue;
      const event = raw as Record<string, unknown>;

      // Tên lạ bị bỏ im lặng chứ không làm hỏng cả gói: một bản app cũ gửi sự kiện đã
      // gỡ tên không nên khiến các sự kiện còn lại của nó mất theo.
      if (typeof event.name !== "string" || !isAnalyticsEvent(event.name)) continue;
      if (typeof event.sessionId !== "string" || !UUID_RE.test(event.sessionId)) {
        continue;
      }

      rows.push({
        installId,
        sessionId: event.sessionId,
        shell,
        appVersion,
        name: event.name,
        props: sanitizeProps(event.props),
        clientTs: parseClientTs(event.clientTs, receivedAt),
      });
    }

    if (rows.length > 0) await getDb().insert(analyticsEvents).values(rows);

    return new Response(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
