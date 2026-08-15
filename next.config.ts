import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Ảnh bìa album được trích từ tag rồi lưu lên Vercel Blob.
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
      {
        // Ảnh bìa bài YouTube trong hàng đợi radio.
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
  // music-metadata và @tokenizer/range là ESM thuần, chỉ chạy phía server.
  // youtubei.js dùng `node:` builtins nên bundler không được đóng gói nó.
  serverExternalPackages: ["music-metadata", "@tokenizer/range", "youtubei.js"],
};

export default nextConfig;
