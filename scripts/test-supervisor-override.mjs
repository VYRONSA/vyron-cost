#!/usr/bin/env node
/**
 * VYRON — supervisor override of an invoice approval policy block.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (Kingdom Foods, measured 2026-09-28)
 * ---------------------------------------------------------------------
 * An invoice blocked by company policy ("Not all invoice lines could be read",
 * "Line totals do not add up", "Figures on each line do not agree", "A purchase
 * order must be linked") opened the Supervisor Override dialog. After
 * "Supervisor override & approve" the invoice was still blocked.
 *
 * Root cause, traced through the real route:
 *   1. A PIN the server did not accept was treated as "no override at all". The
 *      response was byte-identical to the original policy block, and the dialog
 *      reopened blank. Production has no VYRON_DOCUMENT_SUPERVISOR_PIN set, so
 *      the only accepted PIN was the built-in default; any real supervisor PIN
 *      was silently refused.
 *   2. The override audit was computed from a validation run WITH the override
 *      switched on, which drops the overridden rules — the audit recorded only
 *      some of the blockers the supervisor saw, and the PO-link override audit
 *      was never written.
 *   3. Saving corrections on an approved invoice set status back to "reviewed",
 *      and re-approving it re-raised the overridden findings as a fresh block.
 *
 * Drives the REAL approve / corrections / validate route handlers with the real
 * session, tenant and policy code. Only the process boundary is replaced (an
 * in-memory database, cookies). Family A: no network, no database, no
 * credentials. Nothing here touches a real invoice.
 *
 *   npm run test:supervisor-override
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";
const SUPERVISOR_PIN = `qa-pin-${randomBytes(4).toString("hex")}`;
process.env.VYRON_DOCUMENT_SUPERVISOR_PIN = SUPERVISOR_PIN;

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_SUPERVISOR = uuid("a", 10), U_B = uuid("b", 10);
const DOC = uuid("d", 1);
const USERS = [
  { id: U_SUPERVISOR, email: "supervisor@qa-a.test", password: "qa-pass-supervisor" },
  { id: U_B, email: "owner@qa-b.test", password: "qa-pass-b" },
];

/** The extraction verdicts behind the three OCR blockers in the screenshots. */
const FAILED_EXTRACTION = {
  classification: "Needs Review",
  quality: 42,
  completenessStatus: "Incomplete",
  reconciliationStatus: "Not reconciled",
  columnMappingFailed: true,
};

/**
 * A synthetic Kingdom-Foods-shaped supplier invoice: every line matched and the
 * header agreeing with the lines, so the ONLY findings are the ones in the
 * screenshots. `requirePoLinked` adds the purchase-order rule (screenshot 2).
 */
function seed({ requirePoLinked = false, extraction = FAILED_EXTRACTION, lines, approvalRules } = {}) {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_SUPERVISOR, role: "OWNER", status: "Active", permissions: {} },
      { id: "m2", workspace_id: WS_B, user_id: U_B, role: "OWNER", status: "Active", permissions: {} },
    ],
    vyron_documents: [
      {
        id: DOC,
        tenant_id: CO_A,
        status: "reviewed",
        supplier_name: "QA Meat Supplier",
        invoice_number: "INV-QA-1001",
        invoice_date: "2026-09-20",
        purchase_order_id: null,
        purchase_order_number: null,
        subtotal: 1000,
        vat: 150,
        total: 1150,
        currency: "ZAR",
        field_confidence: { supplier: 95, invoiceNo: 95, invoiceDate: 95, total: 95 },
      },
    ],
    vyron_document_line_items: lines || [
      { id: "l1", document_id: DOC, description: "Beef mince 5kg", quantity: 4, unit: "kg", unit_price: 150, vat: 90, line_total: 690, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-1", matched_entity_name: "Beef mince" },
      { id: "l2", document_id: DOC, description: "Chicken fillet 2kg", quantity: 2, unit: "kg", unit_price: 200, vat: 60, line_total: 460, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-2", matched_entity_name: "Chicken fillet" },
    ],
    vyron_document_extraction_logs: [
      { id: "x1", document_id: DOC, stage: "extraction", status: "success", created_at: "2026-09-20T08:00:00Z", metadata: { extractionQuality: extraction } },
    ],
    // Explicit either way: with no row the PO-link rule defaults to ON.
    vyron_po_approval_rules: [{ id: "po-r", company_id: CO_A, require_po_before_invoice_approval: requirePoLinked }],
    vyron_document_approval_rules: approvalRules ? [{ id: "ar", tenant_id: CO_A, ...approvalRules }] : [],
    vyron_cost_ingredients: [
      { id: "ing-1", company_id: CO_A, ingredient_name: "Beef mince", purchase_unit: "kg", purchase_cost: 140 },
      { id: "ing-2", company_id: CO_A, ingredient_name: "Chicken fillet", purchase_unit: "kg", purchase_cost: 190 },
    ],
    vyron_document_approval_override_audit: [],
    vyron_document_po_link_override_audit: [],
    vyron_document_approval_audit: [],
    vyron_document_cost_audit: [],
    vyron_supplier_price_history: [],
    vyron_procurement_risk_alerts: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function useDb(seedTables, options) {
  db = createFakeSupabase(seedTables, options);
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const approveRoute = await importFromRoot("src/app/api/documents/[id]/review/approve/route.ts");
const correctionsRoute = await importFromRoot("src/app/api/documents/[id]/review/corrections/route.ts");
const validateRoute = await importFromRoot("src/app/api/documents/[id]/review/validate/route.ts");

/** Route tracing is verbose; keep the test output to the checks. */
async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

async function login(email, password) {
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

async function call(jar, handler, route, body) {
  setCookieJar(jar);
  const request = new NextRequest(new URL(`/api/documents/${DOC}/review/${route}`, "http://qa.local"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const res = await quietly(() => handler(request, { params: Promise.resolve({ id: DOC }) }));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const approve = (jar, body) => call(jar, approveRoute.POST, "approve", body);
const validate = (jar, body) => call(jar, validateRoute.POST, "validate", body);
const saveCorrections = (jar) =>
  call(jar, correctionsRoute.POST, "corrections", {
    fields: { supplierName: "QA Meat Supplier", invoiceNumber: "INV-QA-1001", invoiceDate: "2026-09-20", subtotal: 1000, vat: 150, total: 1150, currency: "ZAR" },
    lines: [],
  });

/** Exactly what the review screen sends from the override dialog. */
const overrideBody = (pin, reason) => ({
  force: false,
  forceTotalsMismatch: false,
  reconciliationNote: null,
  supervisorOverride: { pin, reason, overriddenBy: "supervisor" },
});

const doc = () => db.tables.vyron_documents.find((d) => d.id === DOC);
const rows = (table) => db.tables[table] || [];
const costWrites = () => rows("vyron_document_cost_audit").length + rows("vyron_supplier_price_history").length;
const ruleSet = (violations) => (violations || []).map((v) => v.rule).sort().join(",");

const SCREENSHOT_1_RULES = ["extraction_column_mapping_failed", "extraction_incomplete", "extraction_totals_not_reconciled"].sort().join(",");
const SCREENSHOT_2_RULES = [...SCREENSHOT_1_RULES.split(","), "require_po_linked"].sort().join(",");

useDb(seed());
const jarA = await login("supervisor@qa-a.test", "qa-pass-supervisor");
const jarB = await login("owner@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", Boolean(jarA.vyron_workspace_user_session && jarB.vyron_workspace_user_session));

console.log("\n1. Invoice blocked by policy stays blocked");
{
  useDb(seed());
  const r = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("approval without override → 400 policyBlocked", r.status === 400 && r.json?.policyBlocked === true, JSON.stringify(r.json).slice(0, 300));
  check("the findings are exactly the three in screenshot 1", ruleSet(r.json?.violations) === SCREENSHOT_1_RULES, ruleSet(r.json?.violations));
  check("the invoice is not approved", doc().status === "reviewed" && !doc().approved_at);
  check("no override recorded, no cost written", rows("vyron_document_approval_override_audit").length === 0 && costWrites() === 0);
}

console.log("\n10. Normal approval without override still respects every blocker");
{
  useDb(seed({ requirePoLinked: true }));
  const r = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("PO-link rule plus extraction findings → 400 policyBlocked", r.status === 400 && r.json?.policyBlocked === true);
  check("the findings are exactly the four in screenshot 2", ruleSet(r.json?.violations) === SCREENSHOT_2_RULES, ruleSet(r.json?.violations));
  check("the override flag the client can set on validate does not approve anything", doc().status === "reviewed");
  const forced = await approve(jarA, { force: true, forceTotalsMismatch: true });
  check("a clerk's force flags do not clear the PO-link rule", forced.status === 400 && forced.json?.policyBlocked === true && ruleSet(forced.json?.violations).includes("require_po_linked"));
  check("still not approved", doc().status === "reviewed");
  // Existing behaviour, recorded rather than changed: with no rules row the PO-link rule is ON.
  const noRow = seed();
  noRow.vyron_po_approval_rules = [];
  useDb(noRow);
  const d = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("a tenant with no PO rules row still requires a linked PO (default on)", ruleSet(d.json?.violations).includes("require_po_linked"));
}

console.log("\n6. Invalid supervisor PIN → override fails, and says so");
{
  useDb(seed());
  const r = await approve(jarA, overrideBody("1234", "Checked every line against the paper invoice"));
  check("wrong PIN → 403 supervisorOverrideRejected", r.status === 403 && r.json?.supervisorOverrideRejected === true, JSON.stringify(r.json));
  check("the refusal is distinguishable from a fresh policy block", r.json?.policyBlocked !== true && /PIN not accepted/.test(r.json?.error || ""));
  check("not approved, nothing recorded, no cost written", doc().status === "reviewed" && rows("vyron_document_approval_override_audit").length === 0 && costWrites() === 0);
  const def = await approve(jarA, overrideBody("vyron-supervisor", "Checked every line against the paper invoice"));
  check("the built-in default PIN is refused once a tenant PIN is configured", def.status === 403 && doc().status === "reviewed");
}

console.log("\n7. Missing override reason → override fails");
{
  useDb(seed());
  const r = await approve(jarA, overrideBody(SUPERVISOR_PIN, "   "));
  check("valid PIN, blank reason → 400 supervisorOverrideRejected", r.status === 400 && r.json?.supervisorOverrideRejected === true && /reason is required/.test(r.json?.error || ""), JSON.stringify(r.json));
  check("not approved, nothing recorded", doc().status === "reviewed" && rows("vyron_document_approval_override_audit").length === 0 && costWrites() === 0);
}

console.log("\n8. Unauthorised callers cannot override");
{
  useDb(seed());
  const anon = await approve({}, overrideBody(SUPERVISOR_PIN, "reason"));
  check("no session, correct PIN → refused (401/403)", anon.status === 401 || anon.status === 403, String(anon.status));
  const otherTenant = await approve(jarB, overrideBody(SUPERVISOR_PIN, "reason"));
  check("another tenant's member, correct PIN → refused (403)", otherTenant.status === 403, String(otherTenant.status));
  check("neither approved nor recorded anything", doc().status === "reviewed" && rows("vyron_document_approval_override_audit").length === 0 && costWrites() === 0);
}

console.log("\n2-5. Kingdom Foods screenshot scenario: valid override approves and is fully recorded");
for (const [label, requirePoLinked, expectedRules] of [
  ["screenshot 1 (OCR findings)", false, SCREENSHOT_1_RULES],
  ["screenshot 2 (OCR findings + PO must be linked)", true, SCREENSHOT_2_RULES],
]) {
  console.log(`  — ${label}`);
  useDb(seed({ requirePoLinked }));
  const blocked = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("the dialog's findings", ruleSet(blocked.json?.violations) === expectedRules, ruleSet(blocked.json?.violations));

  const reason = "Checked every line against the paper invoice; OCR misread the weight column";
  const r = await approve(jarA, overrideBody(SUPERVISOR_PIN, reason));
  check("2. valid PIN + reason → approved (200)", r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 300));
  check("   costs were applied once", rows("vyron_document_cost_audit").length === 2);

  const audit = rows("vyron_document_approval_override_audit");
  check("3. exactly one override audit row", audit.length === 1);
  const o = audit[0] || {};
  check("3. overridden_by is the signed-in user, not the browser's label", o.overridden_by === U_SUPERVISOR, String(o.overridden_by));
  check("3. reason, tenant and document recorded", o.override_reason === reason && o.tenant_id === CO_A && o.document_id === DOC);
  check("3. resulting approval state recorded", o.metadata?.resultingStatus === "archived" && Boolean(o.metadata?.approvedAt) && o.metadata?.declaredBy === "supervisor");
  check("5. every original blocker is in rules_bypassed", [...(o.rules_bypassed || [])].sort().join(",") === expectedRules, [...(o.rules_bypassed || [])].sort().join(","));
  check("5. the findings' text is preserved", ruleSet(o.violations_snapshot) === expectedRules && (o.violations_snapshot || []).every((v) => v.message));
  const po = rows("vyron_document_po_link_override_audit");
  check(requirePoLinked ? "5. PO-link override audit written" : "5. no PO-link override audit when no PO rule", requirePoLinked ? po.length === 1 && po[0].overridden_by === U_SUPERVISOR && po[0].override_reason === reason : po.length === 0);
  const approval = rows("vyron_document_approval_audit")[0] || {};
  check("5. the approval audit carries the findings and the override", ruleSet(approval.metadata?.policyFindings) === expectedRules && approval.metadata?.supervisorOverride?.overrideAuditId === o.id);

  check("4. invoice persisted as approved", doc().status === "archived" && Boolean(doc().approved_at));
  check("4. the override is visible on the invoice record", /Supervisor override by/.test(doc().processing_notes || "") && (doc().processing_notes || "").includes(reason));

  console.log("  — 9. reload / recalculation does not undo it");
  const recheck = await validate(jarA, {});
  check("9. re-validating still reports the original findings (auditable)", recheck.status === 200 && ruleSet(recheck.json?.validation?.violations).includes("extraction_incomplete"));
  check("9. …and re-validating does not change the approval", doc().status === "archived");
  const again = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("9. re-approving reports 'already approved', not a fresh policy block", again.status === 409 && again.json?.alreadyApproved === true && again.json?.policyBlocked !== true, JSON.stringify(again.json));
  const againOverride = await approve(jarA, overrideBody(SUPERVISOR_PIN, reason));
  check("9. a second override cannot re-apply costs", againOverride.status === 409 && rows("vyron_document_cost_audit").length === 2 && rows("vyron_document_approval_override_audit").length === 1);
  const saved = await saveCorrections(jarA);
  check("9. saving corrections cannot flip it back to 'reviewed'", saved.status === 409 && doc().status === "archived", `${saved.status} ${doc().status}`);
}

const SOUND_EXTRACTION = { classification: "Verified", quality: 100, completenessStatus: "Complete", reconciliationStatus: "Reconciled", columnMappingFailed: false };
const UNMAPPED_LINES = [
  { id: "l1", document_id: DOC, description: "Beef mince 5kg", quantity: 4, unit: "kg", unit_price: 150, vat: 90, line_total: 690, ignored: false, matched_entity_type: null, matched_entity_id: null },
  { id: "l2", document_id: DOC, description: "Chicken fillet 2kg", quantity: 2, unit: "kg", unit_price: 200, vat: 60, line_total: 460, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-2", matched_entity_name: "Chicken fillet" },
];
/** Lines that fall R115 short of the invoice header: a major totals mismatch. */
const SHORT_LINES = [
  { id: "l1", document_id: DOC, description: "Beef mince 5kg", quantity: 4, unit: "kg", unit_price: 125, vat: 75, line_total: 575, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-1", matched_entity_name: "Beef mince" },
  { id: "l2", document_id: DOC, description: "Chicken fillet 2kg", quantity: 2, unit: "kg", unit_price: 200, vat: 60, line_total: 460, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-2", matched_entity_name: "Chicken fillet" },
];
/** Exactly what the review screen sends after "N line(s) are not matched. Approve anyway?" and a totals reason. */
const CLERK_APPROVE_ANYWAY = { force: true, forceTotalsMismatch: true, reconciliationNote: "Supplier short-shipped; will credit" };

console.log("\nC. A clerk's \"Approve anyway?\" cannot bypass supervisor-only blockers");
{
  useDb(seed());
  const r = await approve(jarA, CLERK_APPROVE_ANYWAY);
  check("clerk force flags on the screenshot-1 invoice → still 400 policyBlocked", r.status === 400 && r.json?.policyBlocked === true, JSON.stringify(r.json).slice(0, 200));
  check("…with every original finding", ruleSet(r.json?.violations) === SCREENSHOT_1_RULES, ruleSet(r.json?.violations));
  check("…not approved, no cost written, no override recorded", doc().status === "reviewed" && costWrites() === 0 && rows("vyron_document_approval_override_audit").length === 0);

  useDb(seed({ extraction: SOUND_EXTRACTION, lines: UNMAPPED_LINES }));
  const unmapped = await approve(jarA, { force: true, forceTotalsMismatch: false });
  check("unmatched lines under 'require matched lines' + force → blocked", unmapped.status === 400 && ruleSet(unmapped.json?.violations).includes("require_matched_line_items"), JSON.stringify(unmapped.json).slice(0, 200));
  check("…not approved", doc().status === "reviewed");

  useDb(seed({ extraction: SOUND_EXTRACTION, lines: SHORT_LINES }));
  const short = await approve(jarA, CLERK_APPROVE_ANYWAY);
  check("a major totals mismatch + forceTotalsMismatch + a note → blocked", short.status === 400 && ruleSet(short.json?.violations).includes("major_totals_mismatch"), JSON.stringify(short.json).slice(0, 200));
  check("…not approved", doc().status === "reviewed");
  const pre = await validate(jarA, { force: true, forceTotalsMismatch: true });
  check("the pre-check agrees, so the supervisor dialog opens up front", pre.status === 200 && pre.json?.policyBlocked === true);

  const sup = await approve(jarA, { ...CLERK_APPROVE_ANYWAY, supervisorOverride: { pin: SUPERVISOR_PIN, reason: "Credit note agreed with supplier", overriddenBy: "supervisor" } });
  check("the same invoice is approvable through the explicit supervisor override", sup.status === 200 && doc().status === "archived", JSON.stringify(sup.json).slice(0, 200));
  const o = rows("vyron_document_approval_override_audit")[0] || {};
  check("…and the override records the totals findings the clerk could not clear", (o.rules_bypassed || []).includes("major_totals_mismatch") && o.overridden_by === U_SUPERVISOR);
  const approvalAudit = rows("vyron_document_approval_audit")[0] || {};
  check("…and the approval audit still records what the clerk asked for", approvalAudit.metadata?.forceApproval === true && approvalAudit.metadata?.forceTotalsMismatch === true);

  // Legitimate clerk approvals that never bypassed policy are unchanged.
  useDb(seed({ extraction: SOUND_EXTRACTION, lines: UNMAPPED_LINES, approvalRules: { require_matched_line_items: false, block_unmapped_lines: false } }));
  const allowed = await approve(jarA, { force: true, forceTotalsMismatch: false });
  check("where the company does not require matched lines, 'Approve anyway?' still approves", allowed.status === 200 && doc().status === "archived", JSON.stringify(allowed.json).slice(0, 200));
  check("…only the matched line updates cost", rows("vyron_document_cost_audit").length === 1);
  check("…and no supervisor override was needed or recorded", rows("vyron_document_approval_override_audit").length === 0);

  useDb(seed({ extraction: SOUND_EXTRACTION }));
  const clean = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("a clean invoice is approved by the clerk as before", clean.status === 200 && doc().status === "archived");
}

console.log("\nAn override that cannot be recorded does not approve");
{
  useDb(seed(), { missingTables: ["vyron_document_approval_override_audit"] });
  const r = await approve(jarA, overrideBody(SUPERVISOR_PIN, "reason"));
  check("audit table unavailable → 500, not approved", r.status === 500 && doc().status === "reviewed", JSON.stringify(r.json));
  check("no cost written", costWrites() === 0);
}

console.log("\nA sound invoice needs no override");
{
  useDb(seed({ extraction: { classification: "Verified", quality: 100, completenessStatus: "Complete", reconciliationStatus: "Reconciled", columnMappingFailed: false } }));
  const r = await approve(jarA, { force: false, forceTotalsMismatch: false });
  check("clean invoice approves normally (200)", r.status === 200 && doc().status === "archived");
  check("no override recorded", rows("vyron_document_approval_override_audit").length === 0);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
