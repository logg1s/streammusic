"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { Equalizer } from "@/components/player/equalizer";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

/**
 * Hàng đợi đang phát.
 *
 * Có ích nhất khi bật xáo bài — lúc đó thứ tự phát không còn khớp với danh sách
 * trên trang, nên không nhìn vào đâu mà biết bài nào tới.
 */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((s) => s.queue);
  const order = usePlayer((s) => s.order);
  const position = usePlayer((s) => s.position);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playTrackAt = usePlayer((s) => s.playTrackAt);

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
        aria-label="Hàng đợi phát"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background pb-[env(safe-area-inset-bottom)] shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Hàng đợi</p>
            <p className="readout mt-0.5">
              {sapToi > 0 ? `Còn ${sapToi} bài phía sau` : "Bài cuối trong hàng đợi"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <ol className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {items.map(({ track, pos }) => {
            const dangPhat = pos === position;
            const daQua = pos < position;
            return (
              <li key={`${track.id}-${pos}`}>
                <button
                  type="button"
                  onClick={() => playTrackAt(pos)}
                  aria-current={dangPhat ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface",
                    dangPhat && "bg-surface",
                    daQua && "opacity-50",
                  )}
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
                    <span className="block truncate text-xs text-muted-foreground">
                      {track.artistName ?? "Không rõ nghệ sĩ"}
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-xs text-subtle">
                    {formatDuration(track.durationSec)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </>
  );
}
