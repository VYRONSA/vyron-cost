/**
 * VYRON — certification measurement helpers.
 *
 * Extracted from the certification harness so they can be tested directly.
 * The alternative — a flag that makes the harness run its live path against
 * fake data — would let someone produce a certification report that looks
 * measured and is not. There is deliberately no such flag.
 *
 * Family A under the Repository Safety Programme: pure computation plus
 * `existsSync`/`readFileSync` on a caller-supplied directory. No network, no
 * database, no writes.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Page count, measured from the file.
 *
 * Two independent readings — the page tree's `/Count` and the number of
 * `/Type /Page` objects — are cross-checked. They disagree, or neither is
 * visible, when the structure lives in a compressed object stream. In that case
 * this reports that it could not be determined rather than picking a number:
 * a wrong page count in a certification report is worse than an absent one.
 */
export function measurePageCount(bytes, mime) {
  if (mime !== "application/pdf") return { pages: 1, note: null };

  const text = bytes.toString("latin1");
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  const pageObjects = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const treeCount = counts.length ? Math.max(...counts) : null;

  if (treeCount !== null && pageObjects > 0 && treeCount === pageObjects) {
    return { pages: treeCount, note: null };
  }
  if (treeCount !== null && pageObjects === 0) return { pages: treeCount, note: "from page tree only" };
  if (treeCount === null && pageObjects > 0) return { pages: pageObjects, note: "from page objects only" };
  if (treeCount !== null && pageObjects > 0) {
    return { pages: null, note: `undetermined (tree says ${treeCount}, objects say ${pageObjects})` };
  }
  return { pages: null, note: "undetermined (compressed object stream)" };
}

export const normaliseText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.,]$/, "")
    .trim()
    .toLowerCase();

export function moneyEqual(a, b) {
  const x = Number(String(a ?? "").replace(/[^\d.-]/g, ""));
  const y = Number(String(b ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) < 0.005;
}

/**
 * OCR accuracy, MEASURED against a supplied answer key.
 *
 * Returns null when no ground truth exists for the document. Nothing here
 * infers accuracy from confidence, completeness or any other engine self-report
 * — those measure whether the engine thinks it read everything, not whether
 * what it read is correct. An unverified document is reported as unverified.
 */
export function measureAccuracy(extraction, truth) {
  if (!truth) return null;

  const headerChecks = [];
  const push = (field, expected, actual, equal) => {
    if (expected === undefined || expected === null || expected === "") return;
    headerChecks.push({ field, expected, actual, correct: equal(expected, actual) });
  };

  push("supplier", truth.supplier, extraction.supplier, (a, b) => normaliseText(a) === normaliseText(b));
  push("invoiceNo", truth.invoiceNo, extraction.invoiceNo, (a, b) => normaliseText(a) === normaliseText(b));
  push("invoiceDate", truth.invoiceDate, extraction.invoiceDate, (a, b) => normaliseText(a) === normaliseText(b));
  push("subtotal", truth.subtotal, extraction.subtotal, moneyEqual);
  push("vat", truth.vat, extraction.vat, moneyEqual);
  push("total", truth.total, extraction.total, moneyEqual);

  // Line comparison is positional. A missing row therefore misaligns everything
  // after it, which is correct: the operator would have to correct all of them.
  const truthLines = Array.isArray(truth.lineItems) ? truth.lineItems : null;
  const lineChecks = [];
  if (truthLines) {
    for (let i = 0; i < truthLines.length; i += 1) {
      const expected = truthLines[i];
      const actual = extraction.lineItems[i];
      const fields = [];
      if (expected.description !== undefined) {
        fields.push(normaliseText(expected.description) === normaliseText(actual?.description));
      }
      if (expected.quantity !== undefined) fields.push(moneyEqual(expected.quantity, actual?.quantity));
      if (expected.unitPrice !== undefined) fields.push(moneyEqual(expected.unitPrice, actual?.unitPrice));
      if (expected.lineTotal !== undefined) fields.push(moneyEqual(expected.lineTotal, actual?.lineTotal));
      lineChecks.push({ index: i, present: Boolean(actual), fields });
    }
  }

  const headerCorrect = headerChecks.filter((check) => check.correct).length;
  const lineFieldTotal = lineChecks.reduce((acc, row) => acc + row.fields.length, 0);
  const lineFieldCorrect = lineChecks.reduce((acc, row) => acc + row.fields.filter(Boolean).length, 0);
  const missingRows = lineChecks.filter((row) => !row.present).length;

  const totalFields = headerChecks.length + lineFieldTotal;
  const correctFields = headerCorrect + lineFieldCorrect;

  return {
    headerChecks,
    headerCorrect,
    headerTotal: headerChecks.length,
    lineFieldCorrect,
    lineFieldTotal,
    missingRows,
    fieldAccuracy: totalFields ? Math.round((correctFields / totalFields) * 1000) / 10 : null,
    // Every wrong or missing field is one an operator has to fix by hand.
    manualCorrections: totalFields - correctFields,
    wrongFields: headerChecks.filter((check) => !check.correct).map((check) => check.field),
  };
}

/** Ground-truth answer key, supplied alongside the documents. */
export function loadGroundTruth(dir) {
  for (const name of ["expected.json", "ground-truth.json"]) {
    const file = path.join(dir, name);
    if (existsSync(file)) {
      try {
        return { data: JSON.parse(readFileSync(file, "utf8")), file };
      } catch (error) {
        throw new Error(`${file} is not valid JSON: ${error.message}`);
      }
    }
  }
  return { data: null, file: null };
}

