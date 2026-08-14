import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scanJobs } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const [job] = await getDb()
      .select()
      .from(scanJobs)
      .where(and(eq(scanJobs.id, id), eq(scanJobs.userId, userId)))
      .limit(1);

    if (!job) return jsonError("Không tìm thấy job", 404);
    return Response.json({ job });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Dừng job đang chạy. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const updated = await getDb()
      .update(scanJobs)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(scanJobs.id, id), eq(scanJobs.userId, userId)))
      .returning({ id: scanJobs.id });

    if (updated.length === 0) return jsonError("Không tìm thấy job", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
