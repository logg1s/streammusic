"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrackList } from "@/components/library/track-list";
import type { PlayableTrack } from "@vong/shared";

export interface PlaylistTrackItem {
  itemId: string;
  track: PlayableTrack;
}

export function PlaylistTracks({
  playlistId,
  items,
}: {
  playlistId: string;
  items: PlaylistTrackItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* TrackList chỉ biết vị trí trong danh sách, còn API xoá theo itemId — cùng
     một video có thể nằm hai lần trong playlist nên không tra theo track.id. */
  const remove = async (_track: PlayableTrack, index: number) => {
    const item = items[index];
    if (!item || busy) return;
    setBusy(true);
    await fetch(`/api/playlists/${playlistId}/items/${item.itemId}`, {
      method: "DELETE",
    });
    setBusy(false);
    router.refresh();
  };

  /**
   * Đổi chỗ hai bài kề nhau rồi gửi CẢ thứ tự mới: server đòi tập itemId trùng khít
   * tập hiện có, nhờ vậy hai tab mở song song không ghi đè nhau âm thầm.
   */
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (busy || target < 0 || target >= items.length) return;

    const itemIds = items.map((item) => item.itemId);
    [itemIds[index], itemIds[target]] = [itemIds[target], itemIds[index]];

    setBusy(true);
    setError(null);
    const res = await fetch(`/api/playlists/${playlistId}/items`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemIds }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Không đổi được thứ tự.");
      return;
    }
    router.refresh();
  };

  return (
    <>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      <TrackList
        tracks={items.map((item) => item.track)}
        variant="numbered"
        emptyMessage="Playlist này chưa có bài nào."
        onRemove={remove}
        onMove={(index, delta) => void move(index, delta)}
      />
    </>
  );
}
