import { appOrigin, toErrorResponse } from "@/lib/http";
import {
  startTvPairing,
  TvPairingRateLimitError,
} from "@/lib/tv-pairing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const challenge = await startTvPairing(request.headers);
    return Response.json({
      ...challenge,
      verificationUri: `${appOrigin(request)}/tv`,
      intervalMs: 3_000,
    });
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
