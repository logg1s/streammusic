import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scanRoots } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { loadConnection } from "@/lib/connections";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await loadConnection(userId, id)))
      return jsonError("Không tìm thấy kết nối", 404);

    const roots = await getDb()
      .select()
      .from(scanRoots)
      .where(eq(scanRoots.connectionId, id));
    return Response.json({ roots });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Thêm một thư mục vào danh sách sẽ được quét. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await loadConnection(userId, id)))
      return jsonError("Không tìm thấy kết nối", 404);

    const body = (await request.json()) as {
      remoteId?: string;
      path?: string;
      name?: string;
    };
    // remoteId rỗng là hợp lệ (thư mục gốc Dropbox) → chỉ chặn undefined.
    if (body.remoteId === undefined || !body.name) {
      return jsonError("Thiếu remoteId hoặc name", 400);
    }

    const [root] = await getDb()
      .insert(scanRoots)
      .values({
        connectionId: id,
        remoteId: body.remoteId,
        path: body.path ?? body.name,
        name: body.name,
      })
      .onConflictDoUpdate({
        target: [scanRoots.connectionId, scanRoots.remoteId],
        set: { name: body.name, path: body.path ?? body.name },
      })
      .returning();

    return Response.json({ root });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    if (!(await loadConnection(userId, id)))
      return jsonError("Không tìm thấy kết nối", 404);

    const rootId = new URL(request.url).searchParams.get("rootId");
    if (!rootId) return jsonError("Thiếu rootId", 400);

    await getDb()
      .delete(scanRoots)
      .where(and(eq(scanRoots.id, rootId), eq(scanRoots.connectionId, id)));
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
