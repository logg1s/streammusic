import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: new URL("/login", SITE_URL).toString(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
