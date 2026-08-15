/**
 * Kiểm `resolveAudio` bằng chính máy này (IP dân dụng), và kiểm hai bất biến byte.
 *
 * Chạy: `npm run check:youtube [-- videoId…]`
 *
 * Đây là bài kiểm sống, không phải unit test: nó gọi thẳng YouTube. Khi YouTube siết
 * thêm một client thì bài này đỏ TRƯỚC khi người dùng thấy app hỏng — đó là lý do nó
 * ở lại repo thay vì bị mock.
 *
 * Ba vỏ (web, Tauri, Expo) đều dựa vào đúng hai điều dưới đây, nên cả hai đều được đo
 * chứ không chỉ tin lời bình luận:
 *   1. `visitorData` phải xin từ YouTube — tự sinh cục bộ trả `LOGIN_REQUIRED`.
 *   2. Request byte phải có `Range` — thiếu là bị bóp còn ~32 KiB/s.
 */
// Import theo đường dẫn nguồn: loader ESM của tsx bỏ qua mọi thứ trong node_modules,
// nên `@vong/shared` (symlink của workspace) không transform được ở script.
import {
  audioRangeHeaders,
  createYoutubeResolver,
  fetchVisitorData,
} from "../packages/shared/src/index";

const VIDEO_IDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["9bZkp7q19f0", "hq5Umtw5DUo"];

/** Dưới ngưỡng này thì coi như đang bị bóp: đo thật cho ra ~31 MiB/s. */
const MIN_KIB_PER_SEC = 300;

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.error(`  ! ${message}`);
};

const visitorData = await fetchVisitorData(fetch);
console.log(`visitorData: ${visitorData.length} ký tự`);
if (visitorData.length < 100) {
  // Chuỗi tự sinh cục bộ dài ~24 ký tự và bị YouTube từ chối; chuỗi thật ~520 vì mang
  // thêm chữ ký phía server. Ngắn là dấu hiệu đang đi nhánh sai.
  fail(`visitorData quá ngắn (${visitorData.length}) — có chắc lấy từ /sw.js_data?`);
}

const resolver = createYoutubeResolver(fetch);

for (const videoId of VIDEO_IDS) {
  console.log(`\n=== ${videoId} ===`);
  try {
    const audio = await resolver.resolve(videoId);
    console.log(
      `  client=${audio.client} itag=${audio.itag} mime=${audio.mimeType}`,
    );
    console.log(
      `  totalBytes=${audio.totalBytes} durationSec=${audio.durationSec} hết hạn ${new Date(audio.expiresAt).toISOString()}`,
    );
    console.log(`  ${audio.title} — ${audio.channelTitle}`);

    // itag 140 là AAC-LC. Nếu tụt xuống 139 (HE-AAC) thì `symphonia-codec-aac` của vỏ
    // Windows không giải được, nên đây là lỗi chứ không phải cảnh báo.
    if (audio.itag !== 140) fail(`itag ${audio.itag}, mong đợi 140 (AAC-LC)`);
    if (!audio.url.startsWith("https://")) fail("URL không phải https");
    if (/[?&](ump|sabr)=/.test(audio.url)) fail("URL có ump/sabr — cần SABR");
    if (audio.expiresAt <= Date.now()) fail("URL đã hết hạn ngay khi resolve");

    const t0 = Date.now();
    const res = await fetch(audio.url, { headers: audioRangeHeaders(0) });
    const bytes = (await res.arrayBuffer()).byteLength;
    const rate = Math.round(bytes / 1024 / ((Date.now() - t0) / 1000));
    console.log(`  Range bytes=0- -> ${res.status}, ${bytes} byte, ${rate} KiB/s`);

    if (res.status !== 206) fail(`mong đợi 206, nhận ${res.status}`);
    if (audio.totalBytes > 0 && bytes !== audio.totalBytes) {
      fail(`nhận ${bytes} byte, khai ${audio.totalBytes}`);
    }
    if (rate < MIN_KIB_PER_SEC) {
      fail(`chỉ ${rate} KiB/s — nhánh bóp băng thông, xem lại header Range`);
    }

    // Tua: xin từ giữa file phải ra 206 và ĐÚNG phần còn lại. Vỏ nào cũng tua kiểu này.
    const middle = Math.floor(audio.totalBytes / 2);
    const seek = await fetch(audio.url, { headers: audioRangeHeaders(middle) });
    const seekBytes = (await seek.arrayBuffer()).byteLength;
    console.log(
      `  Range bytes=${middle}- -> ${seek.status}, ${seekBytes} byte`,
    );
    if (seek.status !== 206) fail(`tua: mong đợi 206, nhận ${seek.status}`);
    if (seekBytes !== audio.totalBytes - middle) {
      fail(`tua: nhận ${seekBytes} byte, mong đợi ${audio.totalBytes - middle}`);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

console.log(`\n${failures === 0 ? "OK" : `${failures} lỗi`}`);
process.exit(failures === 0 ? 0 : 1);
