#!/usr/bin/env node
/**
 * VYRON — reconciliation consistency tests.
 *
 * The review screen showed an operator three answers to one question. The
 * Extraction Quality summary said the invoice reconciled; the totals banner said
 * the totals did not agree; the difference panel reported a shortfall equal to
 * the VAT. All three were computed separately, so all three could be right about
 * their own arithmetic and still contradict each other on screen.
 *
 * These tests assert the properties that make that impossible:
 *
 *   1. the VAT-basis bug does not come back
 *   2. reconciled and warning are mutually exclusive, by construction
 *   3. nothing warns inside the configured tolerance
 *   4. every surface reads the same numbers
 *
 * Family A under the Repository Safety Programme: pure computation, no network,
 * no database, no writes, no API key.
 *
 *   node scripts/test-reconciliation-consistency.mjs
 */

import { register } from "node:module";

register("./support/ts-alias-hook.mjs", import.meta.url);

const {
  reconcileInvoiceTotals,
  TOTALS_MATCH_TOLERANCE,
  ROUNDING_DIFFERENCE_LIMIT,
} = await import("../src/lib/vyron-invoice-reconciliation.ts");
const { summarizeInvoiceTotals } = await import("../src/lib/vyron-invoice-line-math.ts");

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

/** A review draft carrying the given lines and extracted header figures. */
function draft(lines, fields) {
  return {
    documentId: "test",
    status: "extracted",
    fields: { subtotal: null, vat: null, total: null, currency: "ZAR", ...fields },
    lines: lines.map((line, index) => ({
      id: `line-${index}`,
      description: `Line ${index + 1}`,
      quantity: line.quantity ?? null,
      unit: "",
      unitPrice: line.unitPrice ?? null,
      vat: line.vat ?? null,
      lineTotal: line.lineTotal ?? null,
      lineExclVat: line.lineExclVat ?? null,
      skuOrProductCode: "",
      confidenceScore: null,
      fieldConfidence: {},
      matchedEntityType: null,
      matchedEntityId: null,
      matchedEntityName: null,
      ignored: Boolean(line.ignored),
    })),
    matchOptions: [],
    extractionQuality: null,
  };
}

console.log("\n  VYRON — reconciliation consistency\n");

// ---------------------------------------------------------------------------
console.log("  1. The reported defect: exclusive line totals must not read as a VAT-sized gap");

/*
 * A supplier whose line column excludes VAT. Two lines at 100.00 and 200.00
 * net, VAT at 15%. Summing that column and comparing it to the invoice TOTAL
 * understates by exactly the VAT — which is what the banner used to report.
 */
const exclusive = draft(
  [
    { quantity: 1, unitPrice: 100, vat: 15, lineTotal: 100 },
    { quantity: 1, unitPrice: 200, vat: 30, lineTotal: 200 },
  ],
  { subtotal: 300, vat: 45, total: 345 }
);
const exclusiveSummary = summarizeInvoiceTotals(exclusive);

check("basis detected as exclusive", exclusiveSummary.basis === "exclusive", `got ${exclusiveSummary.basis}`);
check(
  "no difference reported",
  exclusiveSummary.diffIncl === 0 && exclusiveSummary.diffExcl === 0 && exclusiveSummary.diffVat === 0,
  `excl ${exclusiveSummary.diffExcl}, vat ${exclusiveSummary.diffVat}, incl ${exclusiveSummary.diffIncl}`
);
check(
  "delta Incl is NOT the VAT amount (the reported bug)",
  Math.abs(exclusiveSummary.diffIncl ?? 0) !== 45,
  `diffIncl ${exclusiveSummary.diffIncl} equals the VAT of 45`
);
check("no warning shown", exclusiveSummary.hasTotalsDifference === false);
check("reported as reconciled", exclusiveSummary.reconciled === true);

// ---------------------------------------------------------------------------
console.log("\n  2. Inclusive line totals still reconcile");

const inclusive = draft(
  [
    { quantity: 1, unitPrice: 100, vat: 15, lineTotal: 115 },
    { quantity: 1, unitPrice: 200, vat: 30, lineTotal: 230 },
  ],
  { subtotal: 300, vat: 45, total: 345 }
);
const inclusiveSummary = summarizeInvoiceTotals(inclusive);
check("basis detected as inclusive", inclusiveSummary.basis === "inclusive", `got ${inclusiveSummary.basis}`);
check("no warning shown", inclusiveSummary.hasTotalsDifference === false);
check("reported as reconciled", inclusiveSummary.reconciled === true);

// ---------------------------------------------------------------------------
console.log("\n  3. Gourmet Foods 02252489 — the real verified invoice");

/*
 * Real figures from the answer key: a VAT-inclusive NETT PRICE column whose 16
 * rows sum to 26766.19 against a printed total of 26766.18, with VAT summing to
 * 3458.38 against a printed 3458.37. One cent out on each — rounding, not a
 * mismatch, and it must not warn.
 */
const gourmet = reconcileInvoiceTotals({
  lineExclSum: 23307.81,
  lineVatSum: 3458.38,
  lineTotalSum: 26766.19,
  extractedSubtotal: 23307.81,
  extractedVat: 3458.37,
  extractedTotal: 26766.18,
});
check("basis inclusive", gourmet.basis === "inclusive", `got ${gourmet.basis}`);
check("reconciled within tolerance", gourmet.reconciled === true, `maxAbsDiff ${gourmet.maxAbsDiff}`);
check("no rounding warning", gourmet.isRoundingDifference === false);
check("no major mismatch", gourmet.isMajorMismatch === false);

// ---------------------------------------------------------------------------
console.log("\n  4. A real mismatch is still caught");

const broken = draft(
  [
    { quantity: 1, unitPrice: 100, vat: 15, lineTotal: 115 },
    { quantity: 1, unitPrice: 200, vat: 30, lineTotal: 230 },
  ],
  { subtotal: 300, vat: 45, total: 500 }
);
const brokenSummary = summarizeInvoiceTotals(broken);
check("warning shown", brokenSummary.hasTotalsDifference === true);
check("classified as major", brokenSummary.hasMajorMismatch === true);
check("not reported as reconciled", brokenSummary.reconciled === false);

// ---------------------------------------------------------------------------
console.log("\n  5. Invariants — no input may produce a self-contradicting result");

/*
 * Swept rather than hand-picked. Each case asserts the properties that make the
 * three surfaces incapable of disagreeing, whatever the numbers happen to be.
 */
const sweep = [];
for (const net of [0, 12.5, 300, 1000, 26766.18]) {
  for (const rate of [0, 0.15]) {
    for (const drift of [0, 0.01, 0.04, 0.5, 0.99, 1.5, 45]) {
      for (const basis of ["inclusive", "exclusive"]) {
        const vatAmount = Math.round(net * rate * 100) / 100;
        const total = Math.round((net + vatAmount) * 100) / 100;
        sweep.push({
          lineExclSum: net,
          lineVatSum: vatAmount,
          lineTotalSum: (basis === "inclusive" ? total : net) + drift,
          extractedSubtotal: net,
          extractedVat: vatAmount,
          extractedTotal: total,
        });
      }
    }
  }
}

let contradictions = 0;
let toleranceViolations = 0;
let classificationOverlaps = 0;

for (const input of sweep) {
  const result = reconcileInvoiceTotals(input);

  // Reconciled and warning are mutually exclusive.
  if (result.reconciled && (result.isRoundingDifference || result.isMajorMismatch)) contradictions += 1;

  // Nothing warns inside the configured tolerance.
  if (result.verifiable && result.maxAbsDiff <= TOTALS_MATCH_TOLERANCE) {
    if (result.isRoundingDifference || result.isMajorMismatch) toleranceViolations += 1;
    if (!result.reconciled) toleranceViolations += 1;
  }

  // Rounding and major are never both true.
  if (result.isRoundingDifference && result.isMajorMismatch) classificationOverlaps += 1;
}

check(`reconciled never coexists with a warning (${sweep.length} cases)`, contradictions === 0, `${contradictions} contradictions`);
check(`nothing warns within ${TOTALS_MATCH_TOLERANCE} tolerance`, toleranceViolations === 0, `${toleranceViolations} violations`);
check("rounding and major mismatch are exclusive", classificationOverlaps === 0, `${classificationOverlaps} overlaps`);

// ---------------------------------------------------------------------------
console.log("\n  6. Every surface reads the same numbers");

/*
 * The banner, the difference panel and the footer all render from one
 * `InvoiceTotalsSummary`, and that summary is built from `reconcileInvoiceTotals`.
 * This asserts the wiring: if the summary ever diverged from the shared
 * calculation, the surfaces would silently disagree again.
 */
for (const [name, sample] of [["exclusive", exclusive], ["inclusive", inclusive], ["broken", broken]]) {
  const summary = summarizeInvoiceTotals(sample);
  const direct = reconcileInvoiceTotals({
    lineExclSum: summary.basis === "exclusive" ? summary.sumIncl - summary.sumVat : summary.sumExcl,
    lineVatSum: summary.sumVat,
    lineTotalSum: summary.basis === "exclusive" ? summary.sumExcl : summary.sumIncl,
    extractedSubtotal: summary.extractedSubtotal,
    extractedVat: summary.extractedVat,
    extractedTotal: summary.extractedTotal,
  });
  check(
    `${name}: summary matches the shared calculation`,
    summary.diffExcl === direct.diffExcl && summary.diffVat === direct.diffVat && summary.diffIncl === direct.diffIncl,
    `summary [${summary.diffExcl}, ${summary.diffVat}, ${summary.diffIncl}] vs shared [${direct.diffExcl}, ${direct.diffVat}, ${direct.diffIncl}]`
  );
  /*
   * Reconciled implies no banner. Stated one-directionally on purpose: the
   * converse does not hold, because an invoice with no comparable figures at
   * all is neither reconciled nor a mismatch, and asserting equivalence would
   * fail on it for the wrong reason.
   */
  check(
    `${name}: reconciled implies no warning banner`,
    !summary.reconciled || !summary.hasTotalsDifference,
    `hasTotalsDifference ${summary.hasTotalsDifference}, reconciled ${summary.reconciled}`
  );
  check(
    `${name}: a warning implies not reconciled`,
    !summary.hasTotalsDifference || !summary.reconciled,
    `hasTotalsDifference ${summary.hasTotalsDifference}, reconciled ${summary.reconciled}`
  );
}

// ---------------------------------------------------------------------------
console.log(
  `\n  ${checks - failures}/${checks} checks passed` +
    `   (match tolerance ${TOTALS_MATCH_TOLERANCE}, rounding limit ${ROUNDING_DIFFERENCE_LIMIT})\n`
);
process.exit(failures ? 1 : 0);
