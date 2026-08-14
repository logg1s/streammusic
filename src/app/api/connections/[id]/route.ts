import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    // ON DELETE CASCADE lo phần scan_roots / tracks / scan_jobs của connection này.
    const deleted = await getDb()
      .delete(connections)
      .where(and(eq(connections.id, id), eq(connections.userId, userId)))
      .returning({ id: connections.id });

    if (deleted.length === 0) return jsonError("Không tìm thấy kết nối", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
