"use client";

import { useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { startRadioFor } from "@/lib/radio-client";
import { usePlayer } from "@/store/player";
import type { PlayableTrack } from "@vong/shared";

export function HomeQuickGrid({ tracks }: { tracks: PlayableTrack[] }) {
  const [expanded, setExpanded] = useState(false);
  if (tracks.length === 0) return null;
  const visible = expanded ? tracks : tracks.slice(0, 6);
  const canExpand = tracks.length > 6;

  const play = (track: PlayableTrack, index: number) => {
    if (track.source === "youtube") startRadioFor(track);
    else usePlayer.getState().playQueue(tracks, index);
  };

  return (
    <section aria-labelledby="quick-title">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="quick-title" className="text-xl font-bold tracking-tight">
          Nghe tiếp
        </h2>
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-accent-text transition-[color,background-color,transform] hover:scale-[1.03] hover:bg-surface"
          >
            {expanded ? "Thu gọn" : "Xem tất cả"}
            <ArrowRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>
      <div className={`grid gap-2 sm:grid-cols-2 xl:grid-cols-3 ${expanded ? "content-reveal" : ""}`}>
        {visible.map((track, index) => (
          <button
            key={track.id}
            type="button"
            onClick={() => play(track, index)}
            className="group flex min-h-16 items-center overflow-hidden rounded-lg bg-surface-hover/80 text-left transition-colors hover:bg-[#2a2a33]"
          >
            <Cover
              url={track.coverUrl}
              title={track.albumName ?? track.title}
              size={64}
              className="size-16 shrink-0 rounded-none shadow-lg"
            />
            <span className="min-w-0 flex-1 px-3 text-sm font-semibold">
              <span className="line-clamp-2">{track.title}</span>
            </span>
            <span className="mr-3 hidden size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform group-hover:grid group-hover:scale-105 sm:grid sm:opacity-0 sm:group-hover:opacity-100">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
