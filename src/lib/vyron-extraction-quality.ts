import type { ExtractedInvoice, ExtractionRunLog } from "@/lib/vyron-document-extraction";

/**
 * VYRON — Supplier Invoice Extraction Quality.
 *
 * THE AUTHORITATIVE CLASSIFICATION FOR AN EXTRACTED DOCUMENT.
 *
 * WHY THIS EXISTS
 * ---------------
 * Review state used to be derived from the model's self-reported confidence
 * alone (`confidence >= 75 ? "Captured" : "Needs Review"`). Confidence is an
 * opinion: the model is confident about the rows it returned and has no view of
 * the rows it skipped. A truncated invoice could therefore be filed as captured
 * at 90% confidence.
 *
 * Classification is computed from objective facts instead — how many rows the
 * model said it could see against how many it returned, whether the money
 * reconciles, whether the critical header fields are present, and how many
 * attempts it took. Confidence remains informative; classification is
 * authoritative.
 *
 * This module deliberately imports nothing but types from the extraction
 * engine, so the dependency runs one way: engine -> quality. Type-only imports
 * are erased at compile time, so there is no runtime cycle.
 */

/** Deterministic review state. Precedence: Incomplete > Needs Review > Verified. */
export type ExtractionClassification = "Verified" | "Needs Review" | "Incomplete";

export type ExtractionQualityBand = "Excellent" | "Good" | "Fair" | "Poor";

export type ExtractionReconciliationStatus = "Reconciled" | "Not reconciled" | "Not verifiable";

export type ExtractionQualityRecord = {
  /** Bumped when the shape changes, so persisted records stay readable. */
  schemaVersion: 1;
  classification: ExtractionClassification;
  /** 0-100, derived from objective signals only — never the model's self-report. */
  quality: number;
  qualityBand: ExtractionQualityBand;
  completenessStatus: "Complete" | "Incomplete" | "Unverified";
  /** null when neither a declared count nor a reconcilable total was available. */
  completenessPercentage: number | null;
  declaredLineCount: number | null;
  extractedLineCount: number;
  /** Attempts beyond the first. 0 on a clean first-pass extraction. */
  retryCount: number;
  retryReasons: string[];
  reconciliationStatus: ExtractionReconciliationStatus;
  reconciliationVariance: number | null;
  missingFields: string[];
  warnings: string[];
  modelUsed: string | null;
  /** Model confidence, retained for information. Never used for classification. */
  confidence: number | null;
};

/**
 * A Verified document must be 100% complete. There is no partial credit: a
 * missing row on a supplier invoice is a costing error, not a rounding error.
 */
export const COMPLETENESS_THRESHOLD = 100;

/**
 * Document classes that are expected to carry priced invoice lines.
 *
 * A supplier statement lists invoices, not products; a delivery note may carry
 * no prices at all. Treating their empty `lineItems` as truncation was not just
 * a mislabel — it drove the retry loop, so a single statement cost three
 * billable OpenAI calls chasing rows that were never on the page.
 *
 * Unrecognised types fail closed and are treated as line-bearing:
 * `normaliseExtraction` defaults `documentType` to "Supplier Invoice", so the
 * gate stays on unless a document positively identifies as something else.
 */
const NON_LINE_DOCUMENT_TYPES = new Set([
  "supplier statement",
  "statement",
  "delivery note",
  "remittance advice",
  "other",
]);

export function expectsLineItems(documentType: string | null | undefined): boolean {
  const normalised = String(documentType || "").trim().toLowerCase();
  // A deny-list, not an allow-list. Anything not positively identified as a
  // class that carries no priced lines keeps the gate on, so an invoice the
  // model labelled with an unexpected string is still checked for truncation.
  return !NON_LINE_DOCUMENT_TYPES.has(normalised);
}

const QUALITY_BANDS: Array<{ floor: number; band: ExtractionQualityBand }> = [
  { floor: 90, band: "Excellent" },
  { floor: 75, band: "Good" },
  { floor: 50, band: "Fair" },
  { floor: 0, band: "Poor" },
];

export function qualityBandFor(quality: number): ExtractionQualityBand {
  return QUALITY_BANDS.find((entry) => quality >= entry.floor)?.band ?? "Poor";
}

/**
 * Plain-language causes for a rejected attempt. Never shown as raw reason codes.
 *
 * Deliberately past tense and scoped to "an attempt". These describe a
 * SUPERSEDED attempt, not the document's current state — a retry that succeeded
 * leaves a reason behind while the final extraction is perfectly good. Present
 * tense here read as a live problem and contradicted the metrics beside it.
 */
const RETRY_REASON_LABELS: Record<string, string> = {
  "row-count-mismatch": "An attempt returned fewer rows than the document appeared to contain",
  "no-line-items": "An attempt returned no line items from a priced invoice",
  "totals-do-not-reconcile": "An attempt's line totals did not sum to the invoice subtotal",
};

function describeRetryReason(reason: string) {
  return RETRY_REASON_LABELS[reason] || "An attempt did not meet the completeness standard";
}

/**
 * How much of the invoice came back, as a ratio.
 *
 * Preference order matters. The declared row count is the model's own statement
 * of what it could see, so it is the most direct measure. Falling back to the
 * money covers the case where the model reported no count — or reported one
 * that matches its own short output.
 */
function completenessRatio(extraction: ExtractedInvoice): number | null {
  const { completeness } = extraction;
  const extracted = completeness.extractedLineItemCount;

  if (completeness.declaredLineItemCount !== null && completeness.declaredLineItemCount > 0) {
    return Math.min(1, extracted / completeness.declaredLineItemCount);
  }

  // Magnitudes, not signed values — a credit note's totals are negative and its
  // completeness is measured exactly the same way.
  if (
    completeness.lineTotalSum !== null &&
    completeness.reconciliationBase !== null &&
    Math.abs(completeness.reconciliationBase) > 0
  ) {
    return Math.min(1, Math.abs(completeness.lineTotalSum) / Math.abs(completeness.reconciliationBase));
  }

  // A priced document that returned nothing is 0% complete even though neither
  // measure above applies — but only where lines were expected. A statement
  // with no lines is not 0% complete, it is not measurable this way.
  if (
    extracted === 0 &&
    expectsLineItems(extraction.documentType) &&
    completeness.reconciliationBase !== null &&
    Math.abs(completeness.reconciliationBase) > 0
  ) {
    return 0;
  }

  return null;
}

function reconciliationStatusFor(extraction: ExtractedInvoice): ExtractionReconciliationStatus {
  const { completeness, validation } = extraction;

  if (validation.subtotalVatTotalCheck === "Fail") return "Not reconciled";
  if (completeness.reasons.includes("totals-do-not-reconcile")) return "Not reconciled";
  if (completeness.variance === null) return "Not verifiable";
  return "Reconciled";
}

/**
 * Quality score, 0-100.
 *
 * Every penalty is an objective, independently checkable fact. Warnings carry
 * no penalty of their own because they are generated *from* these same facts —
 * penalising both would double-count the one defect.
 */
function computeQuality(extraction: ExtractedInvoice, retryCount: number): number {
  const ratio = completenessRatio(extraction);
  let quality = 100;

  //  4 critical header fields x 15
  quality -= extraction.validation.missingFields.length * 15;

  // Line shortfall, proportional.
  if (ratio !== null) quality -= Math.round(30 * (1 - ratio));
  // Nothing contradicted the extraction, but nothing confirmed it either.
  else quality -= 5;

  // Each extra attempt is evidence the document was hard to read.
  quality -= Math.min(retryCount, 2) * 10;

  if (reconciliationStatusFor(extraction) === "Not reconciled") quality -= 15;

  return Math.max(0, Math.min(100, quality));
}

/**
 * The deterministic review state.
 *
 * Order is significant. The Incomplete conditions are a strict subset of the
 * things that would also make a document Needs Review, so Incomplete is tested
 * first — otherwise every Incomplete document would be reported as Needs
 * Review and the distinction would never surface.
 */
function classify(
  extraction: ExtractedInvoice,
  retryCount: number,
  completenessPercentage: number | null
): ExtractionClassification {
  const { completeness, validation, warnings } = extraction;

  const criticalFieldsMissing = validation.missingFields.length > 0;
  // Strictly a SHORTFALL. More rows than declared is a discrepancy worth
  // reviewing, but it is not the truncation this state exists to name.
  const rowShortfall =
    completeness.declaredLineItemCount !== null &&
    completeness.extractedLineItemCount < completeness.declaredLineItemCount;
  const totalsIrreconcilable = reconciliationStatusFor(extraction) === "Not reconciled";

  if (criticalFieldsMissing || rowShortfall || totalsIrreconcilable) return "Incomplete";

  const needsReview =
    warnings.length > 0 ||
    retryCount > 0 ||
    completeness.status !== "Complete" ||
    (completenessPercentage !== null && completenessPercentage < COMPLETENESS_THRESHOLD) ||
    validation.subtotalVatTotalCheck !== "Pass" ||
    validation.lineItemsTotalCheck !== "Pass";

  return needsReview ? "Needs Review" : "Verified";
}

/**
 * Build the audit record for one extraction run.
 *
 * `log` is optional so that a document re-assessed from stored fields (with no
 * run log available) still classifies, treating it as a clean single attempt.
 */
export function buildExtractionQualityRecord(
  extraction: ExtractedInvoice,
  log?: Pick<ExtractionRunLog, "attempts" | "modelUsed"> | null
): ExtractionQualityRecord {
  const attempts = log?.attempts ?? [];
  const retryCount = Math.max(0, attempts.length - 1);

  const retryReasons = Array.from(
    new Set(
      attempts
        .filter((attempt) => attempt.outcome !== "accepted")
        .flatMap((attempt) =>
          attempt.outcome === "error"
            ? ["The model could not be reached or returned an unreadable response"]
            : (attempt.completeness?.reasons ?? []).map(describeRetryReason)
        )
    )
  );

  const ratio = completenessRatio(extraction);
  const completenessPercentage = ratio === null ? null : Math.round(ratio * 100);
  const quality = computeQuality(extraction, retryCount);

  return {
    schemaVersion: 1,
    classification: classify(extraction, retryCount, completenessPercentage),
    quality,
    qualityBand: qualityBandFor(quality),
    completenessStatus: extraction.completeness.status,
    completenessPercentage,
    declaredLineCount: extraction.completeness.declaredLineItemCount,
    extractedLineCount: extraction.completeness.extractedLineItemCount,
    retryCount,
    retryReasons,
    reconciliationStatus: reconciliationStatusFor(extraction),
    reconciliationVariance: extraction.completeness.variance,
    missingFields: extraction.validation.missingFields,
    warnings: extraction.warnings,
    modelUsed: log?.modelUsed ?? null,
    confidence: Number.isFinite(extraction.confidence) ? extraction.confidence : null,
  };
}

const CLASSIFICATIONS: ExtractionClassification[] = ["Verified", "Needs Review", "Incomplete"];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read a persisted record back.
 *
 * Returns null rather than a default for anything unrecognised. Documents
 * extracted before this feature shipped have no record, and inventing a
 * "Verified" default for them would assert something never measured.
 */
export function parseExtractionQualityRecord(value: unknown): ExtractionQualityRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const classification = raw.classification;
  if (typeof classification !== "string" || !CLASSIFICATIONS.includes(classification as ExtractionClassification)) {
    return null;
  }

  const quality = finiteOrNull(raw.quality);
  if (quality === null) return null;

  const completenessStatus = raw.completenessStatus;
  const status =
    completenessStatus === "Complete" || completenessStatus === "Incomplete" || completenessStatus === "Unverified"
      ? completenessStatus
      : "Unverified";

  const reconciliation = raw.reconciliationStatus;
  const reconciliationStatus: ExtractionReconciliationStatus =
    reconciliation === "Reconciled" || reconciliation === "Not reconciled" ? reconciliation : "Not verifiable";

  return {
    schemaVersion: 1,
    classification: classification as ExtractionClassification,
    quality,
    qualityBand:
      typeof raw.qualityBand === "string" && ["Excellent", "Good", "Fair", "Poor"].includes(raw.qualityBand)
        ? (raw.qualityBand as ExtractionQualityBand)
        : qualityBandFor(quality),
    completenessStatus: status,
    completenessPercentage: finiteOrNull(raw.completenessPercentage),
    declaredLineCount: finiteOrNull(raw.declaredLineCount),
    extractedLineCount: finiteOrNull(raw.extractedLineCount) ?? 0,
    retryCount: finiteOrNull(raw.retryCount) ?? 0,
    retryReasons: stringArray(raw.retryReasons),
    reconciliationStatus,
    reconciliationVariance: finiteOrNull(raw.reconciliationVariance),
    missingFields: stringArray(raw.missingFields),
    warnings: stringArray(raw.warnings),
    modelUsed: typeof raw.modelUsed === "string" ? raw.modelUsed : null,
    confidence: finiteOrNull(raw.confidence),
  };
}

// ---------------------------------------------------------------------------
// Operational reporting
// ---------------------------------------------------------------------------

export type ExtractionQualityKpis = {
  /** Documents carrying a quality record. Documents predating the feature are excluded. */
  documentsAssessed: number;
  /** Verified on the first attempt, with no retry. The headline health metric. */
  firstPassSuccessRate: number | null;
  retryRate: number | null;
  averageQuality: number | null;
  averageCompleteness: number | null;
  manualReviewRate: number | null;
  incompleteRate: number | null;
};

const EMPTY_KPIS: ExtractionQualityKpis = {
  documentsAssessed: 0,
  firstPassSuccessRate: null,
  retryRate: null,
  averageQuality: null,
  averageCompleteness: null,
  manualReviewRate: null,
  incompleteRate: null,
};

function percentage(count: number, total: number) {
  return total === 0 ? null : Math.round((count / total) * 1000) / 10;
}

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round((values.reduce((acc, value) => acc + value, 0) / values.length) * 10) / 10;
}

/**
 * Aggregate quality records into operational KPIs.
 *
 * Rates are null rather than 0 when there is nothing to measure — an empty
 * period must read as "no data", not as "0% success".
 */
export function summariseExtractionQuality(records: ExtractionQualityRecord[]): ExtractionQualityKpis {
  const total = records.length;
  if (!total) return EMPTY_KPIS;

  const completeness = records
    .map((record) => record.completenessPercentage)
    .filter((value): value is number => value !== null);

  return {
    documentsAssessed: total,
    firstPassSuccessRate: percentage(
      records.filter((record) => record.classification === "Verified" && record.retryCount === 0).length,
      total
    ),
    retryRate: percentage(records.filter((record) => record.retryCount > 0).length, total),
    averageQuality: average(records.map((record) => record.quality)),
    averageCompleteness: average(completeness),
    manualReviewRate: percentage(records.filter((record) => record.classification === "Needs Review").length, total),
    incompleteRate: percentage(records.filter((record) => record.classification === "Incomplete").length, total),
  };
}
