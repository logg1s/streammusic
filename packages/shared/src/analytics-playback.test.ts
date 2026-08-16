import { describe, expect, it, vi } from "vitest";
import { createPlaybackAnalytics, type PlaybackSnapshot } from "./analytics-playback";
import type { Analytics } from "./analytics";

function harness() {
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  const analytics = {
    track: (name: string, props?: Record<string, unknown>) =>
      void events.push({ name, props: props ?? {} }),
    flush: vi.fn(),
    setEnabled: vi.fn(),
    isEnabled: () => true,
    init: vi.fn(),
  } as unknown as Analytics;

  let clock = 1000;
  const playback = createPlaybackAnalytics({ analytics, now: () => clock });

  return {
    events,
    advance: (ms: number) => void (clock += ms),
    observe: (patch: Partial<PlaybackSnapshot>) =>
      playback.observe({
        trackId: null,
        source: null,
        durationSec: null,
        currentTime: 0,
        isPlaying: false,
        queueLength: 0,
        radioActive: false,
        radioSeedId: null,
        error: null,
        advanceFailures: 0,
        radioExhausted: false,
        radioErrorKind: null,
        ...patch,
      }),
    noteRadioTrigger: playback.noteRadioTrigger,
    named: (name: string) => events.filter((e) => e.name === name),
  };
}

const TRACK_A = { trackId: "a", source: "youtube" as const, durationSec: 200, queueLength: 3 };
const TRACK_B = { trackId: "b", source: "library" as const, durationSec: 180, queueLength: 3 };

describe("play_start", () => {
  it("bắn khi đồng hồ nhúc nhích, không phải khi isPlaying bật", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.advance(2500);
    // Người dùng đã bấm phát nhưng tiếng chưa ra — chưa được tính.
    h.observe({ ...TRACK_A, isPlaying: true, currentTime: 0 });
    expect(h.named("play_start")).toHaveLength(0);

    h.observe({ ...TRACK_A, isPlaying: true, currentTime: 0.4 });
    expect(h.named("play_start")).toHaveLength(1);
  });

  it("ttfaMs tính từ lúc chọn bài tới lúc ra tiếng", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, isPlaying: true });
    h.advance(3200);
    h.observe({ ...TRACK_A, isPlaying: true, currentTime: 0.2 });
    expect(h.named("play_start")[0].props.ttfaMs).toBe(3200);
  });

  it("chỉ bắn một lần cho mỗi bài", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 1 });
    h.observe({ ...TRACK_A, currentTime: 2 });
    h.observe({ ...TRACK_A, currentTime: 3 });
    expect(h.named("play_start")).toHaveLength(1);
  });

  it("origin phân biệt radio với tự chọn", () => {
    const h = harness();
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1", currentTime: 1 });
    expect(h.named("play_start")[0].props.origin).toBe("radio");
  });
});

describe("play_end", () => {
  it("bắn khi đổi bài, kèm thời lượng đã nghe", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 45 });
    h.observe(TRACK_B);

    const [end] = h.named("play_end");
    expect(end.props).toMatchObject({
      playedSec: 45,
      durationSec: 200,
      completed: false,
      skippedEarly: false,
      source: "youtube",
    });
  });

  it("đánh dấu bỏ sớm khi nghe dưới 10 giây", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 4 });
    h.observe(TRACK_B);
    expect(h.named("play_end")[0].props.skippedEarly).toBe(true);
  });

  it("đánh dấu nghe hết từ 90% thời lượng", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 185 });
    h.observe(TRACK_B);
    expect(h.named("play_end")[0].props.completed).toBe(true);
  });

  it("không kết luận nghe hết khi không biết thời lượng", () => {
    const h = harness();
    h.observe({ ...TRACK_A, durationSec: null });
    h.observe({ ...TRACK_A, durationSec: null, currentTime: 500 });
    h.observe(TRACK_B);
    expect(h.named("play_end")[0].props.completed).toBe(false);
  });
});

describe("queue_end", () => {
  it("bắn kèm số bài đã nghe khi hàng đợi hết mà không nối tiếp", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 100 });
    h.observe(TRACK_B);
    h.observe({ ...TRACK_B, currentTime: 100 });
    h.observe({ trackId: null, queueLength: 0 });

    expect(h.named("queue_end")[0].props.depth).toBe(2);
  });

  it("không bắn khi chỉ chuyển sang bài khác", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe(TRACK_B);
    expect(h.named("queue_end")).toHaveLength(0);
  });
});

describe("advance_failed", () => {
  /**
   * Ca này là toàn bộ lý do sự kiện tồn tại. Hàng đợi hết trong thực tế KHÔNG làm
   * `trackId` thành null — bài cuối vẫn được chọn, chỉ là phía sau không còn gì. Trước
   * khi có bộ đếm này, đường mã đó không phát ra một sự kiện nào, nên "bấm next không
   * ăn" và "nghe xong rồi tắt" là hai dữ liệu giống hệt nhau.
   */
  it("bắn khi bấm next ở bài cuối mà hàng đợi không dài thêm", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, currentTime: 100 });
    h.observe(TRACK_B);
    h.observe({ ...TRACK_B, currentTime: 100 });
    h.observe({ ...TRACK_B, currentTime: 0, advanceFailures: 1 });

    const [event] = h.named("advance_failed");
    expect(event.props.reason).toBe("queue_end");
    // 1, không phải 2: `depth` đếm số bài đã KẾT THÚC. Ở đây bài cuối vẫn đang được
    // chọn — đó chính là đặc điểm của tình huống này — nên nó chưa được tính. Cộng
    // thêm nó vào sẽ đếm trùng khi `play_end` của nó bắn sau đó.
    expect(event.props.depth).toBe(1);
  });

  it("phân biệt được radio đã cạn với hàng đợi thường hết bài", () => {
    const h = harness();
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    h.observe({
      ...TRACK_A,
      radioActive: true,
      radioSeedId: "s1",
      radioExhausted: true,
      advanceFailures: 1,
    });

    expect(h.named("advance_failed")[0].props.reason).toBe("radio_exhausted");
  });

  it("hết quota không bị đọc nhầm thành cạn kho gợi ý", () => {
    // Một lần nạp bị 429 trả về lô rỗng, nên nó tới đây với `radioExhausted` bật lên
    // y hệt trường hợp kho ứng viên thật sự cạn. Nếu hai cái này cùng ra một nhãn thì
    // sau chu kỳ này không ai phân biệt được "bug cũ tái phát" với "hôm nay hết quota".
    const h = harness();
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    h.observe({
      ...TRACK_A,
      radioActive: true,
      radioSeedId: "s1",
      radioExhausted: true,
      radioErrorKind: "quota",
      advanceFailures: 1,
    });

    expect(h.named("advance_failed")[0].props.reason).toBe("quota");
  });

  it("không bắn khi bộ đếm đứng yên", () => {
    const h = harness();
    h.observe({ ...TRACK_A, advanceFailures: 3 });
    h.observe({ ...TRACK_A, advanceFailures: 3, currentTime: 10 });
    expect(h.named("advance_failed")).toHaveLength(0);
  });
});

describe("radio", () => {
  it("radio_seed mặc định là chủ động", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    expect(h.named("radio_seed")[0].props.trigger).toBe("manual");
  });

  it("nhánh autoplay tự khai báo, và chỉ áp cho lần kế", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.noteRadioTrigger("autoplay");
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    expect(h.named("radio_seed")[0].props.trigger).toBe("autoplay");

    h.observe({ ...TRACK_A, radioActive: false, radioSeedId: null });
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s2" });
    expect(h.named("radio_seed")[1].props.trigger).toBe("manual");
  });

  it("radio_refill đếm số bài được nối thêm", () => {
    const h = harness();
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1" });
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1", queueLength: 3 });
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1", queueLength: 11 });
    expect(h.named("radio_refill")[0].props.added).toBe(8);
  });

  it("lô đầu của radio là seed, không phải refill", () => {
    const h = harness();
    h.observe({ ...TRACK_A, queueLength: 1 });
    h.observe({ ...TRACK_A, radioActive: true, radioSeedId: "s1", queueLength: 20 });
    expect(h.named("radio_seed")).toHaveLength(1);
    expect(h.named("radio_refill")).toHaveLength(0);
  });
});

describe("lỗi", () => {
  it.each([
    ["Chưa đăng nhập YouTube (LOGIN_REQUIRED)", "login_required"],
    ["Video unplayable: 150", "unplayable"],
    ["googlevideo trả 403", "forbidden"],
    ["network request failed", "network"],
  ])("quy %s về %s", (message, reason) => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, error: message });
    expect(h.named("resolve_fail")[0].props.reason).toBe(reason);
  });

  it("lỗi không nhận dạng được thành playback_error với mã có giới hạn", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, error: "Không mở được luồng byte" });
    expect(h.named("playback_error")[0].props).toEqual({
      stage: "playback",
      code: "other",
    });
  });

  it("KHÔNG BAO GIỜ gửi nguyên văn thông báo lỗi", () => {
    // Thông báo lỗi trong app này có thể chứa URL googlevideo, id video, tên bài.
    const h = harness();
    h.observe(TRACK_A);
    h.observe({
      ...TRACK_A,
      error: "Không phát được https://rr3---sn-x.googlevideo.com/videoplayback?id=abc123 — Chúng Ta Của Hiện Tại",
    });
    const serialized = JSON.stringify(h.events);
    expect(serialized).not.toContain("googlevideo");
    expect(serialized).not.toContain("Chúng Ta");
    expect(serialized).not.toContain("abc123");
  });

  it("không bắn lại khi cùng một lỗi còn nguyên đó", () => {
    const h = harness();
    h.observe(TRACK_A);
    h.observe({ ...TRACK_A, error: "network failed" });
    h.observe({ ...TRACK_A, error: "network failed", currentTime: 1 });
    expect(h.named("resolve_fail")).toHaveLength(1);
  });
});

describe("ảnh chụp đầu tiên", () => {
  it("không sinh sự kiện — nó là mốc so sánh, không phải một thay đổi", () => {
    const h = harness();
    h.observe({ ...TRACK_A, currentTime: 30, radioActive: true, radioSeedId: "s1" });
    expect(h.events).toHaveLength(0);
  });
});
