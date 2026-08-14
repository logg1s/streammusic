"use client";

import { Play } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { Equalizer } from "@/components/player/equalizer";
import type { PlayableTrack } from "@/lib/library";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

interface TrackListProps {
  tracks: PlayableTrack[];
  /** Trong trang album, số thứ tự có nghĩa; ở nơi khác thì hiện ảnh bìa hữu ích hơn. */
  variant?: "numbered" | "covered";
  emptyMessage?: string;
}

/*
  Lưới cột cố định thay vì flex co giãn: trên màn rộng, flex đẩy cột album ra tận
  mép phải và để lại một khoảng trống lớn giữa tên bài và album. Cột album chỉ
  xuất hiện từ lg trở lên, dưới đó không đủ chỗ để đọc.
*/
const ROW_GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_3.5rem] items-center gap-3 lg:grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(0,1fr)_3.5rem]";

export function TrackList({
  tracks,
  variant = "covered",
  emptyMessage = "Chưa có bài nào ở đây.",
}: TrackListProps) {
  const playQueue = usePlayer((s) => s.playQueue);
  const currentId = usePlayer((s) => s.queue[s.order[s.position]]?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);

  if (tracks.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {tracks.map((track, index) => {
        const isCurrent = track.id === currentId;
        return (
          <li key={track.id}>
            <button
              type="button"
              onClick={() => playQueue(tracks, index)}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                ROW_GRID,
                "group relative w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-surface",
                isCurrent && "bg-surface",
              )}
            >
              <span className="grid place-items-center">
                {isCurrent ? (
                  <Equalizer playing={isPlaying} />
                ) : (
                  <>
                    <span className="tnum text-xs text-subtle group-hover:hidden">
                      {variant === "numbered"
                        ? (track.trackNo ?? index + 1)
                        : index + 1}
                    </span>
                    <Play className="hidden size-3.5 fill-foreground text-foreground group-hover:block" />
                  </>
                )}
              </span>

              <span className="flex min-w-0 items-center gap-3">
                {variant === "covered" && (
                  <Cover
                    url={track.coverUrl}
                    title={track.albumName ?? track.title}
                    size={36}
                  />
                )}
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      isCurrent ? "font-medium text-accent-text" : "text-foreground",
                    )}
                  >
                    {track.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {track.artistName ?? "Không rõ nghệ sĩ"}
                  </span>
                </span>
              </span>

              <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                {track.albumName}
              </span>

              <span className="tnum text-right text-xs text-subtle">
                {formatDuration(track.durationSec)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Nút "Phát tất cả" đặt ở đầu trang album/nghệ sĩ. */
export function PlayAllButton({
  tracks,
  label = "Phát tất cả",
}: {
  tracks: PlayableTrack[];
  label?: string;
}) {
  const playQueue = usePlayer((s) => s.playQueue);

  return (
    <button
      type="button"
      disabled={tracks.length === 0}
      onClick={() => playQueue(tracks, 0)}
      className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-subtle disabled:hover:scale-100"
    >
      <Play className="size-4 fill-current" />
      {label}
    </button>
  );
}
