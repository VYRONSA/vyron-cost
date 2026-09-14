#!/usr/bin/env node
/**
 * VYRON — finance export security regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * GET /api/finance-exports/[type] checked no session at all and read a fixed
 * tenant, VYRON_DEFAULT_TENANT_ID (an environment variable with a hard-coded
 * fallback). Anyone on the internet could download up to 500 rows per export
 * — supplier invoices, purchase orders, GRNs, stock adjustments, production
 * journals, recovery journals, supplier price changes — for whichever company
 * that id named, and a signed-in member was served that company's data rather
 * than their own.
 *
 * WHAT THIS PROVES
 * ----------------
 * The export route, the session, access and workspace modules run unmodified
 * against synthetic tenants; sessions come from the real login route and are
 * the real signed tokens. Only cookies(), the database and the password check
 * are substituted (scripts/support/session-security-test-hook.mjs).
 *
 *   Every export type: anonymous 401, malformed 401, forged 401, no
 *   reports.export 403, exporter gets exactly their own tenant, a company
 *   hint / tenant parameter / header cannot select another tenant, the fixed
 *   default tenant is unreachable, limits and filters as before, columns and
 *   CSV as before.
 *
 * Family A: in-memory database with disposable QA tenants, no network, no
 * credentials (a random signing key for this process only), no writes outside
 * this process.
 *
 *   npm run test:finance-export-security
 */

import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
delete process.env.VYRON_DEFAULT_TENANT_ID;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

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

/* ---------------------------------------------------------------- fixtures */

const { VYRON_DEFAULT_TENANT_ID } = await importFromRoot("src/lib/vyron-documents.ts");
const uuid = (t, n) => `${t}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_EXPORTER = uuid("a", 10), U_NO_EXPORT = uuid("a", 11), U_B = uuid("b", 10);

const USERS = [
  { id: U_EXPORTER, email: "exporter@qa-a.test", password: "qa-pass-exporter" },
  { id: U_NO_EXPORT, email: "clerk@qa-a.test", password: "qa-pass-clerk" },
  { id: U_B, email: "exporter@qa-b.test", password: "qa-pass-b" },
];
const EXPORTER = { "reports.view": true, "reports.export": true, "dashboard.view": true };
const CLERK = { "reports.view": true, "reports.export": false, "dashboard.view": true, "invoices.view": true };

/** Rows for one tenant. Every row carries the tenant's marker so the output can be attributed. */
function tenantRows(marker, companyId, n) {
  const at = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
  const rows = {
    vyron_documents: [], vyron_cost_purchase_orders: [], vyron_cost_goods_receipts: [], vyron_cost_stock_ledger: [],
    vyron_cost_production_runs: [], vyron_recovery_calculations: [], vyron_supplier_price_history: [],
  };
  for (let i = 0; i < n.docs; i += 1) rows.vyron_documents.push({ id: `${marker}-doc-${i}`, tenant_id: companyId, document_number: `${marker}-DOC-${i}`, supplier_name: i === 0 ? `Quote "${marker}", Co` : `${marker} Supplier`, total: 100 + i, status: "Approved", invoice_date: "2026-01-01", created_at: at(i), deleted_at: null });
  rows.vyron_documents.push({ id: `${marker}-doc-deleted`, tenant_id: companyId, document_number: `${marker}-DOC-DELETED`, supplier_name: "x", total: 1, status: "Approved", invoice_date: "2026-01-01", created_at: at(0), deleted_at: at(1) });
  for (let i = 0; i < n.pos; i += 1) rows.vyron_cost_purchase_orders.push({ id: `${marker}-po-${i}`, company_id: companyId, po_number: `${marker}-PO-${i}`, supplier_name_snapshot: `${marker} Supplier`, status: "Approved", subtotal: 100, vat_amount: 15, total: 115, order_date: "2026-01-01", created_at: at(i) });
  for (let i = 0; i < n.grns; i += 1) rows.vyron_cost_goods_receipts.push({ id: `${marker}-grn-${i}`, company_id: companyId, grn_number: `${marker}-GRN-${i}`, supplier_name_snapshot: `${marker} Supplier`, receipt_type: "PO", status: "Received", received_at: at(i), purchase_order_id: `${marker}-po-${i}` });
  for (let i = 0; i < n.ledger; i += 1) rows.vyron_cost_stock_ledger.push({ id: `${marker}-led-${i}`, company_id: companyId, movement_type: ["Adjustment", "Stock Count Variance", "Manual Correction"][i % 3], quantity_in: 1, quantity_out: 0, value: 10, movement_date: at(i), reference_type: "count", reference_id: `${marker}-REF-${i}` });
  rows.vyron_cost_stock_ledger.push({ id: `${marker}-led-receipt`, company_id: companyId, movement_type: "Receipt", quantity_in: 5, quantity_out: 0, value: 50, movement_date: at(0), reference_type: "grn", reference_id: `${marker}-REF-RECEIPT` });
  for (let i = 0; i < n.runs; i += 1) rows.vyron_cost_production_runs.push({ id: `${marker}-run-${i}`, company_id: companyId, run_number: `${marker}-RUN-${i}`, product_name_snapshot: `${marker} Pie`, status: "Completed", actual_cost: 40, completed_at: at(i) });
  rows.vyron_cost_production_runs.push({ id: `${marker}-run-open`, company_id: companyId, run_number: `${marker}-RUN-OPEN`, product_name_snapshot: `${marker} Pie`, status: "In Progress", actual_cost: 0, completed_at: null });
  for (let i = 0; i < n.recovery; i += 1) rows.vyron_recovery_calculations.push({ tenant_id: companyId, opportunity_key: `${marker}-REC-${i}`, title: `${marker} saving`, monthly_recovery: 10, annual_recovery: 120, tracking_status: "Open", recovered_to_date: 0 });
  for (let i = 0; i < n.prices; i += 1) rows.vyron_supplier_price_history.push({ tenant_id: companyId, supplier_name: `${marker} Supplier`, entity_name: `${marker}-ITEM-${i}`, previous_price: 1, new_price: 1.1, percentage_change: 10, created_at: at(i) });
  return rows;
}
const BIG = { docs: 520, pos: 510, grns: 510, ledger: 510, runs: 320, recovery: 320, prices: 420 };
const SMALL = { docs: 3, pos: 3, grns: 3, ledger: 3, runs: 3, recovery: 3, prices: 3 };

function seed() {
  const a = tenantRows("A", CO_A, BIG);
  const b = tenantRows("B", CO_B, SMALL);
  const d = tenantRows("DEFAULT", VYRON_DEFAULT_TENANT_ID, SMALL);
  const merged = {};
  for (const src of [a, b, d]) for (const [t, rows] of Object.entries(src)) merged[t] = (merged[t] || []).concat(rows);
  return {
    ...merged,
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Professional", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Professional", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_EXPORTER, role: "PROCUREMENT", status: "Active", permissions: EXPORTER },
      { id: "m2", workspace_id: WS_A, user_id: U_NO_EXPORT, role: "PROCUREMENT", status: "Active", permissions: CLERK },
      { id: "m3", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: EXPORTER },
    ],
    vyron_contacts: [],
  };
}

/* What each export returns, as the Accounting Export Centre turns it into CSV columns. */
const TYPES = {
  invoices: { limit: 500, marker: (r) => r.document_number, cols: ["document_id", "document_number", "supplier_name", "total", "status", "invoice_date", "created_at"], exact: true },
  "purchase-orders": { limit: 500, marker: (r) => r.po_number, cols: ["po_id", "po_number", "supplier", "status", "subtotal", "vat", "total", "order_date"], exact: true },
  grns: { limit: 500, marker: (r) => r.grn_number, cols: ["grn_id", "grn_number", "supplier", "receipt_type", "status", "received_at", "purchase_order_id"], exact: true },
  "inventory-adjustments": { limit: 500, marker: (r) => r.reference_id, cols: ["id", "movement_type", "quantity_in", "quantity_out", "value", "movement_date", "reference_type", "reference_id"], exact: false },
  "production-journals": { limit: 300, marker: (r) => r.run_number, cols: ["run_id", "run_number", "product", "actual_cost", "completed_at"], exact: true },
  "recovery-journals": { limit: 300, marker: (r) => r.opportunity_key, cols: ["opportunity_key", "title", "monthly_recovery", "annual_recovery", "tracking_status", "recovered_to_date"], exact: false },
  "cost-updates": { limit: 400, marker: (r) => r.entity_name, cols: ["supplier_name", "entity_name", "previous_price", "new_price", "percentage_change", "created_at"], exact: false },
};

/* ------------------------------------------------------------ route calls */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const exportRoute = await importFromRoot("src/app/api/finance-exports/[type]/route.ts");

let db;
db = createFakeSupabase(seed());
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, users: USERS, cookies: new Map() };
const browser = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

async function login(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function exportRows(type, { query = "", headers = {} } = {}) {
  const res = await exportRoute.GET(new NextRequest(new URL(`/api/finance-exports/${type}${query}`, "http://qa.local"), { headers }), { params: Promise.resolve({ type }) });
  let body = null;
  try { body = await res.clone().json(); } catch { body = null; }
  return { status: res.status, body, cacheControl: res.headers.get("cache-control") || "" };
}
const markers = (type, res) => (res.body?.rows || []).map((r) => String(TYPES[type].marker(r) || ""));
const onlyTenant = (type, res, prefix) => { const m = markers(type, res); return m.length > 0 && m.every((x) => x.startsWith(`${prefix}-`)); };
const enc = (o) => encodeURIComponent(JSON.stringify(o));

const exporterA = await login("exporter@qa-a.test", "qa-pass-exporter");
const clerkA = await login("clerk@qa-a.test", "qa-pass-clerk");
const exporterB = await login("exporter@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", Boolean(exporterA.vyron_workspace_user_session && clerkA.vyron_workspace_user_session && exporterB.vyron_workspace_user_session));

for (const [type, spec] of Object.entries(TYPES)) {
  console.log(`\n${type}`);

  browser({});
  const anon = await exportRows(type);
  check("1. anonymous -> 401", anon.status === 401, `${anon.status} rows=${anon.body?.rows?.length ?? "-"}`);
  check("9. anonymous never receives the default tenant's rows", !markers(type, anon).some((m) => m.startsWith("DEFAULT-")));

  browser({ vyron_workspace_user_session: "not-a-session" });
  check("2. malformed session -> 401", (await exportRows(type)).status === 401);
  browser({ vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_EXPORTER, companyId: CO_A, role: "OWNER" }) });
  check("3. forged session naming a real exporter -> 401", (await exportRows(type)).status === 401);

  browser(clerkA);
  const clerk = await exportRows(type);
  check("5. member without reports.export -> 403", clerk.status === 403, `${clerk.status}`);

  browser(exporterA);
  const a = await exportRows(type);
  check("4. exporter -> 200", a.status === 200 && a.body?.ok === true, `${a.status} ${JSON.stringify(a.body).slice(0, 120)}`);
  check("11. only the exporter's own tenant", onlyTenant(type, a, "A"), markers(type, a).slice(0, 3).join(","));
  check(`12. row limit ${spec.limit}`, (a.body?.rows || []).length === spec.limit, `${(a.body?.rows || []).length}`);
  const keys = Object.keys((a.body?.rows || [])[0] || {});
  check("15. columns unchanged", spec.exact ? JSON.stringify(keys) === JSON.stringify(spec.cols) : spec.cols.every((c) => keys.includes(c)), keys.join(","));
  check("responses are not cacheable", /no-store/i.test(a.cacheControl), a.cacheControl);

  const paged = await exportRows(type, { query: "?page=2&offset=500&limit=5000&pageSize=5000" });
  check("13. paging parameters change nothing (no pagination; the limit holds)", (paged.body?.rows || []).length === spec.limit);

  const byParam = await exportRows(type, { query: `?companyId=${CO_B}&tenantId=${CO_B}&tenant_id=${CO_B}&company_id=${VYRON_DEFAULT_TENANT_ID}&workspaceId=${WS_B}` });
  check("8. tenant/company parameters cannot select another tenant", onlyTenant(type, byParam, "A"), markers(type, byParam).slice(0, 3).join(","));
  const byHeader = await exportRows(type, { headers: { "x-tenant-id": CO_B, "x-company-id": CO_B, "x-workspace-id": WS_B } });
  check("8. tenant/company headers cannot select another tenant", onlyTenant(type, byHeader, "A"));

  browser({ ...exporterA, vyron_cost_active_client: enc({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA Tenant A" }) });
  const hinted = await exportRows(type);
  check("7. a company hint naming B cannot select B", !markers(type, hinted).some((m) => m.startsWith("B-")), `${hinted.status}`);
  browser({ ...exporterA, vyron_cost_active_client: exporterB.vyron_cost_active_client });
  check("7. B's active-client cookie cannot select B", !markers(type, await exportRows(type)).some((m) => m.startsWith("B-")));

  browser(exporterB);
  const b = await exportRows(type);
  check("6. tenant B's exporter gets only B", onlyTenant(type, b, "B") && (b.body?.rows || []).length === 3, markers(type, b).join(","));
  check("6. ...never A, never the default tenant", !markers(type, b).some((m) => m.startsWith("A-") || m.startsWith("DEFAULT-")));
}

console.log("\nFilters, unknown types and CSV");
browser(exporterA);
check("deleted supplier invoices stay out", !markers("invoices", await exportRows("invoices")).includes("A-DOC-DELETED"));
check("only adjustment movements are exported", !markers("inventory-adjustments", await exportRows("inventory-adjustments")).includes("A-REF-RECEIPT"));
check("only completed production runs are exported", !markers("production-journals", await exportRows("production-journals")).includes("A-RUN-OPEN"));
check("an unknown type is refused (400) for a signed-in exporter", (await exportRows("payroll")).status === 400);
browser({});
check("an unknown type does not reveal anything to an anonymous caller", (await exportRows("payroll")).status === 401);

// The Accounting Export Centre builds the CSV in the browser from these rows.
const clientSource = readFileSync(path.join(ROOT, "src/components/AccountingExportClient.tsx"), "utf8");
check("14/15. the export centre still builds CSV the same way", clientSource.includes(`String(r[h] ?? "").replace(/"/g, '""')`) && clientSource.includes('headers.join(",")'));
browser(exporterA);
const csvRows = (await exportRows("invoices")).body?.rows || [];
const quoted = csvRows.find((r) => String(r.supplier_name).startsWith("Quote"));
const headers = Object.keys(csvRows[0] || {});
const csv = [headers.join(","), ...[quoted].filter(Boolean).map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
check("15. CSV header row is the export's columns", csv.split("\n")[0] === TYPES.invoices.cols.join(","));
check("15. CSV escapes quotes and commas", csv.includes(`"Quote ""A"", Co"`), csv.split("\n")[1] || "");

console.log("\nThe fixed default tenant is gone from this path");
// Code only: the comments explain the old defect by name, which is not a use of it.
const code = (file) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const helper = code("src/lib/vyron-finance-exports.ts");
const route = code("src/app/api/finance-exports/[type]/route.ts");
check("the export helper no longer references VYRON_DEFAULT_TENANT_ID", !/VYRON_DEFAULT_TENANT_ID/.test(helper));
check("the route no longer reaches a fixed tenant", !/VYRON_DEFAULT_TENANT_ID/.test(route));
check("the route takes no tenant from the request", !/searchParams\.get\(\s*["'](companyId|tenantId|company_id|tenant_id|workspaceId)["']/.test(route));

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
