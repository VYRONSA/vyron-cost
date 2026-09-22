import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
// File names are historical; the artwork is the VOLORA mark.
const sourceSvg = path.join(publicDir, "vyron-cost-app-icon.svg");
const orderSvg = path.join(publicDir, "vyron-order-app-icon.svg");
const orderDir = path.join(publicDir, "vyron-order");
const splashDir = path.join(publicDir, "splash");

const NAVY = "#0B202B";

// VOLORA wordmark strokes (viewBox 0 0 312 60), shared with VyronLogo.tsx.
const WORDMARK = `
  <path d="M3 8 L22.5 52 L42 8" stroke="#FFFFFF"/>
  <circle cx="78" cy="30" r="21" stroke="#FFFFFF"/>
  <path d="M85.18 10.27 A21 21 0 0 1 97.73 37.18" stroke="#F4C44E" stroke-width="5.6" stroke-linecap="round"/>
  <path d="M118 8 V51.7 H147" stroke="#FFFFFF"/>
  <circle cx="183" cy="30" r="21" stroke="#FFFFFF"/>
  <path d="M222 52 V10.3 H240 A11 11 0 0 1 240 32.3 H222 M238.5 32.3 L256 52" stroke="#FFFFFF"/>
  <path d="M268.5 52 L288.5 8 L308.5 52" stroke="#F4C44E"/>`;

function wordmarkGroup(x, y, height) {
  const k = height / 60;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="none" stroke-width="4.6">${WORDMARK}</g>`;
}

function atmosphere(width, height) {
  return `
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#0B202B"/><stop offset="45%" stop-color="#081C27"/><stop offset="100%" stop-color="#061722"/>
    </linearGradient>
    <radialGradient id="gold" cx="0.88" cy="0.05" r="0.6"><stop offset="0%" stop-color="#F4C44E" stop-opacity="0.20"/><stop offset="100%" stop-color="#F4C44E" stop-opacity="0"/></radialGradient>
    <radialGradient id="green" cx="0.05" cy="1" r="0.6"><stop offset="0%" stop-color="#3E9B52" stop-opacity="0.20"/><stop offset="100%" stop-color="#3E9B52" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#ground)"/>
  <rect width="${width}" height="${height}" fill="url(#gold)"/>
  <rect width="${width}" height="${height}" fill="url(#green)"/>`;
}

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

async function renderPng(size, outputName, svg = sourceSvg, dir = publicDir) {
  const outputPath = path.join(dir, outputName);
  await sharp(svg).resize(size, size).png().toFile(outputPath);
  return outputPath;
}

async function renderMaskable(size, outputName, svg = sourceSvg, dir = publicDir) {
  const outputPath = path.join(dir, outputName);
  const iconSize = Math.round(size * 0.74);
  const iconBuffer = await sharp(svg).resize(iconSize, iconSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: NAVY,
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

  // Navy atmosphere with the VOLORA wordmark centred.
  const markHeight = Math.round(Math.min(width, height) * 0.075);
  const markWidth = (markHeight * 312) / 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${atmosphere(width, height)}
    ${wordmarkGroup((width - markWidth) / 2, (height - markHeight) / 2, markHeight)}
  </svg>`;

  const outputPath = path.join(splashDir, outputName);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);

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

  // VOLORA Order (customer app) icons.
  await Promise.all(iconSizes.map((size) => renderPng(size, `icon-${size}.png`, orderSvg, orderDir)));
  await renderMaskable(192, "icon-maskable-192.png", orderSvg, orderDir);
  await renderMaskable(512, "icon-maskable-512.png", orderSvg, orderDir);
  await renderPng(180, "apple-touch-icon.png", orderSvg, orderDir);

  // Open Graph / social card, 1200 x 630.
  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    ${atmosphere(1200, 630)}
    ${wordmarkGroup(88, 150, 64)}
    <text x="90" y="262" fill="#BCCDD5" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="7">PROFITABILITY INTELLIGENCE</text>
    <rect x="90" y="300" width="72" height="3" rx="1.5" fill="#F4C44E"/>
    <text x="88" y="385" fill="#FFFFFF" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700">Turn every cost into a</text>
    <text x="88" y="448" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="700"><tspan fill="#F4C44E">more profitable&#160;</tspan><tspan fill="#FFFFFF">tomorrow.</tspan></text>
    <text x="90" y="540" fill="#93AEB9" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="500">Profitability Intelligence for manufacturing and food manufacturing businesses.</text>
  </svg>`;
  await sharp(Buffer.from(og)).png().toFile(path.join(publicDir, "og-volora.png"));

  console.log("Generated VOLORA PWA icons and splash assets in public/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
