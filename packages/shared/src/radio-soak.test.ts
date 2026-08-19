import { describe, expect, it } from "vitest";
import type { PersistStorage } from "zustand/middleware";
import {
  createPlayerStore,
  type PersistedPlayerState,
  type PlayerStore,
} from "./player-store";
import { createRadioClient } from "./radio-client";
import { createRadioEngine } from "./radio-engine";
import type { PlayableTrack } from "./types";

/**
 * Soak tier 1 — phiên nghe dài, chạy headless, trong CI, vài giây.
 *
 * Vì sao tồn tại: ngày 2026-08-16 người dùng báo "nghe chục bài là không next được
 * nữa" và "danh sách phát toàn bài lạ". Cả hai là MỘT vòng lặp — kho ứng viên hữu hạn
 * theo seed, bị bào mòn bởi mỗi cú skip, không bao giờ được gieo lại, và một cờ
 * `exhausted` chốt một chiều được ghi xuống đĩa. 96 test đơn vị lúc đó đều xanh, vì
 * không test nào chạy quá vài lượt chuyển bài.
 *
 * Nguyên tắc của file này: KHÔNG mô phỏng lại logic của app. Nó dựng store thật,
 * radio client thật, radio engine thật, và cắm một server giả vào đúng chỗ `fetch`.
 * Một soak test mô phỏng lại quyết định của app sẽ luôn xanh, kể cả khi app đã chết.
 */

const ARTISTS = 8;

/**
 * `tsconfig` của shared cố tình không nạp lib DOM lẫn Node — gói này chạy trên ba
 * runtime khác nhau. Lấy `setTimeout` qua `globalThis` giống cách `radio-client` lấy
 * `fetch`, thay vì kéo cả một lib vào chỉ để nhường một nhịp.
 */
const macrotask = () =>
  new Promise<void>((resolve) => {
    (
      globalThis as unknown as {
        setTimeout: (fn: () => void, ms: number) => unknown;
      }
    ).setTimeout(() => resolve(), 0);
  });

function memoryStorage(): PersistStorage<PersistedPlayerState> {
  const map = new Map<string, string>();
  return {
    getItem: (name) => {
      const raw = map.get(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem: (name, value) => {
      map.set(name, JSON.stringify(value));
    },
    removeItem: (name) => {
      map.delete(name);
    },
  };
}

function track(id: string, artist: string): PlayableTrack {
  return {
    id,
    source: "youtube",
    youtubeVideoId: id,
    title: id,
    artistId: artist,
    artistName: artist,
    albumId: null,
    albumName: null,
    coverUrl: null,
    durationSec: 200,
    trackNo: null,
    discNo: null,
    provider: null,
    codec: null,
    bitrate: null,
  };
}

interface ServerOptions {
  /** Số thứ tự các request /api/radio sẽ trả 500. */
  failOn?: number[];
}

/**
 * Server giả mô hình hoá YouTube Mix hiện tại: seed tạo trang đầu, rồi mỗi token
 * continuation mở đúng trang kế tiếp của cùng một danh sách vô hạn.
 */
function fakeServer(options: ServerOptions = {}) {
  const failOn = new Set(options.failOn ?? []);
  let radioCalls = 0;
  let digs = 0;

  const fetchImpl = async (url: string, init?: { body?: unknown }) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const ok = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => data,
    });

    if (url.endsWith("/api/radio")) {
      radioCalls += 1;
      if (failOn.has(radioCalls)) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "server toang" }),
        };
      }
      const page = body.continuation
        ? Number(String(body.continuation).replace("mix-page-", ""))
        : 0;
      if (body.seedId) digs += 1;
      const exclude = new Set<string>(body.exclude ?? []);
      const limit = Number(body.limit ?? 10);
      const tracks = Array.from({ length: limit }, (_, index) => {
        const n = page * 100 + index + 2;
        return track(`v${n}`, `art${n % ARTISTS}`);
      }).filter((item) => !exclude.has(item.id));
      return ok({
        tracks,
        continuation: `mix-page-${page + 1}`,
        playlistId: "RDAMVMv1",
      });
    }
    return ok({});
  };

  return {
    fetchImpl: fetchImpl as never,
    stats: () => ({
      radioCalls,
      digs,
    }),
  };
}

interface SoakResult {
  advances: number;
  died: number | null;
  everExhausted: boolean;
  uniqueTracks: number;
  duplicatePairs: number;
  digs: number;
}

/**
 * Chạy một phiên nghe: mỗi vòng là một bài nghe xong hoặc bị bỏ qua, rồi bấm next.
 * `skipEvery` mô phỏng người dùng bỏ qua bài không hợp gu — đây chính là hành vi làm
 * cạn kho, nên nó là điều kiện thử chứ không phải nhiễu.
 */
async function soak(opts: {
  advances: number;
  skipEvery: number;
  failOn?: number[];
}): Promise<SoakResult> {
  const server = fakeServer({ failOn: opts.failOn });
  const store: PlayerStore = createPlayerStore({
    storage: memoryStorage(),
    name: "soak",
  });
  const client = createRadioClient(store, { fetchImpl: server.fetchImpl });
  let clock = 0;
  const engine = createRadioEngine(store, client, { now: () => clock });

  const unsubscribe = store.usePlayer.subscribe((s) => engine.handle(s));
  const seed = track("v1", "art1");
  store.usePlayer.getState().setAutoplay(true);
  await client.startRadioFor(seed);

  const seen = new Set<string>();
  let duplicatePairs = 0;
  let died: number | null = null;
  let everExhausted = false;

  for (let i = 0; i < opts.advances; i++) {
    clock += 5000; // vượt qua mọi backoff; ta đang thử tính đúng, không thử tốc độ
    const before = store.usePlayer.getState();
    const current = before.queue[before.order[before.position]] ?? null;
    if (current) {
      const key = `${current.artistName}|${current.title}`;
      if (seen.has(key)) duplicatePairs += 1;
      seen.add(key);
      // Nghe hết hay bỏ qua sớm — đều là hành vi của NGƯỜI, nên đều được ghi feedback.
      const skipped = i % opts.skipEvery === 0;
      store.usePlayer.getState().seek(skipped ? 3 : 190);
    }

    store.usePlayer.getState().next();
    // Nhường cho các request nạp thêm đang bay kịp về.
    for (let t = 0; t < 8; t++) await Promise.resolve();
    await macrotask();
    for (let t = 0; t < 8; t++) await Promise.resolve();

    const after = store.usePlayer.getState();
    if (after.radio?.exhausted) everExhausted = true;

    // "Chết" = đứng ở cuối hàng đợi và hàng đợi không dài thêm nữa. Đây chính xác là
    // cái người dùng cảm nhận: bấm next, không có gì xảy ra.
    const atEnd = after.position >= after.order.length - 1;
    if (atEnd && !after.isPlaying && died === null) died = i + 1;
  }

  unsubscribe();
  return {
    advances: opts.advances,
    died,
    everExhausted,
    uniqueTracks: seen.size,
    duplicatePairs,
    digs: server.stats().digs,
  };
}

describe("soak: phiên nghe dài", () => {
  it("300 lần chuyển bài, người dùng bỏ qua 1/3 số bài — hàng đợi không được chết", async () => {
    const r = await soak({ advances: 300, skipEvery: 3 });
    expect(r.died).toBeNull();
    expect(r.everExhausted).toBe(false);
    expect(r.uniqueTracks).toBeGreaterThan(200);
  }, 30_000);

  it("một cú 500 giữa phiên không được làm chết cả phiên", async () => {
    // Đây là ca đã từng hỏng vĩnh viễn: `exhausted` bật vì MỘT lỗi mạng, được ghi
    // xuống đĩa, và `autoplaySeed` từ chối gieo lại vì đã có radio — app không bao giờ
    // tự phát tiếp được nữa, kể cả sau khi mở lại.
    const r = await soak({ advances: 120, skipEvery: 3, failOn: [3] });
    expect(r.died).toBeNull();
    expect(r.everExhausted).toBe(false);
  }, 30_000);

  it("người dùng bỏ qua rất nhiều bài vẫn không làm cạn hàng đợi", async () => {
    const r = await soak({ advances: 150, skipEvery: 1 });
    expect(r.died).toBeNull();
  }, 30_000);

  it("không lặp lại cùng một nghệ sĩ|tên bài trong phiên", async () => {
    const r = await soak({ advances: 150, skipEvery: 4 });
    expect(r.duplicatePairs).toBe(0);
  }, 30_000);

  it("continuation không được đào lại radio từ seed ở mỗi lần nạp", async () => {
    const r = await soak({ advances: 300, skipEvery: 3 });
    expect(r.digs).toBe(1);
  }, 30_000);
});
