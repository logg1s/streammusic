"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Cover } from "@/components/library/cover";
import { startRadioFor } from "@/lib/radio-client";
import type { PlayableTrack } from "@vong/shared";

interface Section {
  title: string;
  tracks: PlayableTrack[];
}

/**
 * Các hàng gợi ý của YouTube trên trang chủ.
 *
 * Client component có chủ ý: lấy hàng gợi ý mất vài giây (mở vài playlist), không
 * đáng để giữ cả trang chủ lại. Thư viện hiện ngay, gợi ý điền vào sau.
 */
export function YoutubeRows() {
  const [sections, setSections] = useState<Section[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [home, trending] = await Promise.all([
        fetch("/api/youtube/home").then((res) =>
          res.ok ? (res.json() as Promise<{ sections?: Section[] }>) : null,
        ),
        fetch("/api/youtube/trending").then((res) =>
          res.ok ? (res.json() as Promise<{ tracks?: PlayableTrack[] }>) : null,
        ),
      ]);
      if (cancelled) return;

      const rows: Section[] = [];
      const hot = trending?.tracks ?? [];
      if (hot.length > 0) rows.push({ title: "Đang thịnh hành", tracks: hot });
      rows.push(...(home?.sections ?? []));
      setSections(rows);
    };

    void load().catch(() => {
      if (!cancelled) setSections([]);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (sections === null) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Đang lấy gợi ý từ YouTube…
      </p>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <section key={section.title}>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight">{section.title}</h2>
            <span className="text-xs text-subtle">Radio từ YouTube</span>
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:-mx-2 md:px-2">
            {section.tracks.slice(0, 12).map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => startRadioFor(track)}
                className="group w-36 shrink-0 snap-start rounded-xl p-2 text-left transition-colors hover:bg-surface sm:w-40"
              >
                <span className="relative block">
                  <Cover
                    url={track.coverUrl}
                    title={track.title}
                    size={160}
                    className="aspect-square h-auto w-full rounded-lg shadow-lg"
                  />
                  <span className="absolute bottom-2 right-2 grid size-10 place-items-center rounded-full bg-accent text-accent-foreground opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100 sm:translate-y-2">
                    <Play className="size-4 translate-x-px fill-current" />
                  </span>
                </span>
                <span className="mt-2 block truncate text-sm font-semibold">
                  {track.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {track.artistName ?? "YouTube"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
