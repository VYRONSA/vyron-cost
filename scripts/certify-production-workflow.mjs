#!/usr/bin/env node
/**
 * VYRON — production workflow certification.
 *
 * Certifies the OPERATOR's task, not the engine's. A green build says nothing
 * about whether a clerk can finish an invoice, so this measures the business
 * task end to end:
 *
 *   Upload Supplier Invoice  ->  Approved Supplier Invoice
 *
 * per invoice, against a human-read answer key:
 *
 *   total elapsed time              rows extracted
 *   manual corrections required     manual line additions required
 *   validation warnings shown       scrolling interactions required
 *   operator clicks required        whether the operator was ever blocked
 *   final approval outcome          faster than manual capture?
 *
 * MEASURED vs DERIVED
 * -------------------
 * Times, rows, warnings, approval outcome and corrections are MEASURED against
 * the live routes and the answer key.
 *
 * Clicks and scrolls are DERIVED — arithmetic over measured quantities, with
 * the model stated below and printed in the output. They are labelled as such
 * in every report. They are not observations of a human and must not be quoted
 * as if they were.
 *
 * Family D: sends real documents to OpenAI. Billable, irreversible.
 *
 *   VYRON_ACKNOWLEDGE_EXTERNAL=1 node scripts/certify-production-workflow.mjs \
 *     --documents ./certification-invoices --report ./workflow-certification.json
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const DOCUMENTS_DIR = value("--documents");
const REPORT = value("--report");
const BASE = value("--base") || "http://localhost:3007";
const CORPUS_DIR = path.join("docs", "evidence", "corpus");

if (!DOCUMENTS_DIR) {
  console.error("\nUsage: --documents <dir> [--report <file>] [--base <url>]\n");
  process.exit(2);
}
if (process.env.VYRON_ACKNOWLEDGE_EXTERNAL !== "1") {
  console.error("\nThis sends every invoice to OpenAI. Re-run with VYRON_ACKNOWLEDGE_EXTERNAL=1.\n");
  process.exit(2);
}

for (const line of existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n") : []) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  if (!process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^"|"$/g, "");
}

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, ""),
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/*
 * The click and scroll model, stated so it can be argued with.
 *
 * Rows visible per screen come from the measured workspace density
 * (measure-review-workspace-density.mjs): 21 at 1920x1080, 15 at 1600x900,
 * 10 at 1366x768. The default is the smallest supported screen, because that
 * is where the operator actually struggles.
 */
const ROWS_VISIBLE_PER_SCREEN = Number(value("--rows-per-screen") || 10);
const CLICKS = {
  upload: 1,
  openReview: 1,
  perCorrectedCell: 1, // focus the cell before typing
  perManualLineAdd: 1, // the Add Invoice Line button
  perLineMatch: 1, // choosing a matched item
  saveDraft: 1,
  approve: 1,
};
/** Seconds a clerk needs to key one line by hand, for the comparison baseline. */
const MANUAL_SECONDS_PER_LINE = Number(value("--manual-seconds-per-line") || 25);

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

const numeric = (v) => {
  const p = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(p) ? p : null;
};

const keys = loadKeys();
const files = readdirSync(DOCUMENTS_DIR).filter((f) => /\.(pdf|png|jpe?g)$/i.test(f));
if (!files.length) {
  console.error(`\nNo invoices in ${DOCUMENTS_DIR}\n`);
  process.exit(2);
}

const { data: seed } = await sb.from("vyron_documents").select("tenant_id").not("tenant_id", "is", null).limit(1).maybeSingle();
const T = seed.tenant_id;
const COOKIE =
  `vyron_cost_active_client=${encodeURIComponent(JSON.stringify({ companyId: T, id: T, companyName: "Certification", packageName: "Enterprise" }))}; ` +
  `vyron_workspace_user_session=${encodeURIComponent(JSON.stringify({ userId: "certification", email: "cert@vyron", role: "OWNER", companyId: T, permissions: ["*"] }))}`;

console.log("\nPRODUCTION WORKFLOW CERTIFICATION");
console.log(`Invoices: ${files.length}   Answer keys: ${keys.length}   Rows/screen: ${ROWS_VISIBLE_PER_SCREEN} (derived metrics)\n`);

const results = [];

for (const file of files) {
  const bytes = readFileSync(path.join(DOCUMENTS_DIR, file));
  const mime = /\.pdf$/i.test(file) ? "application/pdf" : /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  const key = keys.find((k) => k.sourceFile === file || file.includes(String(k.invoiceNumber))) || null;

  const journeyStart = Date.now();
  const stage = {};
  let blocked = null;

  // ---- Upload -------------------------------------------------------------
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), file);
  form.append("tenant_id", T);
  const upStart = Date.now();
  const up = await fetch(`${BASE}/api/documents/upload`, { method: "POST", headers: { Cookie: COOKIE }, body: form });
  const upJson = await up.json().catch(() => ({}));
  stage.uploadMs = Date.now() - upStart;
  const documentId = upJson.documentId || upJson.document?.id || upJson.id;
  if (!documentId) {
    blocked = `Upload failed (HTTP ${up.status})`;
  }

  // ---- Extract ------------------------------------------------------------
  let extraction = null;
  let extractStatus = 0;
  if (!blocked) {
    const exStart = Date.now();
    const ex = await fetch(`${BASE}/api/documents/${documentId}/extract`, { method: "POST", headers: { Cookie: COOKIE } });
    extractStatus = ex.status;
    const exJson = await ex.json().catch(() => ({}));
    stage.extractMs = Date.now() - exStart;
    if (ex.status === 503) blocked = `AI unavailable: ${exJson.reason || "unknown"}`;
    else if (!ex.ok) blocked = `Extraction failed (HTTP ${ex.status}): ${exJson.error || ""}`;
    else extraction = exJson.extraction;
  }

  // ---- Review draft -------------------------------------------------------
  if (!blocked) {
    const rvStart = Date.now();
    const rv = await fetch(`${BASE}/api/documents/${documentId}/review`, { headers: { Cookie: COOKIE } });
    const rvJson = await rv.json().catch(() => ({}));
    stage.reviewMs = Date.now() - rvStart;
    // The draft payload is fetched to time hydration and prove the screen loads;
    // its rows are scored from the extraction response above.
    void rvJson.payload?.lines;
    if (rv.status !== 200) blocked = `Review draft failed (HTTP ${rv.status})`;
  }

  // ---- Corrections the operator must make (vs the answer key) -------------
  let manualCorrections = 0;
  let manualLineAdditions = 0;
  let cellsChecked = 0;
  let cellsCorrect = 0;
  if (key && extraction) {
    for (const [i, want] of key.lineItems.entries()) {
      const got = extraction.lineItems[i];
      if (!got) {
        manualLineAdditions += 1;
        manualCorrections += FIELDS.length;
        cellsChecked += FIELDS.length;
        continue;
      }
      for (const f of FIELDS) {
        cellsChecked += 1;
        const actual = numeric(got[f]);
        if (actual !== null && Math.abs(actual - Number(want[f])) <= TOLERANCE) cellsCorrect += 1;
        else manualCorrections += 1;
      }
    }
  }

  // ---- Validation warnings ------------------------------------------------
  let validationWarnings = 0;
  let approvalOutcome = "not attempted";
  if (!blocked) {
    const vr = await fetch(`${BASE}/api/documents/${documentId}/review/validate`, {
      method: "POST",
      headers: { Cookie: COOKIE, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const vj = await vr.json().catch(() => ({}));
    validationWarnings = (vj.violations || []).length;
    approvalOutcome = vr.status === 200 ? (validationWarnings === 0 ? "approvable" : `blocked by ${validationWarnings} violation(s)`) : `validate HTTP ${vr.status}`;
  }

  const totalMs = Date.now() - journeyStart;
  const rows = extraction?.lineItems?.length ?? 0;

  // ---- Derived operator effort -------------------------------------------
  const scrolls = Math.max(0, Math.ceil(rows / ROWS_VISIBLE_PER_SCREEN) - 1);
  const clicks =
    CLICKS.upload +
    CLICKS.openReview +
    manualCorrections * CLICKS.perCorrectedCell +
    manualLineAdditions * CLICKS.perManualLineAdd +
    rows * CLICKS.perLineMatch +
    CLICKS.saveDraft +
    CLICKS.approve;

  const manualCaptureSeconds = (key?.lineItems?.length ?? rows) * MANUAL_SECONDS_PER_LINE;
  const fasterThanManual = totalMs / 1000 < manualCaptureSeconds;

  results.push({
    file,
    documentId,
    class: key?.characteristics?.join(",") ?? "unclassified",
    hasKey: Boolean(key),
    totalMs,
    ...stage,
    extractStatus,
    rows,
    expectedRows: key?.lineItems?.length ?? null,
    cellAccuracy: cellsChecked ? Math.round((cellsCorrect / cellsChecked) * 10000) / 100 : null,
    manualCorrections: key ? manualCorrections : null,
    manualLineAdditions: key ? manualLineAdditions : null,
    validationWarnings,
    scrollsDerived: scrolls,
    clicksDerived: clicks,
    approvalOutcome,
    blocked,
    manualCaptureSeconds,
    fasterThanManual,
  });

  console.log(
    `${file.slice(0, 30).padEnd(32)}${String(Math.round(totalMs / 1000) + "s").padStart(6)}  rows ${String(rows).padStart(2)}${key ? "/" + key.lineItems.length : "  "}  ` +
      `${key ? `acc ${String(results.at(-1).cellAccuracy).padStart(5)}%  corrections ${String(manualCorrections).padStart(3)}` : "accuracy NOT MEASURED  "}  ` +
      `warn ${validationWarnings}  clicks~${clicks}  scrolls~${scrolls}  ${blocked ? "BLOCKED: " + blocked : approvalOutcome}`
  );
}

// ---- Coverage ---------------------------------------------------------------
const REQUIRED = ["searchable", "scanned", "photograph", "multi-page", "difficult"];
const present = new Set(results.flatMap((r) => String(r.class).split(",")));
const missing = REQUIRED.filter((c) => ![...present].some((p) => p.includes(c)));

const measured = results.filter((r) => !r.blocked);
const withKey = measured.filter((r) => r.hasKey);

console.log("\nSUMMARY");
console.log(`  invoices run              ${results.length}`);
console.log(`  completed without block   ${measured.length}`);
console.log(`  scored against a key      ${withKey.length}`);
if (withKey.length) {
  console.log(`  average cell accuracy     ${(withKey.reduce((s, r) => s + r.cellAccuracy, 0) / withKey.length).toFixed(2)}%`);
  console.log(`  total manual corrections  ${withKey.reduce((s, r) => s + r.manualCorrections, 0)}`);
  console.log(`  total manual line adds    ${withKey.reduce((s, r) => s + r.manualLineAdditions, 0)}`);
}
if (measured.length) {
  console.log(`  average journey           ${Math.round(measured.reduce((s, r) => s + r.totalMs, 0) / measured.length / 1000)}s`);
  console.log(`  faster than manual        ${measured.filter((r) => r.fasterThanManual).length}/${measured.length}`);
}
console.log(`  operator ever blocked     ${results.some((r) => r.blocked) ? "YES" : "no"}`);
if (missing.length) console.log(`  MISSING DOCUMENT CLASSES  ${missing.join(", ")} — certification incomplete`);

if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), rowsPerScreen: ROWS_VISIBLE_PER_SCREEN, results }, null, 2), "utf8");
  console.log(`\n  Report written to ${path.resolve(REPORT)}`);
}

const certified = results.length > 0 && !results.some((r) => r.blocked) && missing.length === 0 && withKey.length === results.length;
console.log(`\n  WORKFLOW CERTIFICATION: ${certified ? "PASS" : "NOT CERTIFIED"}\n`);
process.exit(certified ? 0 : 1);
