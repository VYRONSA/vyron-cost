#!/usr/bin/env node
/**
 * VYRON — supplier invoice line-item extraction regression test.
 *
 * PROVES THAT A PARTIALLY EXTRACTED INVOICE IS DETECTED AND RETRIED.
 *
 * This test exists because the extraction engine reliably read invoice headers
 * but silently returned only some of the line items. Nothing downstream was
 * losing rows — normalisation and persistence are both 1:1 maps — the model was
 * never asked for all of them, and no gate noticed that a 12-row invoice had
 * come back with 3 rows. The document was filed as captured.
 *
 * Two independent signals now reject a partial extraction:
 *
 *   row count      the model declares how many invoice lines it can see BEFORE
 *                  extracting them; a mismatch is self-evident truncation
 *   reconciliation the extracted line totals must sum to the invoice's own
 *                  subtotal, within 1%
 *
 * Family A under the Repository Safety Programme: `fetch` is replaced by a
 * scripted stub, so no OpenAI request is made, no AI allowance is consumed, and
 * no database, storage or network access occurs. The shipped module is imported
 * directly, so this exercises production logic rather than a copy of it.
 *
 *   node scripts/verify-line-item-extraction.mjs
 *
 * Exits 0 on pass, 1 on failure.
 */

import { register } from "node:module";

register("./support/ts-alias-hook.mjs", import.meta.url);

// `assessExtractionCompleteness` is module-private by design — it is reached
// through `normaliseExtraction`, which is the only way production reaches it.
const { normaliseExtraction, runDocumentExtraction } = await import("../src/lib/vyron-document-extraction.ts");
const {
  buildExtractionQualityRecord,
  parseExtractionQualityRecord,
  summariseExtractionQuality,
} = await import("../src/lib/vyron-extraction-quality.ts");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const rule = (t) => console.log(`\n${"=".repeat(96)}\n  ${t}\n${"=".repeat(96)}`);
const section = (t) => console.log(`\n--- ${t} ${"-".repeat(Math.max(0, 90 - t.length))}`);

/** The module's not-visible sentinel. */
const MISSING = "Needs Review";

/** The confidence at or above which DocumentHubdocClient files a document as "Captured". */
const CAPTURED_THRESHOLD = 75;

/** Raw model JSON for an invoice of `rows` line items, each worth `each`. */
function payload({ rows, declared, each = 100, subtotal, vat = 0, total, confidence = 90, header = true }) {
  const sub = subtotal ?? rows * each;
  return {
    supplier: header ? "ACME Supplies (Pty) Ltd" : MISSING,
    invoiceNo: header ? "INV-100234" : MISSING,
    invoiceDate: header ? "2026-07-14" : MISSING,
    customerName: "Handcrafted Food Products",
    subtotal: sub,
    vat,
    total: total ?? sub + vat,
    currency: "ZAR",
    confidence,
    documentType: "Supplier Invoice",
    ...(declared === undefined ? {} : { visibleLineItemCount: declared }),
    lineItems: Array.from({ length: rows }, (_, i) => ({
      description: `Product ${i + 1}`,
      quantity: "1",
      unit: "EA",
      unitPrice: String(each),
      vatAmount: "0",
      lineTotal: String(each),
      skuOrProductCode: `SKU-${i + 1}`,
      confidenceScore: 95,
    })),
    warnings: [],
    rawDetectedText: "invoice",
  };
}

const norm = (p) => normaliseExtraction(p, JSON.stringify(p));

// ---------------------------------------------------------------------------
rule("PART 1 — COMPLETENESS ASSESSMENT");

section("declared row count — the deterministic signal");
{
  const e = norm(payload({ rows: 11, declared: 11 }));
  check("11 declared / 11 extracted -> Complete", e.completeness.status === "Complete", e.completeness.status);
  check("declared count is carried onto the extraction", e.declaredLineItemCount === 11, String(e.declaredLineItemCount));
  check("no incompleteness warning on a complete extraction",
    !e.warnings.some((w) => /line items/i.test(w)), JSON.stringify(e.warnings));
}
{
  // The reported defect, reproduced.
  const e = norm(payload({ rows: 3, declared: 11, subtotal: 1100 }));
  check("11 declared / 3 extracted -> Incomplete", e.completeness.status === "Incomplete", e.completeness.status);
  check("reason is row-count-mismatch", e.completeness.reasons.includes("row-count-mismatch"),
    e.completeness.reasons.join(","));
  check("operator warning names both counts",
    e.warnings.some((w) => w.includes("11") && w.includes("3")), JSON.stringify(e.warnings));
  check("incomplete extraction falls below the Captured threshold",
    e.confidence < CAPTURED_THRESHOLD, String(e.confidence));
}
{
  // Weakest case: only the row count is wrong, every amount reconciles, so the
  // completeness penalty is the only thing demoting it.
  const e = norm(payload({ rows: 11, declared: 12, confidence: 95 }));
  check("row-count mismatch alone demotes a 95-confidence extraction",
    e.completeness.status === "Incomplete" && e.confidence < CAPTURED_THRESHOLD,
    `${e.completeness.status} conf=${e.confidence}`);
}
{
  const e = norm(payload({ rows: 11, declared: undefined }));
  check("no declared count + reconciling totals -> Complete", e.completeness.status === "Complete", e.completeness.status);
  check("declared count is null when the model did not report one", e.declaredLineItemCount === null,
    String(e.declaredLineItemCount));
}
for (const junk of [MISSING, "", null, "not a number", -3]) {
  const p = payload({ rows: 2 });
  p.visibleLineItemCount = junk;
  check(`non-numeric declared count (${JSON.stringify(junk)}) is treated as unreported`,
    norm(p).declaredLineItemCount === null);
}
{
  const p = payload({ rows: 12 });
  p.visibleLineItemCount = "12";
  check("a numeric string declared count is coerced", norm(p).declaredLineItemCount === 12);
}

section("zero is a value, not an absence");
{
  // Zero-rated supplies are routine — most basic foodstuffs in South Africa are
  // zero-rated. An alias chain built on `||` discards a legitimate 0, which
  // used to make `subtotal + VAT = total` unevaluable and put a perfectly good
  // invoice permanently out of reach of a Verified classification.
  const e = norm(payload({ rows: 11, declared: 11, vat: 0 }));
  check("a zero VAT amount is retained, not discarded", e.vat === 0, String(e.vat));
  check("subtotal + VAT = total can be evaluated with zero VAT",
    e.validation.subtotalVatTotalCheck === "Pass", e.validation.subtotalVatTotalCheck);
  check("a zero-rated invoice can reach Verified",
    buildExtractionQualityRecord(e).classification === "Verified",
    buildExtractionQualityRecord(e).classification);
}
{
  const p = payload({ rows: 1, declared: 1, each: 100 });
  p.lineItems[0].vatAmount = 0;
  p.lineItems[0].quantity = 0;
  const line = norm(p).lineItems[0];
  check("a zero line VAT amount is retained", line.vatAmount === "0", line.vatAmount);
  check("a zero quantity is retained", line.quantity === "0", line.quantity);
}
{
  // The other half of the contract: absent must still read as absent.
  const p = payload({ rows: 1, declared: 1 });
  delete p.vat;
  check("an absent VAT amount is still null", norm(p).vat === null, String(norm(p).vat));
  p.vat = "";
  check("an empty-string VAT amount is still null", norm(p).vat === null, String(norm(p).vat));
}

section("totals reconciliation — the independent signal");
{
  // 3 of 12 rows, no declared count. Caught by the money alone.
  const e = norm(payload({ rows: 3, each: 100, subtotal: 1200 }));
  check("line totals 300 vs subtotal 1200 -> Incomplete", e.completeness.status === "Incomplete", e.completeness.status);
  check("reason is totals-do-not-reconcile", e.completeness.reasons.includes("totals-do-not-reconcile"),
    e.completeness.reasons.join(","));
  check("variance is reported for diagnosis", e.completeness.variance === 900, String(e.completeness.variance));
  check("reconciled against the subtotal", e.completeness.reconciliationBasis === "subtotal",
    e.completeness.reconciliationBasis);
}
{
  // Rounding noise must never burn a retry: 0.4% of 1000.
  const e = norm(payload({ rows: 10, each: 100, subtotal: 1004 }));
  check("0.4% variance stays Complete", e.completeness.status === "Complete",
    `${e.completeness.status} var=${e.completeness.variance} tol=${e.completeness.tolerance}`);
}
{
  const e = norm(payload({ rows: 10, each: 100, subtotal: 1020 }));
  check("2% variance is Incomplete — the retry gate is tighter than the display check",
    e.completeness.status === "Incomplete", `${e.completeness.status} var=${e.completeness.variance}`);
  check("the operator-facing lineItemsTotalCheck still reports Pass at 2% (unchanged)",
    e.validation.lineItemsTotalCheck === "Pass", e.validation.lineItemsTotalCheck);
}
{
  const p = payload({ rows: 3, each: 100 });
  delete p.subtotal;
  p.vat = 180;
  p.total = 1380; // net 1200 against 300 extracted
  const e = norm(p);
  check("falls back to total-less-vat when there is no subtotal",
    e.completeness.reconciliationBasis === "total-less-vat", e.completeness.reconciliationBasis);
  check("the fallback basis still detects the shortfall", e.completeness.status === "Incomplete", e.completeness.status);
}
{
  const e = norm(payload({ rows: 0, subtotal: 1200 }));
  check("a priced invoice with zero rows -> Incomplete", e.completeness.status === "Incomplete", e.completeness.status);
  check("reason is no-line-items", e.completeness.reasons.includes("no-line-items"), e.completeness.reasons.join(","));
}
{
  // A supplier statement lists invoices, not products. Treating its empty
  // lineItems as truncation drove the retry loop and burned billable calls
  // chasing rows that were never on the page.
  const p = payload({ rows: 0, subtotal: 48250 });
  p.documentType = "Supplier Statement";
  const e = norm(p);
  check("a supplier statement with no rows is NOT flagged truncated",
    !e.completeness.reasons.includes("no-line-items"), e.completeness.reasons.join(","));
  check("a statement's completeness is not measurable rather than 0%",
    buildExtractionQualityRecord(e).completenessPercentage === null,
    String(buildExtractionQualityRecord(e).completenessPercentage));
}
for (const type of ["Delivery Note", "Other"]) {
  const p = payload({ rows: 0, subtotal: 500 });
  p.documentType = type;
  check(`a ${type} with no rows is not flagged truncated`,
    !norm(p).completeness.reasons.includes("no-line-items"));
}
for (const type of ["Credit Note", "Purchase Order", "", "Something Unrecognised"]) {
  // Unrecognised types fail closed: the gate stays on unless a document
  // positively identifies as a class that carries no priced lines.
  const p = payload({ rows: 0, subtotal: 500 });
  p.documentType = type;
  check(`a ${type || "(blank)"} with no rows IS flagged truncated`,
    norm(p).completeness.reasons.includes("no-line-items"));
}
{
  // Credit notes carry negative values throughout.
  const p = payload({ rows: 4, declared: 4, each: -100, subtotal: -400 });
  p.documentType = "Credit Note";
  p.vat = -60;
  p.total = -460;
  const e = norm(p);
  check("a credit note's negative totals reconcile", e.completeness.status === "Complete", e.completeness.status);
  check("a credit note reaches 100% completeness",
    buildExtractionQualityRecord(e).completenessPercentage === 100,
    String(buildExtractionQualityRecord(e).completenessPercentage));
}
{
  const p = payload({ rows: 2 });
  delete p.subtotal;
  delete p.total;
  delete p.vat;
  // No declared count and nothing to reconcile against. The absence of evidence
  // must not be recorded as evidence of completeness.
  check("unverifiable extraction is Unverified, NOT Complete",
    norm(p).completeness.status === "Unverified", norm(p).completeness.status);
}

// ---------------------------------------------------------------------------
rule("PART 2 — PROMPT CONTRACT");

const calls = [];
const realFetch = globalThis.fetch;

/** Scripted transport. No request leaves the process. */
function stubFetch(script) {
  calls.length = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({
      model: body.model,
      prompt: body.input[0].content[0].text,
      temperature: body.temperature,
      maxOutputTokens: body.max_output_tokens,
    });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    if (step.httpError) {
      return { ok: false, status: 500, json: async () => ({ error: { message: "simulated upstream failure" } }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        output_text: typeof step.raw === "string" ? step.raw : JSON.stringify(step.raw),
        usage: { input_tokens: 1000, output_tokens: 500, total_tokens: 1500 },
      }),
    };
  };
}

const BYTES = Buffer.from("%PDF-1.4 not a real document");
const run = () => runDocumentExtraction({ fileName: "invoice.pdf", mime: "application/pdf", bytes: BYTES });

process.env.OPENAI_API_KEY = "sk-verification-harness-not-a-real-key";
process.env.OPENAI_DOCUMENT_MODEL = "gpt-4o";
process.env.OPENAI_DOCUMENT_FALLBACK_MODEL = "gpt-4o-mini";

// The engine logs rejected attempts by design. Silence that here so a passing
// run reads as a passing run; failures are reported by this script instead.
const realWarn = console.warn;
const realError = console.error;
console.warn = () => {};
console.error = () => {};

try {
  stubFetch([{ raw: payload({ rows: 11, declared: 11 }) }]);
  await run();
  const p = calls[0].prompt;
  for (const phrase of [
    "Extract every visible invoice line exactly as printed.",
    "Do not summarise. Do not combine rows. Do not omit rows.",
    "visibleLineItemCount",
    'The number of objects in "lineItems" MUST equal "visibleLineItemCount".',
  ]) {
    check(`prompt states: "${phrase.slice(0, 56)}…"`, p.includes(phrase));
  }
  const exampleRows = (p.match(/"skuOrProductCode": "", "confidenceScore"/g) || []).length;
  check("the schema example shows MULTIPLE line items — no single-row cardinality cue",
    exampleRows >= 3, `${exampleRows} example objects`);
  check("prompt still forbids reading the filename", p.includes("never use filename"));
  check("temperature is still 0", calls[0].temperature === 0, String(calls[0].temperature));
  check("the standard prompt carries no retry text", !p.includes("RETRY"));
  // Demanding every row without raising the output ceiling would turn a partial
  // extraction into an unparseable one. Both models cap at 16,384.
  check("output ceiling is requested and within both models' limits",
    calls[0].maxOutputTokens >= 8000 && calls[0].maxOutputTokens <= 16384, String(calls[0].maxOutputTokens));

  // -------------------------------------------------------------------------
  rule("PART 3 — RETRY PLAN, DIAGNOSTICS AND ACCOUNTING");

  section("a complete extraction still costs exactly one call");
  stubFetch([{ raw: payload({ rows: 11, declared: 11 }) }]);
  {
    const r = await run();
    check("one API call", calls.length === 1, `${calls.length} calls`);
    check("all 11 rows returned", r.extraction.lineItems.length === 11, String(r.extraction.lineItems.length));
    check("log records the extracted line count", r.log.lineItemCount === 11, String(r.log.lineItemCount));
    check("log records the declared line count", r.log.declaredLineItemCount === 11, String(r.log.declaredLineItemCount));
    check("log records the completeness verdict", r.log.completeness?.status === "Complete", r.log.completeness?.status);
    check("log records one attempt", r.log.attempts.length === 1, String(r.log.attempts.length));
    check("attempt outcome is accepted", r.log.attempts[0].outcome === "accepted", r.log.attempts[0].outcome);
    check("attempt records the response length", r.log.attempts[0].responseLength > 0);
    check("attempt records that the JSON parsed", r.log.attempts[0].jsonParsed === true);
    check("full raw response is NOT retained on the healthy path", r.log.rawOpenAiResponseFull === null);
    check("the 2,000-character preview is still retained", typeof r.log.rawOpenAiResponsePreview === "string");
    check("usage reported for the one call", r.usage.totalTokens === 1500, JSON.stringify(r.usage));
  }

  section("a truncated attempt is retried on the same model, with feedback");
  stubFetch([
    { raw: payload({ rows: 3, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 11, declared: 11 }) },
  ]);
  {
    const r = await run();
    check("exactly two API calls", calls.length === 2, `${calls.length} calls`);
    check("the retry stays on the PRIMARY model", calls[1].model === "gpt-4o", calls[1].model);
    check("the retry prompt is reinforced", calls[1].prompt.includes("RETRY"));
    check("the retry prompt names the shortfall (11 declared, 3 returned)",
      /reported 11 visible invoice lines but returned only 3/.test(calls[1].prompt));
    check("the retry recovers all 11 rows", r.extraction.lineItems.length === 11, String(r.extraction.lineItems.length));
    check("the accepted extraction is Complete", r.extraction.completeness.status === "Complete");
    check("both attempts are logged", r.log.attempts.length === 2, String(r.log.attempts.length));
    check("the first attempt is logged as incomplete", r.log.attempts[0].outcome === "incomplete",
      r.log.attempts[0].outcome);
    check("tokens are summed across BOTH billable calls", r.usage.totalTokens === 3000, JSON.stringify(r.usage));
  }

  section("a reconciliation shortfall alone triggers the retry");
  stubFetch([
    { raw: payload({ rows: 3, each: 100, subtotal: 1200 }) },
    { raw: payload({ rows: 12, each: 100, subtotal: 1200 }) },
  ]);
  {
    const r = await run();
    check("two API calls with no declared count in play", calls.length === 2, `${calls.length} calls`);
    check("the retry prompt cites the money gap",
      /line totals it returned sum to 300\.00, but the invoice net amount is 1200\.00/.test(calls[1].prompt));
    check("the retry recovers all 12 rows", r.extraction.lineItems.length === 12, String(r.extraction.lineItems.length));
  }

  section("exhausted retries degrade — never fail an extraction that used to succeed");
  stubFetch([
    { raw: payload({ rows: 3, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 5, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 4, declared: 11, subtotal: 1100 }) },
  ]);
  {
    const r = await run();
    check("capped at three API calls", calls.length === 3, `${calls.length} calls`);
    check("the third call falls back to the secondary model", calls[2].model === "gpt-4o-mini", calls[2].model);
    check("an extraction is returned rather than an exception", !!r.extraction);
    check("the BEST attempt is returned — 5 rows, not the last 4",
      r.extraction.lineItems.length === 5, String(r.extraction.lineItems.length));
    check("header fields survive for operator correction",
      r.extraction.invoiceNo === "INV-100234" && r.extraction.supplier === "ACME Supplies (Pty) Ltd");
    check("the returned extraction is flagged Incomplete", r.extraction.completeness.status === "Incomplete");
    check("the operator gets a warning", r.extraction.warnings.some((w) => /line items/i.test(w)),
      JSON.stringify(r.extraction.warnings));
    check("the FULL raw response is retained for the incomplete case",
      typeof r.log.rawOpenAiResponseFull === "string" && r.log.rawOpenAiResponseFull.length > 0);
    check("all three attempts are logged", r.log.attempts.length === 3, String(r.log.attempts.length));
    check("tokens are summed across all three calls", r.usage.totalTokens === 4500, JSON.stringify(r.usage));
  }

  section("pre-existing fallback behaviour is preserved");
  stubFetch([{ httpError: true }, { raw: payload({ rows: 11, declared: 11 }) }]);
  {
    const r = await run();
    check("the secondary model is still reached after a transport error", calls.length === 2, `${calls.length} calls`);
    check("the secondary model is used", calls[1].model === "gpt-4o-mini", calls[1].model);
    check("no reinforcement is sent when there is nothing to report", !calls[1].prompt.includes("RETRY"));
    check("the extraction succeeds via the fallback", r.extraction.lineItems.length === 11);
    check("the errored attempt is logged with its message",
      r.log.attempts[0].outcome === "error" && !!r.log.attempts[0].error);
    check("the same-model retry is skipped rather than wasted", r.log.attempts.length === 2,
      String(r.log.attempts.length));
  }

  stubFetch([{ raw: "this is not json at all" }]);
  {
    let threw = null;
    try { await run(); } catch (error) { threw = error; }
    check("unparseable output on every attempt still throws", threw instanceof Error, String(threw));
  }

  stubFetch([{ raw: payload({ rows: 0, header: false, confidence: 5, subtotal: 0, total: 0 }) }]);
  {
    let threw = null;
    try { await run(); } catch (error) { threw = error; }
    check("an extraction with no core header fields still throws", threw instanceof Error, String(threw));
  }

  // -------------------------------------------------------------------------
  rule("PART 4 — DETERMINISTIC REVIEW CLASSIFICATION");

  section("Verified — the only state that requires everything to be right");
  stubFetch([{ raw: payload({ rows: 11, declared: 11 }) }]);
  {
    const r = await run();
    const q = r.quality;
    check("clean first-pass extraction classifies Verified", q.classification === "Verified", q.classification);
    check("quality is 100 when nothing is wrong", q.quality === 100, String(q.quality));
    check("quality band is Excellent", q.qualityBand === "Excellent", q.qualityBand);
    check("completeness is 100%", q.completenessPercentage === 100, String(q.completenessPercentage));
    check("retry count is zero", q.retryCount === 0, String(q.retryCount));
    check("no retry reasons", q.retryReasons.length === 0, JSON.stringify(q.retryReasons));
    check("totals recorded as Reconciled", q.reconciliationStatus === "Reconciled", q.reconciliationStatus);
    check("declared and extracted counts are both recorded",
      q.declaredLineCount === 11 && q.extractedLineCount === 11, `${q.declaredLineCount}/${q.extractedLineCount}`);
    check("model confidence is retained but not authoritative", typeof q.confidence === "number");
  }

  section("Needs Review — recovered, but it cost an attempt");
  stubFetch([
    { raw: payload({ rows: 3, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 11, declared: 11 }) },
  ]);
  {
    const q = (await run()).quality;
    check("a recovered extraction classifies Needs Review, not Verified",
      q.classification === "Needs Review", q.classification);
    check("the retry is counted", q.retryCount === 1, String(q.retryCount));
    check("the retry reason is recorded in plain language",
      q.retryReasons.some((reason) => /returned fewer rows/.test(reason)), JSON.stringify(q.retryReasons));
    check("no retry reason leaks a raw reason code",
      !q.retryReasons.some((reason) => /row-count-mismatch|totals-do-not-reconcile|no-line-items/.test(reason)),
      JSON.stringify(q.retryReasons));
    check("quality is penalised for the retry but stays high", q.quality === 90, String(q.quality));
  }

  section("Incomplete — the state that must not be reported as Needs Review");
  stubFetch([
    { raw: payload({ rows: 3, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 5, declared: 11, subtotal: 1100 }) },
    { raw: payload({ rows: 4, declared: 11, subtotal: 1100 }) },
  ]);
  {
    const q = (await run()).quality;
    check("a row shortfall surviving the final retry classifies Incomplete",
      q.classification === "Incomplete", q.classification);
    check("completeness percentage reflects the shortfall (5 of 11)",
      q.completenessPercentage === 45, String(q.completenessPercentage));
    check("two retries are counted", q.retryCount === 2, String(q.retryCount));
    check("quality falls into the Poor or Fair band", ["Poor", "Fair"].includes(q.qualityBand), q.qualityBand);
  }

  section("classification precedence and each Incomplete trigger");
  {
    // Row shortfall alone, everything else clean.
    const q = buildExtractionQualityRecord(norm(payload({ rows: 10, declared: 11, subtotal: 1000 })));
    check("declared rows exceeding extracted rows -> Incomplete", q.classification === "Incomplete", q.classification);
  }
  {
    // Totals irreconcilable, no declared count to appeal to.
    const q = buildExtractionQualityRecord(norm(payload({ rows: 3, each: 100, subtotal: 1200 })));
    check("totals that cannot be reconciled -> Incomplete", q.classification === "Incomplete", q.classification);
    check("reconciliation status says so", q.reconciliationStatus === "Not reconciled", q.reconciliationStatus);
  }
  {
    // Critical header fields missing, line items perfectly complete.
    const p = payload({ rows: 5, declared: 5, header: false, confidence: 80 });
    const q = buildExtractionQualityRecord(norm(p));
    check("missing critical invoice fields -> Incomplete", q.classification === "Incomplete", q.classification);
    check("the missing fields are named", q.missingFields.length > 0, JSON.stringify(q.missingFields));
  }
  {
    // Extracted MORE rows than declared. A discrepancy worth reviewing, but not
    // the truncation that Incomplete exists to name.
    const q = buildExtractionQualityRecord(norm(payload({ rows: 12, declared: 11, subtotal: 1200 })));
    check("MORE rows than declared -> Needs Review, not Incomplete",
      q.classification === "Needs Review", q.classification);
  }
  {
    // Both an Incomplete trigger and a Needs Review trigger are present.
    // Incomplete must win, or the distinction would never surface.
    const q = buildExtractionQualityRecord(norm(payload({ rows: 2, declared: 11, subtotal: 1100 })), {
      attempts: [{ outcome: "incomplete" }, { outcome: "accepted" }],
      modelUsed: "gpt-4o",
    });
    check("Incomplete takes precedence over Needs Review", q.classification === "Incomplete", q.classification);
  }

  // -------------------------------------------------------------------------
  rule("PART 5 — AUDIT RECORD AND OPERATIONAL KPIs");

  section("the persisted record survives a round trip through jsonb");
  {
    const original = buildExtractionQualityRecord(norm(payload({ rows: 3, declared: 11, subtotal: 1100 })), {
      attempts: [{ outcome: "incomplete" }, { outcome: "accepted" }],
      modelUsed: "gpt-4o",
    });
    // Exactly what Postgres stores and returns for a jsonb column.
    const restored = parseExtractionQualityRecord(JSON.parse(JSON.stringify(original)));
    check("the record parses back", restored !== null);
    check("every persisted metric round-trips intact",
      JSON.stringify(restored) === JSON.stringify(original),
      `${JSON.stringify(restored)} vs ${JSON.stringify(original)}`);
    for (const field of [
      "declaredLineCount", "extractedLineCount", "completenessPercentage",
      "retryCount", "retryReasons", "quality", "classification",
    ]) {
      check(`audit record persists ${field}`, restored[field] !== undefined);
    }
  }
  for (const legacy of [null, undefined, {}, { classification: "Excellent" }, "not an object", []]) {
    check(`a document with no usable record (${JSON.stringify(legacy) ?? "undefined"}) parses to null`,
      parseExtractionQualityRecord(legacy) === null);
  }

  section("KPI aggregation");
  {
    const record = (classification, retryCount, quality, completeness) => ({
      classification, retryCount, quality, completenessPercentage: completeness,
    });
    const kpis = summariseExtractionQuality([
      record("Verified", 0, 100, 100),
      record("Verified", 0, 100, 100),
      record("Verified", 1, 90, 100),   // verified but retried — not first-pass
      record("Needs Review", 1, 80, 100),
      record("Incomplete", 2, 40, 50),
    ]);
    check("documents assessed", kpis.documentsAssessed === 5, String(kpis.documentsAssessed));
    check("first-pass success counts only Verified with no retry",
      kpis.firstPassSuccessRate === 40, String(kpis.firstPassSuccessRate));
    check("retry rate", kpis.retryRate === 60, String(kpis.retryRate));
    check("average quality", kpis.averageQuality === 82, String(kpis.averageQuality));
    check("average completeness", kpis.averageCompleteness === 90, String(kpis.averageCompleteness));
    check("manual review rate", kpis.manualReviewRate === 20, String(kpis.manualReviewRate));
    check("incomplete rate", kpis.incompleteRate === 20, String(kpis.incompleteRate));
  }
  {
    // An empty period must read as "no data", never as "0% success".
    const kpis = summariseExtractionQuality([]);
    check("empty period reports no documents", kpis.documentsAssessed === 0);
    check("empty period reports null rates, not zero",
      kpis.firstPassSuccessRate === null && kpis.retryRate === null && kpis.averageQuality === null,
      JSON.stringify(kpis));
  }
  // -------------------------------------------------------------------------
  rule("PART 6 — CERTIFICATION MEASUREMENT");

  const { measurePageCount, measureAccuracy, moneyEqual } = await import(
    "./support/certification-measurements.mjs"
  );

  section("page count is measured, never guessed");
  {
    const twoPage = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Pages /Count 2>>endobj\n" +
        "2 0 obj<</Type /Page /Parent 1 0 R>>endobj\n3 0 obj<</Type /Page /Parent 1 0 R>>endobj\n",
      "latin1"
    );
    const result = measurePageCount(twoPage, "application/pdf");
    check("agreeing page tree and page objects give a count", result.pages === 2, JSON.stringify(result));
    check("no caveat when the two readings agree", result.note === null, String(result.note));
  }
  {
    // Disagreement must NOT be resolved by picking one. A wrong page count in a
    // certification report is worse than an absent one.
    const conflicted = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Pages /Count 5>>endobj\n2 0 obj<</Type /Page>>endobj\n",
      "latin1"
    );
    const result = measurePageCount(conflicted, "application/pdf");
    check("conflicting readings report undetermined, not a guess", result.pages === null, JSON.stringify(result));
    check("the conflict is explained", /tree says 5.*objects say 1/.test(result.note || ""), String(result.note));
  }
  {
    // A compressed object stream hides both readings.
    const opaque = Buffer.from("%PDF-1.7\n1 0 obj<</Type /ObjStm /N 12>>stream\n\x00\x01\x02\nendstream\n", "latin1");
    const result = measurePageCount(opaque, "application/pdf");
    check("an unreadable structure reports undetermined", result.pages === null, JSON.stringify(result));
    check("the reason is stated", /compressed object stream/.test(result.note || ""), String(result.note));
  }
  {
    const result = measurePageCount(Buffer.from("not a pdf"), "image/png");
    check("an image is one page", result.pages === 1, JSON.stringify(result));
  }
  for (const file of ["tmp-preview-invoice.pdf", "tmp-preview-real-invoice.pdf"]) {
    // Real PDF bytes, not a hand-built fixture.
    const { readFileSync, existsSync } = await import("node:fs");
    if (!existsSync(file)) continue;
    const result = measurePageCount(readFileSync(file), "application/pdf");
    check(`${file} yields a definite or explicitly undetermined result`,
      result.pages === null ? typeof result.note === "string" : result.pages > 0,
      JSON.stringify(result));
  }

  section("OCR accuracy is measured against an answer key, or not reported");
  {
    check("no answer key means no accuracy figure", measureAccuracy({}, null) === null);
    check("no answer key means no accuracy figure (undefined)", measureAccuracy({}, undefined) === null);
  }
  {
    const truth = {
      supplier: "Kingdom Foods Distribution (Pty) Ltd",
      invoiceNo: "KF-2026-004417",
      subtotal: 1200,
      total: 1380,
      expectedLineCount: 3,
      lineItems: [
        { description: "Cake Flour 12.5kg", quantity: "4", unitPrice: "100", lineTotal: "400" },
        { description: "Castor Sugar 10kg", quantity: "4", unitPrice: "100", lineTotal: "400" },
        { description: "Sunflower Oil 20L", quantity: "4", unitPrice: "100", lineTotal: "400" },
      ],
    };
    const perfect = {
      supplier: "Kingdom Foods Distribution (Pty) Ltd",
      invoiceNo: "KF-2026-004417",
      subtotal: 1200,
      total: 1380,
      lineItems: truth.lineItems.map((row) => ({ ...row })),
    };
    const a = measureAccuracy(perfect, truth);
    check("a perfect extraction measures 100%", a.fieldAccuracy === 100, String(a.fieldAccuracy));
    check("a perfect extraction needs no manual corrections", a.manualCorrections === 0, String(a.manualCorrections));
    check("no rows reported absent", a.missingRows === 0, String(a.missingRows));
  }
  {
    const truth = {
      supplier: "Kingdom Foods Distribution (Pty) Ltd",
      invoiceNo: "KF-2026-004417",
      subtotal: 1200,
      lineItems: [
        { description: "Cake Flour 12.5kg", lineTotal: "400" },
        { description: "Castor Sugar 10kg", lineTotal: "400" },
        { description: "Sunflower Oil 20L", lineTotal: "400" },
      ],
    };
    // One header field misread, one row never returned.
    const flawed = {
      supplier: "Kingdom Foods Distribution (Pty) Ltd",
      invoiceNo: "KF-2026-00441",
      subtotal: 1200,
      lineItems: [
        { description: "Cake Flour 12.5kg", lineTotal: "400" },
        { description: "Castor Sugar 10kg", lineTotal: "400" },
      ],
    };
    const a = measureAccuracy(flawed, truth);
    check("a misread invoice number is counted wrong", a.wrongFields.includes("invoiceNo"), JSON.stringify(a.wrongFields));
    check("an absent row is counted absent", a.missingRows === 1, String(a.missingRows));
    check("manual corrections counts every wrong or absent field",
      a.manualCorrections === 3, String(a.manualCorrections));
    check("accuracy is below 100 and above 0", a.fieldAccuracy > 0 && a.fieldAccuracy < 100, String(a.fieldAccuracy));
  }
  {
    // Only fields present in the answer key are judged; an unstated field is not
    // silently counted as correct.
    const a = measureAccuracy({ supplier: "X", invoiceNo: "Y" }, { supplier: "X" });
    check("only supplied ground-truth fields are scored", a.headerTotal === 1, String(a.headerTotal));
    check("accuracy reflects only what was verifiable", a.fieldAccuracy === 100, String(a.fieldAccuracy));
  }
  {
    check("money comparison tolerates formatting", moneyEqual("R 1 200.00", 1200));
    check("money comparison rejects a real difference", !moneyEqual("1200.00", 1201));
    check("money comparison rejects unparseable input", !moneyEqual("Needs Review", 1200));
  }

  section("answer-key discovery");
  {
    const { loadGroundTruth } = await import("./support/certification-measurements.mjs");
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const os = await import("node:os");
    const nodePath = await import("node:path");

    const dir = mkdtempSync(nodePath.join(os.tmpdir(), "vyron-cert-"));
    try {
      check("a directory with no answer key reports none", loadGroundTruth(dir).data === null);

      writeFileSync(nodePath.join(dir, "expected.json"), JSON.stringify({ "a.pdf": { expectedLineCount: 7 } }));
      const found = loadGroundTruth(dir);
      check("expected.json is discovered", found.data?.["a.pdf"]?.expectedLineCount === 7, JSON.stringify(found.data));
      check("the answer key path is reported", String(found.file).endsWith("expected.json"), String(found.file));

      writeFileSync(nodePath.join(dir, "expected.json"), "{ not json");
      let threw = null;
      try { loadGroundTruth(dir); } catch (error) { threw = error; }
      // A malformed key must stop the run. Silently continuing would produce a
      // report reading "not measured" for every document, which looks like a
      // missing key rather than a broken one.
      check("a malformed answer key throws rather than being ignored", threw instanceof Error, String(threw));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
} finally {
  // Cleanup: the process-global transport and console are restored whether or
  // not the checks above threw.
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
}

check("global fetch restored", globalThis.fetch === realFetch);

console.log(`\n${"=".repeat(96)}`);
console.log(`  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("=".repeat(96));
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
}
console.log(`${"=".repeat(96)}\n`);
process.exit(failures.length ? 1 : 0);
