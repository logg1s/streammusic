import { describe, expect, it, vi } from "vitest";
import {
  createAnalytics,
  isAnalyticsEvent,
  sanitizeProps,
  type AnalyticsBatch,
  type AnalyticsStorage,
} from "./analytics";
import type { FetchLike, FetchLikeResponse } from "./types";

const NO_CONTENT: FetchLikeResponse = {
  ok: true,
  status: 204,
  json: async () => null,
  text: async () => "",
};

describe("sanitizeProps", () => {
  it("giữ nhãn ngắn, số hữu hạn và boolean", () => {
    expect(
      sanitizeProps({ source: "youtube", ttfaMs: 1200, completed: false }),
    ).toEqual({ source: "youtube", ttfaMs: 1200, completed: false });
  });

  it("bỏ khoá mang nội dung dù giá trị ngắn", () => {
    // Đây là lằn ranh riêng tư: 'query' và 'title' không được lọt kể cả khi lọt vừa
    // giới hạn độ dài.
    expect(sanitizeProps({ query: "sơn tùng", title: "Chúng ta" })).toEqual({});
  });

  it("bỏ hẳn chuỗi dài thay vì cắt ngắn", () => {
    const long = "Chúng ta của tương lai — Sơn Tùng M-TP (Official Music Video)";
    expect(sanitizeProps({ origin: long })).toEqual({});
  });

  it("bỏ object lồng, mảng, NaN và Infinity", () => {
    expect(
      sanitizeProps({
        nested: { a: 1 },
        list: [1, 2],
        bad: Number.NaN,
        worse: Number.POSITIVE_INFINITY,
        ok: 1,
      }),
    ).toEqual({ ok: 1 });
  });

  it("chặn số khoá tối đa", () => {
    const input = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${i}`, i]),
    );
    expect(Object.keys(sanitizeProps(input))).toHaveLength(12);
  });

  it("trả object rỗng với đầu vào không phải object", () => {
    expect(sanitizeProps(null)).toEqual({});
    expect(sanitizeProps("x")).toEqual({});
    expect(sanitizeProps([1])).toEqual({});
  });
});

describe("isAnalyticsEvent", () => {
  it("chỉ chấp nhận tên trong danh mục", () => {
    expect(isAnalyticsEvent("play_start")).toBe(true);
    expect(isAnalyticsEvent("play_everything")).toBe(false);
  });
});

function memoryStorage(seed: Record<string, string> = {}): AnalyticsStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

/** Đếm uuid để test tất định — lần đầu là installId, lần sau là sessionId. */
function counterUuid() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

function setup(storage = memoryStorage(), batchSize = 2) {
  const sent: AnalyticsBatch[] = [];
  const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)) as AnalyticsBatch);
    return NO_CONTENT;
  });

  const analytics = createAnalytics({
    shell: "android",
    appVersion: "0.3.0",
    fetch: fetchImpl,
    storage,
    batchSize,
    uuid: counterUuid(),
    now: () => new Date("2026-08-16T00:00:00.000Z"),
  });
  return { analytics, sent };
}

describe("createAnalytics", () => {
  it("gửi khi bộ đệm đầy, kèm installId và shell", async () => {
    const { analytics, sent } = setup();
    await analytics.init();

    analytics.track("app_open", { cold: true });
    analytics.track("play_start", { source: "youtube" });
    await analytics.flush();

    expect(sent).toHaveLength(1);
    expect(sent[0].shell).toBe("android");
    expect(sent[0].appVersion).toBe("0.3.0");
    expect(sent[0].events.map((e) => e.name)).toEqual(["app_open", "play_start"]);
  });

  it("dùng lại installId đã lưu giữa các phiên", async () => {
    const saved = "11111111-1111-4111-8111-111111111111";
    const storage = memoryStorage({ "vong.analytics.installId": saved });
    const { analytics, sent } = setup(storage);
    await analytics.init();

    analytics.track("app_open");
    await analytics.flush();

    expect(sent[0].installId).toBe(saved);
  });

  it("không gửi gì khi người dùng đã tắt", async () => {
    const storage = memoryStorage({ "vong.analytics.enabled": "false" });
    const { analytics, sent } = setup(storage);
    await analytics.init();

    expect(analytics.isEnabled()).toBe(false);
    analytics.track("app_open");
    analytics.track("play_start");
    await analytics.flush();

    expect(sent).toHaveLength(0);
  });

  it("tắt giữa chừng thì bỏ luôn sự kiện đang chờ trong bộ đệm", async () => {
    const { analytics, sent } = setup(memoryStorage(), 100);
    await analytics.init();

    analytics.track("app_open");
    await analytics.setEnabled(false);
    await analytics.flush();

    expect(sent).toHaveLength(0);
  });

  it("làm sạch props trước khi rời khỏi máy", async () => {
    const { analytics, sent } = setup(memoryStorage(), 1);
    await analytics.init();

    analytics.track("search_run", { results: 12, query: "sơn tùng" });
    await analytics.flush();

    expect(sent[0].events[0].props).toEqual({ results: 12 });
  });

  it("bỏ qua tên sự kiện ngoài danh mục", async () => {
    const { analytics, sent } = setup(memoryStorage(), 1);
    await analytics.init();

    // @ts-expect-error — chính là trường hợp một bản app cũ gửi tên đã gỡ.
    analytics.track("legacy_event", {});
    await analytics.flush();

    expect(sent).toHaveLength(0);
  });

  it("lỗi mạng không được ném ngược ra ngoài", async () => {
    const failing: FetchLike = vi.fn(async () => {
      throw new Error("offline");
    });
    const analytics = createAnalytics({
      shell: "web",
      fetch: failing,
      storage: memoryStorage(),
      batchSize: 1,
      uuid: counterUuid(),
    });
    await analytics.init();

    analytics.track("app_open");
    await expect(analytics.flush()).resolves.toBeUndefined();
  });

  it("mọi sự kiện trong một phiên dùng chung sessionId", async () => {
    const { analytics, sent } = setup(memoryStorage(), 2);
    await analytics.init();

    analytics.track("app_open");
    analytics.track("play_start");
    await analytics.flush();

    const [a, b] = sent[0].events;
    expect(a.sessionId).toBe(b.sessionId);
    expect(a.sessionId).not.toBe(sent[0].installId);
  });
});
