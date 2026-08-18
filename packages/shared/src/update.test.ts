import { describe, expect, it } from "vitest";
import { isNewerVersion, isVongReleaseUrl } from "./update";

describe("isNewerVersion", () => {
  it.each([
    ["0.5.1", "0.5.0"],
    ["0.6.0", "0.5.9"],
    ["v1.0.0", "0.99.99"],
  ])("nhận %s mới hơn %s", (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(true);
  });

  it.each([
    ["0.5.0", "0.5.0"],
    ["0.4.9", "0.5.0"],
    ["latest", "0.5.0"],
  ])("không coi %s là mới hơn %s", (latest, current) => {
    expect(isNewerVersion(latest, current)).toBe(false);
  });
});

describe("isVongReleaseUrl", () => {
  it("chỉ nhận HTTPS release của đúng repository", () => {
    expect(
      isVongReleaseUrl(
        "https://github.com/logg1s/streammusic/releases/download/v0.5.0/Vong.apk",
      ),
    ).toBe(true);
    expect(isVongReleaseUrl("https://example.com/Vong.apk")).toBe(false);
    expect(
      isVongReleaseUrl("https://github.com/other/repo/releases/download/x/a"),
    ).toBe(false);
  });
});
