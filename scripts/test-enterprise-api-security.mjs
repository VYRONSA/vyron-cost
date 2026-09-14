#!/usr/bin/env node
/**
 * VYRON — enterprise API security regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * Three enterprise APIs checked no session and read a fixed tenant
 * (VYRON_DEFAULT_TENANT_ID, an environment variable with a hard-coded
 * fallback) through their library defaults:
 *
 *   GET  /api/enterprise/auditor-search      supplier invoices, POs, GRNs and
 *                                            stock counts with supplier names
 *                                            and totals
 *   GET  /api/enterprise-platform/search     the auditor search plus products,
 *                                            suppliers, recovery, ingredients,
 *                                            every result labelled with one
 *                                            fixed customer's name
 *   POST /api/enterprise-platform/ai-assistant
 *                                            answers built from the fixed
 *                                            tenant's enterprise payload
 *
 * Anyone could call them, and a signed-in member was answered from the fixed
 * tenant instead of their own company.
 *
 * WHAT THIS PROVES
 * ----------------
 * The three routes and the session, access and workspace modules run
 * unmodified against synthetic tenants; sessions come from the real login
 * route. Only cookies(), the database and the password check are substituted
 * (scripts/support/session-security-test-hook.mjs). Search results are
 * attributed by the synthetic rows they came from. The AI assistant is
 * attributed by the tenant filters it sent to the database: every company_id
 * and tenant_id value a request uses is recorded.
 *
 * KNOWN RESIDUAL, TRACKED SEPARATELY: enterprise search and the AI assistant
 * also call shared recovery / procurement helpers (listed in RESIDUAL_HELPERS)
 * that take no company and default to the fixed demo tenant. Those helpers
 * are shared with the server-rendered pages and belong to the fixed-tenant
 * helper review, not this fix. Their queries are identified by call stack and
 * reported as a note; any OTHER query touching the fixed tenant — from the
 * routes, the auditor search or anything new — fails this test.
 *
 * Family A: in-memory database with disposable QA tenants, no network, no
 * credentials (a random signing key for this process only), no writes outside
 * this process.
 *
 *   npm run test:enterprise-api-security
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

const { VYRON_DEFAULT_TENANT_ID: DEFAULT } = await importFromRoot("src/lib/vyron-documents.ts");
const uuid = (t, n) => `${t}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_A = uuid("a", 10), U_A_NOREPORTS = uuid("a", 11), U_B = uuid("b", 10);

const USERS = [
  { id: U_A, email: "analyst@qa-a.test", password: "qa-pass-analyst" },
  { id: U_A_NOREPORTS, email: "picker@qa-a.test", password: "qa-pass-picker" },
  { id: U_B, email: "analyst@qa-b.test", password: "qa-pass-b" },
];
const REPORTS = { "reports.view": true, "dashboard.view": true };
const NO_REPORTS = { "reports.view": false, "dashboard.view": true, "sales_orders.view": true };

function tenantRows(marker, companyId) {
  const at = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString();
  const r = { vyron_documents: [], vyron_cost_purchase_orders: [], vyron_cost_goods_receipts: [], vyron_cost_stock_counts: [] };
  for (let i = 0; i < 3; i += 1) {
    r.vyron_documents.push({ id: `${marker}-doc-${i}`, tenant_id: companyId, document_number: `${marker}-INV-${i}`, supplier_name: `Acme ${marker} Supplies`, total: 1000 + i, created_at: at(i), deleted_at: null });
    r.vyron_cost_purchase_orders.push({ id: `${marker}-po-${i}`, company_id: companyId, po_number: `${marker}-PO-${i}`, supplier_name_snapshot: `Acme ${marker} Supplies`, total: 500 + i, created_at: at(i) });
    r.vyron_cost_goods_receipts.push({ id: `${marker}-grn-${i}`, company_id: companyId, grn_number: `${marker}-GRN-${i}`, supplier_name_snapshot: `Acme ${marker} Supplies`, received_at: at(i) });
    r.vyron_cost_stock_counts.push({ id: `${marker}-cnt-${i}`, company_id: companyId, count_number: `ACME-${marker}-CNT-${i}`, status: "Open", created_at: at(i) });
  }
  return r;
}

function seed() {
  const merged = {};
  for (const src of [tenantRows("A", CO_A), tenantRows("B", CO_B), tenantRows("DEFAULT", DEFAULT)]) {
    for (const [t, rows] of Object.entries(src)) merged[t] = (merged[t] || []).concat(rows);
  }
  return {
    ...merged,
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_A, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
      { id: "m2", workspace_id: WS_A, user_id: U_A_NOREPORTS, role: "PROCUREMENT", status: "Active", permissions: NO_REPORTS },
      { id: "m3", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
    ],
    vyron_contacts: [],
  };
}

/* ------------------------------------------------------------ route calls */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const searchRoute = await importFromRoot("src/app/api/enterprise-platform/search/route.ts");
const auditorRoute = await importFromRoot("src/app/api/enterprise/auditor-search/route.ts");
const aiRoute = await importFromRoot("src/app/api/enterprise-platform/ai-assistant/route.ts");

const db = createFakeSupabase(seed());
/** Every tenant value any query filtered on, per request. */
let tenantLog = [];
/** Shared helpers that still default to the fixed demo tenant — tracked for the fixed-tenant helper review. */
const RESIDUAL_HELPERS = [
  "recomputeRecoveryIntelligenceV2",
  "getRecoveryCalculationsV2",
  "generateProcurementRecommendations",
  "recomputeProcurementRecommendations",
  "getSupplierPriceWidgetSummary",
  "computeProcurementHealthScore",
];
const originalFrom = db.from.bind(db);
db.from = (table) => {
  const query = originalFrom(table);
  for (const method of ["eq", "in"]) {
    if (typeof query[method] !== "function") continue;
    const original = query[method].bind(query);
    query[method] = (column, value) => {
      if (column === "company_id" || column === "tenant_id") {
        for (const v of Array.isArray(value) ? value : [value]) {
          const s = String(v);
          const stack = s === DEFAULT ? new Error().stack || "" : "";
          tenantLog.push({ v: s, residual: s === DEFAULT && RESIDUAL_HELPERS.some((h) => stack.includes(h)) });
        }
      }
      return original(column, value);
    };
  }
  return query;
};
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, users: USERS, cookies: new Map() };
const browser = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

async function login(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

const ENDPOINTS = {
  "enterprise/auditor-search": {
    call: (q, init = {}) => auditorRoute.GET(new NextRequest(new URL(`/api/enterprise/auditor-search?q=${encodeURIComponent(q)}${init.extraQuery || ""}`, "http://qa.local"), { headers: init.headers || {} })),
    items: (b) => b?.results || [],
    tenantOf: (item) => (/(?:^|ACME-)(A|B|DEFAULT)-/.exec(String(item.label || "")) || [])[1] || "?",
  },
  "enterprise-platform/search": {
    call: (q, init = {}) => searchRoute.GET(new NextRequest(new URL(`/api/enterprise-platform/search?q=${encodeURIComponent(q)}${init.extraQuery || ""}`, "http://qa.local"), { headers: init.headers || {} })),
    items: (b) => b?.results || [],
    tenantOf: (item) => (/(?:^|ACME-)(A|B|DEFAULT)-/.exec(String(item.label || "")) || [])[1] || "?",
  },
  "enterprise-platform/ai-assistant": {
    call: (q, init = {}) => aiRoute.POST(new NextRequest(new URL(`/api/enterprise-platform/ai-assistant${init.extraQuery ? `?${init.extraQuery.replace(/^&/, "")}` : ""}`, "http://qa.local"), { method: "POST", body: JSON.stringify({ question: q, ...(init.body || {}) }), headers: { "content-type": "application/json", ...(init.headers || {}) } })),
    items: () => [],
    tenantOf: () => "?",
  },
};

async function hit(name, q = "acme", init) {
  tenantLog = [];
  const res = await ENDPOINTS[name].call(q, init);
  let body = null;
  try { body = await res.clone().json(); } catch { body = null; }
  return {
    status: res.status,
    body,
    cache: res.headers.get("cache-control") || "",
    /** Tenants queried by the route and its direct sources (tracked residual helpers excluded). */
    tenants: [...new Set(tenantLog.filter((e) => !e.residual).map((e) => e.v))],
    /** Every tenant queried, residual included. */
    all: [...new Set(tenantLog.map((e) => e.v))],
    residual: tenantLog.filter((e) => e.residual).length,
  };
}
const tenantsOf = (name, res) => [...new Set(ENDPOINTS[name].items(res.body).map((i) => ENDPOINTS[name].tenantOf(i)))];
const enc = (o) => encodeURIComponent(JSON.stringify(o));
/** Tenant values a request for company A may legitimately filter on (its own company and workspace). */
const OWN_A = new Set([CO_A, WS_A]);
const OWN_B = new Set([CO_B, WS_B]);
const onlyOwn = (res, own) => res.tenants.every((t) => own.has(t));

const analystA = await login("analyst@qa-a.test", "qa-pass-analyst");
const pickerA = await login("picker@qa-a.test", "qa-pass-picker");
const analystB = await login("analyst@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", Boolean(analystA.vyron_workspace_user_session && pickerA.vyron_workspace_user_session && analystB.vyron_workspace_user_session));

for (const name of Object.keys(ENDPOINTS)) {
  const isAi = name.endsWith("ai-assistant");
  console.log(`\n${name}`);

  browser({});
  const anon = await hit(name);
  check("1. anonymous -> 401", anon.status === 401, `${anon.status} items=${ENDPOINTS[name].items(anon.body).length}`);
  check("13/14. anonymous reaches no tenant at all", anon.all.length === 0, anon.all.join(","));
  browser({ vyron_workspace_user_session: "not-a-session" });
  check("2. malformed session -> 401", (await hit(name)).status === 401);
  browser({ vyron_workspace_user_session: `v1.${Buffer.from(JSON.stringify({ v: 1, k: "ws", sub: U_A, wid: WS_A, iat: 1, exp: 9999999999 })).toString("base64url")}.AAAA` });
  check("3. forged token-shaped session -> 401", (await hit(name)).status === 401);
  browser({ vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_A, companyId: CO_A, role: "OWNER" }) });
  check("4. plain JSON session naming a real member -> 401", (await hit(name)).status === 401);
  browser({ vyron_auth_user_id: U_A });
  check("5. bare auth user id, no session -> 401", (await hit(name)).status === 401);
  browser({ vyron_auth_user_id: analystA.vyron_auth_user_id });
  check("5. a genuine auth cookie is not a workspace session -> 401", (await hit(name)).status === 401);

  browser(pickerA);
  check("7/16. member without reports.view -> 403", (await hit(name)).status === 403);

  browser(analystA);
  const a = await hit(name);
  check("6. member with reports.view -> 200", a.status === 200 && a.body?.ok === true, `${a.status} ${JSON.stringify(a.body).slice(0, 160)}`);
  check("17. response is not cacheable", /no-store/i.test(a.cache), a.cache);
  check("13. the route and its direct sources consult no fixed tenant", !a.tenants.includes(DEFAULT), a.tenants.join(","));
  check("8. another real tenant (B) is never queried", !a.all.includes(CO_B), a.all.join(","));
  if (name === "enterprise/auditor-search") check("13. auditor search consults no fixed tenant at all", !a.all.includes(DEFAULT) && a.residual === 0);
  if (a.residual) console.log(`  note  KNOWN RESIDUAL (tracked for the fixed-tenant helper review): ${a.residual} fixed-tenant queries from shared recovery/procurement helpers`);
  check("8. only tenant A's company is queried", a.tenants.length > 0 && onlyOwn(a, OWN_A), a.tenants.join(","));
  if (!isAi) {
    check("8/20/21. only tenant A's rows come back", tenantsOf(name, a).length === 1 && tenantsOf(name, a)[0] === "A", tenantsOf(name, a).join(","));
    check("18. search terms still work (A's rows for 'acme')", ENDPOINTS[name].items(a.body).length >= 3);
    const none = await hit(name, "zzz-no-match");
    check("18. a term that matches nothing returns nothing", none.status === 200 && ENDPOINTS[name].items(none.body).length === 0);
    const labels = ENDPOINTS[name].items(a.body).map((i) => i.companyLabel).filter(Boolean);
    check("results are not labelled with another company's name", labels.every((l) => l !== "Handcrafted Food Products"), [...new Set(labels)].join(","));
  } else {
    check("18. the AI returns an answer", Boolean(a.body?.answer?.answer || a.body?.answer?.question));
    const empty = await hit(name, "");
    check("18. an empty question is still refused (400) for a permitted member", empty.status === 400);
  }

  const byParam = await hit(name, "acme", { extraQuery: `&companyId=${CO_B}&tenantId=${CO_B}&tenant_id=${DEFAULT}&company_id=${DEFAULT}&workspaceId=${WS_B}`, body: { companyId: CO_B, tenantId: DEFAULT } });
  check("10/14. tenant parameters cannot select B or the fixed tenant", onlyOwn(byParam, OWN_A) && (isAi || tenantsOf(name, byParam).every((t) => t === "A")), `${byParam.tenants.join(",")} / ${tenantsOf(name, byParam).join(",")}`);
  const byHeader = await hit(name, "acme", { headers: { "x-tenant-id": CO_B, "x-company-id": DEFAULT, "x-workspace-id": WS_B } });
  check("11. tenant headers cannot select another tenant", onlyOwn(byHeader, OWN_A) && (isAi || tenantsOf(name, byHeader).every((t) => t === "A")));

  browser({ ...analystA, vyron_cost_active_client: enc({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA Tenant A" }) });
  const hinted = await hit(name);
  check("12. a conflicting company hint is refused (409), never switches tenant", hinted.status === 409 && !hinted.all.includes(CO_B) && !hinted.all.includes(DEFAULT), `${hinted.status} ${hinted.all.join(",")}`);
  browser({ ...analystA, vyron_cost_active_client: analystB.vyron_cost_active_client });
  const otherCookie = await hit(name);
  check("12. B's active-client cookie with A's session stays on A", onlyOwn(otherCookie, OWN_A) && !otherCookie.tenants.includes(CO_B));

  browser(analystB);
  const b = await hit(name, isAi ? `what did ${CO_A} spend?` : "acme");
  check("9. tenant B's analyst queries only B", b.status === 200 && b.tenants.length > 0 && onlyOwn(b, OWN_B), b.tenants.join(","));
  if (!isAi) check("9. tenant B gets only B's rows", tenantsOf(name, b).every((t) => t === "B") && tenantsOf(name, b).length === 1, tenantsOf(name, b).join(","));
  else check("19. naming another company in the question does not reach it", !b.all.includes(CO_A) && !b.tenants.includes(DEFAULT), b.all.join(","));
}

console.log("\nThe fixed tenant is gone from these paths");
const code = (file) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const file of ["src/app/api/enterprise-platform/search/route.ts", "src/app/api/enterprise/auditor-search/route.ts", "src/app/api/enterprise-platform/ai-assistant/route.ts"]) {
  const src = code(file);
  check(`${file}: requires reports.view`, /requireWorkspacePermission\(\s*["']reports\.view["']\s*\)/.test(src));
  check(`${file}: company from the session resolver`, /resolveApiCompanyId\(\)/.test(src));
  check(`${file}: takes no tenant from the request`, !/searchParams\.get\(\s*["'](companyId|tenantId|company_id|tenant_id|workspaceId)["']/.test(src) && !/headers\.get\(\s*["']x-(tenant|company)/i.test(src));
}

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
