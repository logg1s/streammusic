import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const rose = "#f43f5e";
const background = "#0b0b0f";
const source = path.join(root, "assets", "brand", "vong-mark-imagegen.png");

const outputDirectories = [
  path.join(root, "assets", "brand"),
  path.join(root, "public", "brand"),
  path.join(root, "mobile", "assets"),
  path.join(root, "src", "app"),
];
await Promise.all(
  outputDirectories.map((directory) => mkdir(directory, { recursive: true })),
);

async function flatMark(size, inset) {
  const contentSize = size - inset * 2;
  // Image generation may leave almost-transparent dark pixels in the canvas.
  // Build the mask from the bright rose artwork itself so those pixels cannot
  // become opaque when the mark is normalized to one flat brand color.
  const mask = await sharp(source)
    .flatten({ background: "#000000" })
    .grayscale()
    .threshold(72)
    .trim({ background: "#000000" })
    .resize(contentSize, contentSize, { fit: "contain" })
    .toBuffer();
  const solid = await sharp({
    create: {
      width: contentSize,
      height: contentSize,
      channels: 3,
      background: rose,
    },
  })
    .joinChannel(mask)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: solid, left: inset, top: inset }])
    .png()
    .toBuffer();
}

async function appIcon(size, inset) {
  const mark = await flatMark(size, inset);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: mark }])
    .png()
    .toBuffer();
}

async function writePng(buffer, relativePath) {
  await sharp(buffer)
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(root, relativePath));
}

async function faviconIco() {
  const variants = [
    { size: 16, inset: 1 },
    { size: 32, inset: 3 },
    { size: 48, inset: 5 },
    { size: 64, inset: 7 },
  ];
  const frames = await Promise.all(
    variants.map(async ({ size, inset }) => ({
      size,
      png: await sharp(await appIcon(size, inset)).png().toBuffer(),
    })),
  );
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = header.length;
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

const masterMark = await flatMark(1024, 112);
const masterIcon = await appIcon(1024, 152);
const adaptiveForeground = await flatMark(1024, 236);

await Promise.all([
  writePng(masterMark, "assets/brand/vong-mark-1024.png"),
  writePng(masterIcon, "assets/brand/vong-app-icon-1024.png"),
  writePng(masterMark, "public/brand/vong-mark.png"),
  writePng(await appIcon(512, 76), "public/icon-512.png"),
  writePng(await appIcon(512, 118), "public/icon-maskable-512.png"),
  writePng(await appIcon(192, 28), "public/icon-192.png"),
  writePng(await appIcon(180, 26), "public/apple-touch-icon.png"),
  writePng(masterIcon, "mobile/assets/icon.png"),
  writePng(adaptiveForeground, "mobile/assets/adaptive-icon.png"),
  writePng(masterMark, "mobile/assets/vong-mark.png"),
  writePng(masterMark, "mobile/assets/splash-icon.png"),
  writeFile(path.join(root, "src", "app", "favicon.ico"), await faviconIco()),
]);

const wordmarkSvg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1120" height="300" viewBox="0 0 1120 300">
    <text x="292" y="224" font-family="Segoe UI, Arial, sans-serif" font-size="218"
      font-weight="750" letter-spacing="-9" fill="${rose}">Vọng</text>
  </svg>
`);
const wordmarkMark = await flatMark(260, 18);
const wordmark = await sharp({
  create: {
    width: 1120,
    height: 300,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: wordmarkMark, left: 8, top: 20 },
    { input: wordmarkSvg, left: 0, top: 0 },
  ])
  .png()
  .toBuffer();

await Promise.all([
  writePng(wordmark, "public/brand/vong-wordmark.png"),
  writePng(wordmark, "mobile/assets/vong-wordmark.png"),
]);

const socialWordmark = await sharp(wordmark).resize({ width: 336 }).png().toBuffer();
const socialBackdrop = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <radialGradient id="glow" cx="80%" cy="15%" r="72%">
        <stop offset="0" stop-color="#f43f5e" stop-opacity="0.24" />
        <stop offset="1" stop-color="#09090b" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f43f5e" />
        <stop offset="1" stop-color="#fb7185" stop-opacity="0" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="#09090b" />
    <rect width="1200" height="630" fill="url(#glow)" />
    <circle cx="1090" cy="520" r="230" fill="none" stroke="#f43f5e" stroke-opacity="0.12" stroke-width="2" />
    <circle cx="1090" cy="520" r="155" fill="none" stroke="#f43f5e" stroke-opacity="0.09" stroke-width="2" />
    <rect x="72" y="180" width="420" height="5" rx="2.5" fill="url(#line)" />
    <text x="72" y="278" fill="#fafafa" font-family="Segoe UI, Arial, sans-serif" font-size="68" font-weight="700" letter-spacing="-2">Nhạc của bạn.</text>
    <text x="72" y="357" fill="#fafafa" font-family="Segoe UI, Arial, sans-serif" font-size="68" font-weight="700" letter-spacing="-2">Ở nguyên chỗ cũ.</text>
    <text x="74" y="420" fill="#a1a1aa" font-family="Segoe UI, Arial, sans-serif" font-size="27">Google Drive · Dropbox · OneDrive · YouTube</text>
    <rect x="72" y="485" width="449" height="54" rx="27" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.12" />
    <text x="98" y="520" fill="#fda4af" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="600" letter-spacing="1.2">WEB · ANDROID · ANDROID TV · WINDOWS</text>
  </svg>
`);
const socialCard = await sharp(socialBackdrop)
  .composite([{ input: socialWordmark, left: 70, top: 58 }])
  .png()
  .toBuffer();
await writePng(socialCard, "public/brand/vong-social-card.png");

const tvMark = await flatMark(124, 8);
const tvText = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
    <text x="151" y="111" font-family="Segoe UI, Arial, sans-serif" font-size="64"
      font-weight="750" letter-spacing="-3" fill="#f4f4f5">Vọng</text>
  </svg>
`);
const tvBanner = await sharp({
  create: { width: 320, height: 180, channels: 4, background },
})
  .composite([
    { input: tvMark, left: 18, top: 28 },
    { input: tvText, left: 0, top: 0 },
  ])
  .png()
  .toBuffer();
await writePng(tvBanner, "mobile/assets/tv-banner.png");
