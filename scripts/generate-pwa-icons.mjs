import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const sourceSvg = path.join(publicDir, "vyron-cost-app-icon.svg");
const splashDir = path.join(publicDir, "splash");

const iconSizes = [72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];

const splashSizes = [
  { width: 640, height: 1136, file: "splash-640x1136.png" },
  { width: 750, height: 1334, file: "splash-750x1334.png" },
  { width: 828, height: 1792, file: "splash-828x1792.png" },
  { width: 1170, height: 2532, file: "splash-1170x2532.png" },
  { width: 1242, height: 2688, file: "splash-1242x2688.png" },
  { width: 1536, height: 2048, file: "splash-1536x2048.png" },
  { width: 1668, height: 2224, file: "splash-1668x2224.png" },
  { width: 1668, height: 2388, file: "splash-1668x2388.png" },
  { width: 2048, height: 2732, file: "splash-2048x2732.png" },
];

async function renderPng(size, outputName) {
  const outputPath = path.join(publicDir, outputName);
  await sharp(sourceSvg).resize(size, size).png().toFile(outputPath);
  return outputPath;
}

async function renderMaskable(size, outputName) {
  const outputPath = path.join(publicDir, outputName);
  const iconSize = Math.round(size * 0.74);
  const iconBuffer = await sharp(sourceSvg).resize(iconSize, iconSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#07111F",
    },
  })
    .composite([
      {
        input: iconBuffer,
        top: Math.floor((size - iconSize) / 2),
        left: Math.floor((size - iconSize) / 2),
      },
    ])
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function renderSplash(width, height, outputName) {
  if (!fs.existsSync(splashDir)) {
    fs.mkdirSync(splashDir, { recursive: true });
  }

  const iconSize = Math.round(Math.min(width, height) * 0.24);
  const iconBuffer = await sharp(sourceSvg).resize(iconSize, iconSize).png().toBuffer();

  const outputPath = path.join(splashDir, outputName);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#F8FAFD",
    },
  })
    .composite([
      {
        input: iconBuffer,
        top: Math.floor((height - iconSize) / 2),
        left: Math.floor((width - iconSize) / 2),
      },
    ])
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function main() {
  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing source icon: ${sourceSvg}`);
  }

  await Promise.all(iconSizes.map((size) => renderPng(size, `icon-${size}.png`)));
  await renderMaskable(192, "icon-maskable-192.png");
  await renderMaskable(512, "icon-maskable-512.png");
  await renderPng(180, "apple-touch-icon.png");

  await Promise.all(splashSizes.map((item) => renderSplash(item.width, item.height, item.file)));

  const faviconSizes = [16, 32, 48];
  const faviconBuffers = await Promise.all(
    faviconSizes.map((size) => sharp(sourceSvg).resize(size, size).png().toBuffer())
  );
  const faviconIco = await toIco(faviconBuffers);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), faviconIco);

  console.log("Generated VYRON COST PWA icons and splash assets in public/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
