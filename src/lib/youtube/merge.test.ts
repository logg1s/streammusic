import { describe, expect, it } from "vitest";
import { interleaveHits } from "@/lib/youtube/merge";

const hit = (videoId: string) => ({ videoId });

describe("interleaveHits", () => {
  it("xen kẽ luân phiên hai nguồn, phần tử nguồn A đứng trước mỗi cặp", () => {
    const a = [hit("a1"), hit("a2")];
    const b = [hit("b1"), hit("b2")];
    expect(interleaveHits(a, b, 10).map((h) => h.videoId)).toEqual([
      "a1",
      "b1",
      "a2",
      "b2",
    ]);
  });

  it("bỏ trùng theo videoId (giữ lần xuất hiện đầu)", () => {
    const a = [hit("x"), hit("a2")];
    const b = [hit("x"), hit("b2")];
    expect(interleaveHits(a, b, 10).map((h) => h.videoId)).toEqual([
      "x",
      "a2",
      "b2",
    ]);
  });

  it("cắt còn đúng limit", () => {
    const a = [hit("a1"), hit("a2"), hit("a3")];
    const b = [hit("b1"), hit("b2"), hit("b3")];
    expect(interleaveHits(a, b, 3).map((h) => h.videoId)).toEqual([
      "a1",
      "b1",
      "a2",
    ]);
  });

  it("một nguồn rỗng thì trả nguyên nguồn kia (đủ rộng khi YT Music trống)", () => {
    const b = [hit("b1"), hit("b2")];
    expect(interleaveHits([], b, 10).map((h) => h.videoId)).toEqual([
      "b1",
      "b2",
    ]);
  });

  it("hai nguồn rỗng thì trả rỗng", () => {
    expect(interleaveHits([], [], 10)).toEqual([]);
  });

  it("nguồn dài không đều vẫn vét hết trong limit", () => {
    const a = [hit("a1")];
    const b = [hit("b1"), hit("b2"), hit("b3")];
    expect(interleaveHits(a, b, 10).map((h) => h.videoId)).toEqual([
      "a1",
      "b1",
      "b2",
      "b3",
    ]);
  });
});
