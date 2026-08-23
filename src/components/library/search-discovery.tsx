"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { startRadioFor } from "@/lib/radio-client";
import { usePlayer } from "@/store/player";
import {
  findNewReleaseSection,
  type DiscoveryHomeSection,
  type PlayableTrack,
} from "@vong/shared";

interface DiscoveryResponse {
  sections?: DiscoveryHomeSection[];
}

interface TrendingResponse {
  tracks?: PlayableTrack[];
}

/**
 * Search vẫn là nơi nhập chính xác tên bài, nhưng khi chưa có từ khoá nó cũng là
 * một cửa khám phá. Chỉ dùng metadata discovery/radio hiện có; component này không
 * chạm tới player engine nên một track YouTube luôn đi qua đúng luồng radio chung.
 */
export function SearchDiscovery() {
  const [sections, setSections] = useState<DiscoveryHomeSection[] | null>(null);
  const [trending, setTrending] = useState<PlayableTrack[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetch("/api/youtube/home", { signal: controller.signal }).then((response) =>
        response.ok
          ? (response.json() as Promise<DiscoveryResponse>)
          : { sections: [] },
      ),
      fetch("/api/youtube/trending", { signal: controller.signal }).then((response) =>
        response.ok
          ? (response.json() as Promise<TrendingResponse>)
          : { tracks: [] },
      ),
    ])
      .then(([home, trendingResult]) => {
        if (controller.signal.aborted) return;
        setSections(home.sections ?? []);
        setTrending(trendingResult.tracks ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setSections([]);
          setTrending([]);
        }
      });

    return () => controller.abort();
  }, []);

  if (sections === null || trending === null) return <DiscoverySkeleton />;

  const release = findNewReleaseSection(sections);
  const remaining = sections.filter((section) => section !== release);
  const hasContent = Boolean(release) || remaining.length > 0 || trending.length > 0;

  if (!hasContent) {
    return (
      <p role="status" className="mt-8 text-sm text-muted-foreground">
        Chưa thể tải nhạc để khám phá lúc này. Bạn vẫn có thể tìm trong thư viện hoặc trên YouTube.
      </p>
    );
  }

  return (
    <section aria-labelledby="search-discovery-title" className="mt-12 space-y-10">
      <div>
        <p className="eyebrow">Khám phá</p>
        <h2 id="search-discovery-title" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          Có thể bạn sẽ thích
        </h2>
      </div>
      {release && <DiscoveryRail title="Mới phát hành" tracks={release.tracks} />}
      {trending.length > 0 && <DiscoveryRail title="Đang thịnh hành" tracks={trending} />}
      {remaining.slice(0, 2).map((section) => (
        <DiscoveryRail key={section.title} title={section.title} tracks={section.tracks} />
      ))}
    </section>
  );
}

function DiscoveryRail({ title, tracks }: { title: string; tracks: PlayableTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <section aria-labelledby={`search-rail-${title}`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h3 id={`search-rail-${title}`} className="text-xl font-bold tracking-tight">
          {title}
        </h3>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-text">
          Xem tất cả <ArrowRight className="size-4" />
        </span>
      </div>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:-mx-2 md:px-2">
        {tracks.slice(0, 12).map((track, index) => (
          <button
            key={track.id}
            type="button"
            onClick={() => {
              if (track.source === "youtube") startRadioFor(track);
              else usePlayer.getState().playQueue(tracks, index);
            }}
            className="group w-36 shrink-0 snap-start text-left sm:w-40 lg:w-44"
            aria-label={`Phát ${track.title}`}
          >
            <span className="relative block aspect-square overflow-hidden rounded-xl bg-surface shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
              <Cover
                url={track.coverUrl}
                title={track.albumName ?? track.title}
                size={176}
                fill
                className="rounded-xl transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span className="absolute bottom-2 right-2 grid size-10 translate-y-1 place-items-center rounded-full bg-accent text-accent-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                <Play className="size-4 translate-x-px fill-current" />
              </span>
            </span>
            <span className="mt-2.5 block truncate text-sm font-semibold">{track.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {track.artistName ?? "YouTube Music"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoverySkeleton() {
  return (
    <section aria-label="Đang tải nhạc khám phá" aria-busy="true" className="mt-12">
      <div className="mb-3 h-3 w-20 animate-pulse rounded bg-surface" />
      <div className="h-8 w-56 animate-pulse rounded bg-surface" />
      <div className="mt-8 flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="w-36 shrink-0 sm:w-40 lg:w-44">
            <div className="aspect-square animate-pulse rounded-xl bg-surface" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </section>
  );
}
