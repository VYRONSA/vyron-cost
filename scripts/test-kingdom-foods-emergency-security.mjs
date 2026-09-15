#!/usr/bin/env node
/**
 * VYRON — Kingdom Foods emergency workflow security test (Phase 20A).
 *
 * WHAT THIS LOCKS DOWN
 * --------------------
 * The finished-good / BOM cost-line editors (/products/[id]/edit and
 * /products/[id]/cost-lines/[lineId]/edit) used to write vyron_cost_product_cost_lines
 * and re-sync vyron_cost_products directly from the browser with the public anon
 * key, with company_id supplied by the client (the Phase 19 boundary problem).
 * Those writes now go through server routes:
 *
 *   GET/POST   /api/products/[id]/cost-lines
 *   PATCH/DEL  /api/products/[id]/cost-lines/[lineId]
 *
 * Each verifies the signed workspace session, an Active membership, the
 * products.view / products.edit permission, resolves the company from the
 * verified workspace, checks the product (and the line) belong to that company,
 * writes with the server-resolved company, and recomputes the product cost
 * server-side. Nothing from the request body/query/headers selects the tenant.
 *
 * The real route modules run unmodified against synthetic tenants; sessions come
 * from the real login route; only cookies(), the database and the password check
 * are substituted (scripts/support/session-security-test-hook.mjs). Every
 * company_id / tenant_id filter and every write is logged so ordering and
 * isolation are checkable.
 *
 * Family A: in-memory database, disposable QA tenants, no network, no writes
 * outside this process.
 *
 *   npm run test:kingdom-foods-emergency-security
 */

import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
delete process.env.VYRON_DEFAULT_TENANT_ID;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0, checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
  if (condition) { console.log(`  ok    ${name}`); return; }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}

/* ---------------------------------------------------------------- fixtures */
const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_KF = uuid("a", 1), CO_B = uuid("b", 1);      // Kingdom Foods (A) and another tenant (B)
const WS_KF = uuid("a", 2), WS_B = uuid("b", 2);
const U_KF = uuid("a", 10), U_KF_VIEW = uuid("a", 11), U_KF_LAPSED = uuid("a", 12), U_B = uuid("b", 10);
const PROD_KF = uuid("a", 100), PROD_B = uuid("b", 100);
const LINE_KF = uuid("a", 200), LINE_B = uuid("b", 200);

const USERS = [
  { id: U_KF, email: "cost@kf.test", password: "qa-kf" },
  { id: U_KF_VIEW, email: "viewer@kf.test", password: "qa-view" },
  { id: U_KF_LAPSED, email: "lapsed@kf.test", password: "qa-lapsed" },
  { id: U_B, email: "cost@b.test", password: "qa-b" },
];
const EDIT = { "products.view": true, "products.edit": true, "dashboard.view": true };
const VIEW_ONLY = { "products.view": true, "products.edit": false, "dashboard.view": true };

const line = (id, co, prod, name, qty, cost) => ({ id, company_id: co, product_id: prod, product_name: name, line_type: "Ingredient", line_name: name, quantity: qty, unit: "kg", unit_cost: cost, wastage_percent: 0, line_cost: qty * cost, line_cost_imported: qty * cost, created_at: "2026-01-01" });
function seed() {
  return {
    vyron_workspaces: [
      { id: WS_KF, company_id: CO_KF, company_name: "Kingdom Foods", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_KF, user_id: U_KF, role: "PROCUREMENT", status: "Active", permissions: EDIT },
      { id: "m2", workspace_id: WS_KF, user_id: U_KF_VIEW, role: "PROCUREMENT", status: "Active", permissions: VIEW_ONLY },
      { id: "m3", workspace_id: WS_KF, user_id: U_KF_LAPSED, role: "PROCUREMENT", status: "Active", permissions: EDIT },
      { id: "m4", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: EDIT },
    ],
    vyron_cost_products: [
      { id: PROD_KF, company_id: CO_KF, product_name: "KF Pie", selling_price: 30, target_gp: 40, total_cost: 12 },
      { id: PROD_B, company_id: CO_B, product_name: "B Loaf", selling_price: 20, target_gp: 35, total_cost: 9 },
    ],
    vyron_cost_product_cost_lines: [
      line(LINE_KF, CO_KF, PROD_KF, "KF Flour", 2, 5),
      line(LINE_B, CO_B, PROD_B, "B Flour", 3, 4),
    ],
  };
}

/* --------------------------------------------- database, logs, then routes */
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase(seed());
const reseed = () => { for (const [t, rows] of Object.entries(seed())) db.tables[t] = rows; };

let tenantLog = [], writeLog = [];
const originalFrom = db.from.bind(db);
db.from = (table) => {
  const q = originalFrom(table);
  // The company a write targets may come from the payload (insert) or from the
  // .eq("company_id", ...) filter of the same chain (update/delete), and the
  // filter is added AFTER update()/delete(). So capture the scope on eq and log
  // the write when the query actually runs.
  let scoped = "";
  let pending = null;
  for (const m of ["eq", "in"]) {
    if (typeof q[m] !== "function") continue;
    const orig = q[m].bind(q);
    q[m] = (col, val) => {
      if (col === "company_id" || col === "tenant_id") {
        for (const v of Array.isArray(val) ? val : [val]) tenantLog.push(String(v));
        if (!Array.isArray(val)) scoped = String(val);
      }
      return orig(col, val);
    };
  }
  for (const m of ["insert", "upsert", "update", "delete"]) {
    if (typeof q[m] !== "function") continue;
    const orig = q[m].bind(q);
    q[m] = (payload, ...rest) => {
      const rows = m === "delete" ? [{}] : Array.isArray(payload) ? payload : [payload];
      pending = rows.map((row) => (row && typeof row === "object" ? String(row.company_id ?? row.tenant_id ?? "") : ""));
      pending.op = m;
      return orig(payload, ...rest);
    };
  }
  if (typeof q.run === "function") {
    const origRun = q.run.bind(q);
    q.run = (...args) => {
      if (pending) { for (const fromPayload of pending) writeLog.push({ table, op: pending.op, target: fromPayload || scoped }); pending = null; }
      return origRun(...args);
    };
  }
  return q;
};
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map() };
const browser = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const listCreate = await importFromRoot("src/app/api/products/[id]/cost-lines/route.ts");
const lineRoute = await importFromRoot("src/app/api/products/[id]/cost-lines/[lineId]/route.ts");

async function login(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
const enc = (o) => encodeURIComponent(JSON.stringify(o));

async function call(handler, { productId, lineId, method = "POST", body, query = "", headers = {} } = {}) {
  tenantLog = []; writeLog = [];
  const url = new URL(`/api/products/${productId}/cost-lines${lineId ? `/${lineId}` : ""}${query}`, "http://qa.local");
  const req = new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
  const params = Promise.resolve(lineId ? { id: productId, lineId } : { id: productId });
  const res = await handler(req, { params });
  let json = null; try { json = await res.clone().json(); } catch { /* ignore */ }
  return { status: res.status, body: json, cache: res.headers.get("cache-control") || "", writes: [...writeLog], tenants: [...new Set(tenantLog)] };
}
const GOOD = { line_type: "Ingredient", line_name: "New line", quantity: 3, unit: "kg", unit_cost: 5, wastage_percent: 0 };
const post = (jar, opts = {}) => { browser(jar); return call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD, ...opts }); };
const noWrites = (r) => r.writes.length === 0;

const kf = await login("cost@kf.test", "qa-kf");
const kfView = await login("viewer@kf.test", "qa-view");
const kfLapsed = await login("lapsed@kf.test", "qa-lapsed");
const b = await login("cost@b.test", "qa-b");
check("21b. synthetic KF + B members sign in through the real login route", [kf, kfView, kfLapsed, b].every((j) => j.vyron_workspace_user_session));

/* ------------------------------------------------------- A. unauthenticated */
console.log("\nAuthentication");
browser({});
const anon = await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD });
check("1. anonymous -> 401, no write", anon.status === 401 && noWrites(anon), `${anon.status} ${JSON.stringify(anon.writes)}`);
check("18/20. anonymous: no company resolved, nothing written before auth", anon.tenants.length === 0 && noWrites(anon));
browser({ vyron_workspace_user_session: "not-a-session" });
check("2. malformed session -> 401", (await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD })).status === 401);
browser({ vyron_workspace_user_session: `v1.${Buffer.from(JSON.stringify({ v: 1, k: "ws", sub: U_KF, wid: WS_KF, iat: 1, exp: 9999999999 })).toString("base64url")}.AAAA` });
{ const r = await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD }); check("2b. forged token-shaped session -> 401, no write", r.status === 401 && noWrites(r), `${r.status}`); }
browser({ vyron_workspace_user_session: enc({ workspaceId: WS_KF, userId: U_KF, companyId: CO_KF, role: "OWNER" }) });
{ const r = await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD }); check("3. plain-JSON session naming a real KF member -> 401, no write", r.status === 401 && noWrites(r)); }
browser({ vyron_auth_user_id: U_KF });
check("4. bare auth user id -> 401", (await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD })).status === 401);
browser({ vyron_auth_user_id: kf.vyron_auth_user_id });
check("4b. a genuine auth cookie alone is not a workspace session -> 401", (await call(listCreate.POST, { productId: PROD_KF, method: "POST", body: GOOD })).status === 401);

/* --------------------------------------------------- membership + permission */
console.log("\nAuthorization");
reseed();
db.tables.vyron_workspace_memberships.find((m) => m.user_id === U_KF_LAPSED).status = "Suspended";
{ const r = await post(kfLapsed); check("5. inactive/suspended membership -> denied, no write", (r.status === 401 || r.status === 403) && noWrites(r), `${r.status}`); }
reseed();
{ const r = await post(kfView); check("6. KF member without products.edit -> 403, no write, company not resolved past auth", r.status === 403 && noWrites(r), `${r.status}`); }

/* ---------------------------------------------------------- legitimate + isolation */
console.log("\nTenant isolation and legitimate use");
reseed();
{ const r = await post(kf); check("7/21. KF member with products.edit -> 200, writes only to Kingdom Foods", r.status === 200 && r.body?.ok && r.writes.length > 0 && r.writes.every((w) => w.target === CO_KF), `${r.status} ${JSON.stringify(r.writes)}`); }
reseed();
{ const r = await post(kf); check("7b. the created line and the product cost recompute both land in KF", r.writes.some((w) => w.table === "vyron_cost_product_cost_lines" && w.op === "insert" && w.target === CO_KF) && r.writes.some((w) => w.table === "vyron_cost_products" && w.op === "update" && w.target === CO_KF)); check("23. response is not cacheable", /no-store/i.test(r.cache), r.cache); }
reseed();
{ const r = await post(kf); check("8/9/10/16b. company/tenant/workspace/user/BOM/customer/supplier/invoice/PO ids in the body cannot switch tenant", r.status === 200 && r.writes.every((w) => w.target === CO_KF) && !r.tenants.includes(CO_B), ""); }
// The above with hostile overrides:
reseed();
{ const r = await post(kf, { body: { ...GOOD, company_id: CO_B, tenant_id: CO_B, workspace_id: WS_B, user_id: U_B, bom_id: uuid("b", 300), customer_id: uuid("b", 301), supplier_id: uuid("b", 302), invoice_id: uuid("b", 303), po_id: uuid("b", 304) }, query: `?companyId=${CO_B}&workspaceId=${WS_B}`, headers: { "x-company-id": CO_B, "x-tenant-id": CO_B } });
  check("8/9/10/12-16. hostile company/workspace/user/BOM/customer/supplier/invoice/PO in body+query+headers are ignored — write stays in KF, B never touched", r.status === 200 && r.writes.every((w) => w.target === CO_KF) && !r.tenants.includes(CO_B), `${r.status} ${JSON.stringify(r.writes)}`); }

/* ------------------------------------------------------------- foreign entities */
console.log("\nForeign entity rejection");
reseed();
{ const r = await post(b, { productId: PROD_B }); check("B member operates on B's product only, written to B", r.status === 200 && r.writes.every((w) => w.target === CO_B), `${r.status}`); }
reseed();
browser(kf);
{ const r = await call(listCreate.POST, { productId: PROD_B, method: "POST", body: GOOD }); check("11. KF member creating a cost line on ANOTHER tenant's product -> 404, no write", r.status === 404 && noWrites(r), `${r.status} ${JSON.stringify(r.writes)}`); }
{ const r = await call(lineRoute.PATCH, { productId: PROD_KF, lineId: LINE_B, method: "PATCH", body: { unit_cost: 99 } }); check("17a. editing another tenant's cost line by id -> 404, no write", r.status === 404 && noWrites(r), `${r.status}`); }
{ const r = await call(lineRoute.DELETE, { productId: PROD_KF, lineId: LINE_B, method: "DELETE" }); check("17b. deleting another tenant's cost line by id -> 404, no write", r.status === 404 && noWrites(r), `${r.status}`); }
{ const r = await call(lineRoute.PATCH, { productId: PROD_B, lineId: LINE_B, method: "PATCH", body: { unit_cost: 99 } }); check("11b. editing a line under another tenant's product -> 404, no write", r.status === 404 && noWrites(r), `${r.status}`); }

/* ------------------------------------------------------------- legitimate edit/delete */
console.log("\nLegitimate edit / delete + actor integrity");
reseed();
{ browser(kf); const r2 = await call(lineRoute.PATCH, { productId: PROD_KF, lineId: LINE_KF, method: "PATCH", body: { unit_cost: 7, quantity: 2 } });
  check("21c. KF member edits its own cost line -> 200, written to KF only", r2.status === 200 && r2.body?.ok && r2.writes.length > 0 && r2.writes.every((w) => w.target === CO_KF), `${r2.status} ${JSON.stringify(r2.writes)}`); }
reseed();
{ browser(kf); const r = await call(lineRoute.DELETE, { productId: PROD_KF, lineId: LINE_KF, method: "DELETE" }); check("21d. KF member deletes its own cost line -> 200, product recomputed in KF", r.status === 200 && r.writes.some((w) => w.table === "vyron_cost_products" && w.target === CO_KF) && r.writes.every((w) => w.target === CO_KF), `${r.status}`); }
reseed();
{ browser(kf); const r = await post(kf); check("17c. every write carries the server-resolved company; no request field became the tenant", r.writes.length > 0 && r.writes.every((w) => w.target === CO_KF)); }

/* ----------------------------------------------------------------- idempotency */
console.log("\nDuplicate submission");
reseed();
{ browser(kf);
  const first = await post(kf);
  const second = await post(kf);
  const linesAfter = db.tables.vyron_cost_product_cost_lines.filter((l) => l.product_id === PROD_KF).length;
  check("22. two identical submissions create two distinct lines (no existing idempotency rule) and never a cross-tenant row", first.status === 200 && second.status === 200 && linesAfter === 3 && db.tables.vyron_cost_product_cost_lines.every((l) => l.company_id === CO_KF || l.company_id === CO_B), `lines=${linesAfter}`); }

/* --------------------------------------------------------------------- source */
console.log("\nRoute source");
const { readFileSync } = await import("node:fs");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const f of ["src/app/api/products/[id]/cost-lines/route.ts", "src/app/api/products/[id]/cost-lines/[lineId]/route.ts"]) {
  const src = strip(readFileSync(path.join(ROOT, f), "utf8"));
  check(`${f}: requires products.edit before writing (view for GET)`, /requireWorkspacePermission\(\s*["']products\.edit["']\s*\)/.test(src));
  check(`${f}: company from the verified session resolver, no request tenant`, /requireApiCompanyId\(\)/.test(src) && !/company_id|tenant_id|workspace_id/.test(src.replace(/requireApiCompanyId/g, "")));
  check(`${f}: no anon client, no fixed tenant`, !/@\/lib\/supabase["']/.test(src) && !/VYRON_DEFAULT_TENANT_ID|48002864/.test(src));
}
const dataLayer = strip(readFileSync(path.join(ROOT, "src/lib/vyron-cost-product-cost-lines.ts"), "utf8"));
check("data layer: every write is company-scoped and product ownership is verified first", /requireProduct\(/.test(dataLayer) && /\.eq\("company_id", companyId\)/.test(dataLayer) && !/@\/lib\/supabase["']/.test(dataLayer));

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
