#!/usr/bin/env node
/**
 * VYRON — supplier invoice extraction regression.
 *
 * Runs the SHIPPED extraction engine over the corpus in docs/evidence/corpus and
 * scores every numeric line field against a human-read answer key.
 *
 * WHAT IT MEASURES
 * ----------------
 * Per invoice: rows returned against rows on the document, and cell-level
 * accuracy for quantity, unit price, VAT and line total. Those four are the
 * fields the reference failure got wrong, and the only ones a wrong column
 * assignment can corrupt without changing the row count.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * Score against anything but a real answer key. A corpus entry without a key is
 * reported as NOT MEASURED and never counted as a pass. Certifying an extractor
 * against its own previous output would make every regression invisible.
 *
 * Family D under the Repository Safety Programme: sends real documents to
 * OpenAI, billable and irreversible, so VYRON_ACKNOWLEDGE_EXTERNAL=1 is required.
 *
 *   VYRON_ACKNOWLEDGE_EXTERNAL=1 node scripts/run-extraction-regression.mjs --documents ./corpus-pdfs
 *   ... --supplier gourmet-foods          only one supplier directory
 *   ... --report ./regression.json        write the full result
 *
 * Exits 0 when every measured invoice meets its baseline, 1 on a regression,
 * 2 on a usage or environment error.
 */

import { register } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const DOCUMENTS_DIR = value("--documents");
const SUPPLIER = value("--supplier");
const REPORT = value("--report");
const CORPUS_DIR = path.join("docs", "evidence", "corpus");

if (!DOCUMENTS_DIR) {
  console.error("\nUsage: --documents <dir with the source PDFs> [--supplier <name>] [--report <file>]\n");
  process.exit(2);
}

if (process.env.VYRON_ACKNOWLEDGE_EXTERNAL !== "1") {
  console.error(
    "\nThe regression sends every corpus document to OpenAI — billable and irreversible.\n" +
      "Re-run with VYRON_ACKNOWLEDGE_EXTERNAL=1 to acknowledge (Repository Safety Programme, Family D).\n"
  );
  process.exit(2);
}

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).replace(/^"|"$/g, "");
  }
}
loadEnvLocal();

const { runDocumentExtraction } = await import("../src/lib/vyron-document-extraction.ts");

/** Cell tolerance. Tighter than a cent so a swapped column can never pass. */
const TOLERANCE = 0.02;
const SCORED_FIELDS = ["quantity", "unitPrice", "vatAmount", "lineTotal"];

function loadCorpus() {
  if (!existsSync(CORPUS_DIR)) return [];
  const entries = [];
  for (const supplier of readdirSync(CORPUS_DIR)) {
    const supplierDir = path.join(CORPUS_DIR, supplier);
    if (!statSync(supplierDir).isDirectory()) continue;
    if (SUPPLIER && supplier !== SUPPLIER) continue;
    for (const file of readdirSync(supplierDir)) {
      if (!file.endsWith(".json")) continue;
      const key = JSON.parse(readFileSync(path.join(supplierDir, file), "utf8"));
      entries.push({ supplier, keyFile: path.join(supplierDir, file), key });
    }
  }
  return entries;
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreInvoice(extraction, key) {
  const expected = key.lineItems || [];
  let correct = 0;
  let scored = 0;
  const rowReports = [];

  for (const [index, want] of expected.entries()) {
    const got = extraction.lineItems[index];
    const cells = {};
    for (const field of SCORED_FIELDS) {
      scored += 1;
      if (!got) {
        cells[field] = { expected: want[field], actual: null, ok: false };
        continue;
      }
      const actual = numeric(got[field]);
      const ok = actual !== null && Math.abs(actual - Number(want[field])) <= TOLERANCE;
      if (ok) correct += 1;
      cells[field] = { expected: want[field], actual, ok };
    }
    rowReports.push({ index: index + 1, description: want.description, present: Boolean(got), cells });
  }

  return {
    rowsExpected: expected.length,
    rowsReturned: extraction.lineItems.length,
    cellsScored: scored,
    cellsCorrect: correct,
    cellAccuracy: scored ? Math.round((correct / scored) * 10000) / 100 : 0,
    rowReports,
  };
}

function findSourceFile(key) {
  const direct = path.join(DOCUMENTS_DIR, key.sourceFile || "");
  if (key.sourceFile && existsSync(direct)) return direct;
  const byInvoice = readdirSync(DOCUMENTS_DIR).find((file) => file.includes(String(key.invoiceNumber)));
  return byInvoice ? path.join(DOCUMENTS_DIR, byInvoice) : null;
}

const corpus = loadCorpus();
if (!corpus.length) {
  console.error(`\nNo answer keys found under ${CORPUS_DIR}${SUPPLIER ? ` for supplier ${SUPPLIER}` : ""}.\n`);
  process.exit(2);
}

console.log(`\n  VYRON — supplier invoice extraction regression`);
console.log(`  Corpus: ${corpus.length} answer key(s)   Documents: ${path.resolve(DOCUMENTS_DIR)}\n`);

const results = [];
let regressions = 0;
let notMeasured = 0;

for (const entry of corpus) {
  const source = findSourceFile(entry.key);
  if (!source) {
    notMeasured += 1;
    console.log(`  NOT MEASURED  ${entry.supplier}/${entry.key.invoiceNumber} — source document not found in --documents`);
    results.push({ supplier: entry.supplier, invoice: entry.key.invoiceNumber, measured: false });
    continue;
  }

  const bytes = readFileSync(source);
  const mime = source.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : source.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

  const startedAt = Date.now();
  let run;
  try {
    run = await runDocumentExtraction({ fileName: path.basename(source), mime, bytes });
  } catch (error) {
    regressions += 1;
    console.log(`  FAIL          ${entry.supplier}/${entry.key.invoiceNumber} — extraction threw: ${error.message}`);
    results.push({ supplier: entry.supplier, invoice: entry.key.invoiceNumber, measured: true, error: String(error.message) });
    continue;
  }

  const wallClockMs = Date.now() - startedAt;
  const score = scoreInvoice(run.extraction, entry.key);
  const rowsOk = score.rowsReturned === score.rowsExpected;
  const cellsOk = score.cellsCorrect === score.cellsScored;
  const pass = rowsOk && cellsOk;
  if (!pass) regressions += 1;

  console.log(
    `  ${pass ? "PASS        " : "REGRESSION  "}  ${entry.supplier}/${entry.key.invoiceNumber}  ` +
      `rows ${score.rowsReturned}/${score.rowsExpected}  cells ${score.cellsCorrect}/${score.cellsScored} (${score.cellAccuracy}%)  ` +
      `arithmetic=${run.extraction.lineArithmetic.status}  vision=${run.log.visionClass}  ` +
      `attempts=${run.log.attempts.length}  ${wallClockMs}ms  ${run.usage?.totalTokens ?? 0} tokens`
  );

  if (!pass) {
    for (const row of score.rowReports) {
      const bad = Object.entries(row.cells).filter(([, cell]) => !cell.ok);
      if (!bad.length) continue;
      console.log(
        `                  row ${row.index} ${String(row.description).slice(0, 34)}: ` +
          bad.map(([field, cell]) => `${field} ${cell.actual} != ${cell.expected}`).join(", ")
      );
    }
  }

  results.push({
    supplier: entry.supplier,
    invoice: entry.key.invoiceNumber,
    measured: true,
    pass,
    ...score,
    rowReports: undefined,
    arithmeticStatus: run.extraction.lineArithmetic.status,
    completenessStatus: run.extraction.completeness.status,
    visionClass: run.log.visionClass,
    tableVisionUsed: run.log.tableVision.length > 0,
    attempts: run.log.attempts.length,
    wallClockMs,
    totalTokens: run.usage?.totalTokens ?? 0,
    rows: score.rowReports,
  });
}

const measured = results.filter((result) => result.measured && !result.error);
const summary = {
  corpusSize: corpus.length,
  measured: measured.length,
  notMeasured,
  passed: measured.filter((result) => result.pass).length,
  regressions,
  averageCellAccuracy: measured.length
    ? Math.round((measured.reduce((sum, r) => sum + r.cellAccuracy, 0) / measured.length) * 100) / 100
    : null,
  averageWallClockMs: measured.length
    ? Math.round(measured.reduce((sum, r) => sum + r.wallClockMs, 0) / measured.length)
    : null,
  averageTokens: measured.length
    ? Math.round(measured.reduce((sum, r) => sum + r.totalTokens, 0) / measured.length)
    : null,
};

console.log(
  `\n  Measured ${summary.measured}/${summary.corpusSize}   Passed ${summary.passed}   Regressions ${summary.regressions}` +
    (summary.notMeasured ? `   NOT MEASURED ${summary.notMeasured} (no source document)` : "")
);
if (summary.averageCellAccuracy !== null) {
  console.log(
    `  Average cell accuracy ${summary.averageCellAccuracy}%   average ${summary.averageWallClockMs}ms   average ${summary.averageTokens} tokens`
  );
}

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({ summary, results }, null, 2), "utf8");
  console.log(`  Report written to ${path.resolve(REPORT)}`);
}

console.log(regressions ? "\n  REGRESSION DETECTED\n" : "\n  All measured invoices met their baseline\n");
process.exit(regressions ? 1 : 0);
