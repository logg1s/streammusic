"use client";

import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  ListEnd,
  ListPlus,
  ListStart,
  Play,
  Radio,
  Heart,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AddToPlaylist } from "@/components/library/add-to-playlist";
import { useFavorites } from "@/components/favorites-provider";
import { Cover } from "@/components/library/cover";
import { Equalizer } from "@/components/player/equalizer";
import { useRadioConfig } from "@/components/player/radio-context";
import type { PlayableTrack } from "@vong/shared";
import { startRadioFor } from "@/lib/radio-client";
import { cn, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/store/player";

interface TrackListProps {
  tracks: PlayableTrack[];
  /**
   * "numbered" = số thứ tự trong album (theo track_no); "positioned" = đánh số theo vị
   * trí trong danh sách, dùng cho playlist; "covered" = hiện ảnh bìa, số theo vị trí.
   */
  variant?: "numbered" | "covered" | "positioned";
  emptyMessage?: string;
  /** Có mặt thì mỗi dòng thêm nút bỏ bài — dùng ở trang playlist. */
  onRemove?: (track: PlayableTrack, index: number) => void;
  /** Có mặt thì mỗi dòng thêm nút ▲▼ đổi thứ tự — dùng ở trang playlist. */
  onMove?: (index: number, delta: number) => void;
  /**
   * Giữ để tương thích nơi gọi cũ. Nguồn bài nay quyết định hành vi: YouTube mở Mix,
   * thư viện phát đúng hàng đợi hữu hạn.
   */
  radioOnTap?: boolean;
  /** Ẩn ngay dòng vừa bỏ thích ở trang Yêu thích. */
  hideUnfavorited?: boolean;
}

const MENU_ITEM =
  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

/*
  Lưới cột cố định thay vì flex co giãn: trên màn rộng, flex đẩy cột album ra tận
  mép phải và để lại một khoảng trống lớn giữa tên bài và album. Cột album chỉ
  xuất hiện từ lg trở lên, dưới đó không đủ chỗ để đọc.
*/
const ROW_GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(0,1fr)_auto]";

interface TrackMenuState {
  track: PlayableTrack;
  index: number;
  x: number;
  y: number;
}

const MENU_WIDTH = 224;

function menuPosition(x: number, y: number) {
  const margin = 8;
  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - MENU_WIDTH - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - 360)),
  };
}

export function TrackList({
  tracks,
  variant = "covered",
  emptyMessage = "Chưa có bài nào ở đây.",
  onRemove,
  onMove,
  hideUnfavorited = false,
}: TrackListProps) {
  const favorites = useFavorites();
  const radioEnabled = useRadioConfig().enabled;
  const playQueue = usePlayer((s) => s.playQueue);
  const currentId = usePlayer((s) => s.queue[s.order[s.position]]?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const insertNext = usePlayer((s) => s.insertNext);
  const appendTracks = usePlayer((s) => s.appendTracks);
  const [menu, setMenu] = useState<TrackMenuState | null>(null);
  const [playlistTrack, setPlaylistTrack] = useState<PlayableTrack | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();

    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const visibleTracks = hideUnfavorited
    ? tracks.filter((track) => favorites.ids.has(track.id))
    : tracks;

  if (visibleTracks.length === 0) {
    return <p className="py-8 text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const onTap = (track: PlayableTrack, index: number) => {
    if (radioEnabled && track.source === "youtube") {
      startRadioFor(track);
    }
    else playQueue(visibleTracks, index);
  };

  const openMenu = (
    track: PlayableTrack,
    index: number,
    x: number,
    y: number,
  ) => {
    const position = menuPosition(x, y);
    setMenu({ track, index, ...position });
  };

  const runMenuAction = (action: () => void) => {
    setMenu(null);
    action();
  };

  return (
    <>
    <ol className="space-y-0.5">
      {visibleTracks.map((track, index) => {
        const isCurrent = track.id === currentId;
        const isFavorite = favorites.ids.has(track.id);
        return (
          <li
            key={track.id}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu(track, index, event.clientX, event.clientY);
            }}
            className={cn(
              ROW_GRID,
              "group/row relative min-w-0 rounded-md px-2 py-2 transition-colors hover:bg-surface focus-within:bg-surface",
              isCurrent && "bg-surface",
            )}
          >
            <button
              type="button"
              onClick={() => onTap(track, index)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Phát ${track.title}`}
              className="absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            />

            <span className="pointer-events-none relative z-10 grid place-items-center">
              {isCurrent ? (
                <Equalizer playing={isPlaying} />
              ) : (
                <>
                  <span className="tnum text-xs text-subtle group-hover/row:hidden">
                    {variant === "numbered"
                      ? (track.trackNo ?? index + 1)
                      : index + 1}
                  </span>
                  <Play className="hidden size-3.5 fill-foreground text-foreground group-hover/row:block" />
                </>
              )}
            </span>

            <span className="pointer-events-none relative z-10 flex min-w-0 items-center gap-3">
              {variant === "covered" && (
                <Cover
                  url={track.coverUrl}
                  title={track.albumName ?? track.title}
                  size={36}
                />
              )}
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm",
                    isCurrent
                      ? "font-medium text-accent-text"
                      : "text-foreground",
                  )}
                >
                  {track.title}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">
                    {track.artistName ?? "Không rõ nghệ sĩ"}
                  </span>
                  {track.source === "youtube" && (
                    <span className="readout shrink-0">YouTube</span>
                  )}
                </span>
              </span>
            </span>

            <span className="pointer-events-none relative z-10 hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
              {track.albumName}
            </span>

            <span className="relative z-20 flex items-center justify-end gap-1">
              <button
                type="button"
                aria-label={
                  isFavorite ? "Bỏ khỏi Yêu thích" : "Thêm vào Yêu thích"
                }
                title={
                  isFavorite ? "Bỏ khỏi Yêu thích" : "Thêm vào Yêu thích"
                }
                disabled={favorites.pending.has(track.id)}
                onClick={() => void favorites.toggle(track.id).catch(() => undefined)}
                className={cn(
                  "grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100",
                  isFavorite && "opacity-100 text-accent-text hover:text-accent-text",
                )}
              >
                <Heart
                  className={cn("size-4", isFavorite && "fill-current")}
                />
              </button>

              <span className="tnum w-10 text-right text-xs text-subtle">
                {formatDuration(track.durationSec)}
              </span>

              <button
                type="button"
                aria-label={`Tùy chọn cho ${track.title}`}
                aria-haspopup="menu"
                aria-expanded={menu?.track.id === track.id}
                title="Tùy chọn khác"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMenu(track, index, rect.right - MENU_WIDTH, rect.bottom + 6);
                }}
                className="grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-colors hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100"
              >
                <Ellipsis className="size-5" />
              </button>
            </span>
          </li>
        );
      })}
    </ol>

    {menu && createPortal(
      <>
        <button
          type="button"
          aria-label="Đóng menu tùy chọn"
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu(null);
          }}
        />
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Tùy chọn cho ${menu.track.title}`}
          className="fixed z-50 w-56 rounded-lg border border-border bg-surface p-1.5 shadow-2xl"
          style={{ left: menu.x, top: menu.y }}
        >
          {radioEnabled && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runMenuAction(() => startRadioFor(menu.track))}
              className={MENU_ITEM}
            >
              <Radio className="size-4" />
              Phát radio từ bài này
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            disabled={favorites.pending.has(menu.track.id)}
            onClick={() =>
              runMenuAction(() => {
                void favorites.toggle(menu.track.id).catch(() => undefined);
              })
            }
            className={MENU_ITEM}
          >
            <Heart
              className={cn(
                "size-4",
                favorites.ids.has(menu.track.id) && "fill-current text-accent-text",
              )}
            />
            {favorites.ids.has(menu.track.id)
              ? "Bỏ khỏi Yêu thích"
              : "Thêm vào Yêu thích"}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runMenuAction(() => insertNext(menu.track))}
            className={MENU_ITEM}
          >
            <ListStart className="size-4" />
            Phát tiếp
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => runMenuAction(() => appendTracks([menu.track]))}
            className={MENU_ITEM}
          >
            <ListEnd className="size-4" />
            Thêm vào hàng đợi
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null);
              setPlaylistTrack(menu.track);
            }}
            className={MENU_ITEM}
          >
            <ListPlus className="size-4" />
            Thêm vào playlist
          </button>

          {(onMove || onRemove) && <div className="my-1 border-t border-border" />}

          {onMove && (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={menu.index === 0}
                onClick={() => runMenuAction(() => onMove(menu.index, -1))}
                className={MENU_ITEM}
              >
                <ChevronUp className="size-4" />
                Đưa lên trên
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={menu.index === visibleTracks.length - 1}
                onClick={() => runMenuAction(() => onMove(menu.index, 1))}
                className={MENU_ITEM}
              >
                <ChevronDown className="size-4" />
                Đưa xuống dưới
              </button>
            </>
          )}

          {onRemove && (
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runMenuAction(() => onRemove(menu.track, menu.index))
              }
              className={cn(MENU_ITEM, "text-red-400 hover:text-red-300")}
            >
              <X className="size-4" />
              Bỏ khỏi playlist
            </button>
          )}
        </div>
      </>,
      document.body,
    )}

    {playlistTrack && (
      <AddToPlaylist
        key={playlistTrack.id}
        track={playlistTrack}
        open
        hideTrigger
        onOpenChange={(open) => {
          if (!open) setPlaylistTrack(null);
        }}
      />
    )}
    </>
  );
}

/** Nút "Phát tất cả" đặt ở đầu trang album/nghệ sĩ. */
export function PlayAllButton({
  tracks,
  label = "Phát tất cả",
}: {
  tracks: PlayableTrack[];
  label?: string;
}) {
  const playQueue = usePlayer((s) => s.playQueue);

  return (
    <button
      type="button"
      disabled={tracks.length === 0}
      onClick={() => playQueue(tracks, 0)}
      className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-subtle disabled:hover:scale-100"
    >
      <Play className="size-4 fill-current" />
      {label}
    </button>
  );
}
