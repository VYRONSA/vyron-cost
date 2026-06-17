import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const sourceSvg = path.join(publicDir, "vyron-cost-app-icon.svg");

async function renderPng(size, outputName) {
  const outputPath = path.join(publicDir, outputName);
  await sharp(sourceSvg).resize(size, size).png().toFile(outputPath);
  return outputPath;
}

async function main() {
  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing source icon: ${sourceSvg}`);
  }

  await renderPng(512, "icon-512.png");
  await renderPng(192, "icon-192.png");
  await renderPng(180, "apple-touch-icon.png");

  const faviconSizes = [16, 32, 48];
  const faviconBuffers = await Promise.all(
    faviconSizes.map((size) => sharp(sourceSvg).resize(size, size).png().toBuffer())
  );
  const faviconIco = await toIco(faviconBuffers);
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), faviconIco);

  console.log("Generated VYRON COST PWA icons in public/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
