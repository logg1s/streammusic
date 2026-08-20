import { devicePairingResponse } from "@/lib/device-pairing-response";
import { toErrorResponse } from "@/lib/http";
import {
  startDevicePairing,
  TvPairingRateLimitError,
} from "@/lib/tv-pairing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const challenge = await startDevicePairing(request.headers, "web");
    return Response.json(devicePairingResponse(request, challenge));
  } catch (error) {
    if (error instanceof TvPairingRateLimitError) {
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "retry-after": String(error.retryAfterSeconds) },
        },
      );
    }
    return toErrorResponse(error);
  }
}
