"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Tắt transition trong đúng khoảnh khắc đổi theme, nếu không mọi màu sẽ
      // cùng nhau chạy animation và trông như màn hình bị lỗi.
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
