import { describe, expect, it } from "vitest";
import {
  LONG_FORM,
  PLAYLIST_JUNK,
  channelArtistName,
  normalizeKey,
  parseIso8601Duration,
  sameArtistKey,
  splitArtistTitle,
} from "./parse";

describe("normalizeKey", () => {
  it("bỏ dấu tiếng Việt, hạ chữ, gộp khoảng trắng", () => {
    expect(normalizeKey("Chúng Ta Của Hiện Tại")).toBe("chung ta cua hien tai");
  });

  it("thay đ/Đ thành d (NFD không tách được)", () => {
    expect(normalizeKey("Đen Vâu")).toBe("den vau");
  });

  it("bỏ ký tự đặc biệt, trả rỗng cho null/undefined", () => {
    expect(normalizeKey("M-TP!!! (2024)")).toBe("m tp 2024");
    expect(normalizeKey(null)).toBe("");
    expect(normalizeKey(undefined)).toBe("");
  });
});

describe("sameArtistKey", () => {
  it("khớp khi tên ngắn nằm trọn theo biên từ trong tên dài", () => {
    expect(sameArtistKey("mck", "rpt mck")).toBe(true);
    expect(sameArtistKey("rpt mck", 'rpt mck 99 the album')).toBe(true);
    expect(sameArtistKey("den", "den vau")).toBe(true);
  });

  it("bằng nhau thì đúng", () => {
    expect(sameArtistKey("son tung mtp", "son tung mtp")).toBe(true);
  });

  it("không khớp khi chỉ trùng chuỗi con không theo biên từ", () => {
    // " anh " không nằm trong " xanh trai " (trước "anh" là chữ x, không phải cách)
    expect(sameArtistKey("anh", "xanh trai")).toBe(false);
  });

  it("chặn dưới 3 ký tự và chuỗi rỗng", () => {
    expect(sameArtistKey("em", "em abc")).toBe(false);
    expect(sameArtistKey("", "abc")).toBe(false);
    expect(sameArtistKey("abc", "")).toBe(false);
  });

  it("hai tên khác hẳn thì sai", () => {
    expect(sameArtistKey("son tung", "den vau")).toBe(false);
  });
});

describe("splitArtistTitle", () => {
  it("tách 'Nghệ sĩ - Tên bài' và bỏ đuôi rác trong ngoặc", () => {
    const r = splitArtistTitle(
      "Sơn Tùng M-TP - Chúng Ta Của Hiện Tại (Official MV)",
      "Sơn Tùng M-TP Official",
    );
    expect(r.artistName).toBe("Sơn Tùng M-TP");
    expect(r.title).toBe("Chúng Ta Của Hiện Tại");
  });

  it("không có dấu tách thì nghệ sĩ là tên kênh đã làm sạch", () => {
    const r = splitArtistTitle("Chill Song", "MCK // Nger");
    expect(r.artistName).toBe("MCK");
    expect(r.title).toBe("Chill Song");
  });

  it("đảo bên khi đúng bên phải trùng chủ kênh", () => {
    const r = splitArtistTitle("Bài Này - Đen", "Đen");
    expect(r.artistName).toBe("Đen");
    expect(r.title).toBe("Bài Này");
  });
});

describe("parseIso8601Duration", () => {
  it("đọc giờ/phút/giây", () => {
    expect(parseIso8601Duration("PT3M30S")).toBe(210);
    expect(parseIso8601Duration("PT1H2M3S")).toBe(3723);
    expect(parseIso8601Duration("PT45S")).toBe(45);
  });

  it("đọc ngày/tuần", () => {
    expect(parseIso8601Duration("P1DT2H")).toBe(86_400 + 7_200);
  });

  it("chuỗi không hợp lệ trả 0", () => {
    expect(parseIso8601Duration("")).toBe(0);
    expect(parseIso8601Duration("abc")).toBe(0);
  });
});

describe("bộ lọc rác", () => {
  it("LONG_FORM bắt mix/nonstop/liên khúc", () => {
    expect(LONG_FORM.test("Nonstop Việt Mix 2024")).toBe(true);
    expect(LONG_FORM.test("Liên Khúc Nhạc Trẻ")).toBe(true);
    expect(LONG_FORM.test("Chúng Ta Của Hiện Tại")).toBe(false);
  });

  it("PLAYLIST_JUNK bắt karaoke/beat/instrumental", () => {
    expect(PLAYLIST_JUNK.test("Karaoke Beat Chuẩn")).toBe(true);
    expect(PLAYLIST_JUNK.test("Bài hát bình thường")).toBe(false);
  });
});

describe("channelArtistName", () => {
  it("bỏ hậu tố - Topic / VEVO / Official", () => {
    expect(channelArtistName("Trịnh Công Sơn - Topic")).toBe("Trịnh Công Sơn");
    expect(channelArtistName("BTS VEVO")).toBe("BTS");
    expect(channelArtistName("Sơn Tùng M-TP Official")).toBe("Sơn Tùng M-TP");
  });
});
