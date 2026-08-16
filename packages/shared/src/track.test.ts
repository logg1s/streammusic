import { describe, expect, it } from "vitest";
import {
  YOUTUBE_ID_PREFIX,
  parseYoutubeTrackId,
  toPlayableTrack,
  youtubeTrackId,
} from "./track";

describe("id YouTube", () => {
  it("youtubeTrackId gắn tiền tố", () => {
    expect(youtubeTrackId("abc123")).toBe(`${YOUTUBE_ID_PREFIX}abc123`);
  });

  it("parseYoutubeTrackId bóc tiền tố, trả null cho id thư viện", () => {
    expect(parseYoutubeTrackId("yt:abc123")).toBe("abc123");
    expect(parseYoutubeTrackId("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("khứ hồi youtubeTrackId ∘ parseYoutubeTrackId", () => {
    expect(parseYoutubeTrackId(youtubeTrackId("xyz"))).toBe("xyz");
  });
});

describe("toPlayableTrack", () => {
  it("dựng PlayableTrack nguồn youtube với ảnh bìa và id có tiền tố", () => {
    const track = toPlayableTrack({
      videoId: "vid1",
      title: "Bài hát",
      artistName: "Nghệ sĩ",
      channelTitle: "Kênh",
      durationSec: 200,
    });
    expect(track.id).toBe("yt:vid1");
    expect(track.source).toBe("youtube");
    expect(track.youtubeVideoId).toBe("vid1");
    expect(track.artistName).toBe("Nghệ sĩ");
    expect(track.coverUrl).toBe("https://i.ytimg.com/vi/vid1/hqdefault.jpg");
    expect(track.durationSec).toBe(200);
  });

  it("thiếu artistName thì lấy channelTitle", () => {
    const track = toPlayableTrack({
      videoId: "vid2",
      title: "T",
      artistName: null,
      channelTitle: "Kênh Nhạc",
      durationSec: null,
    });
    expect(track.artistName).toBe("Kênh Nhạc");
    expect(track.durationSec).toBeNull();
  });
});
