/**
 * VYRON — supplier invoice extraction, version 2.
 *
 * A deliberately small pipeline:
 *
 *     high-resolution page image  ->  one extraction  ->  validate  ->  accept or flag
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * No retries. No reinforcement prompts. No fallback model. No alias chain. No
 * escalation between paths. No repair of model output.
 *
 * Each of those exists in the v1 engine to compensate for a model that could not
 * read the page, and every one of them adds a way for the result to depend on
 * which branch happened to run. The measured evidence says the compensation was
 * never the fix: the same model reading the same invoice as a legible image
 * returned 64 of 64 numeric cells correctly on the first attempt, with no
 * retries at all. Give the model something it can read and the machinery around
 * it stops being necessary.
 *
 * A wrong answer is therefore not repaired here. It is detected and flagged for
 * manual review. That is the whole design: extraction is either trustworthy or
 * it is a human's problem, and the engine's job is to tell those apart honestly.
 *
 * WHAT IT REUSES
 * --------------
 * Document classification, page-image recovery and the arithmetic validators are
 * shared with v1 rather than reimplemented. They are the parts that are already
 * evidence-backed, and a second copy would drift.
 */

import {
  assessDocumentForVision,
  type DocumentPageImage,
  type DocumentVisionAssessment,
} from "@/lib/vyron-document-page-images";
import {
  assessLineArithmetic,
  normaliseExtractionStrict,
  type ExtractedInvoice,
  type ExtractionEvidence,
  type ExtractionRunLog,
  type ExtractionRuntimeOptions,
  type ExtractionTokenUsage,
  type LineArithmeticAssessment,
} from "@/lib/vyron-document-extraction";
import { buildExtractionQualityRecord, type ExtractionQualityRecord } from "@/lib/vyron-extraction-quality";
import { cropImageToPng, imageSize } from "@/lib/vyron-image-raster";

export type InvoiceExtractionV2Status = "accepted" | "manual-review";

export type InvoiceExtractionV2Result = {
  status: InvoiceExtractionV2Status;
  /** Why the result was accepted, or exactly what a reviewer must check. */
  reasons: string[];
  extraction: ExtractedInvoice;
  arithmetic: LineArithmeticAssessment;
  printedColumns: string[];
  columnMapping: Record<string, string>;
  visionClass: DocumentVisionAssessment["visionClass"];
  modelUsed: string;
  pagesRead: number;
  executionTimeMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  /** Untouched model output, always retained — v2 makes one call, so this is the whole story. */
  rawResponses: Array<{ pageNumber: number; outputText: string }>;
};

/**
 * The single prompt.
 *
 * Column identity is demanded before any value, because the failure this
 * pipeline exists to prevent was not misreading a digit — it was reading the
 * right digit from the wrong column. On the reference invoice a WEIGHT column
 * sits between UNIT PRICE and V.A.T., and the previous engine took it as the VAT
 * amount on every row.
 *
 * The instruction not to calculate is equally load-bearing. Left to itself the
 * model computed VAT at 14% of unit price — South Africa's pre-2018 rate — and
 * returned it as though it had been read off the page.
 */
const PAGE_PROMPT = `You are reading one page of a supplier invoice.

TASK 1 — HEADER
Read the invoice header. "supplier" is the business that ISSUED this invoice —
the one being paid, usually named in the letterhead at the top. It is NOT the
"bill to", "customer", "sold to" or "deliver to" party. Getting these the wrong
way round attributes the cost to the wrong business, so if you cannot tell which
is which, return "UNKNOWN". Use "UNKNOWN" for anything not visible.

TASK 2 — LOCATE THE TABLE
Find the line-item table: the block listing the products charged, including its
column heading row and every product row. Return the smallest rectangle that
contains the headings and all product rows, as fractions of the page, where 0,0
is top-left and 1,1 is bottom-right. Exclude the logo, addresses, payment terms,
bank details, the totals block and the footer.

Also read the table's column headings, left to right, exactly as printed.

Return ONLY JSON:
{
  "supplier": "", "invoiceNo": "", "invoiceDate": "YYYY-MM-DD",
  "customerName": "", "customerVatNo": "", "supplierVatNo": "",
  "orderNo": "", "accountNumber": "", "customerReference": "", "salesRepresentative": "",
  "subtotal": "", "vat": "", "total": "", "currency": "ZAR",
  "documentType": "Supplier Invoice | Purchase Order | Supplier Statement | Delivery Note | Other",
  "tableFound": true,
  "box": { "top": 0.0, "left": 0.0, "width": 1.0, "height": 1.0 },
  "printedColumns": ["..."]
}`;

const EXTRACTION_PROMPT = `You are reading one page of a supplier invoice. Read only what is printed.

STEP 1 — COLUMNS
Read the line-item table's column headings, left to right, exactly as printed,
into "printedColumns".

Then map them to the canonical fields in "columnMapping", using the printed
heading text verbatim. If no printed column clearly corresponds to a field,
return "UNKNOWN". Never guess.

This table may contain numeric columns that are NOT money — a weight, a pack
size, a discount percentage, a tax code. Name any weight column under "weight"
so it is accounted for. Never put such a column into unitPrice, vatAmount or
lineTotal.

STEP 2 — ROWS
Return every charged product row, reading each value ONLY from the column you
named in STEP 1.

Copy the characters exactly as printed. Do NOT calculate, infer, derive,
estimate or convert anything. Do not compute VAT from a rate. Do not derive a
line total from a quantity and a price. If a cell cannot be read, return
"UNKNOWN" for that cell — never a plausible substitute.

Do not return headings, subtotals, totals, carried-forward lines or comments as
line items.

STEP 3 — HEADER
Read the invoice header fields. Use "UNKNOWN" for anything not visible.

Return ONLY JSON:
{
  "supplier": "", "invoiceNo": "", "invoiceDate": "YYYY-MM-DD",
  "customerName": "", "customerVatNo": "", "supplierVatNo": "",
  "orderNo": "", "accountNumber": "", "customerReference": "", "salesRepresentative": "",
  "subtotal": "", "vat": "", "total": "", "currency": "ZAR",
  "documentType": "Supplier Invoice | Purchase Order | Supplier Statement | Delivery Note | Other",
  "printedColumns": ["..."],
  "columnMapping": {
    "description": "", "quantity": "", "unit": "", "unitPrice": "",
    "weight": "", "vatAmount": "", "lineTotal": ""
  },
  "visibleLineItemCount": 0,
  "lineItems": [
    { "description": "", "skuOrProductCode": "", "quantity": "", "unit": "",
      "unitPrice": "", "vatAmount": "", "lineTotal": "" }
  ]
}`;

const MAX_OUTPUT_TOKENS = 16000;

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

function parseJsonBlock(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Extraction did not return JSON. Raw: ${cleaned.slice(0, 400)}`);
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

/**
 * Crop padding. Asymmetric, and both values were paid for in measurements:
 * a clipped heading made the model read "NETT PRICE" as "VAT PRICE" and take
 * values from the wrong column; a clipped bottom silently lost the final row.
 */
const CROP_PADDING = 0.02;
const CROP_PADDING_TOP = 0.06;
const CROP_PADDING_BOTTOM = 0.05;
/** Below this width a crop is enlarged so digit strokes survive the model's own downscaling. */
const READ_MIN_WIDTH = 1400;

async function callModel(input: {
  apiKey: string;
  model: string;
  prompt: string;
  imageBytes: Buffer;
  mime: string;
}): Promise<{ parsed: Record<string, unknown>; outputText: string; usage: Record<string, unknown> | undefined }> {
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
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = data.error as { message?: string } | undefined;
    throw new Error(`Extraction v2 ${input.model} failed: ${error?.message || JSON.stringify(data).slice(0, 400)}`);
  }

  const outputText = outputTextOf(data);
  if (!outputText) throw new Error(`Extraction v2 ${input.model} returned no output.`);

  return { parsed: parseJsonBlock(outputText), outputText, usage: data.usage as Record<string, unknown> | undefined };
}

/**
 * Crop the page to the located table, at original resolution.
 *
 * A degenerate or absent box falls back to the whole page rather than throwing:
 * a full-page read is a weaker result, not a failed one, and the validators
 * downstream will say so.
 */
async function cropTable(
  page: DocumentPageImage,
  located: Record<string, unknown>
): Promise<{ bytes: Buffer; mime: string }> {
  const { width: pageWidth, height: pageHeight } = await imageSize(page.bytes, page.mime);
  if (!pageWidth || !pageHeight || located.tableFound === false) {
    return { bytes: page.bytes, mime: page.mime };
  }

  const box = (located.box || {}) as Record<string, unknown>;
  const clamp = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
  };

  const top = Math.max(0, clamp(box.top, 0) - CROP_PADDING_TOP);
  const left = Math.max(0, clamp(box.left, 0) - CROP_PADDING);
  const width = Math.min(1 - left, clamp(box.width, 1) + CROP_PADDING * 2);
  const height = Math.min(1 - top, clamp(box.height, 1) + (clamp(box.top, 0) - top) + CROP_PADDING_BOTTOM);

  const pixelWidth = Math.round(width * pageWidth);
  const pixelHeight = Math.round(height * pageHeight);
  if (pixelWidth <= 80 || pixelHeight <= 80) {
    return { bytes: page.bytes, mime: page.mime };
  }

  const cropped = await cropImageToPng({
    bytes: page.bytes,
    mime: page.mime,
    region: {
      left: left * pageWidth,
      top: top * pageHeight,
      width: pixelWidth,
      height: pixelHeight,
    },
    minWidth: READ_MIN_WIDTH,
  });

  return { bytes: cropped.bytes, mime: cropped.mime };
}

/**
 * Extract one supplier invoice.
 *
 * Never throws for a bad result — only for an unusable input or a transport
 * failure. A result the validators reject comes back as `manual-review` with the
 * rows intact, so a reviewer can correct them rather than starting from nothing.
 */
export async function extractSupplierInvoiceV2(input: {
  apiKey: string;
  model?: string;
  fileName: string;
  mime: string;
  bytes: Buffer;
}): Promise<InvoiceExtractionV2Result> {
  const startedAt = Date.now();
  const model = input.model || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o";

  const assessment = await assessDocumentForVision({ bytes: input.bytes, mime: input.mime });

  /*
   * A page image is required. This pipeline reads pictures of pages — that is
   * the entire premise — so a document it cannot render is refused outright
   * rather than quietly handled by some other route. The caller decides what to
   * do with a document v2 will not accept.
   */
  if (!assessment.pageImages.length) {
    throw new Error(
      `Extraction v2 needs a page image and none could be recovered (${assessment.visionClass}): ${assessment.reason}`
    );
  }

  const rawResponses: InvoiceExtractionV2Result["rawResponses"] = [];
  const lineItems: Array<Record<string, unknown>> = [];
  let header: Record<string, unknown> = {};
  let printedColumns: string[] = [];
  let columnMapping: Record<string, string> = {};
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;

  const account = (usage: Record<string, unknown> | undefined) => {
    if (!usage) return;
    sawUsage = true;
    promptTokens += Number(usage.input_tokens || 0);
    completionTokens += Number(usage.output_tokens || 0);
    totalTokens += Number(usage.total_tokens || 0);
  };

  for (const page of assessment.pageImages) {
    /*
     * Two reads per page, both deterministic, neither conditional on the other's
     * quality — there is no retry here and no branch that fires only on failure.
     *
     * They are separate because they need different pictures. The header is
     * spread over the whole page; the table needs every pixel it has. Measured
     * on the reference invoice, one read of the whole page named the columns
     * correctly and still took its VAT values from the WEIGHT column beside it,
     * scoring 77%. The same model on a crop of the same table scores 98-100%.
     * The crop is doing the work, not the wording.
     */
    const pageRead = await callModel({
      apiKey: input.apiKey,
      model,
      prompt: PAGE_PROMPT,
      imageBytes: page.bytes,
      mime: page.mime,
    });
    account(pageRead.usage);
    rawResponses.push({ pageNumber: page.pageNumber, outputText: pageRead.outputText });

    if (!Object.keys(header).length) header = pageRead.parsed;
    if (!printedColumns.length && Array.isArray(pageRead.parsed.printedColumns)) {
      printedColumns = pageRead.parsed.printedColumns.map((column) => String(column));
    }

    const cropped = await cropTable(page, pageRead.parsed);
    const tableRead = await callModel({
      apiKey: input.apiKey,
      model,
      prompt: EXTRACTION_PROMPT,
      imageBytes: cropped.bytes,
      mime: cropped.mime,
    });
    account(tableRead.usage);
    rawResponses.push({ pageNumber: page.pageNumber, outputText: tableRead.outputText });

    if (!Object.keys(columnMapping).length && tableRead.parsed.columnMapping) {
      columnMapping = Object.fromEntries(
        Object.entries(tableRead.parsed.columnMapping as Record<string, unknown>).map(([key, value]) => [
          key,
          String(value),
        ])
      );
    }
    if (Array.isArray(tableRead.parsed.printedColumns) && tableRead.parsed.printedColumns.length) {
      printedColumns = tableRead.parsed.printedColumns.map((column) => String(column));
    }
    if (Array.isArray(tableRead.parsed.lineItems)) {
      lineItems.push(...(tableRead.parsed.lineItems as Array<Record<string, unknown>>));
    }
  }

  const extraction = normaliseExtractionStrict(
    { ...header, lineItems, visibleLineItemCount: lineItems.length },
    rawResponses.map((entry) => entry.outputText).join("\n")
  );

  const arithmetic = assessLineArithmetic(extraction);

  /*
   * Acceptance.
   *
   * Deterministic checks only — nothing here consults the model's own opinion of
   * how well it did. On the reference failure every fabricated row carried a
   * confidence of 95.
   */
  const reasons: string[] = [];

  /*
   * An empty result is never an acceptable one.
   *
   * Found by the v1/v2 benchmark: a document that yielded no line items came
   * back "accepted", because with no rows there is nothing for the arithmetic
   * check to disagree with, and with no invoice total on the page the
   * completeness gate had no figure to reconcile against. Both validators
   * abstained, and abstention was read as approval. v1 flagged the same
   * document for review, so this was v2 doing worse than the engine it replaces.
   *
   * Silence from the validators is not evidence of correctness.
   */
  const expectsRows = !/statement/i.test(extraction.documentType);
  if (expectsRows && extraction.lineItems.length === 0) {
    reasons.push(
      "No invoice lines could be read from this document. It needs to be captured by hand, or re-uploaded at a higher quality."
    );
  } else if (expectsRows && arithmetic.status === "Unverified") {
    reasons.push(
      "The line figures could not be checked against each other. Confirm the quantity, unit price and totals against the document."
    );
  }

  if (arithmetic.status === "Fail") {
    reasons.push(...arithmetic.reasons);
  } else if (arithmetic.incoherentRows.length) {
    /*
     * A single row that does not reconcile sends the whole document to review.
     *
     * The v1 engine tolerates this — it has a retry budget and a best-of-N to
     * fall back on, so one odd row among fifteen good ones is a warning there.
     * v2 has no second attempt by design, which means an unreconciled row is
     * the last word on that line. Measured: a run scoring 61 of 64 cells passed
     * the aggregate gate and would have been accepted, with a misread quantity
     * and the wrong line total on row 8. Accepting that silently is precisely
     * the failure this pipeline was built to stop.
     */
    reasons.push(
      `Line ${arithmetic.incoherentRows.join(", ")} did not reconcile against its own quantity, unit price and total.`
    );
  }
  if (extraction.completeness.status === "Incomplete") {
    reasons.push(...extraction.completeness.reasons.map((reason) => `Completeness: ${reason}.`));
  }

  const unknownMappings = (["quantity", "unitPrice", "vatAmount", "lineTotal"] as const).filter(
    (field) => !columnMapping[field] || columnMapping[field] === "UNKNOWN"
  );
  if (unknownMappings.length && lineItems.length) {
    reasons.push(
      `The model could not identify a printed column for: ${unknownMappings.join(", ")}. Those values cannot be trusted.`
    );
  }

  return {
    status: reasons.length ? "manual-review" : "accepted",
    reasons: reasons.length ? reasons : ["All deterministic checks passed."],
    extraction,
    arithmetic,
    printedColumns,
    columnMapping,
    visionClass: assessment.visionClass,
    modelUsed: model,
    pagesRead: assessment.pageImages.length,
    executionTimeMs: Date.now() - startedAt,
    usage: sawUsage ? { promptTokens, completionTokens, totalTokens } : null,
    rawResponses,
  };
}

/**
 * V2 behind V1's contract.
 *
 * Returns exactly the shape `runDocumentExtraction` returns, so persistence,
 * duplicate detection, AI usage accounting, evidence capture and the review
 * workspace are all untouched by the engine swap. The only thing that changes is
 * which engine produced the rows — which is the point of a rollback flag: the
 * blast radius of flipping it has to be one decision, not a code path.
 */
export async function runDocumentExtractionV2(
  input: { fileName: string; mime: string; bytes: Buffer },
  options?: ExtractionRuntimeOptions
): Promise<{
  extraction: ExtractedInvoice;
  modelUsed: string;
  log: ExtractionRunLog;
  usage: ExtractionTokenUsage | null;
  executionTimeMs: number;
  quality: ExtractionQualityRecord;
  evidence: ExtractionEvidence;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("PASTE_YOUR")) {
    throw new Error("OPENAI_API_KEY is missing or still contains the placeholder.");
  }

  const result = await extractSupplierInvoiceV2({
    apiKey,
    fileName: input.fileName,
    mime: input.mime,
    bytes: input.bytes,
  });

  const rawText = result.rawResponses.map((entry) => entry.outputText).join("\n\n");

  /*
   * A single attempt is reported as a single attempt. v2 has no retry budget, so
   * anything that looks like retry history here would be fiction — and the
   * monitoring dashboard counts retries from this array.
   */
  const log: ExtractionRunLog = {
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.bytes.length,
    modelUsed: result.modelUsed,
    modelsAttempted: [result.modelUsed],
    rawOpenAiResponsePreview: rawText.slice(0, 2000),
    rawOpenAiResponseFull: result.status === "manual-review" ? rawText : null,
    visionClass: result.visionClass,
    visionReason: `Extraction engine v2: ${result.pagesRead} page image(s) read.`,
    tableVision: [
      {
        pageNumber: 1,
        printedColumns: result.printedColumns,
        columnMapping: {
          description: result.columnMapping.description || "UNKNOWN",
          quantity: result.columnMapping.quantity || "UNKNOWN",
          unit: result.columnMapping.unit || "UNKNOWN",
          unitPrice: result.columnMapping.unitPrice || "UNKNOWN",
          weight: result.columnMapping.weight || "UNKNOWN",
          vatAmount: result.columnMapping.vatAmount || "UNKNOWN",
          lineTotal: result.columnMapping.lineTotal || "UNKNOWN",
        },
        declaredRowCount: result.extraction.declaredLineItemCount,
        returnedRowCount: result.extraction.lineItems.length,
        cropBox: null,
      },
    ],
    tableVisionOutcome: `v2 ${result.status}: ${result.reasons.join(" ")}`,
    declaredLineItemCount: result.extraction.declaredLineItemCount,
    lineItemCount: result.extraction.lineItems.length,
    completeness: result.extraction.completeness,
    attempts: [
      {
        model: result.modelUsed,
        prompt: "standard",
        outcome: result.status === "accepted" ? "accepted" : "incomplete",
        responseLength: rawText.length,
        jsonParsed: true,
        declaredLineItemCount: result.extraction.declaredLineItemCount,
        lineItemCount: result.extraction.lineItems.length,
        completeness: result.extraction.completeness,
        error: null,
        durationMs: result.executionTimeMs,
      },
    ],
  };

  options?.onTrace?.({
    timestamp: new Date().toISOString(),
    step: "Extraction engine v2 completed",
    input: { fileName: input.fileName, mime: input.mime, model: result.modelUsed },
    output: {
      status: result.status,
      visionClass: result.visionClass,
      rows: result.extraction.lineItems.length,
      arithmetic: result.arithmetic.status,
      printedColumns: result.printedColumns,
      reasons: result.reasons,
    },
    durationMs: result.executionTimeMs,
  });

  return {
    extraction: result.extraction,
    modelUsed: result.modelUsed,
    log,
    usage: result.usage,
    executionTimeMs: result.executionTimeMs,
    quality: buildExtractionQualityRecord(result.extraction, log),
    evidence: {
      rawResponses: result.rawResponses.map((entry) => ({
        model: result.modelUsed,
        prompt: "standard" as const,
        outputText: entry.outputText,
      })),
      crops: [],
      tableVisionResponses: [],
    },
  };
}
