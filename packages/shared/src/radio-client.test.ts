import { describe, expect, it } from "vitest";
import { autoplaySeed } from "./radio-client";
import type { PlayerState } from "./player-store";
import type { PlayableTrack } from "./types";

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

  it("null khi đã có radio chạy (RadioController tự nạp thêm)", () => {
    const radio = {
      seedId: "a",
      seedLabel: "A",
      status: "idle" as const,
      exhausted: false,
      message: null,
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
