"use client";

import { useSyncExternalStore } from "react";

/** Tín hiệu duy nhất phân biệt web thường với WebView2 của Tauri. */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const subscribe = () => () => undefined;

/**
 * `null` trong HTML server và lượt hydrate đầu tiên; sau đó mới trả môi trường thật.
 * Nhờ vậy React không phải đối chiếu cây web với cây native khác cấu trúc.
 */
export function useTauriRuntime(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    isTauriRuntime,
    () => null,
  );
}
