"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
 * Màn hình "đang phát" toàn khung, dành cho điện thoại.
 *
 * Trên mobile thanh phát chỉ đủ chỗ cho tên bài và nút play/pause, nên mọi thứ
 * còn lại (tua, xáo bài, lặp, âm lượng) nằm ở đây.
 */
export function NowPlayingSheet({ onClose }: { onClose: () => void }) {
  const track = useCurrentTrack();

  // Đóng bằng phím Esc, và khoá cuộn nền phía sau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!track) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Đang phát"
      className="fixed inset-0 z-50 flex flex-col bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
        >
          <ChevronDown className="size-5" />
        </button>
        <p className="eyebrow">Đang phát</p>
        <span className="size-9" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-8 px-6 pb-6">
        <div className="relative mx-auto aspect-square w-full max-w-[min(20rem,60vh)]">
          <Cover
            url={track.coverUrl}
            title={track.albumName ?? track.title}
            size={400}
            fill
            priority
          />
        </div>

        <div className="min-w-0 text-center">
          <h2 className="truncate text-xl font-semibold">{track.title}</h2>
          {track.artistId ? (
            <Link
              href={`/artists/${track.artistId}`}
              onClick={onClose}
              className="mt-1 block truncate text-sm text-muted-foreground transition-colors hover:text-accent-text"
            >
              {track.artistName}
            </Link>
          ) : (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {track.artistName ?? "Không rõ nghệ sĩ"}
            </p>
          )}
          <SourceReadout
            className="mt-2 justify-center text-center"
            provider={track.provider ? PROVIDER_LABEL[track.provider] : null}
            codec={shortCodec(track.codec)}
            bitrate={track.bitrate}
          />
        </div>

        <div className="space-y-6">
          <Scrubber />
          <div className="flex justify-center">
            <TransportRow size="lg" />
          </div>
          <VolumeControl className="justify-center" />
        </div>
      </div>
    </div>
  );
}
