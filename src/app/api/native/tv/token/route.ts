import { consumeTvPairing } from "@/lib/tv-pairing";
import { jsonError, toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const deviceCode =
      typeof body === "object" &&
      body !== null &&
      "deviceCode" in body &&
      typeof body.deviceCode === "string"
        ? body.deviceCode
        : "";
    if (!deviceCode) return jsonError("Thiếu mã thiết bị", 400);

    const minted = await consumeTvPairing(request.headers, deviceCode);
    if (!minted) {
      return Response.json({ status: "pending" }, { status: 202 });
    }
    return Response.json({ status: "complete", ...minted });
  } catch (error) {
    return toErrorResponse(error);
  }
}
