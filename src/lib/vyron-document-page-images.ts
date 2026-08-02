/**
 * VYRON — document classification and page-image recovery.
 *
 * WHY THIS EXISTS
 * ---------------
 * A scanned supplier invoice sent to OpenAI as a raw PDF is downsampled before
 * the model ever sees it. On a dense priced table the digits stop being
 * resolvable, and the model does not report that — it invents values with high
 * confidence. Measured on Gourmet Foods invoice 02252489: every line came back
 * carrying `vatAmount = unitPrice x 0.14`, a rate that appears nowhere on the
 * document and has not been South Africa's VAT rate since 2018.
 *
 * The same model reading the same table as a full-resolution cropped image
 * returned all 16 rows with 64 of 64 numeric cells correct.
 *
 * So the engine must decide, per document, how the model should see it:
 *
 *   searchable PDF   the text layer is exact — no vision path needed
 *   scanned PDF      recover the page image and read the table from it
 *   image upload     already an image, read it directly
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 * -----------------------------------------
 * It does not rasterise vector PDF content. Rendering arbitrary PDF drawing
 * operations needs a canvas backend, which is a native dependency this project
 * does not carry. It is not needed: a scanned page IS an embedded image, and
 * that image is recovered losslessly here. A vector PDF has a text layer and
 * takes the searchable path instead. Anything that fits neither is reported as
 * such so the caller can fall back rather than proceed on a guess.
 */

export type DocumentVisionClass =
  /** Has a usable text layer. The existing extraction path is exact for these. */
  | "searchable-pdf"
  /** No text layer, but full-page images were recovered for the vision path. */
  | "scanned-pdf"
  /** Uploaded as an image. Goes straight to the vision path. */
  | "image"
  /** No text layer and no recoverable page image — caller must fall back. */
  | "unreadable-pdf";

export type DocumentPageImage = {
  pageNumber: number;
  /** Encoded image bytes, exactly as embedded — no re-encoding, no resampling. */
  bytes: Buffer;
  mime: string;
  width: number;
  height: number;
};

export type DocumentVisionAssessment = {
  visionClass: DocumentVisionClass;
  pageCount: number;
  /** Characters recovered from the text layer across all pages. */
  textLayerChars: number;
  pageImages: DocumentPageImage[];
  /** Human-readable note for the extraction trace. Never a silent decision. */
  reason: string;
};

/**
 * Minimum characters before a PDF counts as searchable.
 *
 * A scanner sometimes stamps a few characters of metadata onto an otherwise
 * image-only page. Treating that as a text layer would send an unreadable
 * document down the exact path and lose every line item, so the threshold sits
 * well above incidental text and far below any real invoice's body copy.
 */
const TEXT_LAYER_MIN_CHARS = 200;

/** Below this the embedded image is a logo or signature, not a scanned page. */
const PAGE_IMAGE_MIN_PIXELS = 400_000;

type PdfImageCandidate = {
  width: number;
  height: number;
  mime: string;
  bytes: Buffer;
};

/**
 * Recover embedded page images from a PDF without a rasteriser.
 *
 * Scanners emit one JPEG per page wrapped in a thin PDF container, so the page
 * image can be lifted out byte-for-byte. Extracting it is strictly better than
 * re-rendering: there is no generation loss and no resampling of the digits
 * that the whole fix depends on being legible.
 *
 * Only DCTDecode (JPEG) and JPXDecode (JPEG 2000) streams are taken, because
 * those are self-describing formats that can be handed to an image encoder or
 * the model as-is. A Flate-compressed raw bitmap would need colour-space
 * reconstruction to become a valid image, and a wrong reconstruction is worse
 * than no image at all — those are left for the caller's fallback.
 */
function extractEmbeddedImages(pdfBytes: Buffer): PdfImageCandidate[] {
  const latin = pdfBytes.toString("latin1");
  const candidates: PdfImageCandidate[] = [];

  // Image XObject dictionaries, each followed by its stream payload.
  const dictionaryPattern = /\/Subtype\s*\/Image([\s\S]{0,600}?)stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = dictionaryPattern.exec(latin)) !== null) {
    const dictionary = match[1];
    const width = Number(/\/Width\s+(\d+)/.exec(dictionary)?.[1] || 0);
    const height = Number(/\/Height\s+(\d+)/.exec(dictionary)?.[1] || 0);
    if (!width || !height || width * height < PAGE_IMAGE_MIN_PIXELS) continue;

    const isJpeg = /\/DCTDecode/.test(dictionary);
    const isJpeg2000 = /\/JPXDecode/.test(dictionary);
    if (!isJpeg && !isJpeg2000) continue;

    const streamStart = match.index + match[0].length;
    // `/Length` may be an indirect reference, so the stream end is located by
    // the terminating keyword rather than trusted from the dictionary.
    const endstream = latin.indexOf("endstream", streamStart);
    if (endstream === -1) continue;

    let bytes = pdfBytes.subarray(streamStart, endstream);

    if (isJpeg) {
      // Trim to the exact JPEG frame so the payload is a valid standalone file.
      const soi = bytes.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (soi === -1 || eoi === -1 || eoi <= soi) continue;
      bytes = bytes.subarray(soi, eoi + 2);
    }

    candidates.push({
      width,
      height,
      mime: isJpeg ? "image/jpeg" : "image/jp2",
      bytes: Buffer.from(bytes),
    });
  }

  return candidates;
}

async function readTextLayer(pdfBytes: Buffer): Promise<{ pageCount: number; chars: number }> {
  // Imported lazily: pdfjs is only needed when a PDF is actually assessed, and
  // the legacy build is the one that runs outside a browser.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: false,
    /*
     * `standardFontDataUrl` is deliberately not set.
     *
     * Pointing it at `node_modules/pdfjs-dist/standard_fonts/` through
     * `import.meta.url` made the bundler try to resolve a filesystem path that
     * does not exist inside a deployed serverless function — the same class of
     * problem as the native binary this module's crop path was rewritten to
     * avoid. Font data is only needed to RENDER glyphs; extracting text
     * positions does not touch it, and the character counts this function
     * returns are unchanged without it. pdfjs logs a warning for a missing
     * standard font and carries on.
     */
  });

  const pdf = await loadingTask.promise;
  let chars = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      chars += content.items
        .map((item) => (typeof (item as { str?: unknown }).str === "string" ? (item as { str: string }).str : ""))
        .join("")
        .trim().length;
    }
    return { pageCount: pdf.numPages, chars };
  } finally {
    /*
     * Cleanup must never discard a successful read. `destroy` lives on the
     * loading task in some builds and the document proxy in others, and letting
     * the difference throw from `finally` replaced a correct character count
     * with a parse failure — classifying a searchable PDF as unreadable.
     */
    try {
      const disposable = (pdf as unknown as { destroy?: () => Promise<void> }).destroy
        ? (pdf as unknown as { destroy: () => Promise<void> })
        : (loadingTask as unknown as { destroy?: () => Promise<void> });
      await disposable.destroy?.();
    } catch {
      // A leaked worker is recoverable; a misclassified document is not.
    }
  }
}


export async function assessDocumentForVision(input: {
  bytes: Buffer;
  mime: string;
}): Promise<DocumentVisionAssessment> {
  if (input.mime !== "application/pdf") {
    return {
      visionClass: "image",
      pageCount: 1,
      textLayerChars: 0,
      pageImages: [{ pageNumber: 1, bytes: input.bytes, mime: input.mime, width: 0, height: 0 }],
      reason: `Uploaded as ${input.mime}; read directly as an image.`,
    };
  }

  let pageCount = 0;
  let textLayerChars = 0;
  try {
    const textLayer = await readTextLayer(input.bytes);
    pageCount = textLayer.pageCount;
    textLayerChars = textLayer.chars;
  } catch (error) {
    // A PDF that will not parse is not automatically unreadable — the embedded
    // image may still be recoverable — so this degrades rather than throws.
    textLayerChars = 0;
    pageCount = 0;
    console.warn("[document-page-images] text layer unreadable", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (textLayerChars >= TEXT_LAYER_MIN_CHARS) {
    return {
      visionClass: "searchable-pdf",
      pageCount,
      textLayerChars,
      pageImages: [],
      reason: `Text layer carries ${textLayerChars} characters across ${pageCount} page(s); the document is searchable and does not need the vision path.`,
    };
  }

  const embedded = extractEmbeddedImages(input.bytes);

  if (!embedded.length) {
    return {
      visionClass: "unreadable-pdf",
      pageCount,
      textLayerChars,
      pageImages: [],
      reason: `No text layer (${textLayerChars} characters) and no self-describing page image could be recovered. The caller must fall back to sending the PDF whole.`,
    };
  }

  /*
   * Page association.
   *
   * One recovered image per page is the scanner case this path exists for, and
   * document order matches page order there. When the counts disagree the
   * mapping is a guess, so the images are still returned — they are strictly
   * more legible than the raw PDF — but the reason records that page numbers
   * are positional rather than resolved from each page's resource dictionary.
   */
  const pagesMatch = pageCount > 0 && embedded.length === pageCount;
  const pageImages: DocumentPageImage[] = embedded.map((image, index) => ({
    pageNumber: index + 1,
    bytes: image.bytes,
    mime: image.mime,
    width: image.width,
    height: image.height,
  }));

  return {
    visionClass: "scanned-pdf",
    pageCount: pageCount || pageImages.length,
    textLayerChars,
    pageImages,
    reason: pagesMatch
      ? `No text layer (${textLayerChars} characters); recovered ${pageImages.length} full-page image(s) at up to ${Math.max(...embedded.map((image) => image.width))}x${Math.max(...embedded.map((image) => image.height))} for the vision path.`
      : `No text layer (${textLayerChars} characters); recovered ${pageImages.length} embedded image(s) against ${pageCount} page(s) — page numbers are positional, not resolved from page resources.`,
  };
}
