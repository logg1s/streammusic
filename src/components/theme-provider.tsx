"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      // Đắm chìm kiểu Spotify: nền tối làm chủ đạo. Người dùng vẫn đổi Sáng/Hệ thống được.
      defaultTheme="dark"
      enableSystem
      // Tắt transition trong đúng khoảnh khắc đổi theme, nếu không mọi màu sẽ
      // cùng nhau chạy animation và trông như màn hình bị lỗi.
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
