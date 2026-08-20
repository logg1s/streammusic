import QRCode from "qrcode";
import { appOrigin, jsonError, toErrorResponse } from "@/lib/http";
import {
  inspectDevicePairing,
  normalizeTvPairingCode,
  TvPairingCodeError,
} from "@/lib/tv-pairing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const code = normalizeTvPairingCode(
      new URL(request.url).searchParams.get("code") ?? "",
    );
    if (code.length !== 10) return jsonError("Mã ghép nối không hợp lệ", 400);
    await inspectDevicePairing(code);

    const verificationUrl = `${appOrigin(request)}/pair?code=${encodeURIComponent(
      `${code.slice(0, 5)}-${code.slice(5)}`,
    )}`;
    const png = await QRCode.toBuffer(verificationUrl, {
      type: "png",
      width: 360,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#171314", light: "#FFFFFF" },
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "cache-control": "public, max-age=600, s-maxage=600, immutable",
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof TvPairingCodeError) {
      return jsonError("Mã ghép nối không hợp lệ hoặc đã hết hạn", 404);
    }
    return toErrorResponse(error);
  }
}
