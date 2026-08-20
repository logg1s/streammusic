import { NextResponse } from "next/server";
import { jsonError, toErrorResponse } from "@/lib/http";
import { sessionCookieName } from "@/lib/session-token";
import { consumeDevicePairing } from "@/lib/tv-pairing";

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

    const minted = await consumeDevicePairing(
      request.headers,
      deviceCode,
      "web",
    );
    if (!minted) {
      return NextResponse.json({ status: "pending" }, { status: 202 });
    }

    const cookieName = sessionCookieName(request.headers);
    const response = NextResponse.json({ status: "complete" });
    response.cookies.set(cookieName, minted.token, {
      expires: new Date(minted.expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: cookieName.startsWith("__Secure-"),
    });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
