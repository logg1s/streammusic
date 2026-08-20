import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  consume: vi.fn(),
}));

vi.mock("@/lib/tv-pairing", () => ({
  consumeDevicePairing: harness.consume,
}));

vi.mock("@/lib/session-token", () => ({
  sessionCookieName: () => "__Secure-authjs.session-token",
}));

vi.mock("@/lib/http", () => ({
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
  toErrorResponse: (error: unknown) =>
    Response.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    ),
}));

import { POST } from "./route";

describe("web pairing token route", () => {
  beforeEach(() => {
    harness.consume.mockReset();
  });

  it("sets the paired web session only as a secure HttpOnly cookie", async () => {
    harness.consume.mockResolvedValue({
      token: "paired-session-token",
      userId: "user-1",
      expiresAt: Date.now() + 60_000,
    });

    const request = new Request("https://vong.example/api/pairing/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: "x".repeat(43) }),
    });
    const response = await POST(request);
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "complete" });
    expect(harness.consume).toHaveBeenCalledWith(
      request.headers,
      "x".repeat(43),
      "web",
    );
    expect(cookie).toContain("__Secure-authjs.session-token=paired-session-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("user-1");
  });

  it("keeps an unapproved challenge pending without setting a cookie", async () => {
    harness.consume.mockResolvedValue(null);
    const response = await POST(
      new Request("https://vong.example/api/pairing/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: "x".repeat(43) }),
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
