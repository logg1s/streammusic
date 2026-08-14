import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Ảnh bìa album được trích từ tag rồi lưu lên Vercel Blob.
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
  // music-metadata và @tokenizer/range là ESM thuần, chỉ chạy phía server.
  serverExternalPackages: ["music-metadata", "@tokenizer/range"],
};

export default nextConfig;
