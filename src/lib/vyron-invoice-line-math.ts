import type { ReviewDraft, ReviewDraftLine } from "@/lib/vyron-document-review-client";
import {
  reconcileInvoiceTotals,
  roundMoney,
  type ReconciliationBasis,
} from "@/lib/vyron-invoice-reconciliation";

export { roundMoney };

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

// Tolerances live with the calculation that applies them. Re-exported so the
// existing importers of this module keep resolving.
export { TOTALS_MATCH_TOLERANCE, ROUNDING_DIFFERENCE_LIMIT } from "@/lib/vyron-invoice-reconciliation";

export type InvoiceTotalsSummary = {
  /** Which reading of the line total column the figures below are stated on. */
  basis: ReconciliationBasis;
  /** True when every comparable figure agrees within the match tolerance. */
  reconciled: boolean;
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

/*
 * `classifyTotalsDiffs` was removed.
 *
 * It classified a set of differences without knowing how they were produced,
 * which let four callers compute the differences four different ways and then
 * agree on how to describe them — the appearance of shared logic without the
 * substance. Callers now use `reconcileInvoiceTotals`, which produces the
 * differences and their classification together.
 */

/**
 * Totals for the review screen.
 *
 * Every figure here comes from `reconcileInvoiceTotals`, which is also what the
 * extraction engine and the Extraction Quality summary read. That shared source
 * is the point: this function previously did its own arithmetic and assumed the
 * line total column always included VAT, so on an exclusive-basis invoice it
 * reported a difference equal to the VAT while the quality panel — which knew
 * better — reported "Reconciled" alongside it.
 */
export function summarizeInvoiceTotals(draft: ReviewDraft): InvoiceTotalsSummary {
  const active = draft.lines.filter((line) => !line.ignored);

  const reconciliation = reconcileInvoiceTotals({
    lineExclSum: roundMoney(active.reduce((sum, line) => sum + (line.lineExclVat ?? computeLineExclVat(line) ?? 0), 0)),
    lineVatSum: roundMoney(active.reduce((sum, line) => sum + (line.vat ?? 0), 0)),
    lineTotalSum: roundMoney(active.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)),
    extractedSubtotal: draft.fields.subtotal,
    extractedVat: draft.fields.vat,
    extractedTotal: draft.fields.total,
  });

  const unmappedCount = active.filter((line) => !line.matchedEntityId || !line.matchedEntityType).length;
  const hasTotalsDifference = reconciliation.isRoundingDifference || reconciliation.isMajorMismatch;

  return {
    basis: reconciliation.basis,
    sumExcl: reconciliation.lineExcl,
    sumVat: reconciliation.lineVat,
    sumIncl: reconciliation.lineIncl,
    extractedSubtotal: reconciliation.extractedSubtotal,
    extractedVat: reconciliation.extractedVat,
    extractedTotal: reconciliation.extractedTotal,
    diffExcl: reconciliation.diffExcl,
    diffVat: reconciliation.diffVat,
    diffIncl: reconciliation.diffIncl,
    maxAbsDiff: reconciliation.maxAbsDiff,
    reconciled: reconciliation.reconciled,
    hasTotalsDifference,
    hasMismatch: hasTotalsDifference,
    hasRoundingDifference: reconciliation.isRoundingDifference,
    hasMajorMismatch: reconciliation.isMajorMismatch,
    unmappedCount,
    ignoredCount: draft.lines.filter((line) => line.ignored).length,
  };
}

export function formatMoney(value: number | null, currency = "R") {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${currency}${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
