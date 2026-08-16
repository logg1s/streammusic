"use client";

import {
  ChevronDown,
  ChevronUp,
  ListEnd,
  ListStart,
  Play,
  Radio,
  X,
} from "lucide-react";
import { AddToPlaylist } from "@/components/library/add-to-playlist";
import { Cover } from "@/components/library/cover";
import { Equalizer } from "@/components/player/equalizer";
import { useRadioConfig } from "@/components/player/radio-context";
import type { PlayableTrack } from "@vong/shared";
import { startRadioFor } from "@/lib/radio-client";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

interface TrackListProps {
  tracks: PlayableTrack[];
  /** Trong trang album, số thứ tự có nghĩa; ở nơi khác thì hiện ảnh bìa hữu ích hơn. */
  variant?: "numbered" | "covered";
  emptyMessage?: string;
  /** Có mặt thì mỗi dòng thêm nút bỏ bài — dùng ở trang playlist. */
  onRemove?: (track: PlayableTrack, index: number) => void;
  /** Có mặt thì mỗi dòng thêm nút ▲▼ đổi thứ tự — dùng ở trang playlist. */
  onMove?: (index: number, delta: number) => void;
  /**
   * Danh sách "bài lẻ" (nghe gần đây, kết quả tìm, gợi ý) — bấm một dòng là seed radio
   * từ đúng bài đó thay vì phát cả danh sách. Ở album/playlist thì để tắt: bấm để phát
   * xuyên suốt. Cần radio bật (luôn bật trên web); tắt thì rơi về phát cả danh sách.
   */
  radioOnTap?: boolean;
}

/* Nút phụ chỉ hiện khi trỏ vào dòng, nhưng luôn hiện khi được focus bằng bàn phím. */
const ROW_ACTION =
  "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100";

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
  onRemove,
  onMove,
  radioOnTap = false,
}: TrackListProps) {
  const radioEnabled = useRadioConfig().enabled;
  const playQueue = usePlayer((s) => s.playQueue);
  const currentId = usePlayer((s) => s.queue[s.order[s.position]]?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const insertNext = usePlayer((s) => s.insertNext);
  const appendTracks = usePlayer((s) => s.appendTracks);

  if (tracks.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const onTap = (track: PlayableTrack, index: number) => {
    if (radioOnTap && radioEnabled) startRadioFor(track);
    else playQueue(tracks, index);
  };

  return (
    <ol className="divide-y divide-border">
      {tracks.map((track, index) => {
        const isCurrent = track.id === currentId;
        return (
          <li key={track.id} className="group/row flex items-center gap-1">
            <button
              type="button"
              onClick={() => onTap(track, index)}
              aria-current={isCurrent ? "true" : undefined}
              className={cn(
                ROW_GRID,
                "group relative min-w-0 flex-1 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface",
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
                      isCurrent
                        ? "font-medium text-accent-text"
                        : "text-foreground",
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
              </span>

              <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                {track.albumName}
              </span>

              <span className="tnum text-right text-xs text-subtle">
                {formatDuration(track.durationSec)}
              </span>
            </button>

            {radioEnabled && (
              <button
                type="button"
                aria-label="Radio từ bài này"
                title="Radio từ bài này"
                onClick={() => startRadioFor(track)}
                className={ROW_ACTION}
              >
                <Radio className="size-4" />
              </button>
            )}

            <button
              type="button"
              aria-label="Phát tiếp"
              title="Phát tiếp"
              onClick={() => insertNext(track)}
              className={ROW_ACTION}
            >
              <ListStart className="size-4" />
            </button>

            <button
              type="button"
              aria-label="Thêm vào hàng đợi"
              title="Thêm vào hàng đợi"
              onClick={() => appendTracks([track])}
              className={ROW_ACTION}
            >
              <ListEnd className="size-4" />
            </button>

            <AddToPlaylist track={track} className={ROW_ACTION} />

            {onMove && (
              <>
                <button
                  type="button"
                  aria-label="Lên trên"
                  title="Lên trên"
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                  className={cn(ROW_ACTION, "disabled:opacity-20")}
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Xuống dưới"
                  title="Xuống dưới"
                  disabled={index === tracks.length - 1}
                  onClick={() => onMove(index, 1)}
                  className={cn(ROW_ACTION, "disabled:opacity-20")}
                >
                  <ChevronDown className="size-4" />
                </button>
              </>
            )}

            {onRemove && (
              <button
                type="button"
                aria-label="Bỏ khỏi playlist"
                title="Bỏ khỏi playlist"
                onClick={() => onRemove(track, index)}
                className={ROW_ACTION}
              >
                <X className="size-4" />
              </button>
            )}
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
