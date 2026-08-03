import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowedDocumentMime, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";
import {
  assessDocumentForVision,
  type DocumentVisionAssessment,
  type DocumentVisionClass,
} from "@/lib/vyron-document-page-images";
import {
  readInvoiceTableFromImage,
  type TableColumnMapping,
  type TableVisionRow,
} from "@/lib/vyron-invoice-table-vision";
import { reconcileInvoiceTotals } from "@/lib/vyron-invoice-reconciliation";
import { classifyAiProviderFailure } from "@/lib/vyron-ai-service-errors";
import { traceStart, traceComplete, traceFailed, traceRows } from "@/lib/vyron-workflow-trace";
import {
  buildExtractionQualityRecord,
  expectsLineItems,
  type ExtractionQualityRecord,
} from "@/lib/vyron-extraction-quality";

export type ExtractedLineItem = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatAmount: string;
  lineTotal: string;
  skuOrProductCode: string;
  confidenceScore: number;
  fieldConfidence: {
    description: number;
    quantity: number;
    unit: number;
    unitPrice: number;
    vatAmount: number;
    lineTotal: number;
    skuOrProductCode: number;
  };
};

export type ExtractedInvoice = {
  supplier: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerVatNo: string;
  supplierVatNo: string;
  orderNo: string;
  accountNumber: string;
  customerReference: string;
  salesRepresentative: string;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  currency: string;
  confidence: number;
  fieldConfidence: {
    supplier: number;
    invoiceNo: number;
    invoiceDate: number;
    customerName: number;
    customerVatNo: number;
    supplierVatNo: number;
    accountNumber: number;
    orderNo: number;
    customerReference: number;
    salesRepresentative: number;
    subtotal: number;
    vat: number;
    total: number;
  };
  documentType: string;
  /**
   * The number of invoice rows the model reported seeing on the document,
   * declared BEFORE it extracted them. Compared against `lineItems.length` to
   * detect silent truncation deterministically rather than inferring it from
   * confidence. `null` when the model did not report a count.
   */
  declaredLineItemCount: number | null;
  lineItems: ExtractedLineItem[];
  completeness: ExtractionCompleteness;
  /**
   * Whether the extracted line columns agree with each other. Separate from
   * `completeness`, which only asks whether every row came back.
   */
  lineArithmetic: LineArithmeticAssessment;
  warnings: string[];
  validation: {
    subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review";
    lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review";
    duplicateRisk: "Low" | "Medium" | "High";
    missingFields: string[];
  };
  rawDetectedText: string;
};

/**
 * Did the model return the whole invoice, or only part of it?
 *
 * This is deliberately separate from `validation`. `validation` reports what the
 * operator should look at; `completeness` decides whether the extraction is
 * accepted at all, and drives the retry. An extraction that reconciles to the
 * penny but returns 3 of 12 rows is "valid" by every field-level check and is
 * still wrong.
 */
export type ExtractionCompleteness = {
  status: "Complete" | "Incomplete" | "Unverified";
  /** Machine-readable causes; empty when status is not "Incomplete". */
  reasons: ExtractionIncompletenessReason[];
  declaredLineItemCount: number | null;
  extractedLineItemCount: number;
  /** Sum of the extracted line totals, or null when no line total parsed. */
  lineTotalSum: number | null;
  /** The invoice figure the line totals are reconciled against. */
  reconciliationBase: number | null;
  reconciliationBasis: "subtotal" | "total-less-vat" | "total" | "none";
  /** |lineTotalSum − reconciliationBase|, or null when not comparable. */
  variance: number | null;
  tolerance: number | null;
};

export type ExtractionIncompletenessReason =
  | "row-count-mismatch"
  | "no-line-items"
  | "totals-do-not-reconcile"
  | "column-mapping-failed";

/**
 * Does the extracted table agree with its own arithmetic?
 *
 * Completeness asks whether every row came back. This asks whether the values in
 * the rows that did come back were read from the right columns — a question the
 * row count and the invoice totals cannot answer, because a model that reads the
 * wrong column still returns the right NUMBER of rows.
 *
 * Measured on the Gourmet Foods invoice 02252489: every row carried
 * `vatAmount = unitPrice x 0.14`, a figure that appears nowhere on the document
 * and uses South Africa's pre-2018 VAT rate. The row count matched, the header
 * totals were correct, and every existing check passed.
 */
export type LineArithmeticAssessment = {
  status: "Pass" | "Fail" | "Unverified";
  /** Rows where quantity x unitPrice reconciles to the line total, either way. */
  coherentRows: number;
  /** Rows carrying enough numbers to be checked at all. */
  checkableRows: number;
  /**
   * A value repeated down a money column while the line totals differ. A per-line
   * VAT or unit price is a function of its line; one that is constant was read
   * from a rate, code, weight or pack-size column.
   */
  constantColumns: Array<{ field: "unitPrice" | "vatAmount"; value: number; rows: number; distinctLineTotals: number }>;
  /** Sum of extracted line VAT against the invoice's own VAT figure. */
  lineVatSum: number | null;
  vatVariance: number | null;
  /**
   * 1-based positions of individual rows whose own numbers do not reconcile,
   * even when the table as a whole passes.
   *
   * The aggregate gate tolerates a minority of odd rows so that occasional OCR
   * noise does not reject an otherwise sound extraction. That tolerance would
   * otherwise hide the noise completely: a single misread quantity — measured on
   * the reference invoice, where "Selati White Sugar 25kg" came back as 2 rather
   * than 1 — leaves 15 of 16 rows coherent, clears the gate, and reaches the
   * operator looking exactly like the 15 rows that are right. Naming the row
   * sends the operator to the one line worth checking.
   */
  incoherentRows: number[];
  reasons: string[];
};

/**
 * Material too large or too binary to return in an API response, retained for
 * the run so a failed extraction can be reconstructed afterwards.
 *
 * Kept separate from `ExtractionRunLog` deliberately: the run log is serialised
 * into the extract route's JSON response, and page crops would bloat it by
 * megabytes. This travels alongside it and is consumed only by evidence capture.
 */
export type ExtractionEvidence = {
  /** Untruncated model output for every attempt, in attempt order. */
  rawResponses: Array<{ model: string; prompt: "standard" | "reinforced"; outputText: string }>;
  /** The cropped table images actually read, when the vision path ran. */
  crops: Array<{ pageNumber: number; mime: string; bytes: Buffer }>;
  /** Raw JSON returned by each table-vision read, in page order. */
  tableVisionResponses: Array<{ pageNumber: number; locate: unknown; read: unknown }>;
};

export type ExtractionAttemptLog = {
  model: string;
  /** "standard" on the first pass, "reinforced" on a retry. */
  prompt: "standard" | "reinforced";
  outcome: "accepted" | "incomplete" | "unusable" | "error";
  /** Characters of raw model output. A short response on a long invoice is itself a signal. */
  responseLength: number | null;
  jsonParsed: boolean;
  declaredLineItemCount: number | null;
  lineItemCount: number | null;
  completeness: ExtractionCompleteness | null;
  error: string | null;
  durationMs: number;
};

export type ExtractionRunLog = {
  fileName: string;
  mime: string;
  byteSize: number;
  modelUsed: string | null;
  modelsAttempted: string[];
  rawOpenAiResponsePreview: string | null;
  /**
   * The untruncated model output, retained ONLY when the accepted extraction is
   * incomplete. Complete extractions keep the 2,000-character preview, so the
   * common path does not grow storage or retain more document content than the
   * structured fields already hold.
   */
  rawOpenAiResponseFull: string | null;
  /** How the engine decided to show the document to the model, and why. */
  visionClass: DocumentVisionClass | null;
  visionReason: string | null;
  /**
   * Which engine the route asked for, which one actually ran, and why they
   * differ.
   *
   * A silent fallback is indistinguishable from a v2 success in every record
   * downstream — the run log, the monitoring row and the diagnostics page all
   * looked identical whether v2 read the document or quietly handed it to v1.
   * Recording all three makes the substitution auditable after the fact.
   */
  engineRequested: "v1" | "v2" | null;
  engineExecuted: "v1" | "v2" | null;
  engineFallbackReason: string | null;
  /** One entry per page re-read through the cropped-table path. Empty when unused. */
  tableVision: Array<{
    pageNumber: number;
    printedColumns: string[];
    columnMapping: TableColumnMapping;
    declaredRowCount: number | null;
    returnedRowCount: number;
    cropBox: { top: number; left: number; width: number; height: number } | null;
  }>;
  /** Why the table re-read did or did not run, and what it changed. */
  tableVisionOutcome: string | null;
  declaredLineItemCount: number | null;
  lineItemCount: number | null;
  completeness: ExtractionCompleteness | null;
  attempts: ExtractionAttemptLog[];
};

export type ExtractionTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ExtractionTraceEvent = {
  timestamp: string;
  step: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  durationMs: number;
};

export type ExtractionTraceHook = (event: ExtractionTraceEvent) => void;

type ExtractionRuntimeContext = {
  documentId?: string;
  workspaceId?: string | null;
  companyId?: string | null;
};

export type ExtractionRuntimeOptions = {
  onTrace?: ExtractionTraceHook;
  context?: ExtractionRuntimeContext;
};

function first100Hex(bytes: Buffer) {
  return bytes.subarray(0, 100).toString("hex");
}

function first100Readable(bytes: Buffer) {
  return bytes
    .subarray(0, 100)
    .toString("utf8")
    .replace(/[^\x20-\x7E]/g, ".");
}

const MISSING = "Needs Review";
const DEFAULT_FIELD_CONFIDENCE = 0;

function parseConfidence(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : DEFAULT_FIELD_CONFIDENCE;
}

function confidenceFrom(raw: Record<string, unknown>, key: string, fallback?: number) {
  const fields = raw.fieldConfidence as Record<string, unknown> | undefined;
  if (fields && key in fields) return parseConfidence(fields[key]);
  if (typeof fallback === "number") return parseConfidence(fallback);
  return DEFAULT_FIELD_CONFIDENCE;
}

function fieldString(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  const text = String(value).trim();
  return text || MISSING;
}

/**
 * First alias that is actually present.
 *
 * The model may return any one of several key spellings for the same figure, so
 * these are read as an alias chain. `||` cannot express that for money: a
 * legitimate **zero** is falsy, so `raw.vat || raw.tax` discards a real VAT
 * amount of 0 and falls through to `undefined`.
 *
 * That was not academic. Zero-rated supplies are routine — most basic
 * foodstuffs in South Africa are zero-rated — so a real invoice would lose its
 * VAT figure, `subtotal + VAT = total` could never be evaluated, and the
 * document could never reach a Verified classification.
 *
 * Empty string counts as absent: a model that means "not visible" writes "",
 * not 0.
 */
function firstPresent(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function numberFromMoney(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  if (!value || value === MISSING) return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!/[0-9]/.test(cleaned)) return null;
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}` : cleaned;
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function parseDate(value: unknown) {
  const text = fieldString(value);
  if (text === MISSING) return text;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const iso = text.match(/^(20\d{2})[-/](0?[1-9]|1[0-2])[-/]([12]\d|3[01]|0?[1-9])$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const local = text.match(/^([12]\d|3[01]|0?[1-9])[-/](0?[1-9]|1[0-2])[-/](20\d{2})$/);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return text;
}

function getOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks: string[] = [];
  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const text = (block as { text?: string; content?: string }).text;
        const nested = (block as { content?: string }).content;
        if (typeof text === "string") chunks.push(text);
        if (typeof nested === "string") chunks.push(nested);
      }
    }
  }
  return chunks.join("\n").trim();
}

function emitTrace(
  options: ExtractionRuntimeOptions | undefined,
  step: string,
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
  durationMs: number
) {
  options?.onTrace?.({
    timestamp: new Date().toISOString(),
    step,
    input,
    output,
    durationMs,
  });
}

function parseJsonBlock(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`The AI did not return JSON. Raw response: ${cleaned.slice(0, 600)}`);
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

/**
 * Reconciliation tolerance for the completeness gate: 1% of the base, floored at
 * R1.00 for rounding.
 *
 * Deliberately tighter than the 2% used by `validation.lineItemsTotalCheck`.
 * That check is an operator-facing signal shown after the extraction has been
 * accepted; this one decides whether to accept it at all, so it should fire
 * first. A missing row on a real invoice is almost never inside 1%.
 */
const RECONCILIATION_TOLERANCE_RATIO = 0.01;
const RECONCILIATION_TOLERANCE_FLOOR = 1;

/** Output ceiling for one extraction. Both gpt-4o and gpt-4o-mini cap at 16,384. */
const MAX_OUTPUT_TOKENS = 16000;

const UNASSESSED_COMPLETENESS: ExtractionCompleteness = {
  status: "Unverified",
  reasons: [],
  declaredLineItemCount: null,
  extractedLineItemCount: 0,
  lineTotalSum: null,
  reconciliationBase: null,
  reconciliationBasis: "none",
  variance: null,
  tolerance: null,
};

/** Seeded so the object is never partially constructed. Replaced by validateExtraction. */
const UNASSESSED_ARITHMETIC: LineArithmeticAssessment = {
  status: "Unverified",
  coherentRows: 0,
  checkableRows: 0,
  constantColumns: [],
  lineVatSum: null,
  vatVariance: null,
  incoherentRows: [],
  reasons: [],
};

/** A declared row count is only meaningful as a non-negative whole number. */
function countFromRaw(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === MISSING) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

/**
 * Decide whether the model returned the whole invoice.
 *
 * Three independent signals, any of which is sufficient to reject:
 *   1. the model's own declared row count does not match what it returned
 *   2. a priced invoice came back with no line items at all
 *   3. the extracted line totals do not sum to the invoice's own subtotal
 *
 * Signal 1 is the strongest because it is deterministic — the model counted the
 * rows before extracting them, so a mismatch is self-evident truncation and does
 * not depend on any amount parsing correctly.
 */
function assessExtractionCompleteness(
  extraction: ExtractedInvoice,
  lineArithmetic?: LineArithmeticAssessment
): ExtractionCompleteness {
  const subtotal = numberFromMoney(extraction.subtotal);
  const vat = numberFromMoney(extraction.vat);
  const total = numberFromMoney(extraction.total);

  let reconciliationBase: number | null = null;
  let reconciliationBasis: ExtractionCompleteness["reconciliationBasis"] = "none";
  if (subtotal !== null) {
    reconciliationBase = subtotal;
    reconciliationBasis = "subtotal";
  } else if (total !== null && vat !== null) {
    reconciliationBase = total - vat;
    reconciliationBasis = "total-less-vat";
  } else if (total !== null) {
    reconciliationBase = total;
    reconciliationBasis = "total";
  }

  const lineTotals = extraction.lineItems
    .map((line) => numberFromMoney(line.lineTotal))
    .filter((value): value is number => value !== null);
  const lineTotalSum = lineTotals.length ? lineTotals.reduce((acc, value) => acc + value, 0) : null;

  const declared = extraction.declaredLineItemCount;
  const extracted = extraction.lineItems.length;

  const reasons: ExtractionIncompletenessReason[] = [];

  if (declared !== null && declared !== extracted) {
    reasons.push("row-count-mismatch");
  }

  // A supplier document carrying a value must have priced rows — but only where
  // rows are expected. A supplier statement lists invoices, not products, and
  // demanding lines from one used to drive the retry loop and burn billable
  // calls chasing rows that were never on the page.
  //
  // Magnitude, not sign: a credit note's totals are negative and it is just as
  // incomplete without its lines. A document with no total at all is a
  // different problem, caught by the field checks, not truncation.
  if (
    extracted === 0 &&
    expectsLineItems(extraction.documentType) &&
    reconciliationBase !== null &&
    Math.abs(reconciliationBase) > 0
  ) {
    reasons.push("no-line-items");
  }

  /*
   * Reconciliation is delegated to the shared calculation.
   *
   * The engine, the Extraction Quality summary, the totals banner, the
   * difference panel and approval all read `reconcileInvoiceTotals`. When each
   * had its own arithmetic they disagreed in front of the operator — the banner
   * reported a difference equal to the VAT on suppliers whose line column
   * excludes it, while this gate, which inferred the basis correctly, reported
   * the same invoice as reconciled.
   */
  let variance: number | null = null;
  let tolerance: number | null = null;
  if (lineTotalSum !== null) {
    const lineExclSum = extraction.lineItems.reduce((sum, line) => {
      const quantity = numberFromMoney(line.quantity);
      const unitPrice = numberFromMoney(line.unitPrice);
      return quantity !== null && unitPrice !== null ? sum + quantity * unitPrice : sum;
    }, 0);
    const lineVatSum = extraction.lineItems.reduce((sum, line) => {
      const lineVat = numberFromMoney(line.vatAmount);
      return lineVat !== null ? sum + lineVat : sum;
    }, 0);

    const reconciliation = reconcileInvoiceTotals({
      lineExclSum: round2(lineExclSum),
      lineVatSum: round2(lineVatSum),
      lineTotalSum: round2(lineTotalSum),
      extractedSubtotal: subtotal,
      extractedVat: vat,
      extractedTotal: total,
    });

    if (reconciliation.verifiable) {
      reconciliationBasis = reconciliation.basis === "exclusive" ? "subtotal" : "total";
      reconciliationBase = reconciliation.basis === "exclusive" ? subtotal : total;
      variance = reconciliation.maxAbsDiff;
      /*
       * The engine keeps its own, wider tolerance: 1% of the invoice floored at
       * R1. It decides whether to ACCEPT an extraction and burn another billable
       * attempt, where the review screen only decides what to show an operator
       * who is already looking at the document. Retrying a whole invoice over
       * four cents would be the wrong trade.
       */
      const base = reconciliationBase ?? total ?? subtotal ?? 0;
      tolerance = Math.max(RECONCILIATION_TOLERANCE_FLOOR, Math.abs(base) * RECONCILIATION_TOLERANCE_RATIO);
      if (variance > tolerance) reasons.push("totals-do-not-reconcile");
    }
  }

  if (lineArithmetic?.status === "Fail") reasons.push("column-mapping-failed");

  // "Unverified" is not "Complete". With no declared count and nothing to
  // reconcile against, there is no evidence either way, and the caller must not
  // read the absence of a failure as a pass.
  const verifiable = declared !== null || (lineTotalSum !== null && reconciliationBase !== null) || extracted === 0;

  return {
    status: reasons.length ? "Incomplete" : verifiable ? "Complete" : "Unverified",
    reasons,
    declaredLineItemCount: declared,
    extractedLineItemCount: extracted,
    lineTotalSum,
    reconciliationBase,
    reconciliationBasis,
    variance,
    tolerance,
  };
}

/**
 * Rows needed before a repeated value counts as evidence of a mis-read column.
 *
 * Below this, repetition is ordinary: three single-unit lines on a small invoice
 * legitimately share a quantity, and two rows of the same product share a price.
 */
const CONSTANT_COLUMN_MIN_ROWS = 5;
const CONSTANT_COLUMN_DOMINANCE = 0.6;
/** Rows must reconcile at this rate before the table is trusted as a whole. */
const ARITHMETIC_COHERENCE_THRESHOLD = 0.6;

export function assessLineArithmetic(extraction: ExtractedInvoice): LineArithmeticAssessment {
  const rows = extraction.lineItems.map((line) => ({
    quantity: numberFromMoney(line.quantity),
    unitPrice: numberFromMoney(line.unitPrice),
    vatAmount: numberFromMoney(line.vatAmount),
    lineTotal: numberFromMoney(line.lineTotal),
  }));

  const checkable = rows.filter(
    (row) => row.quantity !== null && row.unitPrice !== null && row.lineTotal !== null
  );

  /*
   * Both readings of the line total are accepted. Suppliers differ on whether the
   * final column is exclusive or inclusive of VAT — Gourmet Foods prints an
   * inclusive "NETT PRICE", others print an exclusive "Amount" — and a row that
   * satisfies either is internally consistent. Only a row that satisfies neither
   * indicates the numbers did not come from the columns they were labelled with.
   */
  const rowIsCoherent = (row: (typeof rows)[number]) => {
    const product = round2(row.quantity! * row.unitPrice!);
    const withVat = round2(product + (row.vatAmount ?? 0));
    const tolerance = Math.max(0.05, Math.abs(row.lineTotal!) * 0.005);
    return Math.abs(product - row.lineTotal!) <= tolerance || Math.abs(withVat - row.lineTotal!) <= tolerance;
  };

  const coherent = checkable.filter(rowIsCoherent);

  const incoherentRows = rows
    .map((row, index) => ({ row, position: index + 1 }))
    .filter(
      ({ row }) =>
        row.quantity !== null && row.unitPrice !== null && row.lineTotal !== null && !rowIsCoherent(row)
    )
    .map(({ position }) => position);

  const constantColumns: LineArithmeticAssessment["constantColumns"] = [];
  const distinctLineTotals = new Set(
    rows.map((row) => row.lineTotal).filter((value): value is number => value !== null)
  ).size;

  if (rows.length >= CONSTANT_COLUMN_MIN_ROWS && distinctLineTotals >= 3) {
    for (const field of ["unitPrice", "vatAmount"] as const) {
      const values = rows.map((row) => row[field]).filter((value): value is number => value !== null);
      if (values.length < CONSTANT_COLUMN_MIN_ROWS) continue;
      const counts = new Map<number, number>();
      for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
      const [dominant, occurrences] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      // A column of zeros is a legitimate zero-rated invoice, not a mis-read.
      if (dominant !== 0 && occurrences / values.length >= CONSTANT_COLUMN_DOMINANCE) {
        constantColumns.push({ field, value: dominant, rows: occurrences, distinctLineTotals });
      }
    }
  }

  const lineVats = rows.map((row) => row.vatAmount).filter((value): value is number => value !== null);
  const lineVatSum = lineVats.length ? round2(lineVats.reduce((acc, value) => acc + value, 0)) : null;
  const invoiceVat = numberFromMoney(extraction.vat);
  const vatVariance = lineVatSum !== null && invoiceVat !== null ? round2(Math.abs(lineVatSum - invoiceVat)) : null;

  /*
   * Phrased for the operator who has to act on it.
   *
   * These strings reach the review screen. "Constant money column across N rows
   * with M distinct line totals" is the reason the check fired, not something a
   * person checking an invoice can use — the underlying numbers stay on the
   * assessment object for the diagnostics page and the evidence record.
   */
  const reasons: string[] = [];
  for (const column of constantColumns) {
    reasons.push(
      `Every line shows the same ${column.field === "vatAmount" ? "VAT amount" : "unit price"} (${column.value}), which is unlikely to be correct. Check the ${column.field === "vatAmount" ? "VAT" : "unit price"} column against the document.`
    );
  }
  if (checkable.length && coherent.length / checkable.length < ARITHMETIC_COHERENCE_THRESHOLD) {
    reasons.push(
      `Most lines do not add up: quantity multiplied by unit price does not match the line total. Check the line figures against the document.`
    );
  }
  if (vatVariance !== null && invoiceVat !== null) {
    const vatTolerance = Math.max(1, Math.abs(invoiceVat) * 0.02);
    if (vatVariance > vatTolerance) {
      reasons.push(
        `Extracted line VAT sums to ${lineVatSum?.toFixed(2)} but the invoice declares ${invoiceVat.toFixed(2)}.`
      );
    }
  }

  /*
   * Named as a warning, not a rejection. These rows are individually suspect
   * while the table as a whole is sound, so failing the extraction over them
   * would discard 15 good rows to re-read 1 — and the re-read is not reliably
   * better. Pointing the operator at the row is the proportionate response.
   */
  const rowWarnings = incoherentRows.length
    ? [
        `Line ${incoherentRows.join(", ")} ${incoherentRows.length === 1 ? "does" : "do"} not reconcile: quantity x unit price does not agree with the line total. Check ${incoherentRows.length === 1 ? "this line" : "these lines"} against the document before approving.`,
      ]
    : [];

  return {
    status: reasons.length ? "Fail" : checkable.length ? "Pass" : "Unverified",
    coherentRows: coherent.length,
    checkableRows: checkable.length,
    constantColumns,
    lineVatSum,
    vatVariance,
    incoherentRows,
    reasons: [...reasons, ...rowWarnings],
  };
}

function describeIncompleteness(completeness: ExtractionCompleteness): string[] {
  const money = (value: number | null) => (value === null ? "unknown" : value.toFixed(2));
  return completeness.reasons.map((reason) => {
    if (reason === "row-count-mismatch") {
      return `The document appears to have ${completeness.declaredLineItemCount} line items but only ${completeness.extractedLineItemCount} were extracted. Review the line items against the source document.`;
    }
    if (reason === "no-line-items") {
      return "No line items were extracted from a priced invoice. Review the line items against the source document.";
    }
    if (reason === "column-mapping-failed") {
      // Operator-facing. The machine-readable code stays in
      // `completeness.reasons` for the diagnostics page and the monitoring
      // record; an operator needs to know what to do, not what it is called.
      return "The figures on each line do not add up against the invoice. Check the quantity, unit price and VAT on every line against the document before approving.";
    }
    return `Extracted line totals (${money(completeness.lineTotalSum)}) do not sum to the invoice ${completeness.reconciliationBasis === "subtotal" ? "subtotal" : "net amount"} (${money(completeness.reconciliationBase)}). Line items may be missing.`;
  });
}

/** Call counter for the workflow trace; per-process, only used for log labels. */
/** Sequence for OPENAI REQUEST labels in the workflow trace. Per-process. */
let openAiCallCounter = 0;

function validateExtraction(extraction: ExtractedInvoice): ExtractedInvoice {
  const subtotal = numberFromMoney(extraction.subtotal);
  const vat = numberFromMoney(extraction.vat);
  const total = numberFromMoney(extraction.total);

  let subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review" = "Needs Review";
  if (subtotal !== null && vat !== null && total !== null) {
    subtotalVatTotalCheck = Math.abs(subtotal + vat - total) <= 1 ? "Pass" : "Fail";
  }

  let lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review" = "Needs Review";
  const lineTotals = extraction.lineItems
    .map((line) => numberFromMoney(line.lineTotal))
    .filter((value): value is number => value !== null);

  if (lineTotals.length && subtotal !== null) {
    const sum = lineTotals.reduce((acc, value) => acc + value, 0);
    lineItemsTotalCheck = Math.abs(sum - subtotal) <= Math.max(1, subtotal * 0.02) ? "Pass" : "Fail";
  }

  const missingFields = [
    ["supplier", extraction.supplier],
    ["invoiceNo", extraction.invoiceNo],
    ["invoiceDate", extraction.invoiceDate],
    ["total", extraction.total],
  ]
    .filter(([, value]) => value === MISSING || value === null || value === "")
    .map(([field]) => field as string);

  /*
   * Arithmetic is assessed first, then folded into completeness as its own
   * reason. A table whose columns disagree is not a usable extraction, so it has
   * to reach the same gate that truncation does — otherwise it is accepted,
   * persisted and shown to an operator as though it were correct.
   */
  const lineArithmetic = assessLineArithmetic(extraction);
  const completeness = assessExtractionCompleteness(extraction, lineArithmetic);

  const warnings = [...(extraction.warnings || [])];
  if (subtotalVatTotalCheck === "Fail") warnings.push("Subtotal + VAT does not match invoice total.");
  if (lineItemsTotalCheck === "Fail") warnings.push("Line item totals do not match subtotal.");
  if (missingFields.length) warnings.push(`Missing required fields: ${missingFields.join(", ")}.`);
  warnings.push(...describeIncompleteness(completeness));
  warnings.push(...lineArithmetic.reasons);

  let confidence = Number(extraction.confidence || 0);
  if (confidence > 0) {
    confidence = Math.max(
      0,
      Math.min(
        100,
        confidence -
          missingFields.length * 10 -
          (subtotalVatTotalCheck === "Fail" ? 15 : 0) -
          (lineItemsTotalCheck === "Fail" ? 10 : 0) -
          // An incomplete extraction must not present as high-confidence. The
          // model is confident about the rows it returned; it has no view of the
          // rows it skipped.
          (completeness.status === "Incomplete" ? 25 : 0)
      )
    );
  }

  return {
    ...extraction,
    confidence,
    completeness,
    lineArithmetic,
    warnings: Array.from(new Set(warnings)),
    validation: {
      subtotalVatTotalCheck,
      lineItemsTotalCheck,
      duplicateRisk: extraction.validation?.duplicateRisk || "Low",
      missingFields,
    },
  };
}

/**
 * Strict normalisation — canonical keys only, no alias chain.
 *
 * `normaliseExtraction` below reads several spellings per field
 * (`unitPrice` or `price` or `rate`) because its prompt does not hard-constrain
 * key names. That tolerance is a repair: it rescues output from a model that
 * ignored the requested shape, and in doing so hides the fact that it did.
 *
 * The v2 pipeline states the shape exactly and holds the model to it. A missing
 * `unitPrice` is a failed extraction to be flagged, not a `price` field to be
 * quietly promoted in its place. `"UNKNOWN"` — which v2 asks for by name when a
 * cell cannot be read — is treated as absent rather than as a value.
 */
export function normaliseExtractionStrict(raw: Record<string, unknown>, rawText: string): ExtractedInvoice {
  const strict = (value: unknown) => {
    const text = fieldString(value);
    return text === "UNKNOWN" ? MISSING : text;
  };
  const strictMoney = (value: unknown) => {
    const text = fieldString(value);
    return text === "UNKNOWN" ? null : numberFromMoney(value);
  };

  const lineItems: ExtractedLineItem[] = Array.isArray(raw.lineItems)
    ? (raw.lineItems as Array<Record<string, unknown>>).map((row) => {
        const confidence = (value: unknown) => (strict(value) === MISSING ? 0 : 90);
        return {
          description: strict(row.description),
          quantity: strict(row.quantity),
          unit: strict(row.unit),
          unitPrice: strict(row.unitPrice),
          vatAmount: strict(row.vatAmount),
          lineTotal: strict(row.lineTotal),
          skuOrProductCode: strict(row.skuOrProductCode),
          confidenceScore: 90,
          fieldConfidence: {
            description: confidence(row.description),
            quantity: confidence(row.quantity),
            unit: confidence(row.unit),
            unitPrice: confidence(row.unitPrice),
            vatAmount: confidence(row.vatAmount),
            lineTotal: confidence(row.lineTotal),
            skuOrProductCode: confidence(row.skuOrProductCode),
          },
        };
      })
    : [];

  const confidenceForField = (value: unknown) => (strict(value) === MISSING ? 0 : 90);

  const extraction: ExtractedInvoice = {
    supplier: strict(raw.supplier),
    invoiceNo: strict(raw.invoiceNo),
    invoiceDate: parseDate(strict(raw.invoiceDate) === MISSING ? null : raw.invoiceDate),
    customerName: strict(raw.customerName),
    customerVatNo: strict(raw.customerVatNo),
    supplierVatNo: strict(raw.supplierVatNo),
    orderNo: strict(raw.orderNo),
    accountNumber: strict(raw.accountNumber),
    customerReference: strict(raw.customerReference),
    salesRepresentative: strict(raw.salesRepresentative),
    subtotal: strictMoney(raw.subtotal),
    vat: strictMoney(raw.vat),
    total: strictMoney(raw.total),
    currency: strict(raw.currency) === MISSING ? "ZAR" : strict(raw.currency),
    confidence: 90,
    fieldConfidence: {
      supplier: confidenceForField(raw.supplier),
      invoiceNo: confidenceForField(raw.invoiceNo),
      invoiceDate: confidenceForField(raw.invoiceDate),
      customerName: confidenceForField(raw.customerName),
      customerVatNo: confidenceForField(raw.customerVatNo),
      supplierVatNo: confidenceForField(raw.supplierVatNo),
      accountNumber: confidenceForField(raw.accountNumber),
      orderNo: confidenceForField(raw.orderNo),
      customerReference: confidenceForField(raw.customerReference),
      salesRepresentative: confidenceForField(raw.salesRepresentative),
      subtotal: confidenceForField(raw.subtotal),
      vat: confidenceForField(raw.vat),
      total: confidenceForField(raw.total),
    },
    documentType: strict(raw.documentType) === MISSING ? "Supplier Invoice" : strict(raw.documentType),
    declaredLineItemCount: countFromRaw(raw.visibleLineItemCount),
    lineItems,
    completeness: UNASSESSED_COMPLETENESS,
    lineArithmetic: UNASSESSED_ARITHMETIC,
    warnings: [],
    validation: {
      subtotalVatTotalCheck: "Needs Review",
      lineItemsTotalCheck: "Needs Review",
      duplicateRisk: "Low",
      missingFields: [],
    },
    rawDetectedText: rawText,
  };

  return validateExtraction(extraction);
}

/** Never uses filename or document id as invoice number. */
export function normaliseExtraction(raw: Record<string, unknown>, rawText: string): ExtractedInvoice {
  const lineItems = Array.isArray(raw.lineItems)
    ? raw.lineItems.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          description: fieldString(row.description || row.productDescription || row.item),
          // Numeric line fields use firstPresent so a zero-rated or zero-value
          // line keeps its 0 instead of being recorded as not visible.
          quantity: fieldString(firstPresent(row.quantity, row.qty)),
          unit: fieldString(row.unit || row.uom || row.measurement),
          unitPrice: fieldString(firstPresent(row.unitPrice, row.price, row.rate)),
          vatAmount: fieldString(firstPresent(row.vatAmount, row.vat, row.taxAmount)),
          lineTotal: fieldString(firstPresent(row.lineTotal, row.total, row.netPrice, row.amount)),
          skuOrProductCode: fieldString(row.skuOrProductCode || row.sku || row.productCode || row.code),
          confidenceScore: Number(row.confidenceScore || row.lineConfidence || row.confidence || 0),
          fieldConfidence: {
            description: confidenceFrom(row, "description", Number(row.confidenceScore || row.confidence || 0)),
            quantity: confidenceFrom(row, "quantity", Number(row.confidenceScore || row.confidence || 0)),
            unit: confidenceFrom(row, "unit", Number(row.confidenceScore || row.confidence || 0)),
            unitPrice: confidenceFrom(row, "unitPrice", Number(row.confidenceScore || row.confidence || 0)),
            vatAmount: confidenceFrom(row, "vatAmount", Number(row.confidenceScore || row.confidence || 0)),
            lineTotal: confidenceFrom(row, "lineTotal", Number(row.confidenceScore || row.confidence || 0)),
            skuOrProductCode: confidenceFrom(row, "skuOrProductCode", Number(row.confidenceScore || row.confidence || 0)),
          },
        };
      })
    : [];

  const extraction: ExtractedInvoice = {
    supplier: fieldString(raw.supplier || raw.supplierName || raw.vendor || raw.vendorName),
    invoiceNo: fieldString(raw.invoiceNo || raw.invoiceNumber || raw.documentNumber),
    invoiceDate: parseDate(raw.invoiceDate || raw.date),
    customerName: fieldString(raw.customerName || raw.customer || raw.billTo),
    customerVatNo: fieldString(raw.customerVatNo || raw.customerVATNumber || raw.customerVatNumber),
    supplierVatNo: fieldString(raw.supplierVatNo || raw.supplierVATNumber || raw.vatNo || raw.vatNumber),
    orderNo: fieldString(raw.orderNo || raw.orderNumber || raw.purchaseOrderNo || raw.poNumber),
    accountNumber: fieldString(raw.accountNumber || raw.accountNo || raw.customerAccountNumber),
    customerReference: fieldString(raw.customerReference || raw.reference || raw.customerRef),
    salesRepresentative: fieldString(raw.salesRepresentative || raw.representative || raw.salesRep),
    // firstPresent, not `||` — a genuine 0 must survive. See firstPresent.
    subtotal: numberFromMoney(firstPresent(raw.subtotal, raw.subTotal, raw.netAmount, raw.excludingVat)),
    vat: numberFromMoney(firstPresent(raw.vat, raw.vatAmount, raw.tax)),
    total: numberFromMoney(firstPresent(raw.total, raw.totalAmount, raw.grossAmount, raw.includingVat)),
    currency: fieldString(raw.currency) === MISSING ? "ZAR" : fieldString(raw.currency),
    confidence: Number(raw.confidence || 0),
    fieldConfidence: {
      supplier: confidenceFrom(raw, "supplier", Number(raw.confidence || 0)),
      invoiceNo: confidenceFrom(raw, "invoiceNo", Number(raw.confidence || 0)),
      invoiceDate: confidenceFrom(raw, "invoiceDate", Number(raw.confidence || 0)),
      customerName: confidenceFrom(raw, "customerName", Number(raw.confidence || 0)),
      customerVatNo: confidenceFrom(raw, "customerVatNo", Number(raw.confidence || 0)),
      supplierVatNo: confidenceFrom(raw, "supplierVatNo", Number(raw.confidence || 0)),
      accountNumber: confidenceFrom(raw, "accountNumber", Number(raw.confidence || 0)),
      orderNo: confidenceFrom(raw, "orderNo", Number(raw.confidence || 0)),
      customerReference: confidenceFrom(raw, "customerReference", Number(raw.confidence || 0)),
      salesRepresentative: confidenceFrom(raw, "salesRepresentative", Number(raw.confidence || 0)),
      subtotal: confidenceFrom(raw, "subtotal", Number(raw.confidence || 0)),
      vat: confidenceFrom(raw, "vat", Number(raw.confidence || 0)),
      total: confidenceFrom(raw, "total", Number(raw.confidence || 0)),
    },
    documentType: fieldString(raw.documentType) === MISSING ? "Supplier Invoice" : fieldString(raw.documentType),
    declaredLineItemCount: countFromRaw(
      raw.visibleLineItemCount ?? raw.visibleLineCount ?? raw.lineItemCount ?? raw.totalLineItems
    ),
    lineItems,
    // Replaced by validateExtraction, which is the only place completeness is
    // computed. Seeded here so the object is never partially constructed.
    completeness: UNASSESSED_COMPLETENESS,
    lineArithmetic: UNASSESSED_ARITHMETIC,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((warning) => String(warning)) : [],
    validation: {
      subtotalVatTotalCheck: "Needs Review",
      lineItemsTotalCheck: "Needs Review",
      duplicateRisk: (raw.duplicateRisk as ExtractedInvoice["validation"]["duplicateRisk"]) || "Low",
      missingFields: [],
    },
    rawDetectedText: String(raw.rawDetectedText || rawText || ""),
  };

  return validateExtraction(extraction);
}

/**
 * Does the extraction have enough header detail to be worth anything?
 *
 * This is the floor, not the bar. It answers "did the model read the document at
 * all", and is deliberately unchanged from the original gate. Whether the model
 * read *all* of the document is a separate question, answered by
 * `assessExtractionCompleteness`, because the two have different consequences: a
 * failure here means try another model, a failure there means try a stronger
 * prompt.
 */
function extractionHasCoreFields(extraction: ExtractedInvoice) {
  const core = [extraction.supplier, extraction.invoiceNo, extraction.invoiceDate, extraction.total];
  const populated = core.filter((value) => value !== MISSING && value !== null && value !== "").length;
  return populated >= 2 || extraction.confidence >= 50;
}

/**
 * The acceptance gate. An extraction is usable when it has the core header
 * fields AND is not demonstrably truncated.
 *
 * Rejecting here does not discard the result — the caller keeps the best
 * attempt and returns it once retries are exhausted, so this can only ever cause
 * another attempt, never a worse outcome than accepting immediately.
 */
function extractionIsUsable(extraction: ExtractedInvoice) {
  return extractionHasCoreFields(extraction) && extraction.completeness.status !== "Incomplete";
}

/**
 * Should the table-vision path be used to replace this extraction's line items?
 *
 * Only when deterministic validation says the current lines cannot be trusted —
 * never because the model reported low confidence. On the Gourmet Foods
 * fabrications the model reported `confidenceScore: 95` on every invented row,
 * so confidence is not evidence of anything.
 *
 * A scanned document whose lines reconcile and whose columns agree is left
 * alone. Fabricated columns do not reconcile — both observed failure patterns
 * were caught by `assessLineArithmetic` — so this escalates on the documents
 * that need it and keeps the healthy path at one API call.
 */
function shouldEscalateToTableVision(
  extraction: ExtractedInvoice,
  visionClass: DocumentVisionClass
): { escalate: boolean; reason: string } {
  /*
   * v1 no longer escalates. MEASURED, same document, same day:
   *
   *   baseline v1 (before this project)   66,364ms   3 model calls
   *   v1 with escalation                  92,867ms   5 model calls   (1.40x)
   *   v2                                  20,296ms   2 model calls
   *
   * The escalation was added to v1 before v2 existed. Now that scanned pages
   * and images always route to v2 — which reads a cropped table by design — the
   * only thing v1's copy still did was make the rollback engine 40% slower than
   * the engine it rolls back to. A rollback that is worse than never having
   * shipped is not a rollback.
   *
   * v2 owns the vision path. v1 is the text-exact fallback and nothing else.
   */
  void extraction;
  void visionClass;
  return {
    escalate: false,
    reason: "Engine v1 does not use the table re-read; scanned pages and images are handled by engine v2.",
  };
}

function lineItemsFromTableVision(rows: TableVisionRow[]): ExtractedLineItem[] {
  const confidence = (value: string) => (value && value !== "UNKNOWN" ? 90 : 0);
  return rows.map((row) => {
    const field = (value: string) => (!value || value === "UNKNOWN" ? MISSING : value);
    return {
      description: field(row.description),
      quantity: field(row.quantity),
      unit: field(row.unit),
      unitPrice: field(row.unitPrice),
      vatAmount: field(row.vatAmount),
      lineTotal: field(row.lineTotal),
      skuOrProductCode: field(row.skuOrProductCode),
      confidenceScore: 90,
      fieldConfidence: {
        description: confidence(row.description),
        quantity: confidence(row.quantity),
        unit: confidence(row.unit),
        unitPrice: confidence(row.unitPrice),
        vatAmount: confidence(row.vatAmount),
        lineTotal: confidence(row.lineTotal),
        skuOrProductCode: confidence(row.skuOrProductCode),
      },
    };
  });
}

/** Feedback for a retry prompt, naming exactly what the previous attempt got wrong. */
function buildReinforcement(extraction: ExtractedInvoice): string {
  const { completeness } = extraction;
  const notes: string[] = [];

  if (completeness.reasons.includes("row-count-mismatch")) {
    notes.push(
      `it reported ${completeness.declaredLineItemCount} visible invoice lines but returned only ${completeness.extractedLineItemCount}`
    );
  }
  if (completeness.reasons.includes("no-line-items")) {
    notes.push("it returned no line items at all, although the invoice carries a value");
  }
  if (completeness.reasons.includes("totals-do-not-reconcile")) {
    notes.push(
      `the ${completeness.extractedLineItemCount} line totals it returned sum to ${completeness.lineTotalSum?.toFixed(2)}, but the invoice net amount is ${completeness.reconciliationBase?.toFixed(2)} — rows are missing`
    );
  }

  return `RETRY — THE PREVIOUS ATTEMPT WAS INCOMPLETE AND WAS REJECTED.
It was rejected because ${notes.join("; and ")}.
Go through the document row by row, from the first invoice line to the last, on
every page. Return every row. Do not stop until the extracted line totals sum to
the invoice subtotal and the row count matches "visibleLineItemCount".`;
}

async function callOpenAI({
  apiKey,
  model,
  fileName,
  mime,
  dataUrl,
  runtime,
  reinforcement,
}: {
  apiKey: string;
  model: string;
  fileName: string;
  mime: string;
  dataUrl: string;
  runtime?: ExtractionRuntimeOptions;
  /** Feedback from a rejected attempt, injected into the retry prompt. */
  reinforcement?: string;
}) {
  const callStartedAt = Date.now();
  const isPdf = mime === "application/pdf";

  const filePart = isPdf
    ? { type: "input_file", filename: fileName, file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl };

  const prompt = `You are VYRON COST Document AI Engine.
Extract the COMPLETE contents of this supplier invoice from the document image/PDF.
Read the visual document only — never use filename.

LINE ITEMS — THE MOST IMPORTANT PART OF THIS TASK
First, count every visible invoice line on the document, across every page, and
report that number as "visibleLineItemCount". Then extract every one of them.

- Extract every visible invoice line exactly as printed.
- Do not summarise. Do not combine rows. Do not omit rows.
- Do not stop early. Long invoices must be extracted in full, to the last row.
- Output one JSON object in "lineItems" for every visible invoice line.
- If a field on a row cannot be read, return "${MISSING}" for that field rather
  than skipping the row.
- The number of objects in "lineItems" MUST equal "visibleLineItemCount".

Count a line only if it is a charged product or service row. Do not count column
headers, headers repeated at the top of later pages, subtotal / VAT / total
summary rows, or terms-and-conditions text.
${reinforcement ? `\n${reinforcement}\n` : ""}
Return ONLY valid JSON matching this schema:
{
  "supplier": "string",
  "invoiceNo": "string",
  "invoiceDate": "YYYY-MM-DD",
  "customerName": "string",
  "customerVatNo": "string",
  "supplierVatNo": "string",
  "orderNo": "string",
  "accountNumber": "string",
  "customerReference": "string",
  "salesRepresentative": "string",
  "subtotal": "numeric amount excluding VAT",
  "vat": "VAT amount",
  "total": "invoice total including VAT",
  "currency": "ZAR",
  "confidence": 0-100,
  "fieldConfidence": {
    "supplier": 0-100,
    "invoiceNo": 0-100,
    "invoiceDate": 0-100,
    "customerName": 0-100,
    "customerVatNo": 0-100,
    "supplierVatNo": 0-100,
    "accountNumber": 0-100,
    "orderNo": 0-100,
    "customerReference": 0-100,
    "salesRepresentative": 0-100,
    "subtotal": 0-100,
    "vat": 0-100,
    "total": 0-100
  },
  "documentType": "Supplier Invoice | Purchase Order | Supplier Statement | Delivery Note | Other",
  "visibleLineItemCount": 0,
  "lineItems": [
    { "description": "", "quantity": "", "unit": "", "unitPrice": "", "vatAmount": "", "lineTotal": "", "skuOrProductCode": "", "confidenceScore": 0, "fieldConfidence": { "description": 0, "quantity": 0, "unit": 0, "unitPrice": 0, "vatAmount": 0, "lineTotal": 0, "skuOrProductCode": 0 } },
    { "description": "", "quantity": "", "unit": "", "unitPrice": "", "vatAmount": "", "lineTotal": "", "skuOrProductCode": "", "confidenceScore": 0, "fieldConfidence": { "description": 0, "quantity": 0, "unit": 0, "unitPrice": 0, "vatAmount": 0, "lineTotal": 0, "skuOrProductCode": 0 } },
    { "description": "", "quantity": "", "unit": "", "unitPrice": "", "vatAmount": "", "lineTotal": "", "skuOrProductCode": "", "confidenceScore": 0, "fieldConfidence": { "description": 0, "quantity": 0, "unit": 0, "unitPrice": 0, "vatAmount": 0, "lineTotal": 0, "skuOrProductCode": 0 } }
  ],
  "warnings": [],
  "rawDetectedText": "brief summary"
}
"lineItems" shows three objects only to illustrate the shape. Return as many
objects as the document has invoice lines — that may be 1, 11, 40 or more.
Before returning, check that "lineItems" has exactly "visibleLineItemCount"
objects, and that their line totals sum to the invoice subtotal.
Use "${MISSING}" only for fields not visible on the document.`;

  const requestBody = {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, filePart] }],
    temperature: 0,
    /*
     * Headroom for a long invoice.
     *
     * The request previously relied on the API default. Now that the prompt
     * demands every row, a 40-line invoice can legitimately need several
     * thousand output tokens — and a response cut off mid-array does not come
     * back short, it comes back unparseable, which `parseJsonBlock` throws on.
     * Asking for more rows without raising this ceiling would convert a partial
     * extraction into a total failure.
     *
     * 16,000 is within the 16,384 output limit of both gpt-4o and gpt-4o-mini.
     * It is a ceiling, not a reservation: only tokens actually generated are
     * billed, so a one-line invoice costs exactly what it did before.
     */
    max_output_tokens: MAX_OUTPUT_TOKENS,
  };

  emitTrace(
    runtime,
    "OpenAI request body built",
    {
      executed: "YES",
      model,
      mimeType: mime,
      fileName,
      byteSize: Buffer.byteLength(dataUrl, "utf8"),
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    {
      requestBody,
    },
    0
  );

  const specCheck = isPdf
    ? {
        expectedFileType: "input_file",
        actualFileType: (filePart as { type: string }).type,
        hasFileData: typeof (filePart as { file_data?: unknown }).file_data === "string",
        fileDataPrefixOk: String((filePart as { file_data?: unknown }).file_data || "").startsWith(`data:${mime};base64,`),
      }
    : {
        expectedFileType: "input_image",
        actualFileType: (filePart as { type: string }).type,
        hasImageUrl: typeof (filePart as { image_url?: unknown }).image_url === "string",
        imageUrlPrefixOk: String((filePart as { image_url?: unknown }).image_url || "").startsWith(`data:${mime};base64,`),
      };
  const specConforms = isPdf
    ? specCheck.actualFileType === "input_file" && specCheck.hasFileData && specCheck.fileDataPrefixOk
    : specCheck.actualFileType === "input_image" && specCheck.hasImageUrl && specCheck.imageUrlPrefixOk;

  emitTrace(
    runtime,
    "OpenAI payload spec verification",
    {
      executed: "YES",
      mimeType: mime,
      model,
    },
    {
      conforms: specConforms ? "YES" : "NO",
      checks: specCheck,
      mismatch: specConforms ? null : "Request body file object does not match expected Responses API input shape.",
    },
    0
  );

  emitTrace(
    runtime,
    "Prompt built",
    {
      executed: "YES",
      model,
      fileName,
      mime,
      isPdf,
      promptLength: prompt.length,
      documentId: runtime?.context?.documentId || null,
      first100Bytes: Buffer.from(prompt, "utf8").subarray(0, 100).toString("utf8"),
    },
    {
      promptPreview: prompt.slice(0, 500),
    },
    0
  );

  const requestStartedAt = Date.now();
  emitTrace(
    runtime,
    "OpenAI request started",
    {
      executed: "YES",
      model,
      endpoint: "https://api.openai.com/v1/responses",
      fileName,
      mime,
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    null,
    0
  );

  const openAiCallIndex = ++openAiCallCounter;
  const traceCallId = runtime?.context?.documentId ?? null;
  traceStart(`OPENAI REQUEST ${openAiCallIndex}`, traceCallId, { model, mime, promptChars: prompt.length });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestBody,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (response.ok) {
    traceComplete(`OPENAI REQUEST ${openAiCallIndex}`, traceCallId, {
      httpStatus: response.status,
      tokens: (data as { usage?: { total_tokens?: number } }).usage?.total_tokens ?? null,
    });
  } else {
    const providerError = (data as { error?: { message?: string; code?: string } }).error;
    traceFailed(`OPENAI REQUEST ${openAiCallIndex}`, traceCallId, {
      httpStatus: response.status,
      reason: providerError?.code || providerError?.message || `HTTP ${response.status}`,
    });
  }

  emitTrace(
    runtime,
    "OpenAI response received",
    {
      executed: "YES",
      model,
      status: response.status,
      ok: response.ok,
    },
    {
      responseKeys: Object.keys(data),
      outputTextLength: getOutputText(data).length,
    },
    Date.now() - requestStartedAt
  );

  if (!response.ok) {
    console.error("[documents/extract/runtime] OpenAI error", {
      timestamp: new Date().toISOString(),
      step: "OpenAI response received",
      httpStatus: response.status,
      responseBody: data,
      documentId: runtime?.context?.documentId || null,
      workspaceId: runtime?.context?.workspaceId || null,
      companyId: runtime?.context?.companyId || null,
    });
    // Availability problems are a fact about the provider, not about us, and
    // must not reach the operator as a server error.
    const availability = classifyAiProviderFailure({ status: response.status, body: data });
    if (availability) throw availability;

    const err = data.error as { message?: string } | undefined;
    throw new Error(`${model} failed: ${err?.message || JSON.stringify(data).slice(0, 800)}`);
  }

  const outputText = getOutputText(data);
  if (!outputText) {
    throw new Error(`${model} returned no extraction text.`);
  }

  const parsedStartedAt = Date.now();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = parseJsonBlock(outputText);
  } catch (error) {
    console.error("[documents/extract/runtime] JSON parse failed", {
      timestamp: new Date().toISOString(),
      step: "JSON parsed",
      rawAiResponse: outputText,
      documentId: runtime?.context?.documentId || null,
      workspaceId: runtime?.context?.workspaceId || null,
      companyId: runtime?.context?.companyId || null,
    });
    throw error;
  }

  emitTrace(
    runtime,
    "JSON parsed",
    {
      model,
      rawResponseLength: outputText.length,
    },
    {
      parsedKeys: Object.keys(parsedJson),
    },
    Date.now() - parsedStartedAt
  );

  traceRows("1-openai-json", runtime?.context?.documentId ?? null, Array.isArray((parsedJson as { lineItems?: unknown[] }).lineItems) ? (parsedJson as { lineItems: unknown[] }).lineItems.length : 0, { declared: (parsedJson as { visibleLineItemCount?: number }).visibleLineItemCount ?? null });
  const validationStartedAt = Date.now();
  traceStart("NORMALISATION", runtime?.context?.documentId ?? null);
  const extraction = normaliseExtraction(parsedJson, outputText);
  traceComplete("NORMALISATION", runtime?.context?.documentId ?? null, { rows: extraction.lineItems.length });
  traceStart("VALIDATION", runtime?.context?.documentId ?? null);
  traceComplete("VALIDATION", runtime?.context?.documentId ?? null, { completeness: extraction.completeness.status, arithmetic: extraction.lineArithmetic.status, reasons: extraction.completeness.reasons.join("|") || "none" });
  traceRows("2-normalised", runtime?.context?.documentId ?? null, extraction.lineItems.length);
  emitTrace(
    runtime,
    "Validation completed",
    {
      model,
      invoiceNo: extraction.invoiceNo,
      supplier: extraction.supplier,
    },
    {
      confidence: extraction.confidence,
      warningsCount: extraction.warnings.length,
      lineItems: extraction.lineItems.length,
      declaredLineItemCount: extraction.declaredLineItemCount,
      rawResponseLength: outputText.length,
      completeness: extraction.completeness,
      usable: extractionIsUsable(extraction),
    },
    Date.now() - validationStartedAt
  );

  const usageRaw = (data as { usage?: Record<string, unknown> }).usage;
  const usage: ExtractionTokenUsage | null = usageRaw
    ? {
        promptTokens: Number(usageRaw.input_tokens || 0),
        completionTokens: Number(usageRaw.output_tokens || 0),
        totalTokens: Number(usageRaw.total_tokens || 0),
      }
    : null;

  return { extraction, rawOpenAi: data, outputText, usage, apiExecutionTimeMs: Date.now() - callStartedAt };
}

export async function runDocumentExtraction(input: {
  fileName: string;
  mime: string;
  bytes: Buffer;
}, options?: ExtractionRuntimeOptions): Promise<{
  extraction: ExtractedInvoice;
  modelUsed: string;
  log: ExtractionRunLog;
  usage: ExtractionTokenUsage | null;
  executionTimeMs: number;
  /** Authoritative review classification for this run. See vyron-extraction-quality.ts. */
  quality: ExtractionQualityRecord;
  /** Bulk diagnostics for evidence capture. Never returned in an API response. */
  evidence: ExtractionEvidence;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("PASTE_YOUR")) {
    throw new Error(
      "OPENAI_API_KEY is missing or still contains the placeholder. Add your real OpenAI API key to .env.local and restart Next.js."
    );
  }

  /** Narrowed once here; the async closures below would otherwise re-widen it. */
  const openAiKey: string = apiKey;

  if (!isAllowedDocumentMime(input.mime)) {
    throw new Error(`Unsupported MIME type for extraction: ${input.mime}`);
  }

  const models = [
    process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o",
    process.env.OPENAI_DOCUMENT_FALLBACK_MODEL || "gpt-4o-mini",
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  emitTrace(
    options,
    "Buffer prepared",
    {
      executed: "YES",
      fileName: input.fileName,
      mimeType: input.mime,
      byteSize: input.bytes.length,
      first100Bytes: first100Hex(input.bytes),
      first100Readable: first100Readable(input.bytes),
    },
    {
      bufferLength: input.bytes.length,
    },
    0
  );

  const base64StartedAt = Date.now();
  const base64 = input.bytes.toString("base64");
  emitTrace(
    options,
    "Base64 conversion completed",
    {
      executed: "YES",
      mimeType: input.mime,
      byteSize: input.bytes.length,
      first100Bytes: first100Hex(input.bytes),
    },
    {
      base64Length: base64.length,
      first100Bytes: base64.slice(0, 100),
    },
    Date.now() - base64StartedAt
  );

  const dataUrlStartedAt = Date.now();
  const dataUrl = `data:${input.mime};base64,${base64}`;
  emitTrace(
    options,
    "Data URL constructed",
    {
      executed: "YES",
      mimeType: input.mime,
      base64Length: base64.length,
      first100Bytes: base64.slice(0, 100),
    },
    {
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    Date.now() - dataUrlStartedAt
  );

  const errors: string[] = [];
  const evidence: ExtractionEvidence = { rawResponses: [], crops: [], tableVisionResponses: [] };
  const log: ExtractionRunLog = {
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.bytes.length,
    modelUsed: null,
    modelsAttempted: [],
    rawOpenAiResponsePreview: null,
    rawOpenAiResponseFull: null,
    visionClass: null,
    visionReason: null,
    engineRequested: null,
    engineExecuted: "v1",
    engineFallbackReason: null,
    tableVision: [],
    tableVisionOutcome: null,
    declaredLineItemCount: null,
    lineItemCount: null,
    completeness: null,
    attempts: [],
  };

  /*
   * The attempt plan.
   *
   * Pass 1 is the primary model with the standard prompt — the only pass a
   * healthy extraction ever needs, so the common path still costs exactly one
   * API call. A pass is only reached if the pass before it was rejected.
   *
   * Pass 2 re-runs the SAME model with feedback naming what was missing.
   * Truncation is a compliance failure, not a capability failure, so the primary
   * model with a stronger instruction beats a weaker model with any instruction.
   *
   * Pass 3 falls back to the secondary model, also reinforced.
   *
   * Worst case is three calls against today's two, and only on documents that
   * are already failing.
   */
  const attemptPlan: Array<{ model: string; reinforced: boolean; sameModelRetry: boolean }> = [
    { model: models[0], reinforced: false, sameModelRetry: false },
    { model: models[0], reinforced: true, sameModelRetry: true },
    ...(models[1] ? [{ model: models[1], reinforced: true, sameModelRetry: false }] : []),
  ];

  /*
   * Classify the document before any model call.
   *
   * This decides how the model should see it: a searchable PDF has an exact text
   * layer and needs nothing special, while a scanned one has to be read as an
   * image or its dense table is downsampled into guesswork. Failure here is
   * never fatal — an unclassifiable document simply takes the existing path.
   */
  let visionAssessment: DocumentVisionAssessment | null = null;
  const traceDocId = options?.context?.documentId ?? null;
  try {
    traceStart("CLASSIFICATION", traceDocId, { mime: input.mime, bytes: input.bytes.length });
    visionAssessment = await assessDocumentForVision({ bytes: input.bytes, mime: input.mime });
    traceComplete("CLASSIFICATION", traceDocId, {
      visionClass: visionAssessment.visionClass,
      textChars: visionAssessment.textLayerChars,
      pageImages: visionAssessment.pageImages.length,
    });
    log.visionClass = visionAssessment.visionClass;
    log.visionReason = visionAssessment.reason;
    emitTrace(
      options,
      "Document vision class resolved",
      { fileName: input.fileName, mime: input.mime },
      {
        visionClass: visionAssessment.visionClass,
        pageCount: visionAssessment.pageCount,
        textLayerChars: visionAssessment.textLayerChars,
        pageImages: visionAssessment.pageImages.length,
        reason: visionAssessment.reason,
      },
      0
    );
  } catch (error) {
    traceFailed("CLASSIFICATION", traceDocId, { reason: error instanceof Error ? error.message : String(error) });
    log.visionReason = `Document classification failed: ${error instanceof Error ? error.message : String(error)}`;
    console.warn("[document-extraction] vision classification failed", log.visionReason);
  }

  // Every attempt is billable, so token usage is accumulated across all of them
  // rather than reporting only the attempt that happened to be accepted.
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let sawUsage = false;
  let executionTimeMs = 0;

  /**
   * The best result seen so far, kept so an exhausted retry budget degrades to
   * today's behaviour instead of failing. Ranked by: core fields present, then
   * complete, then most line items, then highest confidence.
   */
  let best: { extraction: ExtractedInvoice; model: string; outputText: string } | null = null;
  let lastRejected: ExtractedInvoice | null = null;

  function rank(extraction: ExtractedInvoice) {
    return [
      extractionHasCoreFields(extraction) ? 1 : 0,
      extraction.completeness.status === "Incomplete" ? 0 : 1,
      extraction.lineItems.length,
      extraction.confidence,
    ];
  }

  function isBetter(candidate: ExtractedInvoice) {
    if (!best) return true;
    const a = rank(candidate);
    const b = rank(best.extraction);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  /**
   * Re-read the line-item table from a cropped, full-resolution page image.
   *
   * Header fields are left exactly as the whole-document pass read them — those
   * were never the problem, and on the measured invoice the supplier, invoice
   * number and all three totals were already correct. Only the rows are
   * replaced, and only when the re-read is demonstrably better than what it
   * would replace.
   */
  async function escalateToTableVision(
    extraction: ExtractedInvoice,
    model: string
  ): Promise<{ extraction: ExtractedInvoice; applied: boolean; note: string }> {
    if (!visionAssessment?.pageImages.length) {
      return { extraction, applied: false, note: "No page image was recoverable for a table re-read." };
    }

    const rows: TableVisionRow[] = [];
    const columnMappings: TableColumnMapping[] = [];
    const printedColumns: string[][] = [];

    const accountUsage = (usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null) => {
      if (!usage) return;
      sawUsage = true;
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;
    };

    for (const page of visionAssessment.pageImages) {
      let table = await readInvoiceTableFromImage({
        apiKey: openAiKey,
        model,
        imageBytes: page.bytes,
        mime: page.mime,
        pageNumber: page.pageNumber,
        runtime: options,
      });
      accountUsage(table.usage);

      /*
       * One re-read against the identical crop, when the page's own numbers say
       * rows are missing.
       *
       * Two deterministic signals drive it: the model returning fewer rows than
       * it declared, and the returned line totals falling short of the invoice
       * total. Both were observed — a read of this invoice returned 14 of 16
       * rows and stopped — and neither depends on the model's self-reported
       * confidence, which was 95 on every fabricated row.
       *
       * Single page only: on a multi-page invoice the rows on one page are not
       * expected to reach the invoice total, so the shortfall signal does not
       * apply and only the declared-count signal is used.
       */
      const singlePage = visionAssessment.pageImages.length === 1;
      const declaredShort = table.rowCount !== null && table.lineItems.length < table.rowCount;
      const invoiceTotal = numberFromMoney(extraction.total);
      const pageSum = table.lineItems
        .map((row) => numberFromMoney(row.lineTotal))
        .filter((value): value is number => value !== null)
        .reduce((acc, value) => acc + value, 0);
      const shortOfTotal =
        singlePage &&
        invoiceTotal !== null &&
        Math.abs(invoiceTotal) > 0 &&
        pageSum < Math.abs(invoiceTotal) * 0.98;

      if (declaredShort || shortOfTotal) {
        const notes: string[] = [];
        if (declaredShort) notes.push(`you reported ${table.rowCount} product rows but returned only ${table.lineItems.length}`);
        if (shortOfTotal) {
          notes.push(
            `the line totals you returned sum to ${pageSum.toFixed(2)} but this invoice totals ${invoiceTotal?.toFixed(2)} — rows are missing, most likely at the bottom of the table`
          );
        }
        const retry = await readInvoiceTableFromImage({
          apiKey: openAiKey,
          model,
          imageBytes: page.bytes,
          mime: page.mime,
          pageNumber: page.pageNumber,
          runtime: options,
          crop: table.cropBytes ? { bytes: table.cropBytes, mime: table.cropMime, box: table.cropBox } : undefined,
          reinforcement: `RETRY — THE PREVIOUS READ OF THIS TABLE WAS REJECTED because ${notes.join("; and ")}.
Work down the table one row at a time, from the first product row to the very
last one, and return every one of them. Do not stop early. Still copy the values
exactly as printed — do not calculate anything to make the total agree.`,
        });
        accountUsage(retry.usage);
        // Keep the re-read only when it actually recovered rows.
        if (retry.lineItems.length > table.lineItems.length) table = retry;
      }

      rows.push(...table.lineItems);
      columnMappings.push(table.columnMapping);
      printedColumns.push(table.printedColumns);
      if (table.cropBytes) {
        evidence.crops.push({ pageNumber: page.pageNumber, mime: table.cropMime, bytes: table.cropBytes });
      }
      evidence.tableVisionResponses.push({
        pageNumber: page.pageNumber,
        locate: table.rawLocateJson,
        read: table.rawReadJson,
      });
      log.tableVision.push({
        pageNumber: page.pageNumber,
        printedColumns: table.printedColumns,
        columnMapping: table.columnMapping,
        declaredRowCount: table.rowCount,
        returnedRowCount: table.lineItems.length,
        cropBox: table.cropBox,
      });
    }

    if (!rows.length) {
      return { extraction, applied: false, note: "The table re-read returned no rows." };
    }

    const candidate = validateExtraction({
      ...extraction,
      lineItems: lineItemsFromTableVision(rows),
      declaredLineItemCount: rows.length,
      warnings: [],
    });

    /*
     * The re-read only wins on evidence. A replacement that still fails
     * arithmetic is not an improvement, and silently swapping one unreliable
     * table for another would destroy the audit trail without helping anyone.
     */
    const before = extraction.lineArithmetic;
    const after = candidate.lineArithmetic;
    const improved =
      after.status === "Pass" ||
      (before.status === "Fail" && after.coherentRows > before.coherentRows) ||
      (extraction.lineItems.length === 0 && candidate.lineItems.length > 0);

    if (!improved) {
      return {
        extraction,
        applied: false,
        note: `Table re-read returned ${rows.length} rows but did not improve arithmetic coherence (${before.coherentRows}/${before.checkableRows} -> ${after.coherentRows}/${after.checkableRows}); the original rows were kept.`,
      };
    }

    const mappingNote = columnMappings[0]
      ? ` Columns read as quantity=${columnMappings[0].quantity}, unitPrice=${columnMappings[0].unitPrice}, vatAmount=${columnMappings[0].vatAmount}, lineTotal=${columnMappings[0].lineTotal}.`
      : "";

    return {
      extraction: candidate,
      applied: true,
      note: `Line items re-read from the cropped table image: ${rows.length} rows, arithmetic ${after.status} (${after.coherentRows}/${after.checkableRows} coherent).${mappingNote} Printed columns: ${printedColumns[0]?.join(" | ") || "unknown"}.`,
    };
  }

  /**
   * The single exit point. Every accepted extraction passes the table-vision
   * gate here, so no return path can skip it.
   */
  async function finaliseWithVision(extraction: ExtractedInvoice, model: string, outputText: string) {
    let final = extraction;
    const decision = shouldEscalateToTableVision(extraction, visionAssessment?.visionClass ?? "unreadable-pdf");

    if (decision.escalate) {
      try {
        const escalated = await escalateToTableVision(extraction, model);
        final = escalated.extraction;
        log.tableVisionOutcome = `${decision.reason} ${escalated.note}`;
      } catch (error) {
        // A failed re-read must never lose the extraction that already exists.
        log.tableVisionOutcome = `${decision.reason} Table re-read failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        console.warn("[document-extraction] table vision failed", log.tableVisionOutcome);
      }
    } else {
      log.tableVisionOutcome = decision.reason;
    }

    emitTrace(
      options,
      "Table vision gate",
      { model, visionClass: visionAssessment?.visionClass ?? null },
      {
        escalated: decision.escalate,
        outcome: log.tableVisionOutcome,
        lineItemsBefore: extraction.lineItems.length,
        lineItemsAfter: final.lineItems.length,
        arithmetic: final.lineArithmetic.status,
      },
      0
    );

    return finalise(final, model, outputText);
  }

  function finalise(extraction: ExtractedInvoice, model: string, outputText: string) {
    log.modelUsed = model;
    log.rawOpenAiResponsePreview = outputText.slice(0, 2000);
    log.declaredLineItemCount = extraction.declaredLineItemCount;
    log.lineItemCount = extraction.lineItems.length;
    log.completeness = extraction.completeness;
    // Full output is retained only when the accepted extraction is incomplete —
    // that is the case an engineer has to reconstruct, and the only case where
    // the extra storage and retained document content are justified.
    log.rawOpenAiResponseFull = extraction.completeness.status === "Incomplete" ? outputText : null;

    return {
      extraction,
      modelUsed: model,
      log,
      usage: sawUsage ? { promptTokens, completionTokens, totalTokens } : null,
      executionTimeMs,
      // Built here, after the attempt log is final, so the retry count and
      // reasons reflect the whole run rather than the accepted attempt alone.
      quality: buildExtractionQualityRecord(extraction, log),
      evidence,
    };
  }

  for (const [index, attempt] of attemptPlan.entries()) {
    // Re-running the SAME model is only worth a call when there is concrete
    // feedback to give it; without that it would repeat the identical prompt.
    // The fallback-model pass is never skipped — that path predates this change
    // and must still run when the primary model fails outright.
    if (attempt.sameModelRetry && !lastRejected) continue;

    if (!log.modelsAttempted.includes(attempt.model)) log.modelsAttempted.push(attempt.model);
    const attemptStartedAt = Date.now();

    try {
      const result = await callOpenAI({
        apiKey,
        model: attempt.model,
        fileName: input.fileName,
        mime: input.mime,
        dataUrl,
        runtime: options,
        reinforcement: attempt.reinforced && lastRejected ? buildReinforcement(lastRejected) : undefined,
      });

      if (result.usage) {
        sawUsage = true;
        promptTokens += result.usage.promptTokens;
        completionTokens += result.usage.completionTokens;
        totalTokens += result.usage.totalTokens;
      }
      executionTimeMs += result.apiExecutionTimeMs;

      const { extraction } = result;
      const usable = extractionIsUsable(extraction);
      if (isBetter(extraction)) {
        best = { extraction, model: attempt.model, outputText: result.outputText };
      }

      evidence.rawResponses.push({
        model: attempt.model,
        prompt: attempt.reinforced ? "reinforced" : "standard",
        outputText: result.outputText,
      });

      log.attempts.push({
        model: attempt.model,
        prompt: attempt.reinforced ? "reinforced" : "standard",
        outcome: usable
          ? "accepted"
          : extractionHasCoreFields(extraction)
            ? "incomplete"
            : "unusable",
        responseLength: result.outputText.length,
        jsonParsed: true,
        declaredLineItemCount: extraction.declaredLineItemCount,
        lineItemCount: extraction.lineItems.length,
        completeness: extraction.completeness,
        error: null,
        durationMs: Date.now() - attemptStartedAt,
      });

      if (usable) return await finaliseWithVision(extraction, attempt.model, result.outputText);

      /*
       * MEASURED AND REJECTED — do not reintroduce without re-running the corpus.
       *
       * Escalating to the table re-read straight after the first whole-page
       * attempt looked like an obvious saving: on a scanned document the
       * remaining whole-page attempts never fix column identity, and skipping
       * them cut the reference invoice from 119.7s to 45.3s.
       *
       * It also dropped accuracy from 64/64 to 47/64 with arithmetic failing.
       * The whole-page attempts are not wasted work — the best-of-three
       * extraction they produce is what the table re-read is layered onto and
       * validated against, and starting the re-read from a single weaker attempt
       * degrades the result. The saving is real and the cost is unacceptable.
       *
       * The 119.7s figure sits inside the route's 120s ceiling with almost no
       * margin. That is tracked as a deployment risk, not paid for in accuracy.
       */

      if (!extractionHasCoreFields(extraction)) {
        errors.push(`${attempt.model} returned insufficient fields.`);
        lastRejected = null;
      } else {
        errors.push(
          `${attempt.model} returned an incomplete extraction (${extraction.completeness.reasons.join(", ")}).`
        );
        lastRejected = extraction;
        console.warn("[document-extraction] incomplete extraction, retrying", {
          model: attempt.model,
          attempt: index + 1,
          declaredLineItemCount: extraction.declaredLineItemCount,
          lineItemCount: extraction.lineItems.length,
          reasons: extraction.completeness.reasons,
          lineTotalSum: extraction.completeness.lineTotalSum,
          reconciliationBase: extraction.completeness.reconciliationBase,
          responseLength: result.outputText.length,
          documentId: options?.context?.documentId || null,
          workspaceId: options?.context?.workspaceId || null,
          companyId: options?.context?.companyId || null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `${attempt.model} failed.`;
      errors.push(message);
      lastRejected = null;
      log.attempts.push({
        model: attempt.model,
        prompt: attempt.reinforced ? "reinforced" : "standard",
        outcome: "error",
        responseLength: null,
        // A parse failure is the one error that is specifically about the shape
        // of the response, so it is distinguished from transport errors here.
        jsonParsed: !/JSON/i.test(message),
        declaredLineItemCount: null,
        lineItemCount: null,
        completeness: null,
        error: message,
        durationMs: Date.now() - attemptStartedAt,
      });
      console.error("[document-extraction] model error", {
        model: attempt.model,
        message,
        documentId: options?.context?.documentId || null,
        workspaceId: options?.context?.workspaceId || null,
        companyId: options?.context?.companyId || null,
        stack: error instanceof Error ? error.stack || null : null,
      });
    }
  }

  // Retries exhausted. An incomplete extraction the operator can correct beats
  // no extraction at all — it is returned carrying the warnings and the reduced
  // confidence that say so.
  if (best && extractionHasCoreFields(best.extraction)) {
    console.warn("[document-extraction] returning best incomplete extraction", {
      model: best.model,
      attempts: log.attempts.length,
      lineItemCount: best.extraction.lineItems.length,
      declaredLineItemCount: best.extraction.declaredLineItemCount,
      reasons: best.extraction.completeness.reasons,
      documentId: options?.context?.documentId || null,
      workspaceId: options?.context?.workspaceId || null,
      companyId: options?.context?.companyId || null,
    });
    return await finaliseWithVision(best.extraction, best.model, best.outputText);
  }

  throw new Error(`Extraction failed. ${errors.join(" | ")}`);
}

export async function logExtractionEvent(
  supabase: SupabaseClient,
  documentId: string,
  status: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("vyron_document_extraction_logs").insert({
    document_id: documentId,
    stage: "extraction",
    status,
    model: typeof metadata.model === "string" ? metadata.model : null,
    message,
    metadata,
  });
}

export async function persistExtractionToDocument(
  supabase: SupabaseClient,
  documentId: string,
  extraction: ExtractedInvoice,
  modelUsed: string,
  options?: ExtractionRuntimeOptions,
  /**
   * The run's quality record. Optional so the queued/bulk path, which has no
   * run log to hand, still persists; it is rebuilt from the extraction alone.
   */
  quality?: ExtractionQualityRecord
) {
  const invoiceDate =
    extraction.invoiceDate && extraction.invoiceDate !== MISSING ? extraction.invoiceDate : null;

  const headerWhere = { id: documentId };
  const headerUpdateStartedAt = Date.now();
  const { data: updatedHeaders, error: updateError } = await supabase
    .from("vyron_documents")
    .update({
      document_type: extraction.documentType,
      supplier_name: extraction.supplier !== MISSING ? extraction.supplier : null,
      supplier_vat_number: extraction.supplierVatNo !== MISSING ? extraction.supplierVatNo : null,
      customer_name: extraction.customerName !== MISSING ? extraction.customerName : null,
      customer_vat_number: extraction.customerVatNo !== MISSING ? extraction.customerVatNo : null,
      invoice_number: extraction.invoiceNo !== MISSING ? extraction.invoiceNo : null,
      invoice_date: invoiceDate,
      purchase_order_number: extraction.orderNo !== MISSING ? extraction.orderNo : null,
      account_number: extraction.accountNumber !== MISSING ? extraction.accountNumber : null,
      customer_reference: extraction.customerReference !== MISSING ? extraction.customerReference : null,
      sales_representative: extraction.salesRepresentative !== MISSING ? extraction.salesRepresentative : null,
      subtotal: numberFromMoney(extraction.subtotal),
      vat: numberFromMoney(extraction.vat),
      total: numberFromMoney(extraction.total),
      currency: extraction.currency,
      confidence: extraction.confidence,
      field_confidence: extraction.fieldConfidence,
      status: "extracted",
    })
    .eq("id", documentId)
    .select("id");

  emitTrace(
    options,
    "Database update completed",
    {
      table: "vyron_documents",
      where: headerWhere,
      documentId,
    },
    {
      affectedRows: Array.isArray(updatedHeaders) ? updatedHeaders.length : 0,
    },
    Date.now() - headerUpdateStartedAt
  );

  if (updateError) {
    throw new Error(`Could not persist extracted header fields: ${updateError.message}`);
  }
  if (!updatedHeaders?.length) {
    console.error("[documents/extract/runtime] Database update affected 0 rows", {
      timestamp: new Date().toISOString(),
      sql: "update vyron_documents set ... where id = :documentId",
      where: headerWhere,
      workspaceId: options?.context?.workspaceId || null,
      companyId: options?.context?.companyId || null,
      documentId,
    });
  }

  const { error: deleteLinesError } = await supabase
    .from("vyron_document_line_items")
    .delete()
    .eq("document_id", documentId);
  if (deleteLinesError) {
    throw new Error(`Could not reset extracted line items: ${deleteLinesError.message}`);
  }

  if (extraction.lineItems.length) {
    const rows = extraction.lineItems.map((line) => ({
      document_id: documentId,
      description: line.description !== MISSING ? line.description : "",
      quantity: numberFromMoney(line.quantity),
      unit: line.unit !== MISSING ? line.unit : null,
      unit_price: numberFromMoney(line.unitPrice),
      vat: numberFromMoney(line.vatAmount),
      line_total: numberFromMoney(line.lineTotal),
      sku_product_code: line.skuOrProductCode !== MISSING ? line.skuOrProductCode : null,
      confidence_score: line.confidenceScore || null,
      field_confidence: line.fieldConfidence,
    }));

    traceRows("3-database-insert", documentId, rows.length);
    const { error: insertLinesError } = await supabase.from("vyron_document_line_items").insert(rows);
    if (insertLinesError) {
      throw new Error(`Could not persist extracted line items: ${insertLinesError.message}`);
    }
  }

  /*
   * The extraction audit record.
   *
   * `vyron_document_extraction_logs.metadata` is already `jsonb`, so the
   * analytics below need no schema change — nothing to migrate, and no window
   * in which deployed code expects a column that does not exist yet.
   * `extractionQuality` is the single key the review workspace and the
   * executive dashboard both read.
   */
  await logExtractionEvent(supabase, documentId, "success", "Extraction persisted to vyron_documents.", {
    model: modelUsed,
    invoiceNo: extraction.invoiceNo,
    supplier: extraction.supplier,
    extractionQuality: quality ?? buildExtractionQualityRecord(extraction),
  });
}

export async function loadDocumentBytes(
  supabase: SupabaseClient,
  document: {
    storage_bucket: string | null;
    storage_path: string | null;
    original_filename: string | null;
    file_mime: string | null;
  }
) {
  const bucket = document.storage_bucket || VYRON_DOCUMENTS_BUCKET;
  const path = document.storage_path;
  if (!path) {
    throw new Error("Document has no storage_path — cannot download for extraction.");
  }

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || "unknown error"}`);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const mime = document.file_mime || "application/octet-stream";
  const fileName = document.original_filename || path.split("/").pop() || "document";

  return { bytes, mime, fileName, bucket, path };
}

export async function extractStoredDocumentById(supabase: SupabaseClient, documentId: string) {
  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, status, storage_bucket, storage_path, original_filename, file_mime, deleted_at")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) throw new Error(docError.message);
  if (!document) throw new Error(`Document ${documentId} not found.`);
  if (document.deleted_at) throw new Error(`Document ${documentId} was deleted.`);

  await supabase.from("vyron_documents").update({ status: "extracting" }).eq("id", documentId);

  const { bytes, mime, fileName, bucket, path } = await loadDocumentBytes(supabase, document);

  await logExtractionEvent(supabase, documentId, "started", "Bulk/queued extraction started.", {
    fileName,
    mime,
    byteSize: bytes.length,
    bucket,
    path,
  });

  const { extraction, modelUsed, log, quality } = await runDocumentExtraction({ fileName, mime, bytes });
  await persistExtractionToDocument(supabase, documentId, extraction, modelUsed, undefined, quality);

  return { documentId, modelUsed, extraction, log, quality };
}
