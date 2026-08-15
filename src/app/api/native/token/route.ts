import { headers } from "next/headers";
import { jsonError, toErrorResponse } from "@/lib/http";
import { HandoffCodeError, consumeHandoffCode } from "@/lib/native-handoff";

export const runtime = "nodejs";

/**
 * Đổi mã trao tay lấy session JWT. Vỏ Expo dùng đường này rồi cất token vào SecureStore.
 *
 * POST chứ không GET: mã nằm trong body nên không lọt vào log truy cập của Vercel, và
 * không bị prefetch/duyệt trước làm cháy mã một lần.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    const code = typeof body?.code === "string" ? body.code : "";

    const { token, expiresAt, userId } = await consumeHandoffCode(
      await headers(),
      code,
    );
    return Response.json({ token, expiresAt, userId });
  } catch (error) {
    if (error instanceof HandoffCodeError) return jsonError(error.message, 400);
    return toErrorResponse(error);
  }
}
