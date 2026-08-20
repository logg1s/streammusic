import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http", () => ({
  appOrigin: () => "https://vong.example",
}));

import { devicePairingResponse } from "./device-pairing-response";

describe("devicePairingResponse", () => {
  it("puts only the short public code in verification and QR URLs", () => {
    const deviceCode = "secret-device-credential-that-must-stay-on-the-target";
    const response = devicePairingResponse(
      new Request("https://internal.invalid/api/pairing/start"),
      {
        deviceCode,
        userCode: "ABCDE23456",
        displayCode: "ABCDE-23456",
        expiresAt: Date.now() + 60_000,
        target: "web",
      },
    );

    expect(response.verificationUri).toBe("https://vong.example/pair");
    expect(response.verificationUriComplete).toContain("ABCDE-23456");
    expect(response.qrImageUri).toContain("ABCDE23456");
    expect(response.verificationUriComplete).not.toContain(deviceCode);
    expect(response.qrImageUri).not.toContain(deviceCode);
  });
});
