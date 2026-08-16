"use client";

import { useEffect, useState } from "react";
import { TrackList } from "@/components/library/track-list";
import { getAnalytics } from "@/lib/analytics";
import type { PlayableTrack } from "@vong/shared";

/**
 * Mục "Trên YouTube" của trang tìm kiếm.
 *
 * Là client component vì kết quả tới sau khi trang đã render: tìm trên YouTube mất
 * ~1 giây, không đáng để giữ cả trang lại chờ khi kết quả thư viện đã có ngay.
 *
 * Nơi gọi phải truyền `key={query}` — đổi từ khoá là dựng lại component, nhờ vậy
 * trạng thái tự về rỗng mà không cần setState trong effect.
 */
export function YoutubeSearch({ query }: { query: string }) {
  const [tracks, setTracks] = useState<PlayableTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length === 0) return;
    let cancelled = false;

    void fetch("/api/youtube/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: query }),
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          tracks?: PlayableTrack[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Không tìm được trên YouTube.");
          return;
        }
        const found = body.tracks ?? [];
        setTracks(found);
        // Chỉ đếm, KHÔNG kèm từ khoá — xem `ANALYTICS_EVENTS` trong `@vong/shared`.
        getAnalytics()?.track("search_run", {
          results: found.length,
          hasYoutube: found.length > 0,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Không kết nối được tới YouTube.");
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (query.length === 0) return null;

  return (
    <section>
      <h2 className="eyebrow mb-3">Trên YouTube</h2>
      {error && <p className="py-2 text-sm text-danger">{error}</p>}
      {!error && tracks === null && (
        <p className="py-2 text-sm text-muted-foreground">Đang tìm…</p>
      )}
      {!error && tracks !== null && (
        <TrackList
          tracks={tracks}
          radioOnTap
          emptyMessage="Không có kết quả trên YouTube."
        />
      )}
    </section>
  );
}
