import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const originalE2eVersion = process.env.VONG_E2E_LATEST_VERSION;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalE2eVersion === undefined) {
    delete process.env.VONG_E2E_LATEST_VERSION;
  } else {
    process.env.VONG_E2E_LATEST_VERSION = originalE2eVersion;
  }
});

function mockGithub(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(body, { status }),
  );
}

describe("latest release route", () => {
  it("returns the trusted phone, TV, and Windows assets", async () => {
    delete process.env.VONG_E2E_LATEST_VERSION;
    mockGithub({
      tag_name: "v0.8.0",
      html_url: "https://github.com/logg1s/streammusic/releases/tag/v0.8.0",
      assets: [
        {
          name: "Vong_0.8.0_arm64.apk",
          browser_download_url:
            "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_arm64.apk",
        },
        {
          name: "Vong_0.8.0_android-tv_universal.apk",
          browser_download_url:
            "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_android-tv_universal.apk",
        },
        {
          name: "Vong_0.8.0_x64-setup.exe",
          browser_download_url:
            "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_x64-setup.exe",
        },
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: "0.8.0",
      pageUrl: "https://github.com/logg1s/streammusic/releases/tag/v0.8.0",
      androidUrl:
        "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_arm64.apk",
      androidTvUrl:
        "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_android-tv_universal.apk",
      windowsUrl:
        "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.8.0_x64-setup.exe",
    });
  });

  it.each([
    {
      tag_name: "v0.8",
      html_url: "https://github.com/logg1s/streammusic/releases/tag/v0.8",
    },
    {
      tag_name: "v0.8.0",
      html_url: "https://example.com/logg1s/streammusic/releases/tag/v0.8.0",
    },
  ])("returns 502 for invalid release metadata", async (body) => {
    delete process.env.VONG_E2E_LATEST_VERSION;
    mockGithub(body);
    const response = await GET();
    expect(response.status).toBe(502);
  });

  it("drops an asset URL outside the repository release", async () => {
    delete process.env.VONG_E2E_LATEST_VERSION;
    mockGithub({
      tag_name: "v0.8.0",
      html_url: "https://github.com/logg1s/streammusic/releases/tag/v0.8.0",
      assets: [
        {
          name: "Vong_0.8.0_android-tv_universal.apk",
          browser_download_url: "https://example.com/tv.apk",
        },
      ],
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).androidTvUrl).toBeNull();
  });

  it("does not publish an artifact from a different version", async () => {
    delete process.env.VONG_E2E_LATEST_VERSION;
    mockGithub({
      tag_name: "v0.8.0",
      html_url: "https://github.com/logg1s/streammusic/releases/tag/v0.8.0",
      assets: [
        {
          name: "Vong_0.7.0_android-tv_universal.apk",
          browser_download_url:
            "https://github.com/logg1s/streammusic/releases/download/v0.8.0/Vong_0.7.0_android-tv_universal.apk",
        },
      ],
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).androidTvUrl).toBeNull();
  });

  it("returns 502 for an upstream failure", async () => {
    delete process.env.VONG_E2E_LATEST_VERSION;
    mockGithub({}, 503);
    const response = await GET();
    expect(response.status).toBe(502);
  });
});
