import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/login",
        "/brand/",
        "/favicon.ico",
        "/icon-192.png",
        "/icon-512.png",
        "/apple-touch-icon.png",
        "/manifest.webmanifest",
      ],
      disallow: "/",
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
    host: SITE_URL.origin,
  };
}
