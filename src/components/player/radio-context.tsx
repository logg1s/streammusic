"use client";

import { createContext, useContext, useMemo } from "react";

interface RadioConfig {
  /** Có credential gọi Data API (API key dùng chung hoặc tài khoản đã nối) hay không. */
  enabled: boolean;
  /** Đã nối tài khoản YouTube và token còn sống → gợi ý bám theo gu nhạc thật. */
  personalized: boolean;
}

const RadioConfigContext = createContext<RadioConfig>({
  enabled: false,
  personalized: false,
});

/**
 * Cấu hình radio đọc từ server (env + bảng youtube_accounts) rồi truyền xuống các
 * component client. Không để client tự đoán: nút bấm vào là lỗi thì tệ hơn là không có nút.
 */
export function RadioConfigProvider({
  enabled,
  personalized,
  children,
}: {
  enabled: boolean;
  personalized: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ enabled, personalized }), [enabled, personalized]);
  return <RadioConfigContext value={value}>{children}</RadioConfigContext>;
}

export function useRadioConfig(): RadioConfig {
  return useContext(RadioConfigContext);
}
