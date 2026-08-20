import { appOrigin } from "@/lib/http";
import type { TvPairingChallenge } from "@/lib/tv-pairing";

/** Public challenge data shared by TV and web targets. Never include deviceCode in a URL. */
export function devicePairingResponse(
  request: Request,
  challenge: TvPairingChallenge,
) {
  const origin = appOrigin(request);
  const verificationUri = `${origin}/pair`;
  const verificationUriComplete = `${verificationUri}?code=${encodeURIComponent(challenge.displayCode)}`;
  const qrImageUri = `${origin}/api/pairing/qr?code=${encodeURIComponent(challenge.userCode)}`;

  return {
    ...challenge,
    verificationUri,
    verificationUriComplete,
    qrImageUri,
    intervalMs: 3_000,
  };
}
