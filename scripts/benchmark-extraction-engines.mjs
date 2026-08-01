#!/usr/bin/env node
/**
 * VYRON — v1 vs v2 extraction engine benchmark.
 *
 * Runs BOTH engines over the same documents and records, per document per
 * engine: extraction time, model calls, token usage, rows extracted, arithmetic
 * validation, manual corrections required, and final acceptance status.
 *
 * This is the evidence that decides whether v1 can be retired. v1 may only be
 * removed once v2 equals or exceeds it on every document class across multiple
 * runs, so each document is repeated and results are reported per class.
 *
 * Documents without an answer key are still run and timed, but their accuracy is
 * reported as NOT MEASURED and cannot count toward retiring v1. Treating "no
 * errors found" as "correct" is how the original defect survived undetected.
 *
 * Family D under the Repository Safety Programme: sends real documents to
 * OpenAI, billable and irreversible.
 *
 *   VYRON_ACKNOWLEDGE_EXTERNAL=1 node scripts/benchmark-extraction-engines.mjs \
 *     --documents ./corpus-pdfs --runs 3 --report ./benchmark.json
 */

import { register } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const DOCUMENTS_DIR = value("--documents");
const RUNS = Math.max(1, Number(value("--runs") || 1));
const REPORT = value("--report");
const CORPUS_DIR = path.join("docs", "evidence", "corpus");

if (!DOCUMENTS_DIR) {
  console.error("\nUsage: --documents <dir> [--runs N] [--report <file>]\n");
  process.exit(2);
}
if (process.env.VYRON_ACKNOWLEDGE_EXTERNAL !== "1") {
  console.error("\nBenchmark calls OpenAI for every document and engine. Re-run with VYRON_ACKNOWLEDGE_EXTERNAL=1.\n");
  process.exit(2);
}

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).replace(/^"|"$/g, "");
}

const { runDocumentExtraction } = await import("../src/lib/vyron-document-extraction.ts");
const { runDocumentExtractionV2 } = await import("../src/lib/vyron-invoice-extraction-v2.ts");

const TOLERANCE = 0.02;
const FIELDS = ["quantity", "unitPrice", "vatAmount", "lineTotal"];

function loadKeys() {
  if (!existsSync(CORPUS_DIR)) return [];
  const keys = [];
  for (const supplier of readdirSync(CORPUS_DIR)) {
    const dir = path.join(CORPUS_DIR, supplier);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".json")) keys.push(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
    }
  }
  return keys;
}

const numeric = (input) => {
  const parsed = Number(String(input ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function score(extraction, key) {
  if (!key) return { measured: false };
  let correct = 0;
  let cells = 0;
  for (const [index, want] of key.lineItems.entries()) {
    const got = extraction.lineItems[index];
    for (const field of FIELDS) {
      cells += 1;
      const actual = got ? numeric(got[field]) : null;
      if (actual !== null && Math.abs(actual - Number(want[field])) <= TOLERANCE) correct += 1;
    }
  }
  return {
    measured: true,
    cells,
    correct,
    cellAccuracy: cells ? Math.round((correct / cells) * 10000) / 100 : 0,
    rowsExpected: key.lineItems.length,
    /** Cells a person would have to retype by hand to make the document correct. */
    manualCorrections: cells - correct,
  };
}

const keys = loadKeys();
const files = readdirSync(DOCUMENTS_DIR).filter((file) => /\.(pdf|png|jpe?g)$/i.test(file));
if (!files.length) {
  console.error(`\nNo documents found in ${DOCUMENTS_DIR}\n`);
  process.exit(2);
}

console.log(`\n  VYRON — extraction engine benchmark`);
console.log(`  Documents: ${files.length}   Runs each: ${RUNS}   Answer keys available: ${keys.length}\n`);

const rows = [];

for (const file of files) {
  const bytes = readFileSync(path.join(DOCUMENTS_DIR, file));
  const mime = /\.pdf$/i.test(file) ? "application/pdf" : /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  const key = keys.find((entry) => entry.sourceFile === file || file.includes(String(entry.invoiceNumber))) || null;

  for (const engine of ["v1", "v2"]) {
    const run = engine === "v1" ? runDocumentExtraction : runDocumentExtractionV2;

    for (let attempt = 1; attempt <= RUNS; attempt += 1) {
      const startedAt = Date.now();
      let result = null;
      let error = null;
      try {
        result = await run({ fileName: file, mime, bytes });
      } catch (thrown) {
        error = thrown instanceof Error ? thrown.message : String(thrown);
      }
      const wallClockMs = Date.now() - startedAt;

      if (error) {
        rows.push({ file, documentClass: key?.characteristics?.join(",") ?? "unclassified", engine, attempt, error, wallClockMs });
        console.log(`  ${engine}  run ${attempt}  ${file.slice(0, 34).padEnd(34)}  ERROR ${error.slice(0, 60)}`);
        continue;
      }

      const scored = score(result.extraction, key);
      const accepted =
        result.extraction.completeness.status !== "Incomplete" && result.extraction.lineArithmetic.status !== "Fail";
      const modelCalls = result.log.attempts.length + (result.log.tableVision?.length ?? 0) * 2;

      rows.push({
        file,
        documentClass: key?.characteristics?.join(",") ?? "unclassified",
        engine,
        attempt,
        wallClockMs,
        modelCalls,
        totalTokens: result.usage?.totalTokens ?? 0,
        rowsExtracted: result.extraction.lineItems.length,
        arithmetic: result.extraction.lineArithmetic.status,
        completeness: result.extraction.completeness.status,
        acceptance: accepted ? "accepted" : "manual-review",
        ...scored,
      });

      console.log(
        `  ${engine}  run ${attempt}  ${file.slice(0, 34).padEnd(34)}  ` +
          `rows ${String(result.extraction.lineItems.length).padStart(2)}${scored.measured ? `/${scored.rowsExpected}` : "   "}  ` +
          `${scored.measured ? `cells ${String(scored.correct).padStart(3)}/${String(scored.cells).padEnd(3)} (${String(scored.cellAccuracy).padStart(6)}%)` : "accuracy NOT MEASURED  "}  ` +
          `${result.extraction.lineArithmetic.status.padEnd(10)} ${accepted ? "accepted     " : "manual-review"}  ` +
          `${String(wallClockMs).padStart(6)}ms  ${String(result.usage?.totalTokens ?? 0).padStart(6)} tok  ${modelCalls} calls`
      );
    }
  }
}

function aggregate(engine) {
  const mine = rows.filter((row) => row.engine === engine && !row.error);
  const measured = mine.filter((row) => row.measured);
  const average = (list, pick) => (list.length ? Math.round(list.reduce((sum, row) => sum + pick(row), 0) / list.length) : null);
  return {
    engine,
    runs: mine.length,
    errors: rows.filter((row) => row.engine === engine && row.error).length,
    measuredRuns: measured.length,
    averageCellAccuracy: measured.length
      ? Math.round((measured.reduce((sum, row) => sum + row.cellAccuracy, 0) / measured.length) * 100) / 100
      : null,
    perfectRuns: measured.filter((row) => row.correct === row.cells).length,
    averageWallClockMs: average(mine, (row) => row.wallClockMs),
    averageTokens: average(mine, (row) => row.totalTokens),
    averageModelCalls: average(mine, (row) => row.modelCalls),
    totalManualCorrections: measured.reduce((sum, row) => sum + row.manualCorrections, 0),
    accepted: mine.filter((row) => row.acceptance === "accepted").length,
  };
}

const summary = { v1: aggregate("v1"), v2: aggregate("v2") };

console.log(`\n  ${"metric".padEnd(24)}${"v1".padEnd(16)}v2`);
for (const metric of [
  "averageCellAccuracy",
  "perfectRuns",
  "measuredRuns",
  "averageWallClockMs",
  "averageTokens",
  "averageModelCalls",
  "totalManualCorrections",
  "accepted",
  "errors",
]) {
  console.log(`  ${metric.padEnd(24)}${String(summary.v1[metric] ?? "—").padEnd(16)}${summary.v2[metric] ?? "—"}`);
}

const unmeasured = [...new Set(rows.filter((row) => !row.measured && !row.error).map((row) => row.file))];
if (unmeasured.length) {
  console.log(`\n  NOT MEASURED for accuracy — no answer key: ${unmeasured.join(", ")}`);
  console.log(`  These documents cannot count toward retiring v1.`);
}

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({ summary, rows }, null, 2), "utf8");
  console.log(`\n  Report written to ${path.resolve(REPORT)}`);
}
console.log();
