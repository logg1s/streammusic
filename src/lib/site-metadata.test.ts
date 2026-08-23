import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  loginMetadata,
  rootMetadata,
  SITE_URL,
  SOCIAL_IMAGE,
} from "@/lib/site-metadata";

describe("public web metadata", () => {
  it("indexes only the canonical public login page", () => {
    expect(rootMetadata.robots).toMatchObject({ index: false, follow: false });
    expect(loginMetadata.alternates).toEqual({ canonical: "/login" });
    expect(loginMetadata.robots).toMatchObject({ index: true, follow: true });
    expect(sitemap()).toEqual([
      {
        url: new URL("/login", SITE_URL).toString(),
        changeFrequency: "monthly",
        priority: 1,
      },
    ]);

    const policy = robots();
    expect(policy.rules).toMatchObject({
      allow: expect.arrayContaining(["/login", "/brand/", "/favicon.ico"]),
      disallow: "/",
    });
  });

  it("publishes a complete social preview", () => {
    expect(loginMetadata.openGraph).toMatchObject({
      type: "website",
      locale: "vi_VN",
      url: "/login",
      images: [SOCIAL_IMAGE],
    });
    expect(loginMetadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [SOCIAL_IMAGE],
    });
  });

  it("keeps the generated favicon and social card at their declared sizes", async () => {
    const root = process.cwd();
    const favicon = await readFile(path.join(root, "src/app/favicon.ico"));
    expect(favicon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    expect(favicon.readUInt16LE(4)).toBe(4);
    expect(
      Array.from({ length: 4 }, (_, index) => favicon.readUInt8(6 + index * 16)),
    ).toEqual([16, 32, 48, 64]);

    const socialCard = await readFile(
      path.join(root, "public", SOCIAL_IMAGE.url.slice(1)),
    );
    expect(socialCard.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(socialCard.readUInt32BE(16)).toBe(SOCIAL_IMAGE.width);
    expect(socialCard.readUInt32BE(20)).toBe(SOCIAL_IMAGE.height);
  });
});
