"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw } from "lucide-react";

export interface YoutubeAccountView {
  channelTitle: string;
  status: "active" | "needs_reauth";
  /** Đã định dạng sẵn ở server để client và server render ra cùng một chuỗi. */
  tasteSyncedAt: string | null;
}

export function YoutubeLink({
  account,
  likedCount,
  artistCount,
  configured,
}: {
  account: YoutubeAccountView | null;
  likedCount: number;
  artistCount: number;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Đồng bộ thất bại");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đồng bộ thất bại");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm("Bỏ liên kết YouTube? Gu nhạc đã đồng bộ sẽ bị xoá.")) return;
    setBusy(true);
    setError(null);
    await fetch("/api/youtube/link", { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  return (
    <section className="mb-10">
      <h2 className="eyebrow mb-3">Gu nhạc YouTube</h2>

      {account ? (
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
            <div className="min-w-0">
              <p className="readout">YouTube</p>
              <p className="mt-1 truncate text-sm text-foreground">
                {account.channelTitle}
              </p>
              <p className="readout mt-1">
                {likedCount} bài đã thích · {artistCount} nghệ sĩ trong gu ·
                đồng bộ {account.tasteSyncedAt ?? "chưa"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {account.status === "needs_reauth" ? (
                <a
                  href="/api/youtube/oauth/authorize"
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground"
                >
                  Cấp quyền lại
                </a>
              ) : (
                <button
                  type="button"
                  onClick={sync}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs text-foreground transition-colors hover:border-accent hover:text-accent-text disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {busy ? "Đang đồng bộ" : "Đồng bộ lại gu nhạc"}
                </button>
              )}

              <button
                type="button"
                onClick={unlink}
                disabled={busy}
                className="rounded-full px-3 py-1.5 text-xs text-subtle transition-colors hover:text-danger disabled:opacity-50"
              >
                Bỏ liên kết
              </button>
            </div>
          </div>

          {account.status === "needs_reauth" && (
            <p className="border-t border-danger/40 px-4 py-3 text-xs leading-relaxed text-danger">
              Liên kết YouTube đã hết quyền truy cập. Google thu hồi refresh
              token sau 7 ngày khi app còn ở chế độ Testing — đây là hành vi
              bình thường, không phải lỗi. Radio vẫn chạy, chỉ là chưa cá nhân
              hoá.
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="border-t border-border px-4 py-3 text-xs text-danger"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Nối tài khoản YouTube để radio bám theo gu nhạc của bạn — video đã
            thích và kênh đã đăng ký.
          </p>
          {configured ? (
            <a
              href="/api/youtube/oauth/authorize"
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent-text"
            >
              <Plus className="size-3.5" />
              Nối YouTube
            </a>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Điền{" "}
              <code className="font-mono text-xs text-foreground">
                AUTH_GOOGLE_ID
              </code>{" "}
              và{" "}
              <code className="font-mono text-xs text-foreground">
                AUTH_GOOGLE_SECRET
              </code>{" "}
              vào <code className="font-mono text-xs text-foreground">.env.local</code>{" "}
              rồi khởi động lại máy chủ.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
