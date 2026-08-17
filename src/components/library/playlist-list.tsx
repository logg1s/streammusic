"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import type { PlaylistSummary } from "@vong/shared";
import { formatNumber, formatVnDate } from "@/lib/utils";

export function PlaylistList({ playlists }: { playlists: PlaylistSummary[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const remove = async (playlist: PlaylistSummary) => {
    setRemoving(playlist.id);
    await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    setRemoving(null);
    setConfirming(null);
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
                `${formatNumber(playlist.itemCount)} bài`,
                formatVnDate(playlist.createdAt),
                playlist.seedLabel ? `Radio · ${playlist.seedLabel}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </span>
          </Link>

          {confirming === playlist.id ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="px-1 text-xs text-muted-foreground">Xoá?</span>
              <button
                type="button"
                aria-label={`Xác nhận xoá playlist ${playlist.name}`}
                title="Xoá — không khôi phục lại được"
                disabled={removing === playlist.id}
                onClick={() => remove(playlist)}
                className="grid size-8 place-items-center rounded-md text-danger transition-colors hover:bg-surface disabled:opacity-50"
              >
                {removing === playlist.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
              </button>
              <button
                type="button"
                aria-label="Huỷ xoá"
                title="Huỷ"
                onClick={() => setConfirming(null)}
                className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Xoá playlist ${playlist.name}`}
              title="Xoá playlist"
              onClick={() => setConfirming(playlist.id)}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
