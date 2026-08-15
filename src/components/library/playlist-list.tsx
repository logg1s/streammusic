"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { PlaylistSummary } from "@/lib/playlists";

/*
  Múi giờ cố định: server và client cùng render danh sách này, để Intl tự đoán
  múi giờ thì hai bên ra hai chuỗi khác nhau và React báo lệch hydrate.
*/
const DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function PlaylistList({ playlists }: { playlists: PlaylistSummary[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  const remove = async (playlist: PlaylistSummary) => {
    if (!confirm(`Xoá playlist "${playlist.name}"? Không khôi phục lại được.`))
      return;
    setRemoving(playlist.id);
    await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    setRemoving(null);
    router.refresh();
  };

  return (
    <ul className="divide-y divide-border">
      {playlists.map((playlist) => (
        <li key={playlist.id} className="flex items-center gap-2">
          <Link
            href={`/playlists/${playlist.id}`}
            className="min-w-0 flex-1 rounded-md px-2 py-3 transition-colors hover:bg-surface"
          >
            <span className="block truncate text-sm font-medium">
              {playlist.name}
            </span>
            <span className="readout mt-0.5 block truncate">
              {[
                `${playlist.itemCount} bài`,
                DATE_FORMAT.format(playlist.createdAt),
                playlist.seedLabel ? `Radio · ${playlist.seedLabel}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </span>
          </Link>

          <button
            type="button"
            aria-label={`Xoá playlist ${playlist.name}`}
            title="Xoá playlist"
            disabled={removing === playlist.id}
            onClick={() => remove(playlist)}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            {removing === playlist.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
