import { describe, expect, it } from "vitest";
import { movePlaylistItem } from "./playlist-order";

describe("movePlaylistItem", () => {
  it("moves the dragged item without mutating the server order", () => {
    const before = ["one", "two", "three"];

    expect(movePlaylistItem(before, 0, 2)).toEqual(["two", "three", "one"]);
    expect(before).toEqual(["one", "two", "three"]);
  });

  it("keeps the order for invalid or unchanged destinations", () => {
    const before = ["one", "two"];

    expect(movePlaylistItem(before, 0, 0)).toEqual(before);
    expect(movePlaylistItem(before, -1, 1)).toEqual(before);
    expect(movePlaylistItem(before, 0, 3)).toEqual(before);
  });
});
