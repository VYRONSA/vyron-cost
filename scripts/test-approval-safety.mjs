#!/usr/bin/env node
/**
 * VYRON — approval safety regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (PCP-038, measured)
 * -----------------------------------------------------
 * A scanned invoice extracted with:
 *
 *   arithmetic   = Fail
 *   completeness = Incomplete [column-mapping-failed]
 *
 * — the exact failure this programme exists to catch, where VAT was read from a
 * WEIGHT column — passed approval validation with ZERO violations. Approving it
 * writes wrong unit costs into inventory and costing, where the error stops
 * being visible and starts compounding.
 *
 * Root cause: `validateDocumentApproval` inspected the document's fields and
 * lines but never the extraction's own verdict on itself.
 *
 * WHY IT CANNOT RECUR
 * -------------------
 * Approval now consults the extraction quality record, and this test asserts
 * both directions: a sound extraction approves, and each unsound condition
 * blocks. There is ONE approval path — `/api/documents/[id]/review/approve` —
 * and bulk approval fans out to it, so covering the shared validator covers
 * every route capable of approving a supplier invoice.
 *
 * Family A: pure computation. No network, no database, no API key.
 *
 *   npm run test:approval-safety
 */

import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./support/ts-alias-hook.mjs", import.meta.url);

const { validateDocumentApproval } = await import("../src/lib/vyron-document-approval-validation.ts");
const { DEFAULT_APPROVAL_RULES } = await import("../src/lib/vyron-document-approval-rules.ts");

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

/** A document and lines that satisfy every non-extraction rule. */
function soundDocument() {
  return {
    document: {
      supplier_name: "Gourmet Foods on the Go",
      invoice_number: "02252489",
      invoice_date: "2026-07-02",
      purchase_order_number: "PO-4526",
      supplier_vat_number: "4350250850",
      subtotal: 300,
      vat: 45,
      total: 345,
      field_confidence: { supplier: 95, invoiceNo: 95, invoiceDate: 95, total: 95 },
    },
    lines: [
      { ignored: false, matched_entity_id: "e1", matched_entity_type: "ingredient", quantity: 1, unit_price: 100, vat: 15, line_total: 115 },
      { ignored: false, matched_entity_id: "e2", matched_entity_type: "ingredient", quantity: 1, unit_price: 200, vat: 30, line_total: 230 },
    ],
    rules: { ...DEFAULT_APPROVAL_RULES, requirePurchaseOrder: false },
  };
}

function quality(overrides) {
  return {
    schemaVersion: 1,
    classification: "Verified",
    quality: 100,
    qualityBand: "Excellent",
    completenessStatus: "Complete",
    completenessPercentage: 100,
    declaredLineCount: 2,
    extractedLineCount: 2,
    retryCount: 0,
    retryReasons: [],
    reconciliationStatus: "Reconciled",
    columnMappingFailed: false,
    reconciliationVariance: 0,
    missingFields: [],
    warnings: [],
    modelUsed: "gpt-4o",
    confidence: 95,
    ...overrides,
  };
}

const rulesOf = (r) => r.violations.map((v) => v.rule);

console.log("\n  VYRON — approval safety\n");

// ---------------------------------------------------------------------------
console.log("  PASS CASES — a sound extraction must approve");

const soundResult = validateDocumentApproval({ ...soundDocument(), extractionQuality: quality({}) });
check("verified, complete, reconciled extraction approves", soundResult.ok && !soundResult.blocked, `violations: ${JSON.stringify(rulesOf(soundResult))}`);
check("no extraction violations raised", !rulesOf(soundResult).some((r) => r.startsWith("extraction_")), JSON.stringify(rulesOf(soundResult)));

/*
 * Documents extracted before extraction quality shipped carry no record. They
 * must remain approvable — retroactively blocking work a person already
 * reviewed would be a regression, not a safety improvement.
 */
const legacyResult = validateDocumentApproval({ ...soundDocument(), extractionQuality: null });
check("legacy document with no quality record still approves", legacyResult.ok && !legacyResult.blocked, JSON.stringify(rulesOf(legacyResult)));

// ---------------------------------------------------------------------------
console.log("\n  FAIL CASES — each unsound condition must block");

const failCases = [
  ["incomplete extraction", { completenessStatus: "Incomplete" }, "extraction_incomplete"],
  ["failed reconciliation", { reconciliationStatus: "Not reconciled" }, "extraction_totals_not_reconciled"],
  ["column mapping failure", { columnMappingFailed: true }, "extraction_column_mapping_failed"],
];

for (const [label, overrides, expectedRule] of failCases) {
  const result = validateDocumentApproval({ ...soundDocument(), extractionQuality: quality(overrides) });
  check(`${label} blocks approval`, result.blocked === true, `blocked=${result.blocked} violations=${JSON.stringify(rulesOf(result))}`);
  check(`${label} raises ${expectedRule}`, rulesOf(result).includes(expectedRule), JSON.stringify(rulesOf(result)));
}

/*
 * The measured production case: the Gourmet Foods scanned invoice, whose VAT
 * column was read from the WEIGHT column beside it.
 */
const gourmet = validateDocumentApproval({
  ...soundDocument(),
  extractionQuality: quality({
    classification: "Incomplete",
    completenessStatus: "Incomplete",
    columnMappingFailed: true,
    reconciliationStatus: "Not reconciled",
  }),
});
check("the measured production failure blocks approval", gourmet.blocked === true, `violations=${JSON.stringify(rulesOf(gourmet))}`);
check(
  "all three extraction reasons are reported together",
  ["extraction_incomplete", "extraction_totals_not_reconciled", "extraction_column_mapping_failed"].every((r) => rulesOf(gourmet).includes(r)),
  JSON.stringify(rulesOf(gourmet))
);

// ---------------------------------------------------------------------------
console.log("\n  OPERATOR LANGUAGE — no internal codes in the message text");

const allMessages = gourmet.violations.filter((v) => v.rule.startsWith("extraction_")).map((v) => v.message);
check("every extraction message is plain English", allMessages.length === 3);
for (const message of allMessages) {
  check(
    `no internal code in: "${message.slice(0, 44)}..."`,
    !/COLUMN_MAPPING_FAILED|extraction_[a-z_]+|Incomplete\b|Not reconciled|arithmetic|lineArithmetic/.test(message),
    message
  );
}
check("machine codes are still available in `rule` for diagnostics", rulesOf(gourmet).every((r) => /^[a-z_]+$/.test(r)), JSON.stringify(rulesOf(gourmet)));

// ---------------------------------------------------------------------------
console.log("\n  APPROVAL PATHS — no route may bypass the shared validator");

const approveSource = readFileSync("src/app/api/documents/[id]/review/approve/route.ts", "utf8");
const validateSource = readFileSync("src/app/api/documents/[id]/review/validate/route.ts", "utf8");
const bulkSource = readFileSync("src/app/api/documents/bulk-approve/route.ts", "utf8");

check("approve route passes extractionQuality", /validateDocumentApproval\(\{[\s\S]{0,200}extractionQuality:/.test(approveSource));
check("validate route passes extractionQuality", /validateDocumentApproval\(\{[\s\S]{0,200}extractionQuality:/.test(validateSource));
check(
  "bulk approve delegates to the single approve route",
  bulkSource.includes("/review/approve"),
  "bulk approve must not implement its own approval logic"
);
check(
  "approve route blocks when validation blocks",
  /if \(validation\.blocked\)[\s\S]{0,800}status:\s*400/.test(approveSource),
  "no 400 response found for a blocked validation"
);

console.log(`\n  ${checks - failures}/${checks} checks passed\n`);
process.exit(failures ? 1 : 0);
