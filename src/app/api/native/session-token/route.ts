import { headers } from "next/headers";
import { requireUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { mintForUser } from "@/lib/native-handoff";

export const runtime = "nodejs";

/**
 * Phát session JWT cho phiên đang đăng nhập.
 *
 * Vỏ Tauri cần đường này: JS trong WebView không đọc được cookie `httpOnly`, nhưng phía
 * Rust phải có `Authorization: Bearer` để tải `/api/stream/<id>` (bài thư viện) ngoài
 * WebView. Trả token dài hạn 30 ngày như cookie — vỏ xin một lần mỗi phiên chạy.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const minted = await mintForUser(await headers(), userId);
    return Response.json(minted);
  } catch (error) {
    return toErrorResponse(error);
  }
}
