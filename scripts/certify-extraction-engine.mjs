#!/usr/bin/env node
/**
 * VYRON — Supplier Invoice Extraction Engine certification.
 *
 * Runs a document profile suite through the SHIPPED extraction engine and
 * records, per profile: extraction quality, completeness, retry behaviour,
 * processing time and final classification.
 *
 * TWO MODES
 * ---------
 *   default            Synthetic suite. `fetch` is stubbed, so no OpenAI
 *                      request is made and no AI allowance is consumed.
 *                      Family A under the Repository Safety Programme.
 *
 *   --documents <dir>  Live suite against real documents. Every file in the
 *                      directory is sent to OpenAI. Family D — external,
 *                      billable, irreversible — and therefore requires
 *                      VYRON_ACKNOWLEDGE_EXTERNAL=1 and a real API key.
 *
 * WHAT THE SYNTHETIC MODE DOES AND DOES NOT CERTIFY
 * -------------------------------------------------
 * It certifies the engine's DECISION LOGIC: that each document profile is
 * classified, scored, retried and reconciled the way the specification says,
 * including the profiles that are hardest to get right (multi-page, credit
 * note, low-quality scan, statement).
 *
 * It does NOT certify OCR accuracy. Whether the model reads a smudged fax
 * correctly can only be measured against real documents with known correct
 * values, which is what --documents exists for. Processing time in synthetic
 * mode measures the engine around a stubbed transport, not a real API call, and
 * is reported as such.
 *
 *   node scripts/certify-extraction-engine.mjs
 *   node scripts/certify-extraction-engine.mjs --documents ./kingdom-foods
 *
 * Exits 0 when every profile meets its expected classification.
 */

import { register } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);

import {
  loadGroundTruth,
  measureAccuracy,
  measurePageCount,
} from "./support/certification-measurements.mjs";

const { runDocumentExtraction } = await import("../src/lib/vyron-document-extraction.ts");

const MISSING = "Needs Review";
const args = process.argv.slice(2);
const documentsDir = args.includes("--documents") ? args[args.indexOf("--documents") + 1] : null;
const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
const LIVE = Boolean(documentsDir);

// ---------------------------------------------------------------------------
// Measurement helpers for the live certification report
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Synthetic document profiles
// ---------------------------------------------------------------------------

function line(index, each, vat = 0) {
  return {
    description: `Product ${index + 1}`,
    quantity: "1",
    unit: "EA",
    unitPrice: String(each),
    vatAmount: String(vat),
    lineTotal: String(each),
    skuOrProductCode: `SKU-${index + 1}`,
    confidenceScore: 92,
  };
}

function invoice({
  rows,
  declared,
  each = 100,
  vat = 0,
  documentType = "Supplier Invoice",
  header = true,
  confidence = 92,
  subtotalOverride,
}) {
  const subtotal = subtotalOverride ?? rows * each;
  return {
    supplier: header ? "Kingdom Foods Distribution (Pty) Ltd" : MISSING,
    invoiceNo: header ? "KF-2026-004417" : MISSING,
    invoiceDate: header ? "2026-07-21" : MISSING,
    customerName: "Handcrafted Food Products",
    supplierVatNo: header ? "4210987654" : MISSING,
    subtotal,
    vat,
    total: subtotal + vat,
    currency: "ZAR",
    confidence,
    documentType,
    visibleLineItemCount: declared,
    lineItems: Array.from({ length: rows }, (_, i) => line(i, each)),
    warnings: [],
    rawDetectedText: documentType,
  };
}

/**
 * The seven document classes named in the certification directive.
 *
 * `responses` is the scripted sequence of model outputs — one entry per
 * attempt — so a profile can exercise the retry path deterministically.
 */
const PROFILES = [
  {
    name: "Small invoice (3 lines)",
    expect: "Verified",
    responses: [invoice({ rows: 3, declared: 3 })],
  },
  {
    name: "Medium invoice (12 lines)",
    expect: "Verified",
    responses: [invoice({ rows: 12, declared: 12 })],
  },
  {
    name: "Large invoice (48 lines)",
    expect: "Verified",
    responses: [invoice({ rows: 48, declared: 48 })],
  },
  {
    name: "Multi-page invoice (40 lines, page 2 dropped)",
    // Not Verified: the specification lists "retry required" as a Needs Review
    // trigger, and this profile only became complete on the second attempt.
    // Recovering the missing page is the win; hiding that it took two attempts
    // would not be.
    expect: "Needs Review",
    // The defect this programme exists to fix: page 1 returns, page 2 does not.
    // The reinforced retry must recover it.
    responses: [
      invoice({ rows: 18, declared: 40, subtotalOverride: 4000 }),
      invoice({ rows: 40, declared: 40 }),
    ],
  },
  {
    name: "Low-quality scan (rows unreadable after retries)",
    expect: "Incomplete",
    responses: [
      invoice({ rows: 4, declared: 15, subtotalOverride: 1500, confidence: 55 }),
      invoice({ rows: 6, declared: 15, subtotalOverride: 1500, confidence: 58 }),
      invoice({ rows: 5, declared: 15, subtotalOverride: 1500, confidence: 51 }),
    ],
  },
  {
    name: "Supplier statement (no line items, statement total)",
    // Not Incomplete: a statement lists invoices, not products, so its empty
    // lineItems is correct rather than truncated. It still warrants an
    // operator's eye — it is not an invoice — which is exactly Needs Review.
    // Must complete in ONE call: retrying a statement for rows it never had
    // costs money and finds nothing.
    expect: "Needs Review",
    maxCalls: 1,
    responses: [
      {
        ...invoice({ rows: 0, declared: 0, documentType: "Supplier Statement" }),
        subtotal: 48250.0,
        vat: 7237.5,
        total: 55487.5,
      },
    ],
  },
  {
    name: "Credit note (negative values, 4 lines)",
    expect: "Verified",
    responses: [
      {
        ...invoice({ rows: 0, declared: 4, documentType: "Credit Note" }),
        subtotal: -400,
        vat: -60,
        total: -460,
        lineItems: Array.from({ length: 4 }, (_, i) => ({
          ...line(i, -100, -15),
          lineTotal: "-100",
        })),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
let scripted = [];
let callCount = 0;

function installStub(responses) {
  scripted = responses;
  callCount = 0;
  globalThis.fetch = async () => {
    const body = scripted[Math.min(callCount, scripted.length - 1)];
    callCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: JSON.stringify(body),
        usage: { input_tokens: 1200, output_tokens: 900, total_tokens: 2100 },
      }),
    };
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function liveCases(dir) {
  const resolved = path.resolve(dir);
  if (!statSync(resolved).isDirectory()) throw new Error(`${resolved} is not a directory.`);
  const { data: truth, file: truthFile } = loadGroundTruth(resolved);
  const cases = readdirSync(resolved)
    .filter((name) => MIME_BY_EXT[path.extname(name).toLowerCase()])
    .sort()
    .map((name) => ({
      name,
      expect: null,
      file: path.join(resolved, name),
      mime: MIME_BY_EXT[path.extname(name).toLowerCase()],
      truth: truth?.[name] ?? null,
    }));
  return { cases, truthFile, truthCount: cases.filter((entry) => entry.truth).length };
}

if (!LIVE) {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-certification-harness-not-a-real-key";
} else if (process.env.VYRON_ACKNOWLEDGE_EXTERNAL !== "1") {
  console.error(
    "\nLive certification calls OpenAI for every document — billable and irreversible.\n" +
      "Re-run with VYRON_ACKNOWLEDGE_EXTERNAL=1 to acknowledge (Repository Safety Programme, Family D).\n"
  );
  process.exit(2);
}

const live = LIVE ? liveCases(documentsDir) : null;
const cases = LIVE ? live.cases : PROFILES;
if (!cases.length) {
  console.error(`No supported documents found in ${documentsDir}.`);
  process.exit(2);
}

if (LIVE) {
  console.log(`\n  Documents: ${cases.length}`);
  if (live.truthFile) {
    console.log(`  Answer key: ${live.truthFile} — ${live.truthCount}/${cases.length} documents covered`);
  } else {
    console.log(
      `  Answer key: NONE FOUND.\n` +
        `  Expected line count, OCR accuracy and manual corrections CANNOT BE MEASURED without one.\n` +
        `  Supply expected.json in the documents directory to certify accuracy.`
    );
  }
}

// The engine logs rejected attempts by design; the table below is the report.
const realWarn = console.warn;
const realError = console.error;
console.warn = () => {};
console.error = () => {};

const results = [];
try {
  for (const testCase of cases) {
    if (!LIVE) installStub(testCase.responses);

    const bytes = LIVE ? readFileSync(testCase.file) : Buffer.from("%PDF-1.4 synthetic profile");
    const mime = LIVE ? testCase.mime : "application/pdf";
    const pageInfo = LIVE ? measurePageCount(bytes, mime) : { pages: null, note: null };
    const startedAt = Date.now();

    try {
      const result = await runDocumentExtraction({ fileName: testCase.name, mime, bytes });
      const q = result.quality;
      const accuracy = LIVE ? measureAccuracy(result.extraction, testCase.truth) : null;
      results.push({
        name: testCase.name,
        expect: testCase.expect,
        // Measured from the document itself, never inferred.
        invoiceType: LIVE ? result.extraction.documentType : null,
        supplier: LIVE ? result.extraction.supplier : null,
        pages: pageInfo.pages,
        pagesNote: pageInfo.note,
        expectedLines: testCase.truth?.expectedLineCount ?? null,
        classification: q.classification,
        quality: q.quality,
        band: q.qualityBand,
        completeness: q.completenessPercentage,
        declared: q.declaredLineCount,
        extracted: q.extractedLineCount,
        retries: q.retryCount,
        retryReasons: q.retryReasons,
        reconciliation: q.reconciliationStatus,
        accuracy,
        ms: Date.now() - startedAt,
        calls: LIVE ? null : callCount,
        ok:
          (testCase.expect === null || q.classification === testCase.expect) &&
          (LIVE || testCase.maxCalls === undefined || callCount <= testCase.maxCalls),
        error:
          !LIVE && testCase.maxCalls !== undefined && callCount > testCase.maxCalls
            ? `used ${callCount} API calls, budget is ${testCase.maxCalls}`
            : null,
      });
    } catch (error) {
      results.push({
        name: testCase.name,
        expect: testCase.expect,
        invoiceType: null,
        supplier: null,
        pages: pageInfo.pages,
        pagesNote: pageInfo.note,
        expectedLines: testCase.truth?.expectedLineCount ?? null,
        classification: "EXTRACTION FAILED",
        quality: 0,
        band: "Poor",
        completeness: null,
        declared: null,
        extracted: 0,
        retries: 0,
        retryReasons: [],
        reconciliation: "Not verifiable",
        accuracy: null,
        ms: Date.now() - startedAt,
        calls: LIVE ? null : callCount,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
} finally {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);
const num = (value, width) => String(value ?? "—").padStart(width);

console.log(`\n${"=".repeat(118)}`);
console.log(`  VYRON COST — SUPPLIER INVOICE EXTRACTION ENGINE CERTIFICATION`);
console.log(`  Mode: ${LIVE ? `LIVE against ${path.resolve(documentsDir)}` : "SYNTHETIC PROFILE SUITE (no OpenAI call)"}`);
console.log("=".repeat(118));
console.log(
  `  ${pad("Document profile", 52)}${pad("Class", 14)}${num("Qual", 5)}  ${num("Compl", 6)}  ${num("Rows", 8)}  ${num("Retry", 5)}  ${num("Calls", 5)}  ${pad("  Totals", 17)}${num("ms", 5)}`
);
console.log("-".repeat(118));

for (const row of results) {
  const rows = row.declared === null ? String(row.extracted) : `${row.extracted}/${row.declared}`;
  console.log(
    `  ${row.ok ? " " : "!"}${pad(row.name, 51)}${pad(row.classification, 14)}${num(row.quality, 5)}  ${num(
      row.completeness === null ? "—" : `${row.completeness}%`,
      6
    )}  ${num(rows, 8)}  ${num(row.retries, 5)}  ${num(row.calls, 5)}  ${pad(`  ${row.reconciliation}`, 17)}${num(row.ms, 5)}`
  );
  if (row.error) console.log(`     ${row.error}`);
}

console.log("-".repeat(118));

/*
 * The live certification report.
 *
 * Every column is measured. Where a measurement is impossible — no answer key,
 * a page count hidden in a compressed object stream — the cell says so rather
 * than carrying an estimate. "No estimated accuracy, only measured results"
 * means an absent measurement must be visibly absent.
 */
if (LIVE) {
  const cell = (value) => (value === null || value === undefined || value === "" ? "not measured" : String(value));
  const rows = results.map((row) => {
    const a = row.accuracy;
    return [
      row.name,
      cell(row.invoiceType),
      cell(row.supplier),
      row.pages === null ? cell(row.pagesNote) : String(row.pages),
      cell(row.expectedLines),
      cell(row.declared),
      String(row.extracted),
      row.completeness === null ? "not measurable" : `${row.completeness}%`,
      `${row.quality}% (${row.band})`,
      String(row.retries),
      row.retryReasons.length ? row.retryReasons.join("; ") : "none",
      `${row.ms} ms`,
      row.classification,
      a
        ? `${a.fieldAccuracy}% of ${a.headerTotal + a.lineFieldTotal} fields` +
          (a.missingRows ? `; ${a.missingRows} row(s) absent` : "") +
          (a.wrongFields.length ? `; wrong: ${a.wrongFields.join(", ")}` : "")
        : "no answer key — not measured",
      a ? String(a.manualCorrections) : "no answer key — not measured",
    ];
  });

  const headers = [
    "Document", "Invoice type", "Supplier", "Pages", "Expected lines", "Declared", "Extracted",
    "Completeness", "Extraction quality", "Retries", "Retry reason", "Duration",
    "Classification", "OCR accuracy (measured)", "Manual corrections",
  ];

  const md = [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map((value) => String(value).replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");

  const withTruth = results.filter((row) => row.accuracy);
  const summary = [
    "",
    `- Documents processed: **${results.length}**`,
    `- Answer key coverage: **${withTruth.length}/${results.length}**`,
    withTruth.length
      ? `- Measured field accuracy across covered documents: **${
          Math.round(
            (withTruth.reduce((acc, row) => acc + row.accuracy.headerCorrect + row.accuracy.lineFieldCorrect, 0) /
              Math.max(
                1,
                withTruth.reduce((acc, row) => acc + row.accuracy.headerTotal + row.accuracy.lineFieldTotal, 0)
              )) *
              1000
          ) / 10
        }%**`
      : "- Measured field accuracy: **not measurable — no answer key supplied**",
    withTruth.length
      ? `- Total manual corrections required: **${withTruth.reduce((acc, row) => acc + row.accuracy.manualCorrections, 0)}**`
      : "- Manual corrections: **not measurable — no answer key supplied**",
    `- Classification: Verified ${results.filter((r) => r.classification === "Verified").length} · Needs Review ${results.filter((r) => r.classification === "Needs Review").length} · Incomplete ${results.filter((r) => r.classification === "Incomplete").length} · Failed ${results.filter((r) => r.classification === "EXTRACTION FAILED").length}`,
    `- Retried: ${results.filter((r) => r.retries > 0).length}/${results.length}`,
    `- Median duration: **${[...results.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(results.length / 2)]} ms** (real API latency)`,
    "",
  ].join("\n");

  console.log(`\n${summary}`);
  if (reportPath) {
    writeFileSync(
      path.resolve(reportPath),
      `# Kingdom Foods Production Certification — measured results\n\nSource: \`${path.resolve(documentsDir)}\`\n${summary}\n${md}\n`,
      "utf8"
    );
    console.log(`  Markdown report written to ${path.resolve(reportPath)}\n`);
  } else {
    console.log(`${md}\n\n  Pass --report <file.md> to write this table to disk.\n`);
  }
}

const failures = results.filter((row) => !row.ok);
if (!LIVE) {
  for (const row of failures) {
    console.log(`  MISMATCH  ${row.name}: expected ${row.expect}, got ${row.classification}`);
  }
}

const assessed = results.filter((row) => row.classification !== "EXTRACTION FAILED");
const avg = (values) =>
  values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : "—";

console.log(`  Profiles: ${results.length}   Verified: ${results.filter((r) => r.classification === "Verified").length}   Needs Review: ${results.filter((r) => r.classification === "Needs Review").length}   Incomplete: ${results.filter((r) => r.classification === "Incomplete").length}`);
console.log(`  Average quality: ${avg(assessed.map((r) => r.quality))}   Average completeness: ${avg(assessed.map((r) => r.completeness).filter((v) => v !== null))}%   Retried: ${assessed.filter((r) => r.retries > 0).length}/${assessed.length}`);
if (!LIVE) {
  console.log(`  Processing time above measures engine logic around a stubbed transport, NOT real API latency.`);
}
console.log("=".repeat(118));
console.log(`  ${failures.length ? `${failures.length} PROFILE(S) DID NOT MEET THE EXPECTED CLASSIFICATION` : "CERTIFICATION PASSED — every profile classified as specified"}`);
console.log(`${"=".repeat(118)}\n`);

process.exit(failures.length ? 1 : 0);
