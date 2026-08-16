"use client";

import { useEffect, useState } from "react";
import { TrackList } from "@/components/library/track-list";
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
          <h2 className="eyebrow mb-3">{section.title}</h2>
          <TrackList tracks={section.tracks.slice(0, 12)} radioOnTap />
        </section>
      ))}
    </>
  );
}
