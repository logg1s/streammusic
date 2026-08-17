"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Folder, Loader2, Plus, RefreshCw, X } from "lucide-react";
import type { StorageProviderId } from "@/db/schema";
import { PROVIDER_LABEL } from "@/lib/provider-labels";
import { cn, formatNumber } from "@/lib/utils";

interface RootView {
  id: string;
  remoteId: string;
  name: string;
  path: string;
}

export interface ConnectionView {
  id: string;
  provider: StorageProviderId;
  label: string;
  status: "active" | "needs_reauth";
  trackCount: number;
  roots: RootView[];
}

interface ScanState {
  phase: "listing" | "processing" | "done" | "error";
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  message?: string;
}

export function ConnectionsManager({
  connections,
  available,
}: {
  connections: ConnectionView[];
  available: Array<{ id: StorageProviderId; displayName: string }>;
}) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="eyebrow mb-3">Nối tài khoản</h2>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa cấu hình provider nào. Điền client id và secret vào{" "}
            <code className="font-mono text-xs text-foreground">.env.local</code> rồi
            khởi động lại máy chủ.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((provider) => (
              <a
                key={provider.id}
                href={`/api/connections/oauth/${provider.id}/authorize`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:border-accent hover:text-accent-text"
              >
                <Plus className="size-3.5" />
                {provider.displayName}
              </a>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">Đã nối</h2>
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa nối kho nào. Chọn một nhà cung cấp ở trên để bắt đầu.
          </p>
        ) : (
          <ul className="space-y-4">
            {connections.map((connection) => (
              <ConnectionCard key={connection.id} connection={connection} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const [scan, setScan] = useState<ScanState | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const runScan = useCallback(async () => {
    setScan({ phase: "listing", total: 0, processed: 0, skipped: 0, failed: 0 });
    try {
      const start = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      if (!start.ok) throw new Error((await start.json()).error ?? "Quét thất bại");

      const { jobId, totalFiles } = (await start.json()) as {
        jobId: string;
        totalFiles: number;
      };

      setScan({
        phase: "processing",
        total: totalFiles,
        processed: 0,
        skipped: 0,
        failed: 0,
      });

      // Gọi lặp từng lô: một function trên Vercel không đủ 300s để đọc tag của
      // vài nghìn file, nên client giữ nhịp và hiển thị tiến độ thật.
      for (;;) {
        const step = await fetch(`/api/scan/${jobId}/step`, { method: "POST" });
        if (!step.ok) throw new Error((await step.json()).error ?? "Lỗi khi quét");

        const data = (await step.json()) as {
          done: boolean;
          job?: {
            totalFiles: number;
            processedFiles: number;
            skippedFiles: number;
            failedFiles: number;
          };
        };

        if (data.job) {
          setScan({
            phase: data.done ? "done" : "processing",
            total: data.job.totalFiles,
            processed: data.job.processedFiles,
            skipped: data.job.skippedFiles,
            failed: data.job.failedFiles,
          });
        }
        if (data.done) break;
      }

      router.refresh();
    } catch (error) {
      setScan({
        phase: "error",
        total: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        message: error instanceof Error ? error.message : "Quét thất bại",
      });
    }
  }, [connection.id, router]);

  const removeRoot = async (rootId: string) => {
    setBusy(true);
    await fetch(`/api/connections/${connection.id}/roots?rootId=${rootId}`, {
      method: "DELETE",
    });
    setBusy(false);
    router.refresh();
  };

  const disconnect = async () => {
    if (
      !confirm(
        `Ngắt ${connection.label}? Toàn bộ ${formatNumber(connection.trackCount)} bài đã lập chỉ mục từ kho này sẽ bị xoá khỏi thư viện. File gốc trên kho không bị ảnh hưởng.`,
      )
    )
      return;
    setBusy(true);
    await fetch(`/api/connections/${connection.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  };

  const scanning = scan?.phase === "listing" || scan?.phase === "processing";

  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <p className="readout">{PROVIDER_LABEL[connection.provider]}</p>
          <p className="mt-1 truncate text-sm text-foreground">{connection.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatNumber(connection.trackCount)} bài đã lập chỉ mục
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {connection.status === "needs_reauth" ? (
            <a
              href={`/api/connections/oauth/${connection.provider}/authorize`}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground"
            >
              Cấp quyền lại
            </a>
          ) : (
            <button
              type="button"
              onClick={runScan}
              disabled={scanning || busy}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-xs text-foreground transition-colors hover:border-accent hover:text-accent-text disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {scanning ? "Đang quét" : "Quét"}
            </button>
          )}

          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="rounded-full px-3 py-1.5 text-xs text-subtle transition-colors hover:text-danger disabled:opacity-50"
          >
            Ngắt kết nối
          </button>
        </div>
      </div>

      {connection.status === "needs_reauth" && (
        <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-danger">
          Kho này đã hết quyền truy cập.
          {connection.provider === "google_drive" &&
            " Google thu hồi refresh token sau 7 ngày khi app còn ở chế độ Testing — đây là hành vi bình thường, không phải lỗi."}
        </p>
      )}

      <div className="border-t border-border px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="eyebrow">Thư mục sẽ quét</h3>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            className="text-xs text-muted-foreground transition-colors hover:text-accent-text"
          >
            {picking ? "Đóng" : "Thêm thư mục"}
          </button>
        </div>

        {connection.roots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Chưa chọn thư mục nào — lần quét sẽ duyệt toàn bộ kho. Chọn một thư
            mục cụ thể sẽ nhanh hơn nhiều.
          </p>
        ) : (
          <ul className="space-y-1">
            {connection.roots.map((root) => (
              <li
                key={root.id}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  <Folder className="size-3.5 shrink-0 text-subtle" />
                  <span className="truncate">{root.path || root.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeRoot(root.id)}
                  aria-label={`Bỏ thư mục ${root.name}`}
                  className="shrink-0 text-subtle transition-colors hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {picking && (
          <FolderPicker
            connectionId={connection.id}
            onPicked={() => {
              setPicking(false);
              router.refresh();
            }}
          />
        )}
      </div>

      {scan && <ScanProgress scan={scan} />}
    </li>
  );
}

function ScanProgress({ scan }: { scan: ScanState }) {
  if (scan.phase === "error") {
    return (
      <p role="alert" className="border-t border-border px-4 py-3 text-xs text-danger">
        {scan.message}
      </p>
    );
  }

  const handled = scan.processed + scan.skipped + scan.failed;
  const ratio = scan.total > 0 ? handled / scan.total : 0;

  return (
    <div className="border-t border-border px-4 py-3">
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className="readout mt-2" aria-live="polite">
        {scan.phase === "listing"
          ? "Đang liệt kê file…"
          : scan.phase === "done"
            ? `Xong · ${scan.processed} bài mới · ${scan.skipped} bỏ qua${scan.failed ? ` · ${scan.failed} lỗi` : ""}`
            : `${handled}/${scan.total} · ${scan.processed} bài mới${scan.failed ? ` · ${scan.failed} lỗi` : ""}`}
      </p>
    </div>
  );
}

interface BrowseEntry {
  id: string;
  name: string;
  path: string;
}

function FolderPicker({
  connectionId,
  onPicked,
}: {
  connectionId: string;
  onPicked: () => void;
}) {
  const [trail, setTrail] = useState<BrowseEntry[]>([]);
  const [entries, setEntries] = useState<BrowseEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = trail.at(-1) ?? null;
  // null = thư mục gốc. Dropbox dùng chuỗi rỗng cho gốc nên không gộp hai giá trị này.
  const folderId = current?.id ?? null;

  // Đường dẫn hiện tại quyết định nội dung hiển thị: đổi thư mục là tải lại.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const url = new URL(
          `/api/connections/${connectionId}/browse`,
          window.location.origin,
        );
        if (folderId !== null) url.searchParams.set("folderId", folderId);

        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Không duyệt được thư mục");

        setEntries(data.entries as BrowseEntry[]);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Không duyệt được thư mục");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    // Bấm nhanh qua nhiều thư mục: huỷ request cũ để kết quả cũ không đè kết quả mới.
    return () => controller.abort();
  }, [connectionId, folderId]);

  const openFolder = (entry: BrowseEntry) => {
    setLoading(true);
    setTrail((t) => [...t, entry]);
  };

  const goTo = (depth: number) => {
    setLoading(true);
    setTrail((t) => t.slice(0, depth));
  };

  const addCurrent = async () => {
    setLoading(true);
    await fetch(`/api/connections/${connectionId}/roots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remoteId: current?.id ?? "",
        name: current?.name ?? "Toàn bộ kho",
        path: current?.path ?? "/",
      }),
    });
    setLoading(false);
    onPicked();
  };

  return (
    <div className="mt-4 rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => goTo(0)}
          className={cn(
            "transition-colors hover:text-accent-text",
            trail.length === 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Gốc
        </button>
        {trail.map((entry, i) => (
          <span key={entry.id} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-subtle" />
            <button
              type="button"
              onClick={() => goTo(i + 1)}
              className={cn(
                "transition-colors hover:text-accent-text",
                i === trail.length - 1 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {entry.name}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {loading && (
          <p className="px-3 py-4 text-xs text-muted-foreground">Đang tải…</p>
        )}
        {error && (
          <p role="alert" className="px-3 py-4 text-xs text-danger">
            {error}
          </p>
        )}
        {!loading && !error && entries?.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Không có thư mục con ở đây.
          </p>
        )}
        {!loading &&
          entries?.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => openFolder(entry)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-surface-hover"
            >
              <Folder className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate">{entry.name}</span>
            </button>
          ))}
      </div>

      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={addCurrent}
          disabled={loading}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          Chọn {current ? `“${current.name}”` : "toàn bộ kho"}
        </button>
      </div>
    </div>
  );
}
