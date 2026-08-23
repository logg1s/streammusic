"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronDown, ListMusic } from "lucide-react";
import { Cover } from "@/components/library/cover";
import {
  Scrubber,
  SourceReadout,
  TransportRow,
  VolumeControl,
} from "@/components/player/controls";
import { PROVIDER_LABEL } from "@/lib/provider-labels";
import { shortCodec } from "@/lib/utils";
import { useCurrentTrack } from "@/store/player";

/**
 * Mặt nghe nhạc toàn khung cho desktop/Windows. Đây chỉ là một góc nhìn khác của
 * shared player state: không mount engine và không giữ audio element/iframe riêng.
 */
export function DesktopNowPlaying({
  onClose,
  onOpenQueue,
}: {
  onClose: () => void;
  onOpenQueue: () => void;
}) {
  const track = useCurrentTrack();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!track) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đang phát"
      className="fixed inset-0 z-50 hidden bg-background/92 backdrop-blur-xl md:block"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {track.coverUrl && (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
            style={{ backgroundImage: `url("${track.coverUrl}")` }}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,transparent,rgba(8,9,11,0.82)_65%)]" />
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl flex-col px-8 py-7 lg:px-14">
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronDown className="size-5" />
          </button>
          <p className="eyebrow">Đang phát</p>
          <button
            type="button"
            onClick={onOpenQueue}
            aria-label="Hàng đợi"
            className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <ListMusic className="size-5" />
          </button>
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 items-center gap-12 py-8 lg:gap-20">
          <div className="relative aspect-square w-[min(42vw,34rem)] shrink-0 overflow-hidden rounded-2xl shadow-2xl">
            <Cover
              url={track.coverUrl}
              title={track.albumName ?? track.title}
              size={700}
              fill
              priority
              className="rounded-2xl"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="eyebrow">{track.source === "youtube" ? "YouTube Music" : "Thư viện"}</p>
            <h2 className="mt-3 line-clamp-2 break-words text-3xl font-bold tracking-[-0.04em] lg:text-5xl">
              {track.title}
            </h2>
            {track.artistId ? (
              <Link
                href={`/artists/${track.artistId}`}
                onClick={onClose}
                className="mt-2 block line-clamp-2 break-words text-lg text-muted-foreground transition-colors hover:text-accent-text"
              >
                {track.artistName}
              </Link>
            ) : (
              <p className="mt-2 line-clamp-2 break-words text-lg text-muted-foreground">
                {track.artistName ?? "Không rõ nghệ sĩ"}
              </p>
            )}
            <SourceReadout
              className="mt-3"
              provider={track.provider ? PROVIDER_LABEL[track.provider] : null}
              codec={shortCodec(track.codec)}
              bitrate={track.bitrate}
            />

            <div className="mt-12 space-y-8">
              <Scrubber />
              <div className="flex justify-center">
                <TransportRow size="lg" />
              </div>
              <VolumeControl className="justify-center" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
