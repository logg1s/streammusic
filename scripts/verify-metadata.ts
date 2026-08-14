/**
 * Kiểm chứng phần rủi ro nhất của hệ thống mà không cần database hay OAuth:
 * đọc tag ID3 từ file nhạc ở xa qua HTTP range request.
 *
 * Điều cần chứng minh: chỉ tải vài KB, không tải cả file. Với thư viện vài nghìn
 * bài thì đây là khác biệt giữa vài MB và vài GB mỗi lần quét.
 *
 *   npx tsx scripts/verify-metadata.ts
 */
import { readRemoteMetadata, inferFromPath } from "../src/lib/metadata";
import { encryptSecret, decryptSecret } from "../src/lib/crypto";

const REPO = "Borewit/test-audio";

interface GhEntry {
  name: string;
  size: number;
  type: string;
  download_url: string | null;
}

async function listDir(path: string): Promise<GhEntry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}`,
    { headers: { "User-Agent": "streammusic-verify" } },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return (await res.json()) as GhEntry[];
}

/** Đếm số byte thực sự tải về bằng cách bọc fetch toàn cục. */
function instrumentFetch() {
  const original = globalThis.fetch;
  let bytes = 0;
  let requests = 0;

  globalThis.fetch = async (input, init) => {
    requests++;
    const response = await original(input, init);
    const cloned = response.clone();
    const buffer = await cloned.arrayBuffer();
    bytes += buffer.byteLength;
    return response;
  };

  return {
    restore: () => {
      globalThis.fetch = original;
    },
    stats: () => ({ bytes, requests }),
    reset: () => {
      bytes = 0;
      requests = 0;
    },
  };
}

function pass(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function verifyCrypto() {
  console.log("\n[1] Mã hoá token (AES-256-GCM)");
  process.env.ENCRYPTION_KEY ||= Buffer.from(
    crypto.getRandomValues(new Uint8Array(32)),
  ).toString("base64");

  const secret = "1//0abcDEF-refresh-token_với-dấu-tiếng-Việt";
  const encrypted = encryptSecret(secret);

  pass("giải mã ra đúng chuỗi ban đầu", decryptSecret(encrypted) === secret);
  pass("bản mã không lộ bản rõ", !encrypted.includes(secret));
  pass(
    "hai lần mã hoá cùng chuỗi cho kết quả khác nhau (IV ngẫu nhiên)",
    encryptSecret(secret) !== encrypted,
  );

  // GCM phải phát hiện dữ liệu bị sửa.
  const [iv, tag] = encrypted.split(":");
  const tampered = `${iv}:${tag}:${Buffer.from("giả mạo").toString("base64")}`;
  let rejected = false;
  try {
    decryptSecret(tampered);
  } catch {
    rejected = true;
  }
  pass("từ chối bản mã bị sửa đổi", rejected);
}

function verifyInference() {
  console.log("\n[2] Suy metadata từ tên file (khi file không có tag)");

  const a = inferFromPath(
    "03 - Trịnh Công Sơn - Diễm Xưa.mp3",
    "/Nhạc/Trịnh Công Sơn/Sơn Ca 7/03 - Trịnh Công Sơn - Diễm Xưa.mp3",
  );
  pass("tách được số thứ tự", a.trackNo === 3, `trackNo=${a.trackNo}`);
  pass("tách được nghệ sĩ", a.artist === "Trịnh Công Sơn", `artist=${a.artist}`);
  pass("tách được tên bài", a.title === "Diễm Xưa", `title=${a.title}`);
  pass("lấy album từ thư mục cha", a.album === "Sơn Ca 7", `album=${a.album}`);

  const b = inferFromPath("Bai hat khong ro.mp3", "/Music/Bai hat khong ro.mp3");
  pass("tên file trơn vẫn ra title", b.title === "Bai hat khong ro");
  pass("không bịa số thứ tự", b.trackNo === null);
}

async function verifyRangeReading() {
  console.log("\n[3] Đọc tag từ file ở xa qua range request");

  const dirs = (await listDir("")).filter((e) => e.type === "dir");
  const targets: GhEntry[] = [];

  for (const dir of dirs) {
    const files = await listDir(dir.name);
    const audio = files.find(
      (f) => f.type === "file" && /\.(mp3|m4a|flac|ogg)$/i.test(f.name),
    );
    if (audio) targets.push(audio);
  }

  if (targets.length === 0) {
    console.log("  (không tìm thấy file mẫu — bỏ qua)");
    return;
  }

  const probe = instrumentFetch();

  for (const file of targets) {
    probe.reset();
    const started = Date.now();

    try {
      const metadata = await readRemoteMetadata({
        url: file.download_url!,
        sizeBytes: file.size,
        fileName: file.name,
        mimeType: null,
      });

      const { bytes, requests } = probe.stats();
      const ratio = (bytes / file.size) * 100;

      console.log(`\n  ${file.name}`);
      console.log(
        `    tag:      ${metadata.artist ?? "?"} — ${metadata.title ?? "?"} (${metadata.album ?? "?"})`,
      );
      console.log(
        `    kỹ thuật: ${metadata.codec ?? "?"} · ${metadata.bitrate ? Math.round(metadata.bitrate / 1000) + " kbps" : "?"} · ${metadata.durationSec ? metadata.durationSec.toFixed(1) + "s" : "?"}`,
      );
      console.log(
        `    tải về:   ${(bytes / 1024).toFixed(0)} KB / ${(file.size / 1024).toFixed(0)} KB toàn file (${ratio.toFixed(1)}%) qua ${requests} request, ${Date.now() - started}ms`,
      );

      pass("    đọc được tên bài", Boolean(metadata.title));
      pass(
        "    KHÔNG tải cả file",
        bytes < file.size * 0.5,
        `${ratio.toFixed(1)}% kích thước file`,
      );
    } catch (error) {
      pass(`    đọc ${file.name}`, false, String(error));
    }
  }

  probe.restore();
}

async function main() {
  await verifyCrypto();
  verifyInference();
  await verifyRangeReading();

  console.log(
    process.exitCode ? "\nCÓ KIỂM TRA THẤT BẠI\n" : "\nTất cả kiểm tra đều đạt\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
