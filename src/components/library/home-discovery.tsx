"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowLeft, ArrowRight, Play } from "lucide-react";
import { Cover } from "@/components/library/cover";
import {
  findNewReleaseSection,
  type DiscoveryHomeSection,
} from "@vong/shared";
import { startRadioFor } from "@/lib/radio-client";
import { usePlayer } from "@/store/player";
import type { PlayableTrack } from "@vong/shared";

interface HomeDiscoveryProps {
  fallbackTracks: PlayableTrack[];
}

interface DiscoveryResponse {
  sections?: DiscoveryHomeSection[];
}

interface TrendingResponse {
  tracks?: PlayableTrack[];
}

function playTrack(track: PlayableTrack, context: PlayableTrack[], index: number) {
  if (track.source === "youtube") {
    startRadioFor(track);
    return;
  }
  usePlayer.getState().playQueue(context, index);
}

/**
 * Discovery ở client để trang thư viện có thể render ngay. Chỉ lớp này biết về
 * HTTP discovery; các rail và hero còn lại chỉ nhận PlayableTrack, nên luồng phát
 * luôn đi qua player/radio hiện có thay vì tạo engine thứ hai cho trang chủ.
 */
export function HomeDiscovery({ fallbackTracks }: HomeDiscoveryProps) {
  const [sections, setSections] = useState<DiscoveryHomeSection[] | null>(null);
  const [trending, setTrending] = useState<PlayableTrack[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      const [homeResult, trendingResult] = await Promise.all([
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
      ]);

      if (controller.signal.aborted) return;
      setSections(homeResult.sections ?? []);
      setTrending(trendingResult.tracks ?? []);
    };

    void load().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!controller.signal.aborted) setSections([]);
    });

    return () => controller.abort();
  }, []);

  const release = sections ? findNewReleaseSection(sections) : undefined;
  const featured = release?.tracks[0] ?? fallbackTracks[0];
  const discoverySections = sections?.filter((section) => section !== release) ?? [];

  return (
    <div className="space-y-12 pb-4 sm:space-y-16">
      <HomeHero track={featured} context={release?.tracks ?? fallbackTracks} />

      {sections === null ? (
        <DiscoveryLoading />
      ) : (
        <>
          {release && <InteractiveTrackRail title="Mới phát hành" tracks={release.tracks} />}
          {discoverySections.map((section) => (
            <InteractiveTrackRail
              key={section.title}
              title={section.title}
              tracks={section.tracks}
              label="Radio từ YouTube"
            />
          ))}
          {trending.length > 0 && (
            <InteractiveTrackRail title="Đang thịnh hành" tracks={trending} />
          )}
          {release === undefined && discoverySections.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              Chưa thể tải gợi ý lúc này. Thư viện và nhạc gần đây của bạn vẫn sẵn sàng.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function HomeHero({
  track,
  context,
}: {
  track: PlayableTrack | undefined;
  context: PlayableTrack[];
}) {
  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title" className="mb-5 text-3xl font-bold tracking-[-0.04em] sm:text-4xl lg:text-5xl">
        Âm nhạc dành cho bạn
      </h1>
      <div className="relative isolate min-h-[270px] overflow-hidden rounded-2xl border border-border bg-[#17191d] sm:min-h-[320px]">
        {track?.coverUrl && (
          <div className="absolute inset-y-0 right-0 hidden w-[68%] sm:block" aria-hidden>
            <Cover
              url={track.coverUrl}
              title={track.title}
              size={900}
              fill
              priority
              className="rounded-none opacity-60 [mask-image:linear-gradient(to_right,transparent,black_30%)]"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,20,24,0.98)_0%,rgba(18,20,24,0.84)_44%,rgba(18,20,24,0.22)_100%)]" aria-hidden />
        <div className="relative z-10 flex min-h-[270px] max-w-2xl flex-col justify-end p-5 sm:min-h-[320px] sm:p-8 lg:p-10">
          {track ? (
            <>
              <p className="text-sm font-medium text-muted-foreground">Khám phá ngay</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-4xl">{track.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
                {track.artistName ?? "YouTube Music"}
              </p>
              <button
                type="button"
                onClick={() => playTrack(track, context, Math.max(0, context.findIndex((item) => item.id === track.id)))}
                className="mt-6 inline-grid size-12 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105 focus-visible:scale-105 sm:size-14"
                aria-label={`Phát ${track.title}`}
              >
                <Play className="size-5 translate-x-px fill-current sm:size-6" />
              </button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Bắt đầu một phiên nghe mới</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Nối kho nhạc của bạn hoặc tìm kiếm một bài hát để Vọng xây gợi ý dành riêng cho bạn.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function InteractiveTrackRail({
  title,
  tracks,
  label,
}: {
  title: string;
  tracks: PlayableTrack[];
  label?: string;
}) {
  const headingId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointerX: number; scrollLeft: number } | null>(null);
  const suppressClick = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const canExpand = expanded || canScrollBack || canScrollForward;

  const updateScrollControls = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setCanScrollBack(rail.scrollLeft > 2);
    setCanScrollForward(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || expanded) return;
    updateScrollControls();
    const observer = new ResizeObserver(updateScrollControls);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [expanded, tracks.length, updateScrollControls]);

  if (tracks.length === 0) return null;

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollBy({
      left: direction * Math.max(240, rail.clientWidth * 0.78),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const rail = railRef.current;
    if (!rail) return;
    event.preventDefault();
    dragStart.current = { pointerX: event.clientX, scrollLeft: rail.scrollLeft };
    suppressClick.current = false;
    rail.style.scrollSnapType = "none";
    rail.style.scrollBehavior = "auto";
    rail.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const rail = railRef.current;
    if (!start || !rail) return;
    event.preventDefault();
    const distance = event.clientX - start.pointerX;
    if (Math.abs(distance) > 5) suppressClick.current = true;
    rail.scrollLeft = start.scrollLeft - distance;
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    dragStart.current = null;
    if (rail?.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    if (rail) {
      rail.style.scrollSnapType = "";
      rail.style.scrollBehavior = "";
    }
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
  };

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {label && <p className="mt-1 text-xs text-subtle">{label}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!expanded && (
            <div className="hidden items-center gap-1 sm:flex" aria-label={`Cuộn dải ${title}`}>
              <button
                type="button"
                onClick={() => scrollRail(-1)}
                disabled={!canScrollBack}
                className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-[color,background-color,transform,opacity] hover:scale-105 hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label={`Cuộn ${title} sang trái`}
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollRail(1)}
                disabled={!canScrollForward}
                className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-[color,background-color,transform,opacity] hover:scale-105 hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                aria-label={`Cuộn ${title} sang phải`}
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
          )}
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-medium text-accent-text transition-[color,background-color,transform] hover:scale-[1.03] hover:bg-surface focus-visible:bg-surface"
            >
              {expanded ? "Thu gọn" : "Xem tất cả"}
              <ArrowRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>
      </div>
      <div
        ref={railRef}
        data-testid="discovery-track-rail"
        onScroll={updateScrollControls}
        onPointerDown={expanded ? undefined : handlePointerDown}
        onPointerMove={expanded ? undefined : handlePointerMove}
        onPointerUp={expanded ? undefined : finishPointerDrag}
        onPointerCancel={expanded ? undefined : finishPointerDrag}
        onClickCapture={expanded ? undefined : handleClickCapture}
        className={expanded
          ? "content-reveal grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
          : "-mx-4 flex cursor-grab snap-x gap-3 overflow-x-auto px-4 pb-2 active:cursor-grabbing md:-mx-2 md:px-2"
        }
      >
        {tracks.map((track, index) => (
          <button
            key={track.id}
            type="button"
            onClick={() => playTrack(track, tracks, index)}
            className={expanded
              ? "group min-w-0 text-left"
              : "group w-36 shrink-0 snap-start select-none text-left sm:w-40 lg:w-44"
            }
            aria-label={`Phát ${track.title}`}
          >
            <span className="relative block aspect-square overflow-hidden rounded-xl bg-surface shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
              <Cover
                url={track.coverUrl}
                title={track.albumName ?? track.title}
                size={176}
                fill
                className="rounded-xl transition-transform duration-300 group-hover:scale-[1.04]"
                draggable={false}
              />
              <span className="absolute bottom-2 right-2 grid size-10 translate-y-1 place-items-center rounded-full bg-accent text-accent-foreground opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                <Play className="size-4 translate-x-px fill-current" />
              </span>
            </span>
            <span className="mt-2.5 block truncate text-sm font-semibold">{track.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {track.artistName ?? "YouTube Music"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DiscoveryLoading() {
  return (
    <section aria-label="Đang tải nhạc mới" aria-busy="true">
      <div className="mb-4 h-7 w-40 animate-pulse rounded bg-surface" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="w-36 shrink-0 sm:w-40 lg:w-44">
            <div className="aspect-square animate-pulse rounded-xl bg-surface" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-surface" />
            <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-surface" />
          </div>
        ))}
      </div>
    </section>
  );
}
