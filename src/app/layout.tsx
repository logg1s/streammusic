import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { UpdateBanner } from "@/components/update-banner";
import { rootMetadata } from "@/lib/site-metadata";
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

/*
  Metadata mặc định là noindex vì hầu hết route chứa thư viện cá nhân. Trang
  /login ghi đè để trở thành URL công khai duy nhất được index.
*/
export const metadata: Metadata = rootMetadata;

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
