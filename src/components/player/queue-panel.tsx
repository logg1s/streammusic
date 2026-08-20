"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsUp, X } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { Equalizer } from "@/components/player/equalizer";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

/* Nút phụ của một dòng: chỉ hiện khi trỏ vào dòng, luôn hiện khi focus bằng bàn phím. */
const ROW_ACTION =
  "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100";

const LINK_ACTION =
  "rounded-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Hàng đợi đang phát.
 *
 * Có ích nhất khi bật xáo bài hoặc khi radio đang nạp thêm — lúc đó thứ tự phát
 * không còn khớp với danh sách trên trang, nên không nhìn vào đâu mà biết bài nào tới.
 */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((s) => s.queue);
  const order = usePlayer((s) => s.order);
  const position = usePlayer((s) => s.position);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playTrackAt = usePlayer((s) => s.playTrackAt);
  const radio = usePlayer((s) => s.radio);
  const stopRadio = usePlayer((s) => s.stopRadio);
  const removeAt = usePlayer((s) => s.removeAt);
  const moveToNext = usePlayer((s) => s.moveToNext);

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = order
    .map((queueIndex, pos) => ({ track: queue[queueIndex], pos }))
    .filter((item) => Boolean(item.track));

  const sapToi = items.filter((i) => i.pos > position).length;

  const trangThaiRadio =
    radio === null
      ? null
      : radio.status === "loading"
        ? "Đang tìm bài tương tự…"
        : radio.status === "error"
          ? (radio.message ?? "Không lấy được gợi ý")
          : radio.exhausted
            ? "Hết bài gợi ý"
            : null;

  const luuPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    const ten = name.trim();
    if (!ten) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ten,
          // Theo đúng thứ tự phát, không phải thứ tự thêm vào hàng đợi.
          items: items.map(({ track }) => ({ id: track.id })),
          seedLabel: radio?.seedLabel ?? null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Không lưu được playlist");
      }
      setNaming(false);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Không lưu được playlist");
    }
    setSaving(false);
  };

  return (
    <>
      {/* Nền mờ để bấm ra ngoài là đóng. */}
      <button
        type="button"
        aria-label="Đóng hàng đợi"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Hàng đợi phát"
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-[420px]"
      >
        <header className="border-b border-border px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">Hàng đợi</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {sapToi > 0 ? `Còn ${sapToi} bài phía sau` : "Bài cuối trong hàng đợi"}
              </p>

              {radio && (
                <>
                  <p className="mt-1.5 truncate text-xs text-accent-text">
                    Radio · {radio.seedLabel}
                  </p>
                  {trangThaiRadio && <p className="readout mt-0.5">{trangThaiRadio}</p>}
                  <p className="readout mt-0.5">
                    Danh sách kết hợp theo đúng thứ tự từ YouTube
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {items.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {radio && (
                <button type="button" onClick={stopRadio} className={LINK_ACTION}>
                  Dừng radio
                </button>
              )}
              {!naming && !saved && (
                <button
                  type="button"
                  onClick={() => {
                    setName(radio ? `Radio · ${radio.seedLabel}` : "Hàng đợi");
                    setSaveError(null);
                    setNaming(true);
                  }}
                  className={LINK_ACTION}
                >
                  Lưu thành playlist
                </button>
              )}
              {saved && (
                <Link
                  href="/playlists"
                  onClick={onClose}
                  className="rounded-full px-2 py-1 text-xs text-accent-text underline"
                >
                  Đã lưu — mở playlist
                </Link>
              )}
            </div>
          )}

          {naming && (
            <form onSubmit={luuPlaylist} className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                aria-label="Tên playlist"
                placeholder="Tên playlist"
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:border-accent"
              />
              <button
                type="submit"
                disabled={saving || name.trim().length === 0}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={() => setNaming(false)}
                className={LINK_ACTION}
              >
                Huỷ
              </button>
            </form>
          )}

          {saveError && (
            <p role="status" className="mt-1.5 text-xs text-danger">
              {saveError}
            </p>
          )}
        </header>

        <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {items.map(({ track, pos }) => {
            const dangPhat = pos === position;
            const daQua = pos < position;
            return (
              <li
                key={`${track.id}-${pos}`}
                className={cn(
                  "group/row flex items-center gap-1 rounded-lg pr-2 transition-colors hover:bg-surface-hover",
                  dangPhat && "bg-surface-hover",
                  daQua && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => playTrackAt(pos)}
                  aria-current={dangPhat ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
                >
                  <span className="grid w-5 shrink-0 place-items-center">
                    {dangPhat ? (
                      <Equalizer playing={isPlaying} />
                    ) : (
                      <span className="tnum text-xs text-subtle">{pos + 1}</span>
                    )}
                  </span>

                  <Cover
                    url={track.coverUrl}
                    title={track.albumName ?? track.title}
                    size={36}
                  />

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        dangPhat ? "font-medium text-accent-text" : "text-foreground",
                      )}
                    >
                      {track.title}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">
                        {track.artistName ?? "Không rõ nghệ sĩ"}
                      </span>
                      {track.source === "youtube" && (
                        <span className="readout shrink-0">YouTube</span>
                      )}
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-xs text-subtle">
                    {formatDuration(track.durationSec)}
                  </span>
                </button>

                {pos > position && (
                  <button
                    type="button"
                    aria-label="Phát tiếp"
                    title="Phát tiếp"
                    onClick={() => moveToNext(pos)}
                    className={ROW_ACTION}
                  >
                    <ChevronsUp className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  aria-label="Bỏ khỏi hàng đợi"
                  title="Bỏ khỏi hàng đợi"
                  onClick={() => removeAt(pos)}
                  className={ROW_ACTION}
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </>
  );
}
