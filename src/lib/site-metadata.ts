import type { Metadata } from "next";

export const SITE_URL = new URL("https://streammusic.vercel.app");
export const SITE_NAME = "Vọng";
export const SITE_TITLE = "Vọng — nghe nhạc từ đám mây và YouTube";
export const SITE_DESCRIPTION =
  "Nghe nhạc trực tiếp từ Google Drive, Dropbox, OneDrive và YouTube trên web, Android, Android TV và Windows.";

export const SOCIAL_IMAGE = {
  url: "/brand/vong-social-card.png",
  width: 1200,
  height: 630,
  alt: "Vọng — Nhạc của bạn, ở nguyên chỗ cũ",
} as const;

export const rootMetadata: Metadata = {
  metadataBase: SITE_URL,
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "nghe nhạc đám mây",
    "Google Drive music player",
    "Dropbox music player",
    "OneDrive music player",
    "YouTube Music",
    "Android TV music player",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "music",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const loginMetadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/login" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: "/login",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};
