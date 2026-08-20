import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./safe-redirect";

describe("safeInternalRedirect", () => {
  it("keeps a same-origin path, query, and fragment", () => {
    expect(safeInternalRedirect("/library?tab=favorites#song")).toBe(
      "/library?tab=favorites#song",
    );
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "/\\\\evil.example/",
    "\\\\evil.example/",
    "\n//evil.example/",
    "\thttps://evil.example/",
  ])("rejects an external or browser-normalized callback: %s", (value) => {
    expect(safeInternalRedirect(value)).toBe("/");
  });
});
