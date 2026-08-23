import { describe, expect, it } from "vitest";
import {
  findNewReleaseSection,
  isNewReleaseTitle,
  type DiscoveryHomeSection,
  type PlayableTrack,
} from "./index";

const track = { id: "yt:one" } as PlayableTrack;

describe("home discovery release shelf", () => {
  it.each(["Mới phát hành", "Moi phat hanh", "New releases"]) (
    "recognizes %s as a new-release shelf",
    (title) => expect(isNewReleaseTitle(title)).toBe(true),
  );

  it("only returns a playable shelf that is explicitly a new-release shelf", () => {
    const sections: DiscoveryHomeSection[] = [
      { title: "Dành cho bạn", tracks: [track] },
      { title: "Mới phát hành", tracks: [] },
      { title: "New releases", tracks: [track] },
    ];

    expect(findNewReleaseSection(sections)).toEqual(sections[2]);
  });
});
