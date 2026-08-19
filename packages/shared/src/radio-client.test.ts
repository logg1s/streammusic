import { describe, expect, it } from "vitest";
import type { PersistStorage } from "zustand/middleware";
import { autoplaySeed, createRadioClient } from "./radio-client";
import {
  createPlayerStore,
  type PersistedPlayerState,
  type PlayerState,
} from "./player-store";
import type { FetchLike, PlayableTrack } from "./types";

function track(id: string): PlayableTrack {
  return {
    id,
    source: "youtube",
    youtubeVideoId: id,
    title: id,
    artistId: null,
    artistName: "A",
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

function libraryTrack(id: string): PlayableTrack {
  return {
    ...track(id),
    source: "library",
    youtubeVideoId: null,
    provider: "google_drive",
  };
}

/** State tối thiểu để thử `autoplaySeed` — hàm chỉ đọc vài trường. */
function state(over: Partial<PlayerState>): PlayerState {
  const queue = over.queue ?? [track("a"), track("b"), track("c")];
  return {
    queue,
    order: over.order ?? queue.map((_, i) => i),
    position: over.position ?? 0,
    autoplay: over.autoplay ?? true,
    radio: over.radio ?? null,
    repeat: over.repeat ?? "off",
  } as PlayerState;
}

describe("autoplaySeed", () => {
  it("trả bài đang phát khi đã tới sát cuối hàng đợi thường", () => {
    const seed = autoplaySeed(state({ position: 2 })); // 3 bài, còn 0 phía sau
    expect(seed?.id).toBe("c");
  });

  it("kích hoạt đúng ngưỡng REFILL_THRESHOLD (còn ≤ 2 bài)", () => {
    const five = [track("a"), track("b"), track("c"), track("d"), track("e")];
    // position 2 → còn 2 bài phía sau (d,e) = ngưỡng
    expect(autoplaySeed(state({ queue: five, position: 2 }))?.id).toBe("c");
    // position 1 → còn 3 bài phía sau → chưa tới
    expect(autoplaySeed(state({ queue: five, position: 1 }))).toBeNull();
  });

  it("null khi tắt autoplay", () => {
    expect(autoplaySeed(state({ position: 2, autoplay: false }))).toBeNull();
  });

  it("null với bài thư viện dù cờ autoplay cũ vẫn đang bật", () => {
    const queue = [libraryTrack("drive-a")];
    expect(
      autoplaySeed(state({ queue, order: [0], position: 0, autoplay: true })),
    ).toBeNull();
  });

  it("null khi đã có radio chạy (RadioController tự nạp thêm)", () => {
    const radio = {
      seedId: "a",
      seedLabel: "A",
      playlistId: null,
      continuation: "next",
      blockedIds: [],
      status: "idle" as const,
      exhausted: false,
      message: null,
      errorKind: null,
    };
    expect(autoplaySeed(state({ position: 2, radio }))).toBeNull();
  });

  it("null khi đang lặp (hàng đợi không bao giờ 'hết')", () => {
    expect(autoplaySeed(state({ position: 2, repeat: "all" }))).toBeNull();
    expect(autoplaySeed(state({ position: 2, repeat: "one" }))).toBeNull();
  });

  it("null khi hàng đợi rỗng", () => {
    expect(autoplaySeed(state({ queue: [], order: [], position: 0 }))).toBeNull();
  });

  it("null khi còn xa cuối hàng đợi", () => {
    const ten = Array.from({ length: 10 }, (_, i) => track(`t${i}`));
    expect(autoplaySeed(state({ queue: ten, position: 0 }))).toBeNull();
  });

  it("seed là bài ở vị trí phát hiện tại, tôn trọng order (xáo bài)", () => {
    const q = [track("a"), track("b"), track("c")];
    // order xáo: phát b (index 1) ở cuối
    const seed = autoplaySeed(state({ queue: q, order: [0, 2, 1], position: 2 }));
    expect(seed?.id).toBe("b");
  });
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

describe("startRadioFor", () => {
  it("loại CẢ hàng đợi khỏi lô đầu, không chỉ seed", async () => {
    // Autoplay biến playlist thành radio: hàng đợi vẫn còn nguyên các bài vừa nghe.
    // Lô đầu phải loại TẤT CẢ chúng, nếu không server trả lại chính playlist đó — lô
    // đầu vừa thiếu bài (client lọc trùng bỏ đi) vừa lặp lại bài vừa bỏ qua.
    const store = createPlayerStore({ storage: memoryStorage(), name: "t" });
    const playlist = ["a", "b", "c", "d"].map(track);
    // position ở bài cuối → seed = bài đang phát → startRadio giữ nguyên hàng đợi.
    store.usePlayer.getState().playQueue(playlist, playlist.length - 1);

    let sentExclude: string[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      sentExclude = JSON.parse(init?.body ?? "{}").exclude ?? [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ tracks: [track("x"), track("y")] }),
        text: async () => "",
      };
    };
    const client = createRadioClient(store, { fetchImpl });

    const seed = store.usePlayer.getState().queue[playlist.length - 1];
    await client.startRadioFor(seed);

    expect([...sentExclude].sort()).toEqual(["a", "b", "c", "d"]);
    // Không bài nào của playlist bị nối lại; server sạch nên chỉ có x, y ở cuối.
    expect(store.usePlayer.getState().queue.map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "x",
      "y",
    ]);
  });

  it("không gọi radio cho bài thư viện", async () => {
    const store = createPlayerStore({ storage: memoryStorage(), name: "library" });
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tracks: [] }),
        text: async () => "",
      };
    };
    const client = createRadioClient(store, { fetchImpl });

    await client.startRadioFor(libraryTrack("drive-a"));

    expect(calls).toBe(0);
    expect(store.usePlayer.getState().radio).toBeNull();
  });

  it("nạp tiếp bằng continuation YouTube và lưu token mới", async () => {
    const store = createPlayerStore({ storage: memoryStorage(), name: "continuation" });
    store.usePlayer.getState().startRadio(track("seed"));
    let sent: Record<string, unknown> = {};
    const fetchImpl: FetchLike = async (_url, init) => {
      sent = JSON.parse(init?.body ?? "{}");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tracks: [track("next")],
          continuation: "token-2",
          playlistId: "RDAMVMseed",
        }),
        text: async () => "",
      };
    };
    const client = createRadioClient(store, { fetchImpl });

    await client.refillRadio("token-1", ["seed", "removed"]);

    expect(sent).toMatchObject({
      continuation: "token-1",
      exclude: ["seed", "removed"],
    });
    expect(store.usePlayer.getState().queue.map((item) => item.id)).toEqual([
      "seed",
      "next",
    ]);
    expect(store.usePlayer.getState().radio?.continuation).toBe("token-2");
    expect(store.usePlayer.getState().radio?.playlistId).toBe("RDAMVMseed");
  });
});
