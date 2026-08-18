import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { UpdateBanner } from "@/components/update-banner";
import "./globals.css";

// Subset "vietnamese" là bắt buộc — thiếu nó thì ế, ộ, ữ sẽ rơi về font dự phòng.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Vọng — nghe nhạc từ kho lưu trữ của bạn",
  description:
    "Phát nhạc trực tiếp từ Google Drive, Dropbox và OneDrive. Không tải về, không tải lên.",
  /*
    Manifest + display:standalone là điều kiện để phát nền trên iOS: WebKit chỉ cho
    web app đã "Thêm vào Màn hình chính" giữ tiếng khi khoá máy (từ iOS 15.4).
    Trên Android nó chỉ để cài app; Chromium vốn đã cho audio-only chạy nền.
  */
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Vọng",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  /*
    Next chỉ phát `mobile-web-app-capable`, mà WebKit mới nhận tên đó từ Safari 17.4.
    iOS 15.4–17.3 vẫn cần tên cũ, và đó chính là khoảng đã có phát nền standalone.
  */
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: next-themes gắn class theme lên <html> trước khi
    // React hydrate, nên server và client tất yếu khác nhau ở thuộc tính này.
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <UpdateBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
