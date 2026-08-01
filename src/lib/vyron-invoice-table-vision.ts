/**
 * VYRON — line-item extraction from a table image.
 *
 * WHY THIS EXISTS
 * ---------------
 * Sending a scanned invoice to the model as a whole page spends the model's
 * visual budget on the letterhead, the address block and the bank details, and
 * leaves too little for the priced table. Measured on Gourmet Foods 02252489
 * with gpt-4o against a verified answer key:
 *
 *   whole scanned PDF (production path)   ~25% of numeric cells correct
 *   full-resolution whole page image      90.6%, 15 of 16 rows
 *   full-resolution cropped table         100%, 16 of 16 rows
 *
 * So the table is located first and read second, and the read is done against
 * an unscaled crop.
 *
 * The prompt asks for column identity BEFORE any value. That ordering is the
 * point: the failure being fixed was not bad OCR of a digit, it was reading the
 * right digit out of the wrong column. Gourmet Foods prints
 * `... UNIT PRICE | WEIGHT | V.A.T. | NETT PRICE`, and the model had been
 * taking the WEIGHT column as the VAT amount. Naming the columns first makes
 * that decision explicit and checkable instead of implicit and invisible.
 */

import type { ExtractionRuntimeOptions } from "@/lib/vyron-document-extraction";

export type TableColumnMapping = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  weight: string;
  vatAmount: string;
  lineTotal: string;
};

export type TableVisionRow = {
  description: string;
  skuOrProductCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatAmount: string;
  lineTotal: string;
};

export type TableVisionResult = {
  printedColumns: string[];
  columnMapping: TableColumnMapping;
  rowCount: number | null;
  lineItems: TableVisionRow[];
  /** Normalised crop box actually used, for the diagnostics surface. */
  cropBox: { top: number; left: number; width: number; height: number } | null;
  cropBytes: Buffer | null;
  cropMime: string;
  rawLocateJson: unknown;
  rawReadJson: unknown;
  outputText: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
};

/** Widest edge sent to the locate pass. The box only needs to be roughly right. */
const LOCATE_MAX_WIDTH = 1100;
/**
 * Padding around the located box, as a fraction of the page.
 *
 * Biased upwards. The locate pass tends to place the top edge on the first
 * product row rather than above the heading, and a clipped heading is the one
 * loss that cannot be recovered later: the read pass then guesses the column
 * names, and on Gourmet Foods it turned "NETT PRICE" into "VAT PRICE" and took
 * two values from the wrong place. Whitespace costs nothing by comparison.
 */
const CROP_PADDING = 0.02;
const CROP_PADDING_TOP = 0.06;
/**
 * The bottom edge is padded almost as generously as the top, for the same
 * reason: the locate box tends to stop on the last row it is confident about,
 * and a clipped final row is silently lost. Over-reaching into the totals block
 * is harmless — the read prompt already refuses to return subtotal and total
 * rows as line items.
 */
const CROP_PADDING_BOTTOM = 0.05;
/**
 * Smallest crop width sent to the read pass. A narrow table on a big page can
 * crop down to a strip the model would then have to upscale itself; enlarging
 * it here keeps the digit strokes intact.
 */
const READ_MIN_WIDTH = 1400;

const UNKNOWN = "UNKNOWN";

function emptyMapping(): TableColumnMapping {
  return {
    description: UNKNOWN,
    quantity: UNKNOWN,
    unit: UNKNOWN,
    unitPrice: UNKNOWN,
    weight: UNKNOWN,
    vatAmount: UNKNOWN,
    lineTotal: UNKNOWN,
  };
}

function parseJsonBlock(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Table vision did not return JSON. Raw: ${cleaned.slice(0, 400)}`);
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function outputTextOf(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    const content = (item as { content?: unknown }).content;
    for (const block of Array.isArray(content) ? content : []) {
      const text = (block as { text?: string }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

async function callVision(input: {
  apiKey: string;
  model: string;
  prompt: string;
  imageBytes: Buffer;
  mime: string;
  maxOutputTokens: number;
}) {
  const dataUrl = `data:${input.mime};base64,${input.imageBytes.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: input.prompt },
            { type: "input_image", image_url: dataUrl },
          ],
        },
      ],
      temperature: 0,
      max_output_tokens: input.maxOutputTokens,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(`Table vision ${input.model} failed: ${error?.message || JSON.stringify(data).slice(0, 400)}`);
  }

  const text = outputTextOf(data);
  if (!text) throw new Error(`Table vision ${input.model} returned no output text.`);
  return { data, text, parsed: parseJsonBlock(text) };
}

const LOCATE_PROMPT = `You are looking at one page of a supplier invoice.

Find the LINE ITEM TABLE — the block listing the products or services charged,
including its column heading row and every product row.

Return the smallest rectangle that contains the column headings and all product
rows. Exclude the supplier logo, addresses, payment terms, bank details, the
totals block and any footer.

Express the rectangle as fractions of the page, where 0,0 is the top-left corner
and 1,1 is the bottom-right.

Also read the printed column headings, left to right, exactly as printed.

If there is no line item table on this page, set "tableFound" to false.

Return ONLY JSON:
{
  "tableFound": true,
  "box": { "top": 0.0, "left": 0.0, "width": 1.0, "height": 1.0 },
  "printedColumns": ["..."]
}`;

const READ_PROMPT = `You are reading the line item table of a supplier invoice.

TASK 1 — COLUMN IDENTITY
Read every printed column heading, left to right, exactly as printed, into
"printedColumns".

Then state which printed heading you will read each canonical field from, in
"columnMapping". Use the heading text verbatim. If no printed column clearly
corresponds to a canonical field, return "UNKNOWN" for it.

This table may contain numeric columns that are NOT money — a weight, a pack
size, a discount percentage or a tax code. Never place such a column into
unitPrice, vatAmount or lineTotal. If the table has a weight column, name it
under "weight" so it is accounted for and cannot be mistaken for money.

TASK 2 — ROWS
Return every product row, reading each value ONLY from the column you named in
TASK 1.

Copy the characters exactly as printed. Do not calculate, infer, estimate,
convert or adjust any value. Do not compute VAT. Do not derive a line total.
If a cell cannot be read, return "UNKNOWN" for that cell.
If a row is not a charged product row — a heading, a subtotal, a carried-forward
line or a comment — do not return it.

Set "rowCount" to the number of product rows you returned.

Return ONLY JSON:
{
  "printedColumns": ["..."],
  "columnMapping": {
    "description": "heading or UNKNOWN",
    "quantity": "heading or UNKNOWN",
    "unit": "heading or UNKNOWN",
    "unitPrice": "heading or UNKNOWN",
    "weight": "heading or UNKNOWN",
    "vatAmount": "heading or UNKNOWN",
    "lineTotal": "heading or UNKNOWN"
  },
  "rowCount": 0,
  "lineItems": [
    { "description": "", "skuOrProductCode": "", "quantity": "", "unit": "", "unitPrice": "", "vatAmount": "", "lineTotal": "" }
  ]
}`;

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text;
}

function normaliseRow(raw: unknown): TableVisionRow {
  const row = (raw || {}) as Record<string, unknown>;
  return {
    description: asText(row.description),
    skuOrProductCode: asText(row.skuOrProductCode ?? row.code ?? row.sku),
    quantity: asText(row.quantity),
    unit: asText(row.unit),
    unitPrice: asText(row.unitPrice),
    vatAmount: asText(row.vatAmount),
    lineTotal: asText(row.lineTotal),
  };
}

function normaliseMapping(raw: unknown): TableColumnMapping {
  const mapping = (raw || {}) as Record<string, unknown>;
  const base = emptyMapping();
  for (const key of Object.keys(base) as Array<keyof TableColumnMapping>) {
    const value = asText(mapping[key]);
    base[key] = value || UNKNOWN;
  }
  return base;
}

/**
 * Locate the table on a page image, crop it at full resolution, and read it.
 *
 * The locate pass runs against a downscaled copy because a bounding box does not
 * need legible digits; the read pass always runs against the original pixels.
 */
export async function readInvoiceTableFromImage(input: {
  apiKey: string;
  model: string;
  imageBytes: Buffer;
  mime: string;
  pageNumber?: number;
  runtime?: ExtractionRuntimeOptions;
  /**
   * A crop already located on a previous call. Supplying it retries the READ
   * against the identical pixels instead of paying to locate the table again —
   * a re-read is about the model missing rows, not about the box being wrong.
   */
  crop?: { bytes: Buffer; mime: string; box: TableVisionResult["cropBox"] };
  /** Appended to the read prompt, naming what the previous read got wrong. */
  reinforcement?: string;
}): Promise<TableVisionResult> {
  if (input.crop) {
    return readCroppedTable({
      apiKey: input.apiKey,
      model: input.model,
      cropBytes: input.crop.bytes,
      cropMime: input.crop.mime,
      cropBox: input.crop.box,
      reinforcement: input.reinforcement,
      rawLocateJson: null,
    });
  }

  const sharp = (await import("sharp")).default;
  const startedAt = Date.now();

  const source = sharp(input.imageBytes, { failOn: "none" });
  const metadata = await source.metadata();
  const pageWidth = metadata.width || 0;
  const pageHeight = metadata.height || 0;
  if (!pageWidth || !pageHeight) {
    throw new Error("Table vision could not read the page image dimensions.");
  }

  const locateBytes = await sharp(input.imageBytes, { failOn: "none" })
    .resize({ width: Math.min(LOCATE_MAX_WIDTH, pageWidth), withoutEnlargement: true })
    .png()
    .toBuffer();

  const locate = await callVision({
    apiKey: input.apiKey,
    model: input.model,
    prompt: LOCATE_PROMPT,
    imageBytes: locateBytes,
    mime: "image/png",
    maxOutputTokens: 1200,
  });

  const tableFound = locate.parsed.tableFound !== false;
  const rawBox = (locate.parsed.box || {}) as Record<string, unknown>;
  const clamp = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
  };

  let cropBox: TableVisionResult["cropBox"] = null;
  let cropBytes = input.imageBytes;
  let cropMime = input.mime;

  if (tableFound) {
    const top = clamp(rawBox.top, 0);
    const left = clamp(rawBox.left, 0);
    const width = clamp(rawBox.width, 1);
    const height = clamp(rawBox.height, 1);

    // Padding recovers a heading row or a final row clipped by an off-by-a-little
    // box. Cropping too tight loses a row outright; cropping slightly loose costs
    // nothing but a few pixels of whitespace.
    const paddedTop = Math.max(0, top - CROP_PADDING_TOP);
    const paddedLeft = Math.max(0, left - CROP_PADDING);
    const paddedWidth = Math.min(1 - paddedLeft, width + CROP_PADDING * 2);
    const paddedHeight = Math.min(1 - paddedTop, height + (top - paddedTop) + CROP_PADDING_BOTTOM);

    const pixelWidth = Math.round(paddedWidth * pageWidth);
    const pixelHeight = Math.round(paddedHeight * pageHeight);

    // A degenerate box means the locate pass failed, not that the table is tiny.
    // Falling back to the whole page still beats sending the raw PDF.
    if (pixelWidth > 80 && pixelHeight > 80) {
      cropBox = { top: paddedTop, left: paddedLeft, width: paddedWidth, height: paddedHeight };
      let pipeline = sharp(input.imageBytes, { failOn: "none" }).extract({
        left: Math.round(paddedLeft * pageWidth),
        top: Math.round(paddedTop * pageHeight),
        width: pixelWidth,
        height: pixelHeight,
      });

      if (pixelWidth < READ_MIN_WIDTH) {
        pipeline = pipeline.resize({ width: READ_MIN_WIDTH, kernel: "lanczos3" });
      }

      cropBytes = await pipeline.png().toBuffer();
      cropMime = "image/png";
    }
  }

  input.runtime?.onTrace?.({
    timestamp: new Date().toISOString(),
    step: "Table located",
    input: { pageNumber: input.pageNumber ?? 1, pageWidth, pageHeight, model: input.model },
    output: {
      tableFound,
      cropBox,
      printedColumns: locate.parsed.printedColumns ?? null,
      cropBytes: cropBytes.length,
    },
    durationMs: Date.now() - startedAt,
  });

  const result = await readCroppedTable({
    apiKey: input.apiKey,
    model: input.model,
    cropBytes,
    cropMime,
    cropBox,
    reinforcement: input.reinforcement,
    rawLocateJson: locate.parsed,
  });

  const locateUsage = usageOf(locate.data);
  return {
    ...result,
    usage: {
      promptTokens: locateUsage.promptTokens + (result.usage?.promptTokens || 0),
      completionTokens: locateUsage.completionTokens + (result.usage?.completionTokens || 0),
      totalTokens: locateUsage.totalTokens + (result.usage?.totalTokens || 0),
    },
  };
}

function usageOf(data: Record<string, unknown>) {
  const usage = data.usage as Record<string, unknown> | undefined;
  return {
    promptTokens: Number(usage?.input_tokens || 0),
    completionTokens: Number(usage?.output_tokens || 0),
    totalTokens: Number(usage?.total_tokens || 0),
  };
}

async function readCroppedTable(input: {
  apiKey: string;
  model: string;
  cropBytes: Buffer;
  cropMime: string;
  cropBox: TableVisionResult["cropBox"];
  reinforcement?: string;
  rawLocateJson: unknown;
}): Promise<TableVisionResult> {
  const read = await callVision({
    apiKey: input.apiKey,
    model: input.model,
    prompt: input.reinforcement ? `${READ_PROMPT}\n\n${input.reinforcement}` : READ_PROMPT,
    imageBytes: input.cropBytes,
    mime: input.cropMime,
    maxOutputTokens: 16000,
  });

  const lineItems = Array.isArray(read.parsed.lineItems) ? read.parsed.lineItems.map(normaliseRow) : [];
  const printedColumns = Array.isArray(read.parsed.printedColumns)
    ? read.parsed.printedColumns.map((column) => asText(column)).filter(Boolean)
    : [];
  const rowCountRaw = Number(read.parsed.rowCount);

  return {
    printedColumns,
    columnMapping: normaliseMapping(read.parsed.columnMapping),
    rowCount: Number.isFinite(rowCountRaw) ? Math.round(rowCountRaw) : null,
    lineItems,
    cropBox: input.cropBox,
    cropBytes: input.cropBytes,
    cropMime: input.cropMime,
    rawLocateJson: input.rawLocateJson,
    rawReadJson: read.parsed,
    outputText: read.text,
    usage: usageOf(read.data),
  };
}
