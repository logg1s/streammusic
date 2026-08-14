import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scanJobs } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { loadConnection } from "@/lib/connections";
import { jsonError, toErrorResponse } from "@/lib/http";
import { startScan } from "@/lib/scanner";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Bắt đầu quét: liệt kê toàn bộ file audio rồi đẩy vào hàng đợi scan_items. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { connectionId?: string };
    if (!body.connectionId) return jsonError("Thiếu connectionId", 400);

    const connection = await loadConnection(userId, body.connectionId);
    if (!connection) return jsonError("Không tìm thấy kết nối", 404);

    const result = await startScan(userId, connection);
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Lịch sử các lần quét gần đây. */
export async function GET() {
  try {
    const userId = await requireUserId();
    const jobs = await getDb()
      .select()
      .from(scanJobs)
      .where(eq(scanJobs.userId, userId))
      .orderBy(desc(scanJobs.startedAt))
      .limit(10);
    return Response.json({ jobs });
  } catch (error) {
    return toErrorResponse(error);
  }
}
