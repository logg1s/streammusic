import { requireUserId } from "@/lib/auth";
import { jsonError, toErrorResponse } from "@/lib/http";
import { createPlaylist, listPlaylists } from "@/lib/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lưu hàng đợi hiện tại (thư viện lẫn YouTube) thành một playlist. */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      name?: string;
      items?: Array<{ id?: string }>;
      seedLabel?: string | null;
    };

    const name = body.name?.trim();
    if (!name) return jsonError("Thiếu tên playlist", 400);

    const ids = (body.items ?? [])
      .map((item) => item?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    if (ids.length === 0) return jsonError("Hàng đợi đang trống", 400);

    const id = await createPlaylist(userId, name, ids, body.seedLabel ?? null);
    return Response.json({ id });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Danh sách playlist để hộp chọn "Thêm vào playlist" dựng menu. */
export async function GET() {
  try {
    const userId = await requireUserId();
    return Response.json({ playlists: await listPlaylists(userId) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
