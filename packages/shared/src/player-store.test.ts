import { beforeEach, describe, expect, it } from "vitest";
import type { PersistStorage } from "zustand/middleware";
import {
  createPlayerStore,
  type PersistedPlayerState,
  type PlayerStore,
} from "./player-store";
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

/** Storage RAM để `persist` chạy được ngoài trình duyệt; `map` để soi phần đã lưu. */
function memoryStorage(): {
  storage: PersistStorage<PersistedPlayerState>;
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
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
    },
  };
}

const [a, b, c, d] = [track("a"), track("b"), track("c"), track("d")];
let store: PlayerStore;
let mem: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  mem = memoryStorage();
  store = createPlayerStore({ storage: mem.storage, name: "test" });
});

const get = () => store.usePlayer.getState();

describe("playQueue", () => {
  it("nạp hàng đợi, đặt vị trí, bật phát, xoá radio", () => {
    get().playQueue([a, b, c], 1);
    const s = get();
    expect(s.queue.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(s.order).toEqual([0, 1, 2]);
    expect(s.position).toBe(1);
    expect(s.isPlaying).toBe(true);
    expect(s.radio).toBeNull();
    expect(store.peekCurrentTrack()?.id).toBe("b");
  });

  it("hàng đợi rỗng thì không làm gì", () => {
    get().playQueue([], 0);
    expect(get().queue).toEqual([]);
    expect(get().isPlaying).toBe(false);
  });
});

describe("next / previous", () => {
  it("next chạy sang bài kế", () => {
    get().playQueue([a, b, c], 0);
    get().next();
    expect(get().position).toBe(1);
  });

  it("next ở bài cuối (repeat off) thì dừng, giữ nguyên vị trí", () => {
    get().playQueue([a, b], 1);
    get().next();
    expect(get().isPlaying).toBe(false);
    expect(get().position).toBe(1);
    expect(get().currentTime).toBe(0);
  });

  it("next ở bài cuối (repeat all) quay về đầu", () => {
    get().playQueue([a, b], 1);
    get().cycleRepeat(); // off -> all
    get().next();
    expect(get().position).toBe(0);
  });

  it("previous quá 3 giây thì về đầu bài, không đổi bài", () => {
    get().playQueue([a, b], 1);
    store.usePlayer.setState({ currentTime: 5 });
    get().previous();
    expect(get().position).toBe(1);
    expect(get().currentTime).toBe(0);
  });

  it("previous trong 3 giây đầu thì lùi một bài", () => {
    get().playQueue([a, b], 1);
    get().previous();
    expect(get().position).toBe(0);
  });
});

describe("handleEnded", () => {
  it("repeat one tua về 0 và phát lại cùng bài", () => {
    get().playQueue([a, b], 0);
    get().cycleRepeat(); // all
    get().cycleRepeat(); // one
    store.usePlayer.setState({ currentTime: 100 });
    get().handleEnded();
    expect(get().position).toBe(0);
    expect(get().currentTime).toBe(0);
    expect(get().isPlaying).toBe(true);
  });

  it("bình thường thì sang bài kế", () => {
    get().playQueue([a, b], 0);
    get().handleEnded();
    expect(get().position).toBe(1);
  });
});

describe("shuffle", () => {
  it("bật xáo giữ nguyên bài đang nghe ở đầu order", () => {
    get().playQueue([a, b, c], 1); // đang nghe b (queue index 1)
    get().toggleShuffle();
    const s = get();
    expect(s.shuffle).toBe(true);
    expect(s.order[0]).toBe(1);
    expect(s.position).toBe(0);
    expect(store.peekCurrentTrack()?.id).toBe("b");
  });

  it("tắt xáo quay lại thứ tự gốc, vẫn ở bài đang nghe", () => {
    get().playQueue([a, b, c], 1);
    get().toggleShuffle();
    get().toggleShuffle();
    const s = get();
    expect(s.shuffle).toBe(false);
    expect(s.order).toEqual([0, 1, 2]);
    expect(s.position).toBe(1);
    expect(store.peekCurrentTrack()?.id).toBe("b");
  });
});

describe("appendTracks / insertNext", () => {
  it("appendTracks bỏ trùng theo id", () => {
    get().playQueue([a], 0);
    get().appendTracks([a, b, b, c]);
    expect(get().queue.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(get().order).toEqual([0, 1, 2]);
  });

  it("insertNext chèn ngay sau bài đang phát, bỏ nếu đã có", () => {
    get().playQueue([a, b, c], 0);
    get().insertNext(d);
    expect(get().order).toEqual([0, 3, 1, 2]);
    expect(store.peekNextTrack()?.id).toBe("d");
    get().insertNext(a); // đã có -> bỏ qua
    expect(get().queue).toHaveLength(4);
  });
});

describe("removeAt / moveToNext", () => {
  it("removeAt dịch chỉ số order và vị trí đúng", () => {
    get().playQueue([a, b, c], 1);
    get().removeAt(0); // bỏ order pos 0 (bài a)
    expect(get().queue.map((t) => t.id)).toEqual(["b", "c"]);
    expect(get().order).toEqual([0, 1]);
    expect(get().position).toBe(0);
    expect(store.peekCurrentTrack()?.id).toBe("b");
  });

  it("removeAt bài cuối cùng thì dừng phát", () => {
    get().playQueue([a], 0);
    get().removeAt(0);
    expect(get().order).toEqual([]);
    expect(get().isPlaying).toBe(false);
  });

  it("moveToNext kéo một bài xa lên ngay sau bài đang phát", () => {
    get().playQueue([a, b, c, d], 0);
    get().moveToNext(2); // kéo order pos 2 (c) lên
    expect(get().order).toEqual([0, 2, 1, 3]);
    expect(store.peekNextTrack()?.id).toBe("c");
  });
});

describe("radio", () => {
  it("startRadio với bài KHÔNG đang phát thì thay hàng đợi bằng seed", () => {
    get().playQueue([a, b], 0);
    get().startRadio(c);
    const s = get();
    expect(s.queue.map((t) => t.id)).toEqual(["c"]);
    expect(s.radio?.seedId).toBe("c");
    expect(s.isPlaying).toBe(true);
  });

  it("startRadio ngay trên bài đang phát thì giữ hàng đợi, chỉ gắn radio", () => {
    get().playQueue([a, b], 0); // đang phát a
    get().startRadio(a);
    const s = get();
    expect(s.queue).toHaveLength(2);
    expect(s.radio?.seedId).toBe("a");
    expect(s.shuffle).toBe(false);
    expect(s.repeat).toBe("off");
  });

  it("stopRadio bỏ trạng thái radio, giữ hàng đợi", () => {
    get().playQueue([a], 0);
    get().startRadio(a);
    get().stopRadio();
    expect(get().radio).toBeNull();
    expect(get().queue).toHaveLength(1);
  });
});

describe("autoplay flag", () => {
  it("mặc định bật", () => {
    expect(get().autoplay).toBe(true);
  });

  it("setAutoplay đổi cờ và được lưu ra storage", async () => {
    get().setAutoplay(false);
    expect(get().autoplay).toBe(false);
    await Promise.resolve(); // để persist ghi xong
    const saved = JSON.parse(mem.map.get("test") ?? "{}");
    expect(saved.state.autoplay).toBe(false);
  });
});

describe("peek helpers", () => {
  it("peekNextTrack trả bài kế, null ở cuối khi không lặp", () => {
    get().playQueue([a, b, c], 0);
    expect(store.peekNextTrack()?.id).toBe("b");
    get().playQueue([a, b], 1);
    expect(store.peekNextTrack()).toBeNull();
  });

  it("peekNeighbourIds xếp theo ưu tiên hiện tại, +1, −1", () => {
    get().playQueue([a, b, c], 1);
    expect(store.peekNeighbourIds(1)).toEqual(["b", "c", "a"]);
  });
});
