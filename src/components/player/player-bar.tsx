"use client";

import { useState } from "react";
import Link from "next/link";
import { ListMusic, SkipForward } from "lucide-react";
import { Cover } from "@/components/library/cover";
import {
  IconButton,
  PlayPauseButton,
  Scrubber,
  SourceReadout,
  TransportRow,
  VolumeControl,
} from "@/components/player/controls";
import { NowPlayingSheet } from "@/components/player/now-playing-sheet";
import { QueuePanel } from "@/components/player/queue-panel";
import { PROVIDER_LABEL } from "@/lib/provider-labels";
import { shortCodec } from "@/lib/utils";
import { useCurrentTrack, usePlayer } from "@/store/player";

export function PlayerBar() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const error = usePlayer((s) => s.error);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-border bg-surface/95 backdrop-blur">
        {error && (
          <p
            role="status"
            className="border-b border-border px-4 py-1.5 text-center text-xs text-danger"
          >
            {error}
          </p>
        )}

        {/* Mobile: vạch tiến độ mảnh ở mép trên, vì không đủ chỗ cho thanh tua đầy đủ. */}
        <MiniProgress />

        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-3 sm:h-20 sm:gap-6 sm:px-4">
          <NowPlaying onOpenSheet={() => setSheetOpen(true)} />

          {/* Desktop */}
          <div className="hidden flex-1 flex-col items-center gap-1.5 sm:flex">
            <TransportRow />
            <Scrubber className="max-w-xl" />
          </div>
          <div className="hidden items-center gap-1 md:flex md:w-[220px] md:justify-end">
            <IconButton
              label="Hàng đợi"
              onClick={() => setQueueOpen(true)}
              disabled={!hasQueue}
              active={queueOpen}
            >
              <ListMusic className="size-4" />
            </IconButton>
            <VolumeControl />
          </div>

          {/* Mobile: đủ nút để điều khiển ngay tại chỗ, không phải mở sheet. */}
          <div className="flex shrink-0 items-center gap-1 sm:hidden">
            <PlayPauseButton />
            <IconButton
              label="Bài sau"
              onClick={() => usePlayer.getState().next()}
              disabled={!track}
            >
              <SkipForward className="size-5" />
            </IconButton>
          </div>
        </div>

        <span className="sr-only" aria-live="polite">
          {track
            ? `${isPlaying ? "Đang phát" : "Tạm dừng"}: ${track.title}`
            : "Chưa chọn bài nào"}
        </span>
      </footer>

      {sheetOpen && (
        <NowPlayingSheet
          onClose={() => setSheetOpen(false)}
          onOpenQueue={() => {
            setSheetOpen(false);
            setQueueOpen(true);
          }}
        />
      )}
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
    </>
  );
}

function MiniProgress() {
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="relative h-0.5 w-full overflow-hidden bg-surface-hover sm:hidden">
      <div
        className="h-full bg-accent transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />
      {isBuffering && <span className="progress-sweep" aria-hidden />}
    </div>
  );
}

function NowPlaying({ onOpenSheet }: { onOpenSheet: () => void }) {
  const track = useCurrentTrack();

  if (!track) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-[320px] sm:flex-none">
        <div className="size-11 shrink-0 rounded-md border border-dashed border-border sm:size-12" />
        <p className="truncate text-sm text-subtle">Chưa chọn bài nào</p>
      </div>
    );
  }

  const info = (
    <>
      <Cover
        url={track.coverUrl}
        title={track.albumName ?? track.title}
        size={48}
        className="size-11 sm:size-12"
      />
      <div className="min-w-0 text-left">
        <p className="truncate text-sm font-medium">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground sm:hidden">
          {track.artistName ?? "Không rõ nghệ sĩ"}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-[320px] sm:flex-none">
      {/* Mobile: cả khối là nút mở màn hình đang phát. */}
      <button
        type="button"
        onClick={onOpenSheet}
        aria-label={`Mở màn hình đang phát: ${track.title}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left sm:hidden"
      >
        {info}
      </button>

      {/* Desktop: nghệ sĩ là liên kết, kèm dải thông số nguồn. */}
      <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
        <Cover
          url={track.coverUrl}
          title={track.albumName ?? track.title}
          size={48}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{track.title}</p>
          {track.artistId ? (
            <Link
              href={`/artists/${track.artistId}`}
              className="block truncate text-xs text-muted-foreground transition-colors hover:text-accent-text"
            >
              {track.artistName}
            </Link>
          ) : (
            <p className="truncate text-xs text-muted-foreground">
              {track.artistName ?? "Không rõ nghệ sĩ"}
            </p>
          )}
          <SourceReadout
            className="mt-0.5"
            provider={track.provider ? PROVIDER_LABEL[track.provider] : null}
            codec={shortCodec(track.codec)}
            bitrate={track.bitrate}
          />
        </div>
      </div>
    </div>
  );
}
