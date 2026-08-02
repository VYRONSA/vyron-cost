/**
 * VYRON — the one reconciliation calculation.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three places asked "do the lines agree with the invoice?" and answered
 * differently:
 *
 *   - the extraction engine's completeness gate
 *   - the Extraction Quality summary
 *   - the totals banner and difference panel
 *
 * They disagreed because they disagreed about what the line total column MEANS.
 * The banner assumed it always includes VAT and compared its sum straight to
 * the invoice total. For a supplier whose final column is exclusive of VAT that
 * sum is the NET, so the difference came out as exactly the VAT amount — the
 * "Δ Incl = VAT" the review screen was reporting while Excl and VAT both
 * matched to the cent, and while Extraction Quality said "Reconciled" because
 * the engine had already worked out the basis correctly.
 *
 * An operator cannot trust a screen that contradicts itself, so the question is
 * answered once, here, and every surface reads the same answer.
 *
 * BASIS DETECTION
 * ---------------
 * Suppliers differ and neither convention is wrong. Gourmet Foods prints a
 * VAT-inclusive "NETT PRICE" that sums to the invoice total; others print an
 * exclusive "Amount" that sums to the subtotal. The basis is inferred from
 * whichever reading the numbers actually support, and reported, so the caller
 * never has to guess and the answer can be explained.
 */

export type ReconciliationBasis = "inclusive" | "exclusive" | "indeterminate";

/** Differences at or below this are an exact match (e.g. R0.04 of rounding). */
export const TOTALS_MATCH_TOLERANCE = 0.05;

/** Above the match tolerance but at or below this is rounding, not a mismatch. */
export const ROUNDING_DIFFERENCE_LIMIT = 1.0;

export type ReconciliationInput = {
  /** Sum of line amounts excluding VAT, derived from quantity x unit price. */
  lineExclSum: number;
  /** Sum of per-line VAT amounts. */
  lineVatSum: number;
  /** Sum of the line total column, whatever basis it is on. */
  lineTotalSum: number;
  extractedSubtotal: number | null;
  extractedVat: number | null;
  extractedTotal: number | null;
};

export type ReconciliationResult = {
  basis: ReconciliationBasis;
  /** Line sums restated on a common basis, so the diffs compare like with like. */
  lineExcl: number;
  lineVat: number;
  lineIncl: number;
  extractedSubtotal: number | null;
  extractedVat: number | null;
  extractedTotal: number | null;
  diffExcl: number | null;
  diffVat: number | null;
  diffIncl: number | null;
  maxAbsDiff: number;
  /** Every comparable figure agrees within TOTALS_MATCH_TOLERANCE. */
  reconciled: boolean;
  /** Nothing comparable was available — not the same as agreeing. */
  verifiable: boolean;
  /** Differs by more than the match tolerance but no more than R1.00. */
  isRoundingDifference: boolean;
  /** Differs by more than R1.00. Blocks approval without a reason. */
  isMajorMismatch: boolean;
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Which reading of the line total column do the numbers support?
 *
 * Decided by distance, not by preference: whichever of "these are net amounts"
 * or "these already include VAT" lands closer to the invoice's own figures. When
 * the invoice carries no VAT at all the two readings are identical and the
 * question does not arise, so it resolves to inclusive and the diffs come out
 * the same either way.
 */
function detectBasis(input: ReconciliationInput): ReconciliationBasis {
  const { lineTotalSum, extractedSubtotal, extractedTotal } = input;

  const inclusiveDistance = extractedTotal === null ? null : Math.abs(lineTotalSum - extractedTotal);
  const exclusiveDistance = extractedSubtotal === null ? null : Math.abs(lineTotalSum - extractedSubtotal);

  if (inclusiveDistance === null && exclusiveDistance === null) return "indeterminate";
  if (exclusiveDistance === null) return "inclusive";
  if (inclusiveDistance === null) return "exclusive";
  // Ties go to inclusive: with no VAT on the invoice both readings agree, and
  // the inclusive reading is the one the line total column is named for.
  return exclusiveDistance < inclusiveDistance ? "exclusive" : "inclusive";
}

export function reconcileInvoiceTotals(input: ReconciliationInput): ReconciliationResult {
  const basis = detectBasis(input);

  /*
   * Restate the line sums so each difference compares like with like.
   *
   * On an exclusive basis the line total column IS the net, so the inclusive
   * figure has to have VAT added back before it can be set against the invoice
   * total. Comparing the raw column to the total is what produced a difference
   * equal to the VAT.
   */
  const lineIncl =
    basis === "exclusive" ? roundMoney(input.lineTotalSum + input.lineVatSum) : roundMoney(input.lineTotalSum);
  const lineExcl =
    basis === "exclusive" ? roundMoney(input.lineTotalSum) : roundMoney(input.lineExclSum);
  const lineVat = roundMoney(input.lineVatSum);

  const diffExcl = input.extractedSubtotal === null ? null : roundMoney(lineExcl - input.extractedSubtotal);
  const diffVat = input.extractedVat === null ? null : roundMoney(lineVat - input.extractedVat);
  const diffIncl = input.extractedTotal === null ? null : roundMoney(lineIncl - input.extractedTotal);

  const comparable = [diffExcl, diffVat, diffIncl].filter((value): value is number => value !== null);
  const magnitudes = comparable.map((value) => Math.abs(value));
  const maxAbsDiff = magnitudes.length ? Math.max(...magnitudes) : 0;

  const verifiable = comparable.length > 0;
  const reconciled = verifiable && maxAbsDiff <= TOTALS_MATCH_TOLERANCE;

  return {
    basis,
    lineExcl,
    lineVat,
    lineIncl,
    extractedSubtotal: input.extractedSubtotal,
    extractedVat: input.extractedVat,
    extractedTotal: input.extractedTotal,
    diffExcl,
    diffVat,
    diffIncl,
    maxAbsDiff,
    reconciled,
    verifiable,
    // Mutually exclusive by construction, and neither can be true when
    // reconciled is true. A surface that shows a warning while the summary says
    // "Reconciled" is the contradiction this module exists to make impossible.
    isRoundingDifference: verifiable && maxAbsDiff > TOTALS_MATCH_TOLERANCE && maxAbsDiff <= ROUNDING_DIFFERENCE_LIMIT,
    isMajorMismatch: verifiable && maxAbsDiff > ROUNDING_DIFFERENCE_LIMIT,
  };
}
