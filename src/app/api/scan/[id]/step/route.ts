import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scanJobs } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { processBatch } from "@/lib/scanner";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

/**
 * Xử lý một lô file trong hàng đợi.
 *
 * Client gọi lặp endpoint này cho tới khi `done`. Chia lô như vậy vì function
 * trên Vercel tối đa 300s — không thể đọc tag của vài nghìn file trong một lần gọi.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const requested = Number(
      new URL(request.url).searchParams.get("batchSize") ?? DEFAULT_BATCH_SIZE,
    );
    const batchSize = Math.min(
      Math.max(Number.isFinite(requested) ? requested : DEFAULT_BATCH_SIZE, 1),
      MAX_BATCH_SIZE,
    );

    const [job] = await getDb()
      .select()
      .from(scanJobs)
      .where(and(eq(scanJobs.id, id), eq(scanJobs.userId, userId)))
      .limit(1);
    if (!job) return jsonError("Không tìm thấy job", 404);

    if (job.status === "cancelled" || job.status === "failed") {
      return Response.json({ done: true, status: job.status, job });
    }

    const result = await processBatch(userId, id, batchSize);

    const [updated] = await getDb()
      .select()
      .from(scanJobs)
      .where(eq(scanJobs.id, id))
      .limit(1);

    return Response.json({ ...result, job: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
