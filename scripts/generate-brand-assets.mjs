import { mkdir } from "node:fs/promises";
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
