/**
 * VYRON — dependency-free image cropping for the extraction pipeline.
 *
 * WHY THIS EXISTS
 * ---------------
 * Cropping the invoice table before reading it is what makes extraction
 * accurate, so the crop step cannot be optional. It was implemented with sharp,
 * which failed to load on Vercel:
 *
 *     Failed to load external module sharp
 *     libvips-cpp.so ... linux-x64 runtime
 *
 * sharp is a native addon. Its platform binaries were present in the lockfile,
 * but Next's server bundling did not carry `libvips-cpp.so` into the deployed
 * function, so the module resolved and then failed at load. That class of
 * problem — a native binary that must survive bundling, tracing and a
 * cross-platform install — recurs, and it takes the whole extraction path down
 * with it when it does.
 *
 * This module does the same work in plain JavaScript:
 *
 *   decode   pdfjs-dist's JPEG decoder, already a dependency of this project
 *   crop     array slicing over the decoded pixels
 *   scale    bilinear, only when a crop is too small to stay legible
 *   encode   PNG written directly, using Node's built-in zlib
 *
 * No native addon, no platform binary, nothing to install per architecture. It
 * runs wherever Node runs. Measured on the reference page (1653x2338): decode
 * 40ms, whole crop-and-encode well under a second — irrelevant beside a model
 * call measured in seconds.
 */

import { deflateSync, crc32 } from "node:zlib";

export type RasterImage = {
  width: number;
  height: number;
  /** RGB, 3 bytes per pixel, row-major. */
  pixels: Uint8Array;
};

export type CropRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Formats this module can decode. Anything else is passed through uncropped. */
export function canRasterize(mime: string) {
  return mime === "image/jpeg" || mime === "image/jpg";
}

export async function decodeJpeg(bytes: Buffer): Promise<RasterImage> {
  // Imported lazily: the decoder bundle is only needed when a crop is taken.
  const { JpegImage } = await import("pdfjs-dist/image_decoders/pdf.image_decoders.mjs");
  const image = new JpegImage();
  image.parse(new Uint8Array(bytes));
  const pixels = image.getData({ width: image.width, height: image.height, forceRGB: true });
  return { width: image.width, height: image.height, pixels: new Uint8Array(pixels) };
}

export function cropRaster(source: RasterImage, region: CropRegion): RasterImage {
  const left = Math.max(0, Math.min(source.width - 1, Math.round(region.left)));
  const top = Math.max(0, Math.min(source.height - 1, Math.round(region.top)));
  const width = Math.max(1, Math.min(source.width - left, Math.round(region.width)));
  const height = Math.max(1, Math.min(source.height - top, Math.round(region.height)));

  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((top + y) * source.width + left) * 3;
    pixels.set(source.pixels.subarray(sourceStart, sourceStart + width * 3), y * width * 3);
  }

  return { width, height, pixels };
}

/**
 * Bilinear upscale.
 *
 * Only used to enlarge a crop that came out narrow. Nearest-neighbour would
 * alias the thin strokes of printed digits into each other, which is precisely
 * the legibility this pipeline exists to protect.
 */
export function resizeRaster(source: RasterImage, targetWidth: number): RasterImage {
  if (targetWidth <= source.width) return source;

  const scale = targetWidth / source.width;
  const width = targetWidth;
  const height = Math.max(1, Math.round(source.height * scale));
  const pixels = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, y / scale);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const yWeight = sourceY - y0;

    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, x / scale);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const xWeight = sourceX - x0;

      const target = (y * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        const topLeft = source.pixels[(y0 * source.width + x0) * 3 + channel];
        const topRight = source.pixels[(y0 * source.width + x1) * 3 + channel];
        const bottomLeft = source.pixels[(y1 * source.width + x0) * 3 + channel];
        const bottomRight = source.pixels[(y1 * source.width + x1) * 3 + channel];
        const top = topLeft + (topRight - topLeft) * xWeight;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;
        pixels[target + channel] = Math.round(top + (bottom - top) * yWeight);
      }
    }
  }

  return { width, height, pixels };
}

function pngChunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  const typeAndBody = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndBody) >>> 0, 0);
  return Buffer.concat([length, typeAndBody, checksum]);
}

/**
 * Encode RGB pixels as a PNG.
 *
 * Filter type 0 (none) on every scanline. A smarter filter would compress
 * better, but the buffer is base64-ed into one API call and thrown away — bytes
 * on the wire are not the constraint, and an encoder that is obviously correct
 * is worth more here than one that is small.
 */
export function encodePng(image: RasterImage): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const rowLength = image.width * 3;
  const raw = Buffer.alloc((rowLength + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const target = y * (rowLength + 1);
    raw[target] = 0; // filter: none
    raw.set(image.pixels.subarray(y * rowLength, (y + 1) * rowLength), target + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 6 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Dimensions without a full decode, read from the JPEG frame header. */
export function readJpegSize(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2; // skip SOI
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    // SOF0-SOF15, excluding the non-frame markers DHT (c4), JPGA (c8), DAC (cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  return null;
}

/**
 * Crop an image to a region and return PNG bytes.
 *
 * Returns the original bytes unchanged when the format cannot be decoded here,
 * so an unusual upload degrades to a whole-page read rather than failing. A
 * whole-page read is a weaker extraction; the validators downstream say so.
 */
export async function cropImageToPng(input: {
  bytes: Buffer;
  mime: string;
  region: CropRegion;
  minWidth?: number;
}): Promise<{ bytes: Buffer; mime: string; cropped: boolean; width: number; height: number }> {
  if (!canRasterize(input.mime)) {
    const size = readJpegSize(input.bytes);
    return {
      bytes: input.bytes,
      mime: input.mime,
      cropped: false,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
    };
  }

  const decoded = await decodeJpeg(input.bytes);
  let region = cropRaster(decoded, input.region);
  if (input.minWidth && region.width < input.minWidth) {
    region = resizeRaster(region, input.minWidth);
  }

  return {
    bytes: encodePng(region),
    mime: "image/png",
    cropped: true,
    width: region.width,
    height: region.height,
  };
}

/** Dimensions of a page image, decoding only if the header cannot be read. */
export async function imageSize(bytes: Buffer, mime: string): Promise<{ width: number; height: number }> {
  if (canRasterize(mime)) {
    const fromHeader = readJpegSize(bytes);
    if (fromHeader) return fromHeader;
    const decoded = await decodeJpeg(bytes);
    return { width: decoded.width, height: decoded.height };
  }
  return { width: 0, height: 0 };
}
