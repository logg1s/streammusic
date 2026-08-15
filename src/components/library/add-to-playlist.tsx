"use client";

import { useEffect, useState } from "react";
import { ListPlus, X } from "lucide-react";
import type { PlayableTrack } from "@vong/shared";
import type { PlaylistSummary } from "@vong/shared";

/**
 * Hộp chọn playlist để thêm một bài vào.
 *
 * Danh sách playlist chỉ được tải khi hộp mở lần đầu — mỗi dòng bài trong thư viện
 * đều dựng một hộp, nên tải sẵn cho tất cả sẽ là hàng chục request vô ích.
 */
export function AddToPlaylist({
  track,
  className,
}: {
  track: PlayableTrack;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PlaylistSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open || items !== null) return;
    let cancelled = false;

    void fetch("/api/playlists")
      .then((res) => res.json() as Promise<{ playlists?: PlaylistSummary[] }>)
      .then((body) => {
        if (!cancelled) setItems(body.playlists ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, items]);

  const add = async (playlist: PlaylistSummary) => {
    setMessage("Đang thêm…");
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [track.id] }),
      });
      const body = (await res.json()) as { added?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Không thêm được.");
      setMessage(
        body.added === 0
          ? "Bài đã có trong playlist"
          : `Đã thêm vào ${playlist.name}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thêm được.");
    }
  };

  /** Tạo playlist mới ngay tại đây, lấy bài đang chọn làm bài đầu tiên. */
  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMessage("Đang tạo…");
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, items: [{ id: track.id }] }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Không tạo được.");
      setMessage(`Đã tạo ${trimmed}`);
      setName("");
      setItems(null); // tải lại danh sách để lần thêm sau thấy playlist mới
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không tạo được.");
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Thêm vào playlist"
        title="Thêm vào playlist"
        onClick={() => setOpen(true)}
        className={className}
      >
        <ListPlus className="size-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Thêm vào playlist"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="eyebrow">Thêm vào playlist</p>
                <p className="truncate text-sm text-foreground">
                  {track.title}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {items === null && (
              <p className="py-4 text-sm text-muted-foreground">Đang tải…</p>
            )}
            {items?.length === 0 && (
              <p className="pt-2 text-sm text-muted-foreground">
                Chưa có playlist nào — đặt tên bên dưới để tạo cái đầu tiên.
              </p>
            )}

            {items !== null && items.length > 0 && (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                {items.map((playlist) => (
                  <li key={playlist.id}>
                    <button
                      type="button"
                      onClick={() => void add(playlist)}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                    >
                      <span className="truncate">{playlist.name}</span>
                      <span className="tnum shrink-0 text-xs text-subtle">
                        {playlist.itemCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className="mt-3 flex gap-2 border-t border-border pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Playlist mới…"
                aria-label="Tên playlist mới"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-subtle"
              />
              <button
                type="submit"
                disabled={name.trim() === ""}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-hover disabled:opacity-40"
              >
                Tạo
              </button>
            </form>

            {message && (
              <p className="mt-3 text-xs text-muted-foreground">{message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
