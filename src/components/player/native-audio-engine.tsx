"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createYoutubeResolver,
  type FetchLike,
  type PlayableTrack,
  type YoutubeResolver,
} from "@vong/shared";
import { peekCurrentTrack, registerSink, useCurrentTrack, usePlayer } from "@/store/player";

/**
 * Engine phát nhạc khi app chạy trong vỏ Tauri (Windows).
 *
 * Thay cho `AudioEngine` + `YouTubeEngine`: không có thẻ `<audio>`, không có iframe.
 * Byte đi thẳng xuống Rust (`invoke("play_track")`), Rust bắn `player://tick` về đây để
 * scrubber và nút bấm vẫn sống.
 *
 * ── VÌ SAO KHÔNG DÙNG WEBVIEW2 ĐỂ PHÁT ───────────────────────────────────────
 * Windows gỡ tài nguyên của WebView2 khi cửa sổ thu nhỏ — nhạc rè rồi đứt. Đây chính là
 * lý do có vỏ native: Rust giữ tiếng, WebView chỉ còn là UI.
 *
 * ── BẤT BIẾN ─────────────────────────────────────────────────────────────────
 * Chỉ MỘT engine được mount trong một phiên. `PlaybackEngines` chọn một lần trong
 * `useState` initializer; đổi engine giữa phiên là mất tiếng vì bên kia không biết mình
 * đang giữ bài nào.
 */

/** Xin lại token trước khi hết hạn ngần này — khỏi đứt giữa bài. */
const TOKEN_MARGIN_MS = 60_000;

interface TickPayload {
  posMs: number;
  durMs: number;
  playing: boolean;
  ended: boolean;
}

/** Vỏ Tauri có `invoke`/`listen` không? Đọc một lần, không đổi trong phiên. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * `fetch` của `plugin-http`, đã gỡ header `Origin`.
 *
 * Plugin **tự thêm** `Origin: <origin của trang>` vào mọi request, và InnerTube trả `403`
 * đúng vì header đó (đo 2026-08-15 từ Node: không Origin → `200`; thêm
 * `Origin: http://localhost:3000` → `403`; user-agent thì không ảnh hưởng). Với feature
 * `unsafe-headers`, gửi `origin: ""` là plugin xoá hẳn header — giống `fetch` phía server.
 */
async function tauriFetch(): Promise<FetchLike> {
  const { fetch: httpFetch } = await import("@tauri-apps/plugin-http");
  return (url, init) =>
    httpFetch(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), origin: "" },
    });
}

export function NativeAudioEngine() {
  const track = useCurrentTrack();
  const trackId = track?.id ?? null;
  const isPlaying = usePlayer((s) => s.isPlaying);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);

  /** Phiên khách của InnerTube, dùng lại giữa các bài. */
  const resolverRef = useRef<YoutubeResolver | null>(null);
  /** Token Bearer cho `/api/stream/<id>`, kèm mốc hết hạn. */
  const tokenRef = useRef<{ token: string; expiresAt: number } | null>(null);
  /**
   * Bài mà Rust đang giữ. So với `trackId` để biết có phải nạp lại hay không — không
   * dùng làm khoá render, chỉ để effect đổi bài chạy đúng một lần cho mỗi bài.
   */
  const loadedRef = useRef<string | null>(null);
  /**
   * Đang nạp bài: trong quãng này Rust còn im (sink rỗng) nên `tick` báo
   * `playing: false`, `ended: true`. Nghe theo là UI nhảy bài vô hạn.
   */
  const loadingRef = useRef(false);
  /**
   * Đếm số lần phải nạp lại CÙNG một bài (lặp một bài). Không có nó, effect đổi bài
   * không chạy lại vì `trackId` không đổi, mà `seek(0)` thì vô nghĩa — sink của Rust đã
   * cạn byte khi bài hết.
   */
  const [reloadNonce, setReloadNonce] = useState(0);

  const sessionToken = useCallback(async () => {
    const cached = tokenRef.current;
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return cached.token;
    }
    const res = await fetch("/api/native/session-token", {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Chưa đăng nhập nên không lấy được token");
    const minted = (await res.json()) as { token: string; expiresAt: string };
    const value = {
      token: minted.token,
      expiresAt: new Date(minted.expiresAt).getTime(),
    };
    tokenRef.current = value;
    return value.token;
  }, []);

  /** Lệnh `play_track` cho một bài, đã gồm cả header và metadata cho SMTC. */
  const loadTrack = useCallback(
    async (item: PlayableTrack, startSec: number) => {
      const { invoke } = await import("@tauri-apps/api/core");

      if (item.source === "youtube") {
        if (!item.youtubeVideoId) throw new Error("Bài YouTube thiếu videoId");
        // WebView2 vẫn áp CORS, nên request InnerTube phải đi qua Rust (`plugin-http`).
        resolverRef.current ??= createYoutubeResolver(await tauriFetch());
        const audio = await resolverRef.current.resolve(item.youtubeVideoId);
        // Rust tự gắn `Range: bytes=<start>-` (không có header đó googlevideo bóp băng
        // thông còn ~32 KiB/s) và tự đọc độ dài/khuôn từ header của response.
        await invoke("play_track", {
          track: {
            url: audio.url,
            headers: [],
            title: item.title,
            artist: item.artistName ?? audio.channelTitle,
            album: item.albumName ?? "",
            artworkUrl: item.coverUrl,
            durationSec: item.durationSec ?? audio.durationSec,
            startSec,
          },
        });
        return;
      }

      const token = await sessionToken();
      await invoke("play_track", {
        track: {
          url: `${window.location.origin}/api/stream/${item.id}`,
          headers: [["authorization", `Bearer ${token}`]],
          title: item.title,
          artist: item.artistName ?? "",
          album: item.albumName ?? "",
          artworkUrl: item.coverUrl,
          durationSec: item.durationSec ?? 0,
          startSec,
        },
      });
    },
    [sessionToken],
  );

  // 1. Sink của cả hai nguồn: tua là việc của Rust.
  useEffect(() => {
    const seek = (seconds: number) => {
      void import("@tauri-apps/api/core").then(({ invoke }) =>
        invoke("seek", { pos: seconds }),
      );
    };
    registerSink("library", { seek });
    registerSink("youtube", { seek });
    return () => {
      registerSink("library", null);
      registerSink("youtube", null);
    };
  }, []);

  // 2. Đổi bài — hoặc nạp lại chính bài đó khi đang lặp một bài. Không phụ thuộc tên/ảnh
  //    bìa: đổi metadata thì không kéo lại byte.
  useEffect(() => {
    if (!trackId) {
      loadedRef.current = null;
      return;
    }
    if (loadedRef.current === trackId) return;

    const item = peekCurrentTrack();
    if (!item || item.id !== trackId) return;

    const state = usePlayer.getState();
    // Khôi phục chỗ đang nghe sau khi mở lại app: chỉ dùng đúng một lần.
    const startSec = state.consumePendingSeek() ?? 0;

    loadedRef.current = trackId;
    loadingRef.current = true;
    state.setBuffering(true);

    void loadTrack(item, startSec)
      .then(async () => {
        loadingRef.current = false;
        usePlayer.getState().setBuffering(false);
        // Rust phát ngay khi nạp; store đang tạm dừng thì bảo nó dừng theo.
        if (!usePlayer.getState().isPlaying) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("pause");
        }
      })
      .catch((error: unknown) => {
        loadingRef.current = false;
        loadedRef.current = null;
        const store = usePlayer.getState();
        store.setBuffering(false);
        store.setError(
          error instanceof Error
            ? error.message
            : "Không phát được bài này trên máy này.",
        );
      });
  }, [trackId, reloadNonce, loadTrack]);

  // 3. Phát/tạm dừng. Bài đang nạp thì bỏ qua — `loadTrack` tự chốt trạng thái cuối.
  useEffect(() => {
    if (!trackId || loadingRef.current) return;
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke(isPlaying ? "resume" : "pause"),
    );
  }, [isPlaying, trackId]);

  // 4. Âm lượng. Tắt tiếng = âm lượng 0: Rust chỉ có một núm.
  useEffect(() => {
    void import("@tauri-apps/api/core").then(({ invoke }) =>
      invoke("set_volume", { volume: muted ? 0 : volume }),
    );
  }, [volume, muted]);

  // 5. Event từ Rust: nhịp thời gian, hết bài, và các nút trên thanh media của Windows.
  useEffect(() => {
    let disposed = false;
    const offs: Array<() => void> = [];

    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const add = async (
        name: string,
        handler: (payload: unknown) => void,
      ) => {
        const off = await listen(name, (event) => handler(event.payload));
        if (disposed) off();
        else offs.push(off);
      };

      await add("player://tick", (payload) => {
        const tick = payload as TickPayload;
        if (loadingRef.current) return;
        const store = usePlayer.getState();
        // Rust chỉ biết thời lượng qua metadata gửi kèm; thiếu thì giữ lấy con số
        // trong hàng đợi, đừng trả 0 làm scrubber sập về đầu.
        const durSec =
          tick.durMs > 0 ? tick.durMs / 1000 : (store.duration ?? 0);
        store.syncTime(tick.posMs / 1000, durSec);
        store.syncPlaying(tick.playing);
      });
      await add("player://ended", () => {
        if (loadingRef.current) return;
        // Nhả `loadedRef` rồi bơm nonce: lặp một bài giữ nguyên `trackId`, không có
        // nonce thì effect nạp bài không bao giờ chạy lại.
        loadedRef.current = null;
        usePlayer.getState().handleEnded();
        setReloadNonce((n) => n + 1);
      });
      await add("player://next", () => usePlayer.getState().next());
      await add("player://previous", () => usePlayer.getState().previous());
      await add("player://playing", (payload) =>
        usePlayer.getState().syncPlaying(payload === true),
      );
      await add("player://seeked", (payload) => {
        if (typeof payload === "number") {
          usePlayer.getState().syncTime(payload, usePlayer.getState().duration);
        }
      });
    });

    return () => {
      disposed = true;
      offs.forEach((off) => off());
    };
  }, []);

  return null;
}
