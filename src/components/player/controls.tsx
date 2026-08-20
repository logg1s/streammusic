"use client";

import { useCallback, useRef, useState } from "react";
import {
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

/** Các mảnh điều khiển dùng chung cho thanh phát (desktop) và sheet (mobile). */

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
  size = "md",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "grid place-items-center rounded-full transition-[background,color,transform] hover:bg-surface-hover active:scale-95",
        size === "lg" ? "size-12" : "size-10",
        active ? "bg-surface-hover text-accent-text" : "text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function PlayPauseButton({ size = "md" }: { size?: "md" | "lg" }) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const toggle = usePlayer((s) => s.toggle);

  // Chỉ xoay khi người dùng đang muốn nghe mà chưa có tiếng. Đang tạm dừng thì
  // dù có đệm ngầm cũng không hiện gì, tránh báo động giả.
  const loading = isBuffering && isPlaying;
  const iconSize = size === "lg" ? "size-6" : "size-5";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!hasQueue}
      aria-label={loading ? "Đang tải" : isPlaying ? "Tạm dừng" : "Phát"}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-subtle disabled:hover:scale-100",
        size === "lg" ? "size-16" : "size-11",
      )}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin", iconSize)} />
      ) : isPlaying ? (
        <Pause className={cn("fill-current", iconSize)} />
      ) : (
        <Play className={cn("translate-x-px fill-current", iconSize)} />
      )}
    </button>
  );
}

export function TransportRow({ size = "md" }: { size?: "md" | "lg" }) {
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);

  const icon = size === "lg" ? "size-5" : "size-4";

  return (
    <div className={cn("flex items-center", size === "lg" ? "gap-3" : "gap-1")}>
      <IconButton
        label={shuffle ? "Tắt xáo bài" : "Xáo bài"}
        onClick={toggleShuffle}
        active={shuffle}
        size={size}
      >
        <Shuffle className={icon} />
      </IconButton>

      <IconButton
        label="Bài trước"
        onClick={previous}
        disabled={!hasQueue}
        size={size}
      >
        <SkipBack className={size === "lg" ? "size-6" : "size-5"} />
      </IconButton>

      <PlayPauseButton size={size} />

      <IconButton label="Bài sau" onClick={next} disabled={!hasQueue} size={size}>
        <SkipForward className={size === "lg" ? "size-6" : "size-5"} />
      </IconButton>

      <IconButton
        label={
          repeat === "off"
            ? "Lặp lại"
            : repeat === "all"
              ? "Lặp lại một bài"
              : "Tắt lặp lại"
        }
        onClick={cycleRepeat}
        active={repeat !== "off"}
        size={size}
      >
        {repeat === "one" ? (
          <Repeat1 className={icon} />
        ) : (
          <Repeat className={icon} />
        )}
      </IconButton>
    </div>
  );
}

export function Scrubber({ className }: { className?: string }) {
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const hasQueue = usePlayer((s) => s.queue.length > 0);
  const isBuffering = usePlayer((s) => s.isBuffering);

  const barRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<number | null>(null);
  const [scrubTo, setScrubTo] = useState<number | null>(null);

  const shown = scrubTo ?? currentTime;
  const progress = duration > 0 ? Math.min(1, shown / duration) : 0;

  const positionFromEvent = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect || duration <= 0) return null;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <span className="tnum w-10 shrink-0 text-right text-[11px] text-subtle">
        {formatDuration(shown)}
      </span>

      <div
        ref={barRef}
        role="slider"
        tabIndex={hasQueue ? 0 : -1}
        aria-label="Vị trí phát"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatDuration(shown)}
        onPointerDown={(e) => {
          if (!hasQueue) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const next = positionFromEvent(e.clientX);
          scrubRef.current = next;
          setScrubTo(next);
        }}
        onPointerMove={(e) => {
          if (scrubRef.current === null) return;
          const next = positionFromEvent(e.clientX);
          scrubRef.current = next;
          setScrubTo(next);
        }}
        onPointerUp={() => {
          const target = scrubRef.current;
          scrubRef.current = null;
          if (target !== null) seek(target);
          setScrubTo(null);
        }}
        onPointerCancel={() => {
          scrubRef.current = null;
          setScrubTo(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") seek(Math.min(duration, currentTime + 5));
          else if (e.key === "ArrowLeft") seek(Math.max(0, currentTime - 5));
          else return;
          e.preventDefault();
        }}
        aria-busy={isBuffering}
        className="group relative h-6 flex-1 cursor-pointer touch-none"
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${progress * 100}%` }}
          />
          {isBuffering && <span className="progress-sweep" aria-hidden />}
        </div>
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      <span className="tnum w-10 shrink-0 text-[11px] text-subtle">
        {formatDuration(duration)}
      </span>
    </div>
  );
}

export function VolumeControl({ className }: { className?: string }) {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <IconButton label={muted ? "Bật tiếng" : "Tắt tiếng"} onClick={toggleMute}>
        {muted || volume === 0 ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </IconButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Âm lượng"
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-surface-hover accent-accent"
      />
    </div>
  );
}

/** Dải thông số nguồn — cho thấy byte đang chảy về từ đâu và ở chất lượng nào. */
export function SourceReadout({
  provider,
  codec,
  bitrate,
  className,
}: {
  provider: string | null;
  codec: string | null;
  bitrate: number | null;
  className?: string;
}) {
  const parts = [
    provider,
    codec,
    bitrate ? `${Math.round(bitrate / 1000)} kbps` : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return (
    <p className={cn("readout truncate", className)}>{parts.join(" · ")}</p>
  );
}
