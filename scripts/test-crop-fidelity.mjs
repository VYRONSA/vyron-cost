#!/usr/bin/env node
/**
 * VYRON — page recovery and crop fidelity regression test.
 *
 * WHAT THIS LOCKS DOWN
 * --------------------
 * A PDF run and a JPEG run of the same invoice scored 87.5% and 98.44%. The
 * suspicion was image degradation somewhere in the PDF path — rasterisation,
 * recompression, rotation or a bad crop.
 *
 * MEASURED: there is none. The page recovered from the PDF is byte-identical to
 * the standalone JPEG (sha 03f636298ba935ee both ways), decodes to identical
 * pixels (0 differing bytes of 11,594,142, PSNR infinite), and both paths
 * produce an identical crop (sha f70882641dba6b5e). The accuracy difference was
 * model variance: three fresh runs of the PDF path scored 96.9%, 100%, 100%.
 *
 * This test freezes that fidelity. If a future change rasterises, rescales,
 * recompresses or re-crops the page, the hashes move and this fails — so the
 * question never has to be investigated from scratch again.
 *
 * Family A: pure computation. No network, no database, no API key.
 *
 *   npm run test:crop-fidelity
 */

import { register } from "node:module";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);

const { assessDocumentForVision } = await import("../src/lib/vyron-document-page-images.ts");
const { decodeJpeg, cropImageToPng, imageSize } = await import("../src/lib/vyron-image-raster.ts");

/**
 * The reference document. Kept out of the repository because it is a real
 * supplier invoice; the test reports NOT RUN rather than failing when it is
 * absent, so a checkout without it does not produce a false red.
 */
const PDF = process.env.VYRON_CROP_FIXTURE_PDF || path.join("docs", "evidence", "corpus", "gourmet-foods", "02252489.pdf");

if (!existsSync(PDF)) {
  console.log(`\n  NOT RUN — reference invoice not present at ${PDF}`);
  console.log("  Set VYRON_CROP_FIXTURE_PDF to the Gourmet Foods 02252489 PDF to enable this test.\n");
  process.exit(0);
}

/** Measured on 2026-08-02 from the shipped pipeline. */
const EXPECTED = {
  pageSha: "03f636298ba935ee",
  pageWidth: 1653,
  pageHeight: 2338,
  pageBytes: 255816,
  cropSha: "f70882641dba6b5e",
  cropWidth: 1554,
  cropHeight: 1192,
};

/** The crop region the expectations were captured with. Fixed, not model-chosen. */
const REGION_FRACTIONS = { left: 0.03, top: 0.29, width: 0.94, height: 0.51 };

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

let failures = 0;
let checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}

console.log("\n  VYRON — page recovery and crop fidelity\n");

const pdfBytes = readFileSync(PDF);
const assessment = await assessDocumentForVision({ bytes: pdfBytes, mime: "application/pdf" });

check("PDF classified as a scanned page", assessment.visionClass === "scanned-pdf", `got ${assessment.visionClass}`);
check("exactly one page image recovered", assessment.pageImages.length === 1, `got ${assessment.pageImages.length}`);

const page = assessment.pageImages[0];
check("recovered page is JPEG, not re-encoded", page.mime === "image/jpeg", `got ${page.mime}`);
check(
  `recovered page byte length is ${EXPECTED.pageBytes}`,
  page.bytes.length === EXPECTED.pageBytes,
  `got ${page.bytes.length} — the page is being re-encoded or resampled`
);
check(
  `recovered page sha is ${EXPECTED.pageSha}`,
  sha(page.bytes) === EXPECTED.pageSha,
  `got ${sha(page.bytes)} — page recovery is no longer lossless`
);

const size = await imageSize(page.bytes, page.mime);
check(
  `page resolution is ${EXPECTED.pageWidth}x${EXPECTED.pageHeight}`,
  size.width === EXPECTED.pageWidth && size.height === EXPECTED.pageHeight,
  `got ${size.width}x${size.height} — resolution changed`
);

const raster = await decodeJpeg(page.bytes);
check(
  "decoded pixel buffer matches resolution and RGB depth",
  raster.pixels.length === EXPECTED.pageWidth * EXPECTED.pageHeight * 3,
  `got ${raster.pixels.length}, expected ${EXPECTED.pageWidth * EXPECTED.pageHeight * 3}`
);
check(
  "page is not rotated",
  raster.width === EXPECTED.pageWidth && raster.height === EXPECTED.pageHeight,
  `decoded ${raster.width}x${raster.height} — orientation changed`
);

const region = {
  left: Math.round(REGION_FRACTIONS.left * size.width),
  top: Math.round(REGION_FRACTIONS.top * size.height),
  width: Math.round(REGION_FRACTIONS.width * size.width),
  height: Math.round(REGION_FRACTIONS.height * size.height),
};
const crop = await cropImageToPng({ bytes: page.bytes, mime: page.mime, region, minWidth: 1400 });

check(
  `crop dimensions are ${EXPECTED.cropWidth}x${EXPECTED.cropHeight}`,
  crop.width === EXPECTED.cropWidth && crop.height === EXPECTED.cropHeight,
  `got ${crop.width}x${crop.height} — crop coordinates or scaling changed`
);
check(
  `crop sha is ${EXPECTED.cropSha}`,
  sha(crop.bytes) === EXPECTED.cropSha,
  `got ${sha(crop.bytes)} — the pixels sent to the model changed`
);

/*
 * The equivalence the investigation turned on: a PDF and a standalone JPEG of
 * the same page must deliver identical pixels. Asserted by cropping the
 * recovered page a second time through the image path.
 */
const asImage = await assessDocumentForVision({ bytes: page.bytes, mime: "image/jpeg" });
const imageCrop = await cropImageToPng({ bytes: asImage.pageImages[0].bytes, mime: "image/jpeg", region, minWidth: 1400 });
check(
  "PDF path and image path produce identical crops",
  Buffer.compare(crop.bytes, imageCrop.bytes) === 0,
  "the two paths diverged — accuracy differences would then be a pipeline defect, not model variance"
);

console.log(`\n  ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
