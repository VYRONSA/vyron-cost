#!/usr/bin/env node
/**
 * VYRON — supplier invoice line-item mapping diagnostic.
 *
 * Answers one question with evidence: at which stage does a line-item value
 * stop matching what the model returned?
 *
 * The four stages, captured for a single invoice and printed side by side for
 * every row and every field (Quantity, Unit Price, VAT, Line Total):
 *
 *   1  RAW GPT     the untouched `lineItems` array from the OpenAI response
 *   2  NORMALIZED  after `normaliseExtraction` (alias resolution, MISSING)
 *   3  DATABASE    the `vyron_document_line_items` row values
 *   4  UI          what the review workspace renders, after the draft mapping
 *
 * Every stage is measured through the SHIPPED module — the engine, the row
 * mapper and the line maths are imported, never reimplemented. A replica would
 * drift from production and the comparison would stop being evidence.
 *
 * This script never writes. It does not modify prompts, retries, extraction
 * logic, or any database row.
 *
 * MODES
 * -----
 *   --self-test          Synthetic rows through the real stage 3 -> 4 mapping.
 *                        No network, no database, no key. Family A under the
 *                        Repository Safety Programme. Run this first.
 *
 *   --document <id>      Reads the stored line items for one document and shows
 *                        stages 3 and 4. Read-only database access. Stages 1
 *                        and 2 report Not Measured unless --reextract is given.
 *
 *   --pdf <file>         Runs the shipped extraction engine over a local PDF and
 *                        shows all four stages for a single coherent run.
 *                        Stage 3 is the projection of what persistence WOULD
 *                        write; nothing is stored. Calls OpenAI — billable.
 *
 *   --reextract          With --document: also call OpenAI on the stored PDF so
 *                        stages 1 and 2 are populated. The database rows shown
 *                        remain those of the PREVIOUS run and are labelled so.
 *
 *   --out <dir>          Write raw artefacts (full OpenAI response, parsed JSON,
 *                        the comparison as JSON) to a directory.
 *
 * Anything that calls OpenAI is Family D — external, billable, irreversible —
 * and requires VYRON_ACKNOWLEDGE_EXTERNAL=1.
 *
 *   node scripts/diagnose-invoice-line-mapping.mjs --self-test
 *   node scripts/diagnose-invoice-line-mapping.mjs --document 7b18...
 *   VYRON_ACKNOWLEDGE_EXTERNAL=1 node scripts/diagnose-invoice-line-mapping.mjs --pdf ./invoice.pdf
 *
 * Exits 0 when every field matches across all measured stages, 1 when a stage
 * altered a value, 2 on a usage or environment error.
 */

import { register } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

register("./support/ts-alias-hook.mjs", import.meta.url);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

const SELF_TEST = flag("--self-test");
const DOCUMENT_ID = value("--document");
const PDF_PATH = value("--pdf");
const REEXTRACT = flag("--reextract");
const OUT_DIR = value("--out");
const SAVE = flag("--save");

if (!SELF_TEST && !DOCUMENT_ID && !PDF_PATH) {
  console.error("\nUsage: --self-test | --document <id> [--reextract] | --pdf <file>   [--out <dir>]\n");
  process.exit(2);
}

/** Mirrors the sentinel in vyron-document-extraction.ts (not exported there). */
const MISSING = "Needs Review";
const CALLS_OPENAI = Boolean(PDF_PATH || (DOCUMENT_ID && REEXTRACT));

// ---------------------------------------------------------------------------
// Environment

function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).replace(/^"|"$/g, "");
  }
}

if (!SELF_TEST) loadEnvLocal();

if (CALLS_OPENAI && process.env.VYRON_ACKNOWLEDGE_EXTERNAL !== "1") {
  console.error(
    "\nThis mode sends the document to OpenAI — billable and irreversible.\n" +
      "Re-run with VYRON_ACKNOWLEDGE_EXTERNAL=1 to acknowledge (Repository Safety Programme, Family D).\n"
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Formatting

const FIELDS = [
  { label: "Quantity", raw: "quantity", norm: "quantity", db: "quantity", ui: "quantity" },
  { label: "Unit Price", raw: "unitPrice", norm: "unitPrice", db: "unit_price", ui: "unitPrice" },
  { label: "VAT", raw: "vatAmount", norm: "vatAmount", db: "vat", ui: "vat" },
  { label: "Line Total", raw: "lineTotal", norm: "lineTotal", db: "line_total", ui: "lineTotal" },
];

const NOT_MEASURED = Symbol("not measured");

function show(cell) {
  if (cell === NOT_MEASURED) return "Not Measured";
  if (cell === undefined) return "absent";
  if (cell === null) return "null";
  if (cell === MISSING) return `"${MISSING}"`;
  if (typeof cell === "string") return `"${cell}"`;
  return String(cell);
}

/**
 * Numeric equivalence across stages.
 *
 * A stage boundary that turns the string "12.50" into the number 12.5 has not
 * changed the value, and flagging it would bury the real defects. A stage that
 * turns 230 into 30, or a value into null, has.
 */
function sameValue(a, b) {
  if (a === NOT_MEASURED || b === NOT_MEASURED) return true;
  const na = toComparable(a);
  const nb = toComparable(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  if (typeof na === "number" && typeof nb === "number") return Math.abs(na - nb) < 0.005;
  return String(na) === String(nb);
}

function toComparable(cell) {
  if (cell === undefined || cell === null || cell === "" || cell === MISSING) return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const text = String(cell).trim();
  if (!text) return null;
  const numeric = Number(text.replace(/[^\d.,-]/g, "").replace(/,/g, "."));
  return Number.isFinite(numeric) ? numeric : text;
}

function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

// ---------------------------------------------------------------------------
// Stage capture

/**
 * Wraps global fetch to retain the untouched OpenAI response body.
 *
 * This is how stage 1 is captured without adding a line of logging to the
 * extraction engine: the engine is called exactly as production calls it, and
 * the transport is observed from outside. `rawOpenAiResponsePreview` on the
 * returned log is truncated at 2,000 characters, which is not enough to see
 * every row of a long invoice.
 */
function captureOpenAiCalls() {
  const captures = [];
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const response = await realFetch(input, init);
    if (!url.includes("api.openai.com")) return response;

    const clone = response.clone();
    try {
      const bodyText = await clone.text();
      const body = JSON.parse(bodyText);
      captures.push({ ok: response.ok, status: response.status, body, outputText: outputTextOf(body) });
    } catch (error) {
      captures.push({ ok: response.ok, status: response.status, body: null, outputText: null, error: String(error) });
    }
    return response;
  };

  return {
    captures,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/** Mirror of getOutputText in vyron-document-extraction.ts (not exported). */
function outputTextOf(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const block of Array.isArray(item?.content) ? item.content : []) {
      if (typeof block?.text === "string") chunks.push(block.text);
      if (typeof block?.content === "string") chunks.push(block.content);
    }
  }
  return chunks.join("\n").trim();
}

function parseModelJson(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Arithmetic coherence
//
// A stage-by-stage comparison proves where a value CHANGED. It cannot prove a
// value was WRONG when every stage agrees on the same wrong number. These
// checks close that gap using the invoice's own arithmetic, so a column the
// model mis-identified is caught even though nothing downstream touched it.

/** South African standard rate. Used only to TEST a hypothesis, never to write. */
const VAT_RATE = 0.15;

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^\d.,-]/g, "").replace(/,/g, "."));
  return Number.isFinite(parsed) ? parsed : null;
}

const round2 = (value) => Math.round(value * 100) / 100;
const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 0.05;

function analyseArithmetic(rows, header) {
  const analysed = rows.map((row, index) => {
    const qty = num(row.quantity);
    const price = num(row.unit_price);
    const vat = num(row.vat);
    const total = num(row.line_total);
    const product = qty !== null && price !== null ? round2(qty * price) : null;

    return {
      index,
      description: row.description,
      qty,
      price,
      vat,
      total,
      product,
      // Two readings of what the stored line total means, both tested.
      matchesExcl: near(product, total),
      matchesIncl: product !== null && near(round2(product * (1 + VAT_RATE)), total),
      impliedUnitPriceExcl: qty ? round2((total ?? 0) / (1 + VAT_RATE) / qty) : null,
      impliedVat: product !== null && total !== null ? round2(total - product) : null,
    };
  });

  /*
   * A per-line monetary amount is a function of the line. One that holds the
   * same value while the line totals vary by two orders of magnitude is not
   * that amount — it is a rate, a code, or a discount read from the wrong
   * column. This is the check that identifies a mis-mapped column.
   */
  const constants = [];
  for (const [field, key] of [["VAT", "vat"], ["Unit Price", "price"], ["Quantity", "qty"]]) {
    const values = analysed.map((row) => row[key]).filter((value) => value !== null);
    // Below five rows a repeated value is unremarkable — two lines of quantity
    // 1 on a three-line invoice is a coincidence, not a mis-mapped column.
    if (values.length < 5) continue;
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    const [dominant, occurrences] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const distinctTotals = new Set(analysed.map((row) => row.total).filter((value) => value !== null)).size;
    if (occurrences / values.length >= 0.6 && distinctTotals >= 3) {
      constants.push({ field, value: dominant, occurrences, of: values.length, distinctTotals });
    }
  }

  const sum = (key) => round2(analysed.reduce((acc, row) => acc + (row[key] ?? 0), 0));
  const sumLineTotals = sum("total");
  const sumVat = sum("vat");

  return {
    rows: analysed,
    constants,
    reconciliation: {
      sumLineTotals,
      sumVat,
      headerSubtotal: num(header?.subtotal),
      headerVat: num(header?.vat),
      headerTotal: num(header?.total),
      lineTotalsVsHeaderTotal: num(header?.total) === null ? null : round2(sumLineTotals - num(header.total)),
      lineTotalsVsHeaderSubtotal: num(header?.subtotal) === null ? null : round2(sumLineTotals - num(header.subtotal)),
      lineVatVsHeaderVat: num(header?.vat) === null ? null : round2(sumVat - num(header.vat)),
    },
    coherent: {
      excl: analysed.filter((row) => row.matchesExcl).length,
      incl: analysed.filter((row) => row.matchesIncl).length,
      neither: analysed.filter((row) => !row.matchesExcl && !row.matchesIncl && row.product !== null).length,
      total: analysed.length,
    },
  };
}

function printArithmetic(analysis) {
  const { constants, reconciliation: rec, coherent } = analysis;

  console.log("\n  ARITHMETIC COHERENCE (does the stored table agree with itself?)");
  console.log(
    `    rows where qty x price = line total .............. ${coherent.excl}/${coherent.total}\n` +
      `    rows where qty x price + ${VAT_RATE * 100}% = line total ......... ${coherent.incl}/${coherent.total}\n` +
      `    rows matching neither reading .................... ${coherent.neither}/${coherent.total}`
  );

  console.log("\n    Reconciliation against the stored invoice header:");
  console.log(
    `      sum of line totals ${String(rec.sumLineTotals).padStart(12)}   vs header total    ${String(rec.headerTotal).padStart(12)}   diff ${rec.lineTotalsVsHeaderTotal}\n` +
      `                                          vs header subtotal ${String(rec.headerSubtotal).padStart(12)}   diff ${rec.lineTotalsVsHeaderSubtotal}\n` +
      `      sum of line VAT    ${String(rec.sumVat).padStart(12)}   vs header VAT      ${String(rec.headerVat).padStart(12)}   diff ${rec.lineVatVsHeaderVat}`
  );

  if (constants.length) {
    console.log("\n    COLUMN IDENTITY WARNING");
    for (const entry of constants) {
      console.log(
        `      ${entry.field} holds ${entry.value} on ${entry.occurrences} of ${entry.of} rows, across ${entry.distinctTotals} distinct line totals.\n` +
          `      A per-line ${entry.field.toLowerCase()} cannot be constant while the lines differ. This column was\n` +
          `      almost certainly read from a rate, code or discount column on the document.`
      );
    }
  }

  console.log("\n    Per row — stored vs what the line total implies:");
  console.log(
    `      ${pad("#", 4)}${pad("qty", 7)}${pad("stored price", 14)}${pad("implied excl price", 20)}${pad("stored VAT", 12)}${pad("implied VAT", 13)}line total`
  );
  for (const row of analysis.rows) {
    const priceFlag = row.impliedUnitPriceExcl !== null && !near(row.price, row.impliedUnitPriceExcl) ? " !" : "";
    const vatFlag = row.impliedVat !== null && !near(row.vat, row.impliedVat) ? " !" : "";
    console.log(
      `      ${pad(row.index + 1, 4)}${pad(row.qty, 7)}${pad(row.price, 14)}${pad(String(row.impliedUnitPriceExcl) + priceFlag, 20)}` +
        `${pad(row.vat, 12)}${pad(String(row.impliedVat) + vatFlag, 13)}${row.total}`
    );
  }
}

// ---------------------------------------------------------------------------
// Report

function buildComparison({ rawLines, normalizedLines, dbRows, uiLines, labels }) {
  const rowCount = Math.max(
    rawLines?.length || 0,
    normalizedLines?.length || 0,
    dbRows?.length || 0,
    uiLines?.length || 0
  );

  const rows = [];
  for (let index = 0; index < rowCount; index += 1) {
    const raw = rawLines ? rawLines[index] : null;
    const normalized = normalizedLines ? normalizedLines[index] : null;
    const db = dbRows ? dbRows[index] : null;
    const ui = uiLines ? uiLines[index] : null;

    const description =
      normalized?.description ?? db?.description ?? ui?.description ?? raw?.description ?? "(no description)";

    const fields = FIELDS.map((field) => {
      const cells = [
        rawLines ? raw?.[field.raw] : NOT_MEASURED,
        normalizedLines ? normalized?.[field.norm] : NOT_MEASURED,
        dbRows ? db?.[field.db] : NOT_MEASURED,
        uiLines ? ui?.[field.ui] : NOT_MEASURED,
      ];

      // The first boundary at which the value stops matching the one before it.
      let brokeAt = null;
      for (let stage = 1; stage < cells.length; stage += 1) {
        const previous = cells.slice(0, stage).filter((cell) => cell !== NOT_MEASURED).at(-1);
        if (previous === undefined) continue;
        if (cells[stage] !== NOT_MEASURED && !sameValue(previous, cells[stage])) {
          brokeAt = stage;
          break;
        }
      }

      return { label: field.label, cells, brokeAt };
    });

    rows.push({ index, description, fields });
  }

  return { rows, labels };
}

function printComparison(comparison) {
  const { rows, labels } = comparison;
  const widths = [14, ...labels.map((label) => Math.max(label.length + 2, 16))];

  let mismatches = 0;

  for (const row of rows) {
    const heading = `Row ${String(row.index + 1).padStart(2, " ")}  ${row.description}`;
    console.log(`\n  ${heading.slice(0, 110)}`);
    console.log(
      `    ${pad("field", widths[0])}${labels.map((label, i) => pad(label, widths[i + 1])).join("")}`
    );

    for (const field of row.fields) {
      const cells = field.cells.map((cell, i) => pad(show(cell), widths[i + 1])).join("");
      const marker = field.brokeAt === null ? "" : `  <-- CHANGED AT ${labels[field.brokeAt]}`;
      if (field.brokeAt !== null) mismatches += 1;
      console.log(`    ${pad(field.label, widths[0])}${cells}${marker}`);
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Modes

async function runSelfTest() {
  const { mapLineRowToDraftLine } = await import("../src/lib/vyron-document-review-client.ts");
  const { hydrateReviewDraft } = await import("../src/lib/vyron-review-draft-hydrate.ts");

  // Row 1 is the failure this diagnostic was built for: a readable line total
  // with an unreadable quantity. Row 2 is the ordinary complete row. Row 3 has
  // no VAT figure at all — it must not acquire a measured zero.
  const dbRows = [
    { id: "row-1", description: "Quantity unreadable", quantity: null, unit: "EA", unit_price: 12.5, vat: 30, line_total: 230, sku_product_code: "", confidence_score: 80, field_confidence: {} },
    { id: "row-2", description: "Complete row", quantity: 4, unit: "EA", unit_price: 25, vat: 15, line_total: 115, sku_product_code: "", confidence_score: 90, field_confidence: {} },
    { id: "row-3", description: "No VAT extracted", quantity: 2, unit: "EA", unit_price: 10, vat: null, line_total: 20, sku_product_code: "", confidence_score: 70, field_confidence: {} },
  ];

  const draft = hydrateReviewDraft({
    documentId: "self-test",
    status: "extracted",
    fields: {},
    lines: dbRows.map(mapLineRowToDraftLine),
    matchOptions: [],
    extractionQuality: null,
  });

  console.log("\n  SELF TEST — database row -> review workspace value");
  console.log("  Stages 1 and 2 are not exercised in this mode (no model call).");

  const comparison = buildComparison({
    rawLines: null,
    normalizedLines: null,
    dbRows,
    uiLines: draft.lines,
    labels: ["1 RAW GPT", "2 NORMALIZED", "3 DATABASE", "4 UI"],
  });

  const mismatches = printComparison(comparison);

  // The Excl VAT column is derived, not extracted, so it is asserted separately.
  console.log("\n  Derived Excl VAT (not an extracted field):");
  for (const line of draft.lines) {
    console.log(`    ${pad(line.description, 24)} ${String(line.lineExclVat)}`);
  }

  return { mismatches, comparison };
}

async function runPdf(pdfPath) {
  if (!existsSync(pdfPath)) {
    console.error(`\nNo such file: ${pdfPath}\n`);
    process.exit(2);
  }

  const { runDocumentExtraction, numberFromMoney } = await import("../src/lib/vyron-document-extraction.ts");
  const { mapLineRowToDraftLine } = await import("../src/lib/vyron-document-review-client.ts");
  const { hydrateReviewDraft } = await import("../src/lib/vyron-review-draft-hydrate.ts");

  const bytes = readFileSync(pdfPath);
  const fileName = path.basename(pdfPath);
  const mime = fileName.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : fileName.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

  const capture = captureOpenAiCalls();
  let result;
  try {
    console.log(`\n  Extracting ${fileName} (${bytes.length} bytes) through the shipped engine...`);
    result = await runDocumentExtraction({ fileName, mime, bytes });
  } finally {
    capture.restore();
  }

  const attempts = result.log.attempts || [];
  if (capture.captures.length > 1) {
    console.log(
      `  ${capture.captures.length} model calls were made (retries). Raw JSON below is the attempt whose\n` +
        `  row count matches the accepted extraction; the others are written to --out when supplied.`
    );
  }

  const accepted = result.extraction.lineItems.length;
  const parsedPerCall = capture.captures.map((entry) => parseModelJson(entry.outputText));
  const matchIndex = (() => {
    for (let i = parsedPerCall.length - 1; i >= 0; i -= 1) {
      const lines = parsedPerCall[i]?.lineItems;
      if (Array.isArray(lines) && lines.length === accepted) return i;
    }
    return parsedPerCall.length - 1;
  })();

  const rawLines = Array.isArray(parsedPerCall[matchIndex]?.lineItems) ? parsedPerCall[matchIndex].lineItems : [];

  /*
   * Stage 3 as a projection, not a write.
   *
   * Mirrors the row mapping in persistExtractionToDocument (vyron-document-
   * extraction.ts, the `extraction.lineItems.map` before the insert). The
   * conversion itself is the production `numberFromMoney`, imported above, so
   * the numbers are the ones persistence would store.
   */
  const dbRows = result.extraction.lineItems.map((line, index) => ({
    id: `projected-${index}`,
    description: line.description !== MISSING ? line.description : "",
    quantity: numberFromMoney(line.quantity),
    unit: line.unit !== MISSING ? line.unit : null,
    unit_price: numberFromMoney(line.unitPrice),
    vat: numberFromMoney(line.vatAmount),
    line_total: numberFromMoney(line.lineTotal),
    sku_product_code: line.skuOrProductCode !== MISSING ? line.skuOrProductCode : null,
    confidence_score: line.confidenceScore || null,
    field_confidence: line.fieldConfidence,
  }));

  const draft = hydrateReviewDraft({
    documentId: "pdf-mode",
    status: "extracted",
    fields: {},
    lines: dbRows.map(mapLineRowToDraftLine),
    matchOptions: [],
    extractionQuality: null,
  });

  console.log(
    `\n  Model: ${result.modelUsed}   attempts: ${attempts.length}   ` +
      `declared rows: ${result.extraction.declaredLineItemCount ?? "n/a"}   extracted rows: ${accepted}`
  );
  console.log("  Stage 3 is the projection of what persistence would write. Nothing was stored.");

  const comparison = buildComparison({
    rawLines,
    normalizedLines: result.extraction.lineItems,
    dbRows,
    uiLines: draft.lines,
    labels: ["1 RAW GPT", "2 NORMALIZED", "3 DB (proj)", "4 UI"],
  });

  const mismatches = printComparison(comparison);

  const header = {
    invoice_number: result.extraction.invoiceNo,
    supplier_name: result.extraction.supplier,
    original_filename: fileName,
    subtotal: result.extraction.subtotal,
    vat: result.extraction.vat,
    total: result.extraction.total,
  };
  const analysis = analyseArithmetic(dbRows, header);
  printArithmetic(analysis);

  writeArtefacts({
    captures: capture.captures,
    rawLines,
    extraction: result.extraction,
    dbRows,
    uiLines: draft.lines,
    comparison,
    analysis,
  });
  saveCaseFile({
    documentId: `pdf-${path.basename(pdfPath, path.extname(pdfPath))}`,
    header,
    comparison,
    analysis,
    stagesMeasured: ["raw GPT", "normalized", "database (projected)", "UI"],
    mode: "--pdf",
    capturedAt: new Date().toISOString(),
  });

  return { mismatches, comparison, analysis };
}

async function runDocument(documentId) {
  const { createClient } = await import("@supabase/supabase-js");
  const { mapLineRowToDraftLine } = await import("../src/lib/vyron-document-review-client.ts");
  const { hydrateReviewDraft } = await import("../src/lib/vyron-review-draft-hydrate.ts");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --document.\n");
    process.exit(2);
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { data: document, error: documentError } = await supabase
    .from("vyron_documents")
    .select("id, original_filename, invoice_number, supplier_name, subtotal, vat, total, storage_bucket, storage_path, file_mime")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    console.error(`\nCould not read document: ${documentError.message}\n`);
    process.exit(2);
  }
  if (!document) {
    console.error(`\nDocument ${documentId} not found.\n`);
    process.exit(2);
  }

  const { data: lineRows, error: linesError } = await supabase
    .from("vyron_document_line_items")
    .select("*")
    .eq("document_id", documentId)
    .order("id", { ascending: true });

  if (linesError) {
    console.error(`\nCould not read line items: ${linesError.message}\n`);
    process.exit(2);
  }

  const dbRows = lineRows || [];

  let rawLines = null;
  let normalizedLines = null;

  if (REEXTRACT) {
    const { runDocumentExtraction, loadDocumentBytes } = await import("../src/lib/vyron-document-extraction.ts");
    const loaded = await loadDocumentBytes(supabase, document);

    const capture = captureOpenAiCalls();
    let result;
    try {
      console.log(`\n  Re-extracting ${loaded.fileName} through the shipped engine (not persisted)...`);
      result = await runDocumentExtraction({ fileName: loaded.fileName, mime: loaded.mime, bytes: loaded.bytes });
    } finally {
      capture.restore();
    }

    const parsed = capture.captures.map((entry) => parseModelJson(entry.outputText));
    const last = parsed.filter((entry) => Array.isArray(entry?.lineItems)).at(-1);
    rawLines = last?.lineItems || [];
    normalizedLines = result.extraction.lineItems;

    console.log(
      `  Model: ${result.modelUsed}   rows this run: ${normalizedLines.length}   rows stored previously: ${dbRows.length}`
    );
    console.log("  Stages 1-2 are from THIS run. Stages 3-4 are the PREVIOUS run's stored rows.");
  }

  const draft = hydrateReviewDraft({
    documentId,
    status: "extracted",
    fields: {},
    lines: dbRows.map(mapLineRowToDraftLine),
    matchOptions: [],
    extractionQuality: null,
  });

  console.log(
    `\n  Document: ${document.original_filename || documentId}` +
      `\n  Invoice:  ${document.invoice_number || "(none)"}   Supplier: ${document.supplier_name || "(none)"}` +
      `\n  Header:   subtotal ${document.subtotal}   VAT ${document.vat}   total ${document.total}` +
      `\n  Stored line items: ${dbRows.length}`
  );

  const comparison = buildComparison({
    rawLines,
    normalizedLines,
    dbRows,
    uiLines: draft.lines,
    labels: ["1 RAW GPT", "2 NORMALIZED", "3 DATABASE", "4 UI"],
  });

  const mismatches = printComparison(comparison);

  const analysis = analyseArithmetic(dbRows, document);
  printArithmetic(analysis);

  writeArtefacts({ rawLines, dbRows, uiLines: draft.lines, comparison, analysis });
  saveCaseFile({
    documentId,
    header: document,
    comparison,
    analysis,
    stagesMeasured: REEXTRACT ? ["raw GPT", "normalized", "database", "UI"] : ["database", "UI"],
    mode: REEXTRACT ? "--document --reextract" : "--document",
    capturedAt: new Date().toISOString(),
  });

  return { mismatches, comparison, analysis };
}

function writeArtefacts(payload) {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, contents] of Object.entries(payload)) {
    if (contents === undefined || contents === null) continue;
    writeFileSync(path.join(OUT_DIR, `${key}.json`), JSON.stringify(contents, null, 2), "utf8");
  }
  console.log(`\n  Artefacts written to ${path.resolve(OUT_DIR)}`);
}

/**
 * The reproducible case file.
 *
 * Keyed by document id so the same invoice can be re-measured against a changed
 * extractor and the two runs compared directly. This is what replaces a
 * screenshot: it states what was measured, what was not, and when.
 */
function saveCaseFile({ documentId, header, comparison, analysis, stagesMeasured, mode, capturedAt }) {
  if (!SAVE) return null;

  const dir = path.join("docs", "evidence");
  mkdirSync(dir, { recursive: true });
  const slug = `${String(header?.invoice_number || "no-invoice").replace(/[^\w.-]+/g, "-")}-${documentId}`;

  const jsonPath = path.join(dir, `${slug}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ documentId, mode, capturedAt, stagesMeasured, header, comparison, analysis }, null, 2),
    "utf8"
  );

  const cell = (value) => (value === NOT_MEASURED ? "_not measured_" : value === null ? "`null`" : `\`${value}\``);
  const lines = [];

  lines.push(`# Line-item mapping evidence — invoice ${header?.invoice_number || "(none)"}`);
  lines.push("");
  lines.push(`- **Document id:** \`${documentId}\``);
  lines.push(`- **Supplier:** ${header?.supplier_name || "(none)"}`);
  lines.push(`- **File:** ${header?.original_filename || "(none)"}`);
  lines.push(`- **Captured:** ${capturedAt}`);
  lines.push(`- **Mode:** \`${mode}\``);
  lines.push(`- **Stages measured:** ${stagesMeasured.join(", ")}`);
  lines.push(
    `- **Stored header:** subtotal \`${header?.subtotal}\`, VAT \`${header?.vat}\`, total \`${header?.total}\``
  );
  lines.push("");
  lines.push(
    "Produced by `scripts/diagnose-invoice-line-mapping.mjs`. Re-run with the same document id to compare a changed extractor against this baseline."
  );
  lines.push("");

  if (analysis) {
    lines.push("## Arithmetic coherence");
    lines.push("");
    lines.push(`- rows where \`qty × price = line total\`: **${analysis.coherent.excl}/${analysis.coherent.total}**`);
    lines.push(
      `- rows where \`qty × price + ${VAT_RATE * 100}% = line total\`: **${analysis.coherent.incl}/${analysis.coherent.total}**`
    );
    lines.push(`- rows matching neither: **${analysis.coherent.neither}/${analysis.coherent.total}**`);
    lines.push("");
    const rec = analysis.reconciliation;
    lines.push(`- sum of line totals \`${rec.sumLineTotals}\` vs header total \`${rec.headerTotal}\` — diff \`${rec.lineTotalsVsHeaderTotal}\``);
    lines.push(`- sum of line VAT \`${rec.sumVat}\` vs header VAT \`${rec.headerVat}\` — diff \`${rec.lineVatVsHeaderVat}\``);
    lines.push("");

    if (analysis.constants.length) {
      lines.push("### Column identity warning");
      lines.push("");
      for (const entry of analysis.constants) {
        lines.push(
          `- **${entry.field}** holds \`${entry.value}\` on ${entry.occurrences} of ${entry.of} rows across ${entry.distinctTotals} distinct line totals. A per-line ${entry.field.toLowerCase()} cannot be constant while the lines differ.`
        );
      }
      lines.push("");
    }

    lines.push("### Stored vs implied");
    lines.push("");
    lines.push("| # | Description | Qty | Stored unit price | Implied excl price | Stored VAT | Implied VAT | Line total |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const row of analysis.rows) {
      const priceFlag = row.impliedUnitPriceExcl !== null && !near(row.price, row.impliedUnitPriceExcl) ? " ⚠️" : "";
      const vatFlag = row.impliedVat !== null && !near(row.vat, row.impliedVat) ? " ⚠️" : "";
      lines.push(
        `| ${row.index + 1} | ${row.description} | \`${row.qty}\` | \`${row.price}\` | \`${row.impliedUnitPriceExcl}\`${priceFlag} | \`${row.vat}\` | \`${row.impliedVat}\`${vatFlag} | \`${row.total}\` |`
      );
    }
    lines.push("");
  }

  lines.push("## Stage-by-stage comparison");
  lines.push("");
  for (const row of comparison.rows) {
    lines.push(`### Row ${row.index + 1} — ${row.description}`);
    lines.push("");
    lines.push(`| Field | ${comparison.labels.join(" | ")} |`);
    lines.push(`|---|${comparison.labels.map(() => "---").join("|")}|`);
    for (const field of row.fields) {
      const marker = field.brokeAt === null ? "" : ` ❌ changed at ${comparison.labels[field.brokeAt]}`;
      lines.push(`| ${field.label} | ${field.cells.map(cell).join(" | ")} |${marker ? ` ${marker}` : ""}`);
    }
    lines.push("");
  }

  const mdPath = path.join(dir, `${slug}.md`);
  writeFileSync(mdPath, lines.join("\n"), "utf8");

  console.log(`\n  Case file saved:\n    ${mdPath}\n    ${jsonPath}`);
  return { mdPath, jsonPath };
}

// ---------------------------------------------------------------------------

const outcome = SELF_TEST ? await runSelfTest() : PDF_PATH ? await runPdf(PDF_PATH) : await runDocument(DOCUMENT_ID);

console.log(
  outcome.mismatches === 0
    ? "\n  RESULT: every measured field survived every measured stage unchanged.\n"
    : `\n  RESULT: ${outcome.mismatches} field(s) changed value between stages — see CHANGED AT markers above.\n`
);

process.exit(outcome.mismatches === 0 ? 0 : 1);
