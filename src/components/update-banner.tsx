"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import type { LatestRelease } from "@vong/shared";
import { isNewerVersion, isVongReleaseUrl } from "@vong/shared";
import { useTauriRuntime } from "@/lib/runtime";

const DISMISSED_KEY = "vong-dismissed-update";

/** Chỉ WebView2 thấy banner; web thường không fetch GitHub Release. */
export function UpdateBanner() {
  const native = useTauriRuntime();
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    Promise.all([
      fetch("/api/releases/latest").then(async (response) => {
        if (!response.ok) throw new Error("latest release unavailable");
        return (await response.json()) as LatestRelease;
      }),
      import("@tauri-apps/api/app").then(({ getVersion }) => getVersion()),
    ])
      .then(([latest, current]) => {
        if (
          alive &&
          isNewerVersion(latest.version, current) &&
          localStorage.getItem(DISMISSED_KEY) !== latest.version
        ) {
          setRelease(latest);
        }
      })
      .catch(() => {
        // Kiểm tra cập nhật không được làm gián đoạn nghe nhạc hay đăng nhập.
      });
    return () => {
      alive = false;
    };
  }, [native]);

  if (!release) return null;
  const downloadUrl = release.windowsUrl ?? release.pageUrl;
  if (!isVongReleaseUrl(downloadUrl)) return null;

  return (
    <aside
      role="status"
      className="fixed left-1/2 top-3 z-50 flex w-[min(92vw,34rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-2xl"
    >
      <Download className="size-5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Có Vọng {release.version}</p>
        <p className="truncate text-xs text-muted-foreground">
          Bản Windows mới đã sẵn sàng trên GitHub.
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          const { openUrl } = await import("@tauri-apps/plugin-opener");
          await openUrl(downloadUrl);
        }}
        className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
      >
        Tải bản cập nhật
      </button>
      <button
        type="button"
        aria-label="Để sau"
        title="Để sau"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, release.version);
          setRelease(null);
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover"
      >
        <X className="size-4" />
      </button>
    </aside>
  );
}
