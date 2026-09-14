#!/usr/bin/env node
/**
 * VYRON — enterprise POST security regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 *   POST  /api/enterprise/scenarios          what-if GP modelling over the
 *                                            company's products, ingredients,
 *                                            leakage and recovery figures
 *   POST  /api/vyron-command-centre/copilot  business-intelligence Q&A; every
 *                                            call also INSERTS a
 *                                            vyron_business_health_snapshots row
 *   PATCH /api/procurement/recommendations/[key]/tracking
 *                                            upserts a recommendation's tracking
 *                                            row and inserts audit rows
 *
 * None checked a session or a permission. Scenarios read a fixed tenant's
 * leakage figures; the copilot let any signed-in member write a snapshot on
 * every question; the tracking route wrote for whichever tenant owned the key
 * (falling back to a fixed demo tenant) and took the audit trail's "changed
 * by" from the request body.
 *
 * WHAT THIS PROVES
 * ----------------
 * The routes and the session, access and workspace modules run unmodified
 * against synthetic tenants; sessions come from the real login route. Only
 * cookies(), the database (server AND browser/anon client) and the password
 * check are substituted (scripts/support/session-security-test-hook.mjs). Two
 * logs make ordering and isolation checkable: every company_id / tenant_id a
 * query filters on, and every write (table, operation, company it writes to).
 *
 * KNOWN RESIDUAL, TRACKED SEPARATELY: scenarios and the copilot reach shared
 * recovery / procurement helpers (RESIDUAL_HELPERS) that default to the fixed
 * demo tenant. They are identified by call stack and reported as a note; any
 * OTHER query or write touching the fixed tenant fails this test.
 *
 * CSRF: the application's convention for authenticated browser POSTs is the
 * HttpOnly, SameSite=Lax session cookie — a cross-site POST carries no session
 * cookie. There is no Origin or token check anywhere in the application.
 *
 * Family A: in-memory database with disposable QA tenants, no network, no
 * credentials (a random signing key for this process only), no writes outside
 * this process.
 *
 *   npm run test:enterprise-post-security
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

const DEFAULT = "48002864-8800-4000-9000-000000000001";
const uuid = (t, n) => `${t}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_A = uuid("a", 10), U_A_NOREPORTS = uuid("a", 11), U_A_BUYER = uuid("a", 12), U_B = uuid("b", 10);
const PRODUCT_B = uuid("b", 100);

const USERS = [
  { id: U_A, email: "analyst@qa-a.test", password: "qa-pass-analyst" },
  { id: U_A_NOREPORTS, email: "picker@qa-a.test", password: "qa-pass-picker" },
  { id: U_A_BUYER, email: "buyer@qa-a.test", password: "qa-pass-buyer" },
  { id: U_B, email: "analyst@qa-b.test", password: "qa-pass-b" },
];
const REPORTS = { "reports.view": true, "dashboard.view": true, "purchase_orders.edit": false };
const NO_REPORTS = { "reports.view": false, "dashboard.view": true, "purchase_orders.edit": false };
const BUYER = { "reports.view": false, "dashboard.view": true, "purchase_orders.view": true, "purchase_orders.edit": true };
const B_BOTH = { "reports.view": true, "dashboard.view": true, "purchase_orders.edit": true };

const rec = (tenant, key) => ({ id: `${tenant}-${key}`, tenant_id: tenant, recommendation_key: key, potential_benefit_annual: 1000 });

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_A, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
      { id: "m2", workspace_id: WS_A, user_id: U_A_NOREPORTS, role: "PROCUREMENT", status: "Active", permissions: NO_REPORTS },
      { id: "m3", workspace_id: WS_A, user_id: U_A_BUYER, role: "PROCUREMENT", status: "Active", permissions: BUYER },
      { id: "m4", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: B_BOTH },
    ],
    vyron_cost_products: [
      { id: uuid("a", 100), company_id: CO_A, product_name: "QA A Pie", selling_price: 30, total_cost: 12, product_status: "Active" },
      { id: PRODUCT_B, company_id: CO_B, product_name: "QA B Loaf", selling_price: 20, total_cost: 9, product_status: "Active" },
      { id: uuid("d", 100), company_id: DEFAULT, product_name: "QA DEFAULT Tart", selling_price: 25, total_cost: 10, product_status: "Active" },
    ],
    vyron_procurement_recommendations: [
      rec(CO_A, "rec-a-1"), rec(CO_B, "rec-b-1"), rec(CO_A, "rec-shared"), rec(CO_B, "rec-shared"), rec(DEFAULT, "rec-default"),
    ],
    vyron_procurement_recommendation_tracking: [],
    vyron_procurement_recommendation_audit: [],
    vyron_contacts: [],
    vyron_business_health_snapshots: [],
  };
}

/* --------------------------------------------- database, logs, then routes */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

/** Shared helpers that still default to the fixed demo tenant — tracked for the fixed-tenant helper review. */
const RESIDUAL_HELPERS = [
  "recomputeRecoveryIntelligenceV2",
  "getRecoveryCalculationsV2",
  "generateProcurementRecommendations",
  "recomputeProcurementRecommendations",
  "getSupplierPriceWidgetSummary",
  "computeProcurementHealthScore",
  // Found in Phase 16 once the browser/anon client was modelled (it is null in
  // the other offline tests, so these reads were invisible there). Read-only.
  "getProcurementRecommendations",
  "getRecoveryOpportunities",
];
Error.stackTraceLimit = 200;
const isResidual = () => {
  const stack = new Error().stack || "";
  return RESIDUAL_HELPERS.some((h) => stack.includes(h));
};
/** Callers of fixed-tenant queries NOT on the tracked list, for the report. */
const unattributed = new Map();
const noteUnattributed = (table) => {
  const frames = (new Error().stack || "").split("at ").slice(3).map((x) => x.trim().split(" ")[0]).filter((x) => x && x !== "async" && !x.startsWith("file:") && !x.startsWith("node:") && !x.startsWith("Object.") && !x.startsWith("query."));
  const key = `${table} <- ${frames.slice(0, 3).join(" < ")}`;
  unattributed.set(key, (unattributed.get(key) || 0) + 1);
};

const db = createFakeSupabase(seed());
let tenantLog = [];
let writeLog = [];
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
          const residual = s === DEFAULT && isResidual();
          if (s === DEFAULT && !residual) noteUnattributed(table);
          tenantLog.push({ v: s, residual });
        }
      }
      return original(column, value);
    };
  }
  for (const method of ["insert", "upsert", "update", "delete"]) {
    if (typeof query[method] !== "function") continue;
    const original = query[method].bind(query);
    query[method] = (payload, ...rest) => {
      const rows = method === "delete" ? [{}] : Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        const target = row && typeof row === "object" ? String(row.company_id ?? row.tenant_id ?? "") : "";
        const residual = target === DEFAULT && isResidual();
        if (target === DEFAULT && !residual) noteUnattributed(`${table} (${method})`);
        writeLog.push({ table, method, target, residual, changedBy: row?.changed_by });
      }
      return original(payload, ...rest);
    };
  }
  return query;
};
// The browser/anon client is the same stand-in, so anon-client writes are visible too.
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map() };
const browser = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const scenariosRoute = await importFromRoot("src/app/api/enterprise/scenarios/route.ts");
const copilotRoute = await importFromRoot("src/app/api/vyron-command-centre/copilot/route.ts");
const trackingRoute = await importFromRoot("src/app/api/procurement/recommendations/[key]/tracking/route.ts");

async function loginFull(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return { jar: Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value])), setCookie: res.headers.getSetCookie() };
}

async function run(handler, url, method, payload, { headers = {}, params } = {}) {
  tenantLog = [];
  writeLog = [];
  const req = new NextRequest(new URL(url, "http://qa.local"), {
    method,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    headers: { "content-type": "application/json", ...headers },
  });
  const res = params ? await handler(req, { params: Promise.resolve(params) }) : await handler(req);
  let json = null;
  try { json = await res.clone().json(); } catch { json = null; }
  return {
    status: res.status,
    body: json,
    cache: res.headers.get("cache-control") || "",
    tenants: [...new Set(tenantLog.filter((e) => !e.residual).map((e) => e.v))],
    all: [...new Set(tenantLog.map((e) => e.v))],
    residual: tenantLog.filter((e) => e.residual).length,
    writes: writeLog.filter((w) => !w.residual),
    residualWrites: writeLog.filter((w) => w.residual).length,
  };
}
const enc = (o) => encodeURIComponent(JSON.stringify(o));
const OWN_A = new Set([CO_A, WS_A]);
const OWN_B = new Set([CO_B, WS_B]);
const onlyOwn = (res, own) => res.tenants.every((t) => own.has(t));
const writesOnlyTo = (res, company) => res.writes.every((w) => w.target === company);
const noWrites = (res) => res.writes.length === 0 && res.residualWrites === 0;

const a = await loginFull("analyst@qa-a.test", "qa-pass-analyst");
const picker = await loginFull("picker@qa-a.test", "qa-pass-picker");
const buyer = await loginFull("buyer@qa-a.test", "qa-pass-buyer");
const b = await loginFull("analyst@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", [a, picker, buyer, b].every((x) => Boolean(x.jar.vyron_workspace_user_session)));
const sessionCookie = a.setCookie.find((c) => c.startsWith("vyron_workspace_user_session=")) || "";
check("20. the session cookie is HttpOnly and SameSite=Lax (the application's CSRF convention)", /;\s*HttpOnly/i.test(sessionCookie) && /;\s*SameSite=Lax/i.test(sessionCookie), sessionCookie.slice(0, 120));

const OVERRIDES = {
  companyId: CO_B, company_id: CO_B, tenantId: CO_B, tenant_id: DEFAULT, workspaceId: WS_B, workspace_id: WS_B,
  userId: U_B, ownerUserId: U_B, productId: PRODUCT_B, entityId: PRODUCT_B,
};

/* ------------------------------------------------ scenarios and copilot */

const POSTS = {
  "enterprise/scenarios": {
    handler: () => scenariosRoute.POST,
    path: "/api/enterprise/scenarios",
    goodBody: { supplierPriceIncreasePct: 10, packagingIncreasePct: 5, salesDecreasePct: 0 },
    payloadOf: (bd) => bd?.impact,
    valid: (bd) => bd?.impact && ["currentGpPct", "projectedGpPct", "gpChangePts", "annualProfitImpact"].every((k) => Number.isFinite(bd.impact[k])) && Array.isArray(bd.impact.narrative),
    badBodies: [
      ["a non-numeric percentage", { supplierPriceIncreasePct: "ten" }],
      ["an infinite percentage", '{"supplierPriceIncreasePct": 1e999}'],
      ["an absurd percentage", { salesDecreasePct: 50000 }],
      ["malformed JSON", "{not json"],
    ],
  },
  "vyron-command-centre/copilot": {
    handler: () => copilotRoute.POST,
    path: "/api/vyron-command-centre/copilot",
    goodBody: { question: "What is our business health?" },
    payloadOf: (bd) => bd?.answer,
    valid: (bd) => Boolean(bd?.answer && typeof bd.answer.answer === "string"),
    badBodies: [
      ["a missing question", {}],
      ["a non-string question", { question: { $gt: "" } }],
      ["an over-long question", { question: "x".repeat(5000) }],
      ["malformed JSON", "{not json"],
    ],
  },
};
const hit = (name, { body, query = "", headers = {} } = {}) =>
  run(POSTS[name].handler(), `${POSTS[name].path}${query}`, "POST", body === undefined ? POSTS[name].goodBody : body, { headers });

for (const name of Object.keys(POSTS)) {
  const ep = POSTS[name];
  const isCopilot = name.endsWith("copilot");
  console.log(`\n${name}`);

  browser({});
  const anon = await hit(name);
  check("1. anonymous -> 401", anon.status === 401, `${anon.status}`);
  check("18. nothing protected is returned before authorisation", !ep.payloadOf(anon.body));
  check("19. anonymous: no write at all", noWrites(anon), JSON.stringify(anon.writes));
  check("17. anonymous reaches no tenant at all", anon.all.length === 0, anon.all.join(","));
  check("20. a cross-site POST (which carries no Lax session cookie) is refused", anon.status === 401 && noWrites(anon));
  browser({ vyron_workspace_user_session: "not-a-session" });
  check("2. malformed session -> 401", (await hit(name)).status === 401);
  browser({ vyron_workspace_user_session: `v1.${Buffer.from(JSON.stringify({ v: 1, k: "ws", sub: U_A, wid: WS_A, iat: 1, exp: 9999999999 })).toString("base64url")}.AAAA` });
  check("3. forged token-shaped session -> 401", (await hit(name)).status === 401);
  browser({ vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_A, companyId: CO_A, role: "OWNER" }) });
  const plain = await hit(name);
  check("4. plain JSON session naming a real member -> 401, no write", plain.status === 401 && noWrites(plain));
  browser({ vyron_auth_user_id: U_A });
  check("5. bare auth user id -> 401", (await hit(name)).status === 401);
  browser({ vyron_auth_user_id: a.jar.vyron_auth_user_id });
  check("5. a genuine auth cookie alone is not a workspace session -> 401", (await hit(name)).status === 401);

  browser(picker.jar);
  const forbidden = await hit(name);
  check("7. member without reports.view -> 403", forbidden.status === 403, `${forbidden.status}`);
  check("19. forbidden: no write at all", noWrites(forbidden), JSON.stringify(forbidden.writes));
  check("18. forbidden: nothing protected returned", !ep.payloadOf(forbidden.body));

  browser(a.jar);
  const ok = await hit(name);
  check("6/21. member with reports.view -> 200 with a valid result", ok.status === 200 && ep.valid(ok.body), `${ok.status} ${JSON.stringify(ok.body).slice(0, 160)}`);
  check("23. response is not cacheable", /no-store/i.test(ok.cache), ok.cache);
  check("8. only tenant A is queried (tracked residual excluded)", ok.tenants.length > 0 && onlyOwn(ok, OWN_A), ok.tenants.join(","));
  check("8. tenant B is never queried", !ok.all.includes(CO_B), ok.all.join(","));
  check("17. the route and its direct sources consult no fixed tenant", !ok.tenants.includes(DEFAULT));
  check("19. every write goes to tenant A only", writesOnlyTo(ok, CO_A), JSON.stringify(ok.writes));
  if (isCopilot) check("the copilot's snapshot write lands in tenant A", ok.writes.some((w) => w.table === "vyron_business_health_snapshots" && w.target === CO_A), JSON.stringify(ok.writes));
  if (ok.residual || ok.residualWrites) console.log(`  note  KNOWN RESIDUAL (tracked for the fixed-tenant helper review): ${ok.residual} queries, ${ok.residualWrites} writes by shared recovery/procurement helpers`);

  const overBody = await hit(name, { body: { ...ep.goodBody, ...OVERRIDES } });
  check("10/13/14/15/16. company/tenant/workspace/user/entity ids in the body cannot redirect it", overBody.status === 200 && onlyOwn(overBody, OWN_A) && !overBody.all.includes(CO_B) && !overBody.tenants.includes(DEFAULT) && writesOnlyTo(overBody, CO_A), `${overBody.status} ${overBody.all.join(",")}`);
  const overQuery = await hit(name, { query: `?companyId=${CO_B}&tenantId=${DEFAULT}&workspaceId=${WS_B}&userId=${U_B}` });
  check("11. query tenant ids cannot redirect it", overQuery.status === 200 && onlyOwn(overQuery, OWN_A) && !overQuery.all.includes(CO_B) && writesOnlyTo(overQuery, CO_A));
  const overHeader = await hit(name, { headers: { "x-tenant-id": CO_B, "x-company-id": DEFAULT, "x-workspace-id": WS_B, "x-user-id": U_B } });
  check("12. header tenant ids cannot redirect it", overHeader.status === 200 && onlyOwn(overHeader, OWN_A) && !overHeader.all.includes(CO_B) && writesOnlyTo(overHeader, CO_A));

  browser({ ...a.jar, vyron_cost_active_client: enc({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA Tenant A" }) });
  const hinted = await hit(name);
  check("a conflicting company hint is refused (409), with no queries of B and no writes", hinted.status === 409 && !hinted.all.includes(CO_B) && noWrites(hinted), `${hinted.status}`);
  browser({ ...a.jar, vyron_cost_active_client: b.jar.vyron_cost_active_client });
  const otherCookie = await hit(name);
  check("B's active-client cookie with A's session stays on A", otherCookie.status === 200 && onlyOwn(otherCookie, OWN_A) && writesOnlyTo(otherCookie, CO_A));

  browser(b.jar);
  const bRes = await hit(name, { body: { ...ep.goodBody, companyId: CO_A, productId: uuid("a", 100) } });
  check("9. tenant B operates on B only, even when naming A", bRes.status === 200 && onlyOwn(bRes, OWN_B) && !bRes.all.includes(CO_A) && writesOnlyTo(bRes, CO_B), `${bRes.status} ${bRes.all.join(",")}`);

  browser(a.jar);
  for (const [label, badBody] of ep.badBodies) {
    const bad = await hit(name, { body: badBody });
    check(`22. ${label} -> 400, no write`, bad.status === 400 && noWrites(bad) && /no-store/i.test(bad.cache), `${bad.status} ${JSON.stringify(bad.body).slice(0, 100)}`);
  }
  browser({});
  check("22. malformed JSON from an anonymous caller is still 401 (auth first)", (await hit(name, { body: "{not json" })).status === 401);
}

/* ------------------------------------------- procurement tracking PATCH */

console.log("\nprocurement/recommendations/[key]/tracking (PATCH, purchase_orders.edit)");
const track = (key, body, opts = {}) =>
  run(trackingRoute.PATCH, `/api/procurement/recommendations/${encodeURIComponent(key)}/tracking${opts.query || ""}`, "PATCH", body, { headers: opts.headers, params: { key: encodeURIComponent(key) } });
const GOOD = { status: "Accepted", notes: "qa note", expectedBenefit: 1200, changedBy: "attacker@evil.test" };

browser({});
const tAnon = await track("rec-a-1", GOOD);
check("1. anonymous -> 401, no write", tAnon.status === 401 && noWrites(tAnon), `${tAnon.status} ${JSON.stringify(tAnon.writes)}`);
check("17. anonymous reaches no tenant at all", tAnon.all.length === 0);
browser({ vyron_workspace_user_session: "not-a-session" });
check("2. malformed session -> 401, no write", (await track("rec-a-1", GOOD)).status === 401);
browser({ vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_A_BUYER, companyId: CO_A, role: "OWNER" }) });
const tPlain = await track("rec-a-1", GOOD);
check("3/4. forged plain-JSON session naming a real buyer -> 401, no write", tPlain.status === 401 && noWrites(tPlain));
browser({ vyron_auth_user_id: U_A_BUYER });
check("5. bare auth user id -> 401", (await track("rec-a-1", GOOD)).status === 401);

browser(a.jar);
const tNoPerm = await track("rec-a-1", GOOD);
check("7. member without purchase_orders.edit -> 403, no write", tNoPerm.status === 403 && noWrites(tNoPerm), `${tNoPerm.status}`);

browser(buyer.jar);
const tOk = await track("rec-a-1", GOOD);
check("6/21. buyer updates their own company's recommendation -> 200", tOk.status === 200 && tOk.body?.ok === true, `${tOk.status} ${JSON.stringify(tOk.body)}`);
check("19. the tracking write lands in tenant A only", tOk.writes.length > 0 && writesOnlyTo(tOk, CO_A), JSON.stringify(tOk.writes));
check("the tracking row was upserted for tenant A", tOk.writes.some((w) => w.table === "vyron_procurement_recommendation_tracking" && w.method === "upsert" && w.target === CO_A));
const audit = tOk.writes.filter((w) => w.table === "vyron_procurement_recommendation_audit");
check("the audit trail records the session member, not the body's changedBy", audit.length > 0 && audit.every((w) => w.changedBy === U_A_BUYER), JSON.stringify(audit));
check("23. response is not cacheable", /no-store/i.test(tOk.cache));
check("17. no fixed tenant is consulted", !tOk.all.includes(DEFAULT), tOk.all.join(","));

const tOverride = await track("rec-a-1", { ...GOOD, ...OVERRIDES }, { query: `?companyId=${CO_B}&tenantId=${DEFAULT}`, headers: { "x-tenant-id": CO_B } });
check("10-14. body/query/header tenant, workspace and user ids cannot redirect the write", tOverride.status === 200 && writesOnlyTo(tOverride, CO_A) && !tOverride.all.includes(DEFAULT), JSON.stringify(tOverride.writes));
const tOther = await track("rec-b-1", GOOD);
check("8/15. another company's recommendation key -> 404, no write", tOther.status === 404 && noWrites(tOther), `${tOther.status}`);
const tShared = await track("rec-shared", GOOD);
check("15. a key present in two companies -> 409, no write (the writer resolves tenant by key)", tShared.status === 409 && noWrites(tShared), `${tShared.status}`);
const tDefault = await track("rec-default", GOOD);
check("16. the fixed demo tenant's key -> 404, no write", tDefault.status === 404 && noWrites(tDefault), `${tDefault.status}`);
const tUnknown = await track("rec-does-not-exist", GOOD);
check("16. an unknown key -> 404, never the demo-tenant fallback", tUnknown.status === 404 && noWrites(tUnknown), `${tUnknown.status}`);

for (const [label, badBody] of [
  ["a missing status", { notes: "x" }],
  ["an invalid status", { status: "Owned" }],
  ["a non-finite benefit", { status: "Accepted", expectedBenefit: "lots" }],
  ["a non-string note", { status: "Accepted", notes: { $ne: "" } }],
  ["malformed JSON", "{not json"],
]) {
  const bad = await track("rec-a-1", badBody);
  check(`22. ${label} -> 400, no write`, bad.status === 400 && noWrites(bad) && /no-store/i.test(bad.cache), `${bad.status}`);
}

browser({ ...buyer.jar, vyron_cost_active_client: enc({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA Tenant A" }) });
const tHint = await track("rec-a-1", GOOD);
check("a conflicting company hint -> 409, no write", tHint.status === 409 && noWrites(tHint), `${tHint.status}`);

browser(b.jar);
const tB = await track("rec-b-1", GOOD);
check("9. tenant B updates B's recommendation, written to B only", tB.status === 200 && tB.writes.length > 0 && writesOnlyTo(tB, CO_B), JSON.stringify(tB.writes));
const tBonA = await track("rec-a-1", GOOD);
check("9. tenant B cannot update A's recommendation -> 404, no write", tBonA.status === 404 && noWrites(tBonA), `${tBonA.status}`);
browser({});
check("22. malformed JSON from an anonymous caller is still 401 (auth first)", (await track("rec-a-1", "{not json")).status === 401);

/* ------------------------------------------------------------ route source */

console.log("\nRoute source");
const code = (file) => readFileSync(path.join(ROOT, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const [file, permission] of [
  ["src/app/api/enterprise/scenarios/route.ts", "reports.view"],
  ["src/app/api/vyron-command-centre/copilot/route.ts", "reports.view"],
  ["src/app/api/procurement/recommendations/[key]/tracking/route.ts", "purchase_orders.edit"],
]) {
  const src = code(file);
  const gate = src.indexOf("requireWorkspacePermission");
  check(`${file}: requires ${permission} before reading the body`, new RegExp(`requireWorkspacePermission\\(\\s*["']${permission.replace(".", "\\.")}["']\\s*\\)`).test(src) && gate >= 0 && gate < src.indexOf(".json("));
  check(`${file}: company from the session resolver`, /resolveApiCompanyId\(\)/.test(src));
  check(`${file}: no fixed tenant`, !/VYRON_DEFAULT_TENANT_ID|DEMO_GROUP_ID|DEMO_TENANT_ID/.test(src));
}

if (unattributed.size) {
  console.log("\nFixed-tenant queries NOT from a tracked helper (each is a failure above):");
  for (const [k, n] of unattributed) console.log(`  ${n} x ${k}`);
}

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
