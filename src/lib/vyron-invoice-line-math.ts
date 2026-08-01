import type { ReviewDraft, ReviewDraftLine } from "@/lib/vyron-document-review-client";

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeLineExclVat(line: Pick<ReviewDraftLine, "quantity" | "unitPrice">) {
  const qty = Number(line.quantity ?? 0);
  const price = Number(line.unitPrice ?? 0);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return null;
  return roundMoney(qty * price);
}

/** Derive excl / VAT / incl; preserves manual VAT when qty/price change. */
export function computeLineAmounts(line: ReviewDraftLine): Pick<ReviewDraftLine, "lineExclVat" | "vat" | "lineTotal"> {
  const excl = computeLineExclVat(line);
  const vat = line.vat ?? 0;
  const incl = excl !== null ? roundMoney(excl + (vat ?? 0)) : line.lineTotal;
  return {
    lineExclVat: excl,
    vat: vat ?? null,
    lineTotal: incl ?? null,
  };
}

export function withLineAmounts(line: ReviewDraftLine): ReviewDraftLine {
  return { ...line, ...computeLineAmounts(line) };
}

/**
 * Load-path amounts: keep what was extracted, derive only what is absent.
 *
 * `computeLineAmounts` above is the EDIT path — the operator changed quantity,
 * unit price or VAT, so the derived amounts must follow. Running it on load
 * instead overwrote the extracted line total with `quantity × unitPrice + VAT`,
 * and because both operands coerce a missing value to 0, any row whose quantity
 * or unit price could not be read showed 0.00 under Excl VAT and its VAT amount
 * under Incl VAT. The extracted figure never reached the screen.
 *
 * Precedence for the exclusive amount is the one the review-draft loader always
 * intended, before the result was discarded by the recompute: quantity × unit
 * price when both were extracted, otherwise line total less VAT.
 */
export function deriveLineAmounts(line: ReviewDraftLine): Pick<ReviewDraftLine, "lineExclVat" | "vat" | "lineTotal"> {
  const fromQuantity =
    line.quantity !== null && line.unitPrice !== null && Number.isFinite(line.quantity) && Number.isFinite(line.unitPrice)
      ? roundMoney(line.quantity * line.unitPrice)
      : null;
  const fromTotal =
    line.lineTotal !== null && Number.isFinite(line.lineTotal) ? roundMoney(line.lineTotal - (line.vat ?? 0)) : null;

  return {
    lineExclVat: fromQuantity ?? fromTotal,
    // Preserved rather than defaulted to 0. A VAT amount that was never
    // extracted is unknown, and must not be presented as a measured zero.
    vat: line.vat,
    lineTotal: line.lineTotal ?? (fromQuantity !== null ? roundMoney(fromQuantity + (line.vat ?? 0)) : null),
  };
}

export function withDerivedLineAmounts(line: ReviewDraftLine): ReviewDraftLine {
  return { ...line, ...deriveLineAmounts(line) };
}

/** Differences at or below this are treated as an exact match (e.g. R0.04). */
export const TOTALS_MATCH_TOLERANCE = 0.05;

/** Differences at or below R1.00 (but above tolerance) are rounding only — not a major mismatch. */
export const ROUNDING_DIFFERENCE_LIMIT = 1.0;

export type InvoiceTotalsSummary = {
  sumExcl: number;
  sumVat: number;
  sumIncl: number;
  extractedSubtotal: number | null;
  extractedVat: number | null;
  extractedTotal: number | null;
  diffExcl: number | null;
  diffVat: number | null;
  diffIncl: number | null;
  maxAbsDiff: number;
  /** Any extracted vs line difference above tolerance. */
  hasTotalsDifference: boolean;
  /** @deprecated Use hasTotalsDifference — kept for callers. */
  hasMismatch: boolean;
  hasRoundingDifference: boolean;
  hasMajorMismatch: boolean;
  unmappedCount: number;
  ignoredCount: number;
};

export function classifyTotalsDiffs(diffs: Array<number | null>) {
  const magnitudes = diffs.filter((value): value is number => value !== null).map((value) => Math.abs(value));
  const maxAbsDiff = magnitudes.length ? Math.max(...magnitudes) : 0;
  const hasTotalsDifference = magnitudes.some((value) => value > TOTALS_MATCH_TOLERANCE);
  const hasRoundingDifference = hasTotalsDifference && maxAbsDiff <= ROUNDING_DIFFERENCE_LIMIT;
  const hasMajorMismatch = hasTotalsDifference && maxAbsDiff > ROUNDING_DIFFERENCE_LIMIT;
  return { maxAbsDiff, hasTotalsDifference, hasRoundingDifference, hasMajorMismatch };
}

export function summarizeInvoiceTotals(draft: ReviewDraft): InvoiceTotalsSummary {
  const active = draft.lines.filter((line) => !line.ignored);
  const sumExcl = roundMoney(active.reduce((sum, line) => sum + (line.lineExclVat ?? computeLineExclVat(line) ?? 0), 0));
  const sumVat = roundMoney(active.reduce((sum, line) => sum + (line.vat ?? 0), 0));
  const sumIncl = roundMoney(active.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0));

  const extractedSubtotal = draft.fields.subtotal;
  const extractedVat = draft.fields.vat;
  const extractedTotal = draft.fields.total;

  const diffExcl =
    extractedSubtotal !== null ? roundMoney(sumExcl - extractedSubtotal) : null;
  const diffVat = extractedVat !== null ? roundMoney(sumVat - extractedVat) : null;
  const diffIncl = extractedTotal !== null ? roundMoney(sumIncl - extractedTotal) : null;

  const { maxAbsDiff, hasTotalsDifference, hasRoundingDifference, hasMajorMismatch } = classifyTotalsDiffs([
    diffExcl,
    diffVat,
    diffIncl,
  ]);

  const unmappedCount = active.filter((line) => !line.matchedEntityId || !line.matchedEntityType).length;

  return {
    sumExcl,
    sumVat,
    sumIncl,
    extractedSubtotal,
    extractedVat,
    extractedTotal,
    diffExcl,
    diffVat,
    diffIncl,
    maxAbsDiff,
    hasTotalsDifference,
    hasMismatch: hasTotalsDifference,
    hasRoundingDifference,
    hasMajorMismatch,
    unmappedCount,
    ignoredCount: draft.lines.filter((line) => line.ignored).length,
  };
}

export function formatMoney(value: number | null, currency = "R") {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${currency}${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
