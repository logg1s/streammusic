"use client";

import { useEffect, useState } from "react";
import { InteractiveTrackRail } from "@/components/library/home-discovery";
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
      {release && <InteractiveTrackRail title="Mới phát hành" tracks={release.tracks} />}
      {trending.length > 0 && <InteractiveTrackRail title="Đang thịnh hành" tracks={trending} />}
      {remaining.slice(0, 2).map((section) => (
        <InteractiveTrackRail key={section.title} title={section.title} tracks={section.tracks} />
      ))}
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
