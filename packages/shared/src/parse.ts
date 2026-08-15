/**
 * Làm sạch metadata YouTube trước khi lưu vào DB.
 *
 * Tên video do người tải lên tự đặt nên rất bừa ("Official MV", "[Lyrics]",
 * "| Audio"). Radio so khớp bài theo tên nghệ sĩ + tên bài, nên phải chuẩn hoá
 * ở một chỗ duy nhất — nếu không thì cùng một bài sẽ đếm thành hai ứng viên.
 */

/** ISO 8601 mà YouTube trả cho `contentDetails.duration`; video dài có thể có phần ngày. */
const ISO_DURATION =
  /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Từ khoá "rác" trong tên video: nằm trong ngoặc hoặc sau dấu | thì bỏ được. */
const JUNK =
  /official|m\/?v|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|remaster|full\s*hd|topic/i;

/** Ngoặc tròn, vuông và ngoặc góc kiểu CJK — cả ba đều hay dùng để nhét từ khoá rác. */
const BRACKETED = /[([【]([^)\]】]*)[)\]】]/g;

/** Chỉ nhận gạch nối có khoảng trắng hai bên, để "M-TP" không bị coi là dấu tách. */
const SEPARATOR = /\s[-–—]\s/;

/** Hậu tố kênh không phải phần của tên nghệ sĩ; có thể xuất hiện liên tiếp ("... Official VEVO"). */
const CHANNEL_SUFFIX = /(?:\s*(?:-\s*topic|vevo|official))+\s*$/i;

/** Số thứ tự bài trong playlist album: "02. Chìm Sâu", "7 - Thờ Er". */
const TRACK_NUMBER = /^\d{1,3}\s*[.)\-–]\s*/;

/** Hậu tố trang trí của kênh: "MCK // Nger", "Đen | Music", "Trịnh Công Sơn - Topic". */
const CHANNEL_DECOR = /\s*(?:\/\/|\||•|·|-\s*topic).*$/i;

/** Danh sách hát cùng, không nằm trong ngoặc: "MCK ft. tlinh", "Hòa Minzy feat. Erik". */
const FEATURING = /\s+(?:ft|feat|với|cùng)\.?\s+.*$/i;

/**
 * Đuôi trang trí sau dấu gạch: "… - Official Audio / BLOOMEVER Album 'Track 04'".
 *
 * Hẹp hơn `JUNK` vì đuôi này bị cắt hẳn, không chỉ bị bỏ khi chọn bên: chỉ nhận
 * "official"/"visualizer"/"remaster" ở bất kỳ đâu, hoặc cả đuôi vỏn vẹn là một từ
 * khoá. Nhờ vậy bài tên thật "Video Games" hay "Audio" vẫn còn nguyên.
 */
const JUNK_TAIL =
  /\bofficial\b|\bvisuali[sz]er\b|\bremaster(?:ed)?\b|^(?:audio|video|lyrics?|m\/?v|4k|hd|hq)$/i;

/*
  Bộ lọc "đây có phải MỘT bài hát không". Ở đây chứ không ở radio.ts vì cả radio,
  tìm kiếm và automix đều phải dùng chung một tiêu chuẩn — và radio.ts thì import
  music.ts, nên để hằng ở đó sẽ tạo vòng import.
*/

/** Ngắn hơn là nhạc chờ/quảng cáo; dài hơn là mix hoặc audiobook. */
export const MIN_DURATION_SEC = 60;
export const MAX_DURATION_SEC = 900;

/** Bản mix/nonstop dài hàng giờ lọt lưới thời lượng thì bắt bằng tên. */
export const LONG_FORM =
  /\b(mix|nonstop|full album|playlist|1\s*hour|liên khúc|tổng hợp)\b/i;

/** Playlist karaoke/beat trả về bản không có giọng hát — không phải "bài tương tự". */
export const PLAYLIST_JUNK = /karaoke|beat|instrumental/i;

export function parseIso8601Duration(value: string): number {
  const match = ISO_DURATION.exec(value);
  if (!match) return 0;
  const [, weeks, days, hours, minutes, seconds] = match;
  return (
    Number(weeks ?? 0) * 604_800 +
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Math.round(Number(seconds ?? 0))
  );
}

/**
 * Khoá so khớp: bỏ dấu tiếng Việt, hạ chữ, chỉ giữ [a-z0-9] và một dấu cách.
 *
 * "Chúng Ta Của Hiện Tại" và "chung ta cua hien tai" phải ra cùng một khoá vì
 * tên trên YouTube và trong thẻ ID3 gần như không bao giờ trùng khít.
 */
export function normalizeKey(value: string | null | undefined): string {
  if (!value) return "";
  return (
    value
      .toLowerCase()
      // đ/Đ không tách được bằng NFD nên phải thay tay.
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** Tên kênh dùng làm tên nghệ sĩ: bỏ hậu tố "- Topic", "VEVO", "Official". */
export function channelArtistName(channelTitle: string): string {
  const stripped = channelTitle
    .replace(CHANNEL_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || channelTitle.replace(/\s+/g, " ").trim();
}

/**
 * Tách "Sơn Tùng M-TP - Chúng Ta Của Hiện Tại (Official MV)" thành
 * { artistName: "Sơn Tùng M-TP", title: "Chúng Ta Của Hiện Tại" }.
 *
 * Thứ tự hai bên dấu gạch không có chuẩn nào: kênh Việt hay đặt "Tên bài - Nghệ sĩ"
 * ngược với thông lệ "Nghệ sĩ - Tên bài". Tên kênh là trọng tài: bên nào trùng chủ
 * kênh thì bên đó là nghệ sĩ, và lấy luôn tên kênh đã làm sạch để bỏ phần rác dính
 * kèm ("RPT MCK "99%" the album" → "RPT MCK").
 */
export function splitArtistTitle(
  rawTitle: string,
  channelTitle: string,
): { artistName: string; title: string } {
  const withoutBrackets = rawTitle.replace(BRACKETED, (match, inner: string) =>
    JUNK.test(inner) ? " " : match,
  );

  const segments = withoutBrackets.split("|");
  const cleaned = stripJunkTail(
    segments
      .filter((segment, index) => index === 0 || !JUNK.test(segment))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const channelName = channelArtistName(channelTitle);
  const channelBase = baseArtistName(channelName);
  const separator = SEPARATOR.exec(cleaned);
  if (separator) {
    const left = cleaned.slice(0, separator.index).trim();
    const right = cleaned.slice(separator.index + separator[0].length).trim();
    if (left && right) {
      const leftBase = baseArtistName(left);
      const rightBase = baseArtistName(right);
      const leftIsChannel = sameArtist(leftBase, channelBase);
      const rightIsChannel = sameArtist(rightBase, channelBase);
      // Chỉ đảo khi đúng một bên nhắc tới chủ kênh; cả hai (hoặc không bên nào)
      // thì giữ thông lệ "Nghệ sĩ - Tên bài".
      if (rightIsChannel && !leftIsChannel) {
        return {
          artistName: shorterName(rightBase, channelBase),
          title: stripTrackNumber(left),
        };
      }
      return {
        artistName: leftIsChannel ? shorterName(leftBase, channelBase) : left,
        title: stripTrackNumber(right),
      };
    }
  }

  // Không có dấu tách (hoặc một bên rỗng) → nghệ sĩ là chủ kênh, đã bỏ trang trí
  // để "MCK // Nger" và "MCK" không thành hai nghệ sĩ khác nhau khi xếp hạng.
  return {
    artistName: channelBase,
    title: stripTrackNumber(cleaned || rawTitle.replace(/\s+/g, " ").trim()),
  };
}

/**
 * Cắt các đuôi trang trí liên tiếp sau dấu gạch, dừng ngay khi gặp đuôi không phải
 * rác — nhờ vậy "Sơn Tùng M-TP - Chúng Ta Của Hiện Tại" giữ nguyên cả hai bên.
 */
function stripJunkTail(value: string): string {
  let title = value;
  for (;;) {
    const match = /\s[-–—]\s([^-–—]+)$/.exec(title);
    if (!match || !JUNK_TAIL.test(match[1].trim())) return title;
    title = title.slice(0, match.index).trim();
  }
}

/** Hai tên nghệ sĩ có cùng chỉ một người hay không. */
function sameArtist(a: string, b: string): boolean {
  return sameArtistKey(normalizeKey(a), normalizeKey(b));
}

/**
 * Bản so khớp trên khoá đã chuẩn hoá, dùng cả khi xếp hạng radio.
 *
 * Phần dư nằm ở đâu cũng được, nên tên ngắn hơn chỉ cần xuất hiện thành một chuỗi
 * từ liền mạch trong tên dài hơn: kênh `MCK // Nger` với video ghi `MCK`, hay kênh
 * `RPT MCK` với video ghi `RPT MCK "99%" the album`, hay chính `MCK` nằm giữa
 * `RPT MCK … the album`. So theo biên từ nên "Anh" không dính vào "Anh Trai".
 *
 * Chặn dưới 3 ký tự để một từ đệm ("em", "ta") không kéo nhầm cả hai bên vào nhau.
 */
export function sameArtistKey(keyA: string, keyB: string): boolean {
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  const [shorter, longer] =
    keyA.length < keyB.length ? [keyA, keyB] : [keyB, keyA];
  if (shorter.length < 3) return false;
  return ` ${longer} `.includes(` ${shorter} `);
}

/**
 * Bỏ phần trang trí quanh tên nghệ sĩ: ngoặc, hậu tố kênh (`// Nger`, `| Music`,
 * `- Topic`) và danh sách hát cùng (`ft.`, `feat.`). Giữ nguyên `&` vì đó có thể
 * là một phần của tên ("Simon & Garfunkel").
 */
function baseArtistName(name: string): string {
  const base = name
    .replace(BRACKETED, " ")
    .replace(CHANNEL_DECOR, " ")
    .replace(FEATURING, " ")
    .replace(/\s+/g, " ")
    .trim();
  return channelArtistName(base) || name.trim();
}

/** Hai bên cùng chỉ một nghệ sĩ → lấy bản gọn hơn. */
function shorterName(side: string, channelName: string): string {
  return channelName.length <= side.length ? channelName : side;
}

function stripTrackNumber(title: string): string {
  const stripped = title.replace(TRACK_NUMBER, "").trim();
  return stripped || title;
}
