/**
 * Extracts the VOLORA landing-page photography from the approved design
 * reference (docs/brand/volora-landing-reference.png, 1024 x 1536).
 *
 * The reference is the design source of truth. Its photographic areas are cropped,
 * the text and UI that were painted into those areas are softened out (the page
 * re-renders them as real HTML on top), leaves are keyed out onto transparency,
 * and everything is upscaled 2x for the web.
 *
 *   node scripts/extract-volora-landing-assets.mjs
 *
 * Output: public/volora/landing/*. Local files only; no network.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "docs/brand/volora-landing-reference.png");
const OUT = path.join(root, "public/volora/landing");
fs.mkdirSync(OUT, { recursive: true });

const SCALE = 2;

/** Separable box blur, applied three times (≈ Gaussian), on a Float32 plane. */
function boxBlur(plane, width, height, radius) {
  let src = plane;
  let tmp = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      let acc = 0;
      const row = y * width;
      for (let x = -radius; x <= radius; x++) acc += src[row + Math.min(width - 1, Math.max(0, x))];
      for (let x = 0; x < width; x++) {
        tmp[row + x] = acc / (2 * radius + 1);
        acc += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
      }
    }
    const out = new Float32Array(src.length);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
      for (let y = 0; y < height; y++) {
        out[y * width + x] = acc / (2 * radius + 1);
        acc += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
      }
    }
    src = out;
  }
  return src;
}

/**
 * Crop a region and inpaint the given rectangles (crop-relative) from their
 * surroundings (normalised convolution), so the painted text and UI vanish
 * without leaving a coloured smudge. The page re-renders that content in HTML.
 */
async function cropClean(region, rects = [], { radius = 22, feather = 3 } = {}) {
  const { data, info } = await sharp(SRC).removeAlpha().extract(region).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (!rects.length) return sharp(data, { raw: { width, height, channels } });

  const hole = new Float32Array(width * height);
  for (const r of rects) {
    for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(width, r.x + r.w); x++) hole[y * width + x] = 1;
    }
  }
  const known = hole.map((h) => 1 - h);
  const blend = boxBlur(hole, width, height, feather);
  // Multi-scale: a small radius keeps nearby texture; larger radii reach the
  // middle of big areas (the KPI card block) where no nearby pixel is known.
  const radii = [radius, radius * 3, radius * 7];
  const weights = radii.map((r) => boxBlur(known, width, height, r));

  const out = Buffer.from(data);
  for (let c = 0; c < channels; c++) {
    const plane = new Float32Array(width * height);
    for (let i = 0; i < plane.length; i++) plane[i] = data[i * channels + c] * known[i];
    const fills = radii.map((r) => boxBlur(plane, width, height, r));
    for (let i = 0; i < plane.length; i++) {
      const m = Math.min(1, blend[i] * 1.6);
      if (m <= 0) continue;
      let fill = null;
      for (let k = 0; k < radii.length; k++) {
        if (weights[k][i] > 0.08) {
          fill = fills[k][i] / weights[k][i];
          break;
        }
      }
      if (fill === null) fill = fills[radii.length - 1][i] / Math.max(1e-4, weights[radii.length - 1][i]);
      out[i * channels + c] = Math.round(data[i * channels + c] * (1 - m) + fill * m);
    }
  }
  return sharp(out, { raw: { width, height, channels } });
}

async function writePhoto(img, name, width) {
  const buf = await img.png().toBuffer();
  await sharp(buf)
    .resize({ width, kernel: "lanczos3" })
    .sharpen({ sigma: 0.7 })
    .webp({ quality: 84 })
    .toFile(path.join(OUT, name));
}

/** Key a leaf off its light background onto transparency, using green dominance. */
async function extractLeaf(region, name) {
  const { data, info } = await sharp(SRC).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const dominance = g - Math.max(r, b);
    const alpha = Math.max(0, Math.min(255, (dominance - 16) * 8));
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = alpha;
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({ width: info.width * SCALE * 2, kernel: "lanczos3" })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(path.join(OUT, name));
}

// ── Hero: manufacturing + food manufacturing photography (x 340–1024, y 0–508) ──
// Softened: the painted navigation, headline fragments, button, the two photo
// captions and the four KPI cards — all re-rendered as HTML by the page.
// "Good Food. Better Margins." is kept exactly as painted.
{
  const ox = 340;
  const rect = (x1, y1, x2, y2) => ({ x: x1 - ox, y: y1, w: x2 - x1, h: y2 - y1 });
  const img = await cropClean({ left: ox, top: 0, width: 684, height: 508 }, [
    rect(340, 0, 1024, 66), // navigation band
    rect(340, 84, 432, 105), // eyebrow fragment
    rect(340, 106, 410, 156), // "ost"
    rect(340, 194, 480, 242), // "orrow."
    rect(340, 252, 362, 350), // paragraph line ends
    rect(340, 362, 388, 414), // Watch Video button
    rect(576, 86, 708, 150), // MANUFACTURING caption
    rect(874, 114, 1004, 180), // FOOD MANUFACTURING caption
    rect(531, 304, 844, 482), // KPI cards
  ]);
  await writePhoto(img, "hero.webp", 684 * SCALE);
}

// ── Industry tiles (seven), label band softened for the HTML icon + label ──
const TILES = [
  ["general-manufacturing", 36],
  ["food-manufacturing", 173],
  ["beverages", 310],
  ["packaging", 448],
  ["chemicals", 588],
  ["distribution", 727],
  ["multi-site-operations", 866],
];
for (const [name, left] of TILES) {
  const width = 123;
  const top = 1115;
  const height = 152;
  const img = await cropClean({ left, top, width, height }, [{ x: 0, y: 92, w: width, h: height - 92 }], { radius: 14 });
  await writePhoto(img, `industry-${name}.webp`, width * SCALE * 2);
}

// ── Closing banner: sunset, mountains and road (y 1312–1536) ──
{
  const oy = 1312;
  const rect = (x1, y1, x2, y2) => ({ x: x1, y: y1 - oy, w: x2 - x1, h: y2 - y1 });
  const img = await cropClean({ left: 0, top: oy, width: 1024, height: 224 }, [
    rect(56, 1326, 426, 1450), // headline block
    rect(512, 1374, 810, 1422), // buttons
    rect(832, 1384, 988, 1448), // leaf + PEOPLE / PROFITABILITY / PROGRESS
    rect(828, 1482, 992, 1508), // attribution
  ]);
  await writePhoto(img, "closing-banner.webp", 1024 * SCALE);
}

// ── Stainless process tanks (light backdrop behind the phone) ──
{
  const img = await cropClean({ left: 887, top: 580, width: 137, height: 160 });
  await writePhoto(img, "process-tanks.webp", 137 * SCALE * 2);
}

// ── Leaves, keyed onto transparency ──
await extractLeaf({ left: 912, top: 532, width: 70, height: 54 }, "leaf-top.webp");
await extractLeaf({ left: 294, top: 890, width: 38, height: 80 }, "leaf-blur.webp");
await extractLeaf({ left: 942, top: 996, width: 56, height: 80 }, "leaf-drop.webp");

console.log(`VOLORA landing assets written to ${path.relative(root, OUT)}`);
