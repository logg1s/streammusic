import { describe, expect, it } from "vitest";
import { createAsyncGenerationGate } from "./async-generation-gate";

describe("createAsyncGenerationGate", () => {
  it("chỉ giữ quyền hoàn tất cho lượt async mới nhất", () => {
    const gate = createAsyncGenerationGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.current()).toBe(second);
  });

  it("vô hiệu hoá lượt đang chờ khi playback bị xoá", () => {
    const gate = createAsyncGenerationGate();
    const pending = gate.begin();

    gate.invalidate();

    expect(gate.isCurrent(pending)).toBe(false);
  });
});
