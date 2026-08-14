import { requireUserId } from "@/lib/auth";
import { connectionWithToken } from "@/lib/connections";
import { getProvider } from "@/lib/providers";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** Folder picker: liệt kê một cấp thư mục. `?folderId=` trống nghĩa là thư mục gốc. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const loaded = await connectionWithToken(userId, id);
    if (!loaded) return jsonError("Không tìm thấy kết nối", 404);

    const provider = getProvider(loaded.connection.provider);
    const requested = new URL(request.url).searchParams.get("folderId");
    // Dropbox dùng chuỗi rỗng cho thư mục gốc nên phải phân biệt "không truyền" với "rỗng".
    const folderId = requested === null ? provider.rootFolderId : requested;

    const entries = await provider.listFolder(loaded.accessToken, folderId);
    return Response.json({
      folderId,
      rootFolderId: provider.rootFolderId,
      entries: entries.filter((e) => e.isFolder),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
