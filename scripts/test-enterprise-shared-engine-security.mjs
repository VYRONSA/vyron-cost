#!/usr/bin/env node
/**
 * VYRON — shared enterprise / procurement / recovery engine security test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * The shared engine helpers
 *
 *   getRecoveryCalculationsV2          recomputeRecoveryIntelligenceV2   (writes)
 *   generateProcurementRecommendations recomputeProcurementRecommendations (writes)
 *   getSupplierPriceWidgetSummary      computeProcurementHealthScore
 *   getProcurementRecommendations      getRecoveryOpportunities
 *
 * and the enterprise platform's loadOrgUnits defaulted to ONE fixed tenant
 * (the demo sandbox company) whenever a caller passed none — and most callers,
 * including server pages rendered for anonymous requests, passed none. The two
 * writers were reached from read paths ("recompute when empty"), so an
 * anonymous page load could upsert intelligence rows for that tenant; a
 * signed-in member was silently answered from it instead of their own company;
 * loadOrgUnits showed every company the demo group's units.
 *
 * WHAT THIS PROVES
 * ----------------
 * The helpers and the session, access and workspace modules run unmodified
 * against synthetic tenants; sessions come from the real login route. Only
 * cookies(), the database (server AND browser/anon client) and the password
 * check are substituted (scripts/support/session-security-test-hook.mjs).
 * Every company_id / tenant_id / group_id a query filters on and every write
 * (table, operation, company written to) is logged, in order.
 *
 * Every helper is held to the same 13 checks: anonymous and forged sessions
 * get nothing and write nothing; members get their own company only; an
 * explicit company (argument, or active-client hint) that is not the
 * verified one is refused, never substituted; a real tenant's cookie claiming
 * demo mode cannot reach the sandbox; the sandbox is reached only by a
 * verified sandbox member. The fixed sandbox company is imported from source,
 * not written here, and a synthetic VYRON_DEFAULT_TENANT_ID is set to prove no
 * helper infers a tenant from it.
 *
 * Family A: in-memory database with disposable QA tenants, no network, no
 * credentials (a random signing key for this process only), no writes outside
 * this process.
 *
 *   npm run test:enterprise-shared-engine-security
 */

import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A synthetic "default tenant" env value: no helper may ever query it. */
const CO_ENV = uuid("e", 1);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.VYRON_DEFAULT_TENANT_ID = CO_ENV;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const source = (file) => readFileSync(path.join(ROOT, file), "utf8");

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

// The sandbox company is imported from source (after the harness is installed,
// below), so this file names no tenant; the demo group is read from source.
let SANDBOX = "";
const DEMO_GROUP_ID = /DEMO_GROUP_ID\s*=\s*"([^"]+)"/.exec(source("src/lib/vyron-enterprise-platform-architecture.ts"))?.[1];

const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
/** The sandbox workspace: a verified member of it resolves to the sandbox company through the workspace record. */
let WS_SANDBOX = "";
const U_A = uuid("a", 10), U_A_LAPSED = uuid("a", 11), U_B = uuid("b", 10), U_S = uuid("c", 10);

const USERS = [
  { id: U_A, email: "analyst@qa-a.test", password: "qa-pass-a" },
  { id: U_A_LAPSED, email: "lapsed@qa-a.test", password: "qa-pass-lapsed" },
  { id: U_B, email: "analyst@qa-b.test", password: "qa-pass-b" },
  { id: U_S, email: "demo@qa-sandbox.test", password: "qa-pass-sandbox" },
];
const PERMS = { "reports.view": true, "dashboard.view": true, "purchase_orders.edit": true };
const tenants = () => [
  { co: CO_A, tag: "a", TAG: "A" },
  { co: CO_B, tag: "b", TAG: "B" },
  { co: SANDBOX, tag: "s", TAG: "S" },
];
const TRACKING = {
  [CO_A]: { recovery: "Investigating", procurement: "In Review" },
  [CO_B]: { recovery: "Recovered", procurement: "Implemented" },
};

function seed() {
  const now = new Date().toISOString();
  const tables = {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
      { id: WS_SANDBOX, company_id: SANDBOX, company_name: "QA Sandbox", package_name: "Demo", status: "Demo" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_A, role: "OWNER", status: "Active", permissions: PERMS },
      { id: "m2", workspace_id: WS_A, user_id: U_A_LAPSED, role: "OWNER", status: "Active", permissions: PERMS },
      { id: "m3", workspace_id: WS_B, user_id: U_B, role: "OWNER", status: "Active", permissions: PERMS },
      { id: "m4", workspace_id: WS_SANDBOX, user_id: U_S, role: "OWNER", status: "Active", permissions: PERMS },
    ],
    vyron_supplier_price_history: [],
    vyron_cost_products: [],
    vyron_recovery_calculations: [],
    vyron_recovery_tracking: [],
    vyron_procurement_recommendations: [],
    vyron_procurement_recommendation_tracking: [],
    vyron_procurement_recommendation_audit: [],
    vyron_procurement_recommendation_evidence: [],
    vyron_recovery_evidence: [],
    vyron_recovery_audit_trail: [],
    vyron_enterprise_org_units: [
      { id: "ou-1", group_id: DEMO_GROUP_ID, unit_key: "qa-demo-unit", unit_label: "QA Demo Unit", unit_type: "subsidiary", company_id: SANDBOX, industry: "food_manufacturing", is_active: true },
    ],
    vyron_group_company_registry: [
      { group_id: CO_A, company_id: CO_A, company_label: "QA A Subsidiary", industry: "food_manufacturing" },
    ],
  };
  for (const { co, tag, TAG } of tenants()) {
    tables.vyron_supplier_price_history.push({
      id: `ph-${tag}`, tenant_id: co, supplier_id: `sup-${tag}`, supplier_name: `QA ${TAG} Supplier`,
      entity_type: "ingredient", entity_id: `ing-${tag}`, entity_name: `QA ${TAG} Flour`,
      previous_price: 10, new_price: 12, price_difference: 2, percentage_change: 20,
      movement_type: "increase", created_at: now, invoice_date: now.slice(0, 10),
    });
    tables.vyron_cost_products.push({ id: `prod-${tag}`, company_id: co, product_name: `QA ${TAG} Pie`, selling_price: 30, total_cost: 12, target_gp: 40, product_status: "Active" });
    tables.vyron_recovery_calculations.push(calc(co, `opp-${tag}-1`));
    tables.vyron_procurement_recommendations.push(recommendation(co, `rec-${tag}-1`));
  }
  for (const co of [CO_A, CO_B]) {
    tables.vyron_recovery_calculations.push(calc(co, "opp-shared"));
    tables.vyron_procurement_recommendations.push(recommendation(co, "rec-shared"));
    tables.vyron_recovery_tracking.push({ tenant_id: co, opportunity_key: "opp-shared", status: TRACKING[co].recovery });
    tables.vyron_procurement_recommendation_tracking.push({ tenant_id: co, recommendation_key: "rec-shared", status: TRACKING[co].procurement });
  }
  return tables;
}
function calc(co, key) {
  return {
    id: `${co}-${key}`, tenant_id: co, opportunity_key: key, category: "Ingredient Inflation", title: `QA ${key}`,
    formula_expression: "x", formula_inputs: {}, missing_inputs: [], monthly_recovery: 100, annual_recovery: 1200,
    confidence_score: 80, confidence_level: "High Confidence", is_estimated: false, status: "Open",
    recommended_action: "review", products_affected: [], estimated_recovery: 0, verified_recovery: 0,
    potential_recovery: 1200, recovered_to_date: 0,
  };
}
function recommendation(co, key) {
  return {
    id: `${co}-${key}`, tenant_id: co, recommendation_key: key, category: "Price Increase", title: `QA ${key}`,
    recommended_action: "negotiate", why_exists: "qa", formula_expression: "x", potential_benefit_annual: 1000,
  };
}

/* --------------------------------------------- database, logs, then modules */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

const db = createFakeSupabase({});
const reseed = () => { for (const [table, rows] of Object.entries(seed())) db.tables[table] = rows; };

/** Ordered log: tenant filters and writes, in the order they happen. */
let events = [];
const TENANT_COLUMNS = new Set(["company_id", "tenant_id", "group_id"]);
const originalFrom = db.from.bind(db);
db.from = (table) => {
  const query = originalFrom(table);
  for (const method of ["eq", "in"]) {
    if (typeof query[method] !== "function") continue;
    const original = query[method].bind(query);
    query[method] = (column, value) => {
      if (TENANT_COLUMNS.has(column)) {
        for (const v of Array.isArray(value) ? value : [value]) events.push({ kind: "filter", table, column, v: String(v) });
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
        const target = row && typeof row === "object" ? String(row.tenant_id ?? row.company_id ?? "") : "";
        const actor = row && typeof row === "object" ? row.changed_by ?? row.created_by ?? row.updated_by : undefined;
        events.push({ kind: "write", table, method, target, actor });
      }
      return original(payload, ...rest);
    };
  }
  return query;
};
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map() };
const browser = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

({ HANDCRAFTED_COMPANY_ID: SANDBOX } = await importFromRoot("src/lib/vyron-handcrafted-intelligence.ts"));
WS_SANDBOX = SANDBOX;
reseed();

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const recoveryV2 = await importFromRoot("src/lib/vyron-recovery-intelligence-v2.ts");
const procurementEngine = await importFromRoot("src/lib/vyron-procurement-ai-engine.ts");
const procurementData = await importFromRoot("src/lib/vyron-procurement-ai-data.ts");
const recoveryData = await importFromRoot("src/lib/vyron-cost-recovery-data.ts");
const supplierEngine = await importFromRoot("src/lib/vyron-supplier-intelligence-engine.ts");
const platform = await importFromRoot("src/lib/vyron-enterprise-platform-architecture.ts");
const scenarios = await importFromRoot("src/lib/vyron-enterprise-scenarios.ts");
let engineTenant = null;
try {
  engineTenant = await importFromRoot("src/lib/vyron-engine-tenant.ts");
} catch {
  engineTenant = null;
}

async function login(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

/** Run one call and return its result plus exactly what it touched. */
async function observe(fn) {
  events = [];
  let result;
  let error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const filters = events.filter((e) => e.kind === "filter");
  const writes = events.filter((e) => e.kind === "write");
  return {
    result,
    error,
    events: [...events],
    vals: new Set(filters.filter((f) => f.column !== "group_id").map((f) => f.v)),
    groups: new Set(filters.filter((f) => f.column === "group_id").map((f) => f.v)),
    writes,
  };
}
const enc = (o) => encodeURIComponent(JSON.stringify(o));
const ownSet = (co) => new Set(co === CO_A ? [CO_A, WS_A] : co === CO_B ? [CO_B, WS_B] : [SANDBOX, WS_SANDBOX]);
const only = (run, co) => run.vals.has(co) && [...run.vals].every((v) => ownSet(co).has(v));
const writesTo = (run, co) => run.writes.every((w) => w.target === co);
const quiet = (run) => run.vals.size === 0 && run.groups.size === 0 && run.writes.length === 0;
const fixedHits = (run) => [...new Set(run.events.filter((e) => e.kind === "filter" && (e.v === SANDBOX || e.v === CO_ENV)).map((e) => `${e.table}.${e.column}`))];
const brief = (run) => `tenants=[${[...run.vals].join(",")}] groups=[${[...run.groups].join(",")}] writes=${run.writes.length}${fixedHits(run).length ? ` fixed-tenant filters: ${fixedHits(run).join(", ")}` : ""}${run.error ? ` error=${run.error.message}` : ""}`;

const jarA = await login("analyst@qa-a.test", "qa-pass-a");
const jarLapsed = await login("lapsed@qa-a.test", "qa-pass-lapsed");
const jarB = await login("analyst@qa-b.test", "qa-pass-b");
const jarS = await login("demo@qa-sandbox.test", "qa-pass-sandbox");
check("synthetic members (tenant A, tenant B, a verified sandbox member) sign in through the real login route", [jarA, jarLapsed, jarB, jarS].every((j) => Boolean(j.vyron_workspace_user_session)));
check("the fixed sandbox company and demo group were read from source, and no synthetic id coincides with them", Boolean(SANDBOX && DEMO_GROUP_ID) && [CO_A, CO_B, CO_ENV, WS_A, WS_B].every((id) => id !== SANDBOX && id !== DEMO_GROUP_ID));

const FORGED_TOKEN = { vyron_workspace_user_session: `v1.${Buffer.from(JSON.stringify({ v: 1, k: "ws", sub: U_A, wid: WS_A, iat: 1, exp: 9999999999 })).toString("base64url")}.AAAA` };
const PLAIN_JSON = { vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_A, companyId: CO_A, role: "OWNER" }) };
const hint = (jar, ws, companyId, extra = {}) => ({ ...jar, vyron_cost_active_client: enc({ id: ws, workspaceId: ws, companyId, companyName: "QA", ...extra }) });
/** A real tenant's own cookie, edited to claim demo mode in every way the cookie can. */
const FORGED_DEMO_A = hint(jarA, WS_A, CO_A, { tradingName: "QA", demoMode: true, status: "Demo", packageName: "Demo" });

/* ------------------------------------------------------- the 8 helpers */

const emptyList = (r) => Array.isArray(r) && r.length === 0;
const keysOf = (r) => (Array.isArray(r) ? r.map((x) => String(x.opportunity_key ?? x.recommendation_key ?? "")) : []);
const OTHER_TAGS = { [CO_A]: ["b", "s"], [CO_B]: ["a", "s"], [SANDBOX]: ["a", "b"] };
const TAG_OF = { [CO_A]: "a", [CO_B]: "b", [SANDBOX]: "s" };
const noForeignKeys = (r, co, prefix) => keysOf(r).every((k) => !OTHER_TAGS[co].some((t) => k === `${prefix}-${t}-1`));
const NEUTRAL_HEALTH = (r) => r && r.overall === 0 && Array.isArray(r.notes) && r.notes.some((n) => /No verified company/.test(n));

const HELPERS = [
  {
    name: "getRecoveryCalculationsV2",
    call: (arg) => recoveryV2.getRecoveryCalculationsV2(arg),
    empty: emptyList,
    own: (r, co) => Array.isArray(r) && r.length > 0 && r.every((x) => x.tenant_id === co),
  },
  {
    name: "recomputeRecoveryIntelligenceV2",
    write: true,
    call: (arg) => recoveryV2.recomputeRecoveryIntelligenceV2(arg),
    empty: emptyList,
    own: (r) => Array.isArray(r) && r.length > 0,
  },
  {
    name: "generateProcurementRecommendations",
    call: (arg) => procurementEngine.generateProcurementRecommendations(arg),
    empty: emptyList,
    own: (r) => Array.isArray(r) && r.length > 0,
  },
  {
    name: "recomputeProcurementRecommendations",
    write: true,
    call: (arg) => procurementEngine.recomputeProcurementRecommendations(arg),
    empty: emptyList,
    own: (r) => Array.isArray(r) && r.length > 0,
  },
  {
    name: "getSupplierPriceWidgetSummary",
    call: (arg) => supplierEngine.getSupplierPriceWidgetSummary(arg),
    empty: (r) => r && r.increasesThisMonth === 0 && r.decreasesThisMonth === 0 && !r.highestIncrease,
    own: (r, co) => {
      const text = JSON.stringify(r);
      const mine = `QA ${TAG_OF[co].toUpperCase()} Supplier`;
      return r.increasesThisMonth > 0 && text.includes(mine) && OTHER_TAGS[co].every((t) => !text.includes(`QA ${t.toUpperCase()} Supplier`));
    },
  },
  {
    name: "computeProcurementHealthScore",
    call: (arg) => procurementEngine.computeProcurementHealthScore(arg),
    empty: NEUTRAL_HEALTH,
    own: (r) => r && Number.isFinite(r.overall) && !NEUTRAL_HEALTH(r),
  },
  {
    name: "getProcurementRecommendations",
    noArg: true,
    call: () => procurementData.getProcurementRecommendations(),
    empty: emptyList,
    own: (r, co) => {
      if (!keysOf(r).includes(`rec-${TAG_OF[co]}-1`) || !noForeignKeys(r, co, "rec")) return false;
      const shared = r.find((x) => x.recommendation_key === "rec-shared");
      return TRACKING[co] ? shared?.status === TRACKING[co].procurement : !shared;
    },
  },
  {
    name: "getRecoveryOpportunities",
    noArg: true,
    call: () => recoveryData.getRecoveryOpportunities(),
    empty: emptyList,
    own: (r, co) => {
      if (!keysOf(r).includes(`opp-${TAG_OF[co]}-1`) || !noForeignKeys(r, co, "opp")) return false;
      const shared = r.find((x) => x.opportunity_key === "opp-shared");
      return TRACKING[co] ? shared?.tracking_status === TRACKING[co].recovery : !shared;
    },
  },
];

/** For helpers without a company argument, an "explicit company" is the active-client hint. */
async function asExplicit(helper, sessionJar, ws, company) {
  if (helper.noArg) {
    browser(hint(sessionJar, ws, company));
    return observe(() => helper.call());
  }
  browser(sessionJar);
  return observe(() => helper.call(company));
}

const sessionWrites = { anonymous: [], forged: [], A: [], B: [], sandbox: [] };

for (const helper of HELPERS) {
  console.log(`\n${helper.name}${helper.write ? "  (WRITES)" : ""}`);

  reseed();
  browser({});
  const anon = await observe(() => helper.call());
  check("1. anonymous: returns nothing (an empty / neutral result)", !anon.error && helper.empty(anon.result), brief(anon));
  check("2. anonymous: queries no tenant at all", anon.vals.size === 0 && anon.groups.size === 0, brief(anon));
  check("3. anonymous: writes nothing", anon.writes.length === 0, brief(anon));
  sessionWrites.anonymous.push(...anon.writes);

  const forged = [];
  for (const jar of [FORGED_TOKEN, PLAIN_JSON, { vyron_auth_user_id: U_A }, hint({}, WS_A, CO_A)]) {
    browser(jar);
    forged.push(await observe(() => helper.call()));
  }
  check("4. forged token / plain-JSON session / bare user id / cookie hint alone: nothing returned, queried or written", forged.every((run) => !run.error && helper.empty(run.result) && quiet(run)), forged.map(brief).join(" | "));
  for (const run of forged) sessionWrites.forged.push(...run.writes);

  reseed();
  browser(jarA);
  const a = await observe(() => helper.call());
  check("5. tenant A: only tenant A is queried (never B, the sandbox or the env default)", only(a, CO_A), brief(a));
  check("6. tenant A: returns tenant A's own data", !a.error && helper.own(a.result, CO_A), `${brief(a)} keys=${keysOf(a.result).join(",")}`);
  check(`7. tenant A: every write goes to tenant A${helper.write ? " (and it does write)" : ""}`, writesTo(a, CO_A) && (!helper.write || a.writes.length > 0), JSON.stringify(a.writes));
  sessionWrites.A.push(...a.writes);

  reseed();
  browser(jarB);
  const b = await observe(() => helper.call());
  check("8. tenant B: only B queried, B's own data, writes only to B", only(b, CO_B) && !b.error && helper.own(b.result, CO_B) && writesTo(b, CO_B) && (!helper.write || b.writes.length > 0), `${brief(b)} keys=${keysOf(b.result).join(",")}`);
  sessionWrites.B.push(...b.writes);

  reseed();
  const crossB = await asExplicit(helper, jarA, WS_A, CO_B);
  check(`9. tenant A naming tenant B (${helper.noArg ? "active-client hint" : "explicit argument"}): refused — nothing returned, B never queried, no write`, !crossB.error && helper.empty(crossB.result) && quiet(crossB), brief(crossB));
  const crossFixed = await asExplicit(helper, jarA, WS_A, SANDBOX);
  const crossEnv = await asExplicit(helper, jarA, WS_A, CO_ENV);
  check("10. tenant A naming the fixed sandbox company or the env default tenant: refused, never queried, no write", [crossFixed, crossEnv].every((run) => !run.error && helper.empty(run.result) && quiet(run)), `${brief(crossFixed)} | ${brief(crossEnv)}`);
  sessionWrites.A.push(...crossB.writes, ...crossFixed.writes, ...crossEnv.writes);

  reseed();
  const ownExplicit = await asExplicit(helper, jarA, WS_A, CO_A);
  check("11. tenant A naming its own company: served, tenant A only", only(ownExplicit, CO_A) && !ownExplicit.error && helper.own(ownExplicit.result, CO_A) && writesTo(ownExplicit, CO_A), brief(ownExplicit));
  sessionWrites.A.push(...ownExplicit.writes);

  reseed();
  browser(FORGED_DEMO_A);
  const demoClaim = await observe(() => helper.call());
  check("12. tenant A's cookie edited to claim demo mode: still tenant A only — the sandbox is never reached", only(demoClaim, CO_A) && writesTo(demoClaim, CO_A) && !demoClaim.vals.has(SANDBOX), brief(demoClaim));
  sessionWrites.A.push(...demoClaim.writes);

  reseed();
  browser(jarS);
  const sandbox = await observe(() => helper.call());
  check("13. a verified sandbox member (explicit demo): the sandbox company only, never a real tenant", only(sandbox, SANDBOX) && !sandbox.error && helper.own(sandbox.result, SANDBOX) && writesTo(sandbox, SANDBOX) && (!helper.write || sandbox.writes.length > 0), brief(sandbox));
  sessionWrites.sandbox.push(...sandbox.writes);
}

/* ------------------------------------------- the two write helpers (proof) */

console.log("\nWrite helpers: authentication, authorisation, company, ownership, actor");
const body = (text, name) => {
  const start = text.indexOf(`export async function ${name}(`);
  if (start < 0) return "";
  const next = text.indexOf("\nexport ", start + 10);
  return text.slice(start, next < 0 ? undefined : next);
};
for (const [name, call, file] of [
  ["recomputeRecoveryIntelligenceV2", (arg) => recoveryV2.recomputeRecoveryIntelligenceV2(arg), "src/lib/vyron-recovery-intelligence-v2.ts"],
  ["recomputeProcurementRecommendations", (arg) => procurementEngine.recomputeProcurementRecommendations(arg), "src/lib/vyron-procurement-ai-engine.ts"],
]) {
  console.log(`  ${name}`);
  reseed();
  const lapsedRow = db.tables.vyron_workspace_memberships.find((m) => m.user_id === U_A_LAPSED);
  lapsedRow.status = "Suspended";
  browser(jarLapsed);
  const lapsed = await observe(() => call(CO_A));
  check("E. authorisation first: a validly signed session whose membership is no longer Active writes nothing and reads nothing", quiet(lapsed), brief(lapsed));

  reseed();
  browser(jarA);
  const a = await observe(() => call());
  const firstWrite = a.events.findIndex((e) => e.kind === "write");
  const before = a.events.slice(0, firstWrite < 0 ? a.events.length : firstWrite).filter((e) => e.kind === "filter");
  check("E. company resolved before the write: every query before the first write is scoped to tenant A", firstWrite > 0 && before.length > 0 && before.every((e) => ownSet(CO_A).has(e.v)), `firstWrite=${firstWrite} ${before.map((e) => e.v).join(",")}`);
  check("E. correct company on every write (tenant_id is the verified company on every row)", a.writes.length > 0 && a.writes.every((w) => w.target === CO_A && (w.method === "upsert" || w.method === "insert")), JSON.stringify(a.writes));
  check("E. audit actor: the helper takes no actor from its caller and writes none", a.writes.every((w) => w.actor === undefined) && !/changed_?[bB]y|created_?[bB]y/.test(body(source(file), name).split("\n")[0] + body(source(file), name).split("{")[0]), JSON.stringify(a.writes.map((w) => w.actor)));

  reseed();
  browser(jarB);
  const bOnA = await observe(() => call(CO_A));
  check("E. no caller override: tenant B naming tenant A writes nothing to A (nor anything at all)", quiet(bOnA), brief(bOnA));

  const text = body(source(file), name);
  const gate = text.indexOf("resolveEngineTenant(");
  const firstDb = Math.min(...[text.indexOf("getSupabaseAdmin("), text.indexOf(".from("), text.indexOf("generateProcurementRecommendations(")].filter((i) => i >= 0));
  check("E. source: the company is resolved from the verified session before any database access, with no default", gate > 0 && gate < firstDb && !/=\s*DEMO_TENANT_ID|=\s*VYRON_DEFAULT_TENANT_ID/.test(text.split(")")[0]), `${file}`);
}
check("E. no write was ever made for an anonymous or forged caller", sessionWrites.anonymous.length === 0 && sessionWrites.forged.length === 0);
check("E. every tenant-A-session write went to tenant A; every tenant-B write to B; every sandbox write to the sandbox", writesTo({ writes: sessionWrites.A }, CO_A) && writesTo({ writes: sessionWrites.B }, CO_B) && writesTo({ writes: sessionWrites.sandbox }, SANDBOX), JSON.stringify({ A: [...new Set(sessionWrites.A.map((w) => w.target))], B: [...new Set(sessionWrites.B.map((w) => w.target))], S: [...new Set(sessionWrites.sandbox.map((w) => w.target))] }));
check("E. the synthetic env default tenant was never written", ![...sessionWrites.A, ...sessionWrites.B, ...sessionWrites.sandbox].some((w) => w.target === CO_ENV));

/* ----------------------------------------------- key-based writers (no fallback) */

console.log("\nKey-based tracking / evidence writers: no fallback company");
browser(jarA);
for (const [name, fn] of [
  ["saveRecoveryTracking", () => recoveryData.saveRecoveryTracking("qa-unknown-key", { status: "Investigating" }, "qa")],
  ["addRecoveryEvidence", () => recoveryData.addRecoveryEvidence("qa-unknown-key", { evidenceType: "note", title: "qa" })],
  ["saveProcurementTracking", () => procurementData.saveProcurementTracking("qa-unknown-key", { status: "In Review" }, "qa")],
  ["addProcurementEvidence", () => procurementData.addProcurementEvidence("qa-unknown-key", { evidenceType: "note", title: "qa" })],
]) {
  reseed();
  const run = await observe(fn);
  check(`${name}: an unknown key is refused and writes nothing (it used to write under the fixed tenant)`, Boolean(run.error) && run.writes.length === 0 && !run.vals.has(SANDBOX), brief(run));
}

/* ------------------------------------------------------------ loadOrgUnits */

console.log("\nloadOrgUnits (via getEnterprisePlatformPayload) and DEMO_GROUP_ID");
const DEMO_LABELS = ["QA Demo Unit", "Vyron Foods Group", "Cape Distribution Co"];
const payload = async (jar, arg) => {
  reseed();
  browser(jar);
  return observe(() => (arg === undefined ? platform.getEnterprisePlatformPayload() : platform.getEnterprisePlatformPayload(arg)));
};
const unitsOf = (run) => run.result?.multiCompany?.units || [];
const showsDemo = (run) => unitsOf(run).some((u) => DEMO_LABELS.includes(u.unitLabel) || u.companyId === SANDBOX);
const lAnon = await payload({}, CO_A);
check("L1. anonymous: no org-unit query at all (no group is resolved)", lAnon.groups.size === 0, brief(lAnon));
const lAnonDefault = await payload({}, undefined);
check("L2. anonymous with the page default: the demo group is never queried or shown", !lAnonDefault.groups.has(DEMO_GROUP_ID) && !showsDemo(lAnonDefault), brief(lAnonDefault));
const lA = await payload(jarA, CO_A);
check("L3. tenant A: only tenant A's group registry is queried; the demo group never", [...lA.groups].every((g) => g === CO_A) && lA.groups.has(CO_A), brief(lA));
check("L3. tenant A: its own registry company is shown, never demo-group units", !lA.error && unitsOf(lA).some((u) => u.unitLabel === "QA A Subsidiary" && u.companyId === CO_A) && !showsDemo(lA), lA.error ? `payload error: ${lA.error.message}` : JSON.stringify(unitsOf(lA).map((u) => u.unitLabel)));
const lADefault = await payload(jarA, undefined);
check("L4. tenant A through the page default (a fixed / env company): refused — no group resolved, demo group never queried or shown", lADefault.groups.size === 0 && !showsDemo(lADefault), brief(lADefault));
const lACross = await payload(jarA, CO_B);
check("L5. tenant A naming tenant B: refused — B's group never queried", lACross.groups.size === 0, brief(lACross));
const lADemo = await payload(FORGED_DEMO_A, CO_A);
check("L6. tenant A's cookie claiming demo mode: the demo group is never queried or shown", !lADemo.groups.has(DEMO_GROUP_ID) && !showsDemo(lADemo), brief(lADemo));
const lB = await payload(jarB, CO_B);
check("L7. tenant B with no group registry: only B's registry is queried and B sees its own single company, not the demo group", [...lB.groups].every((g) => g === CO_B) && !lB.error && unitsOf(lB).length === 1 && unitsOf(lB)[0].companyId === CO_B && !showsDemo(lB), `${brief(lB)} units=${JSON.stringify(unitsOf(lB).map((u) => u.unitLabel))}`);
const lS = await payload(jarS, SANDBOX);
check("L8. the verified sandbox member (explicit demo): the demo group is queried and shown, no real tenant's group", lS.groups.has(DEMO_GROUP_ID) && ![CO_A, CO_B].some((g) => lS.groups.has(g)) && unitsOf(lS).some((u) => u.unitLabel === "QA Demo Unit"), `${brief(lS)} units=${JSON.stringify(unitsOf(lS).map((u) => u.unitLabel))}`);

/* ---------------------------------------------------- scenario callers (F) */

console.log("\nrunEnterpriseScenario and its callers");
const INPUT = { supplierPriceIncreasePct: 10, packagingIncreasePct: 0, salesDecreasePct: 0 };
reseed();
browser({});
const sAnon = await observe(() => scenarios.runEnterpriseScenario(INPUT));
check("F1. anonymous: a neutral result, no tenant queried, no write", !sAnon.error && sAnon.result?.currentGpPct === 0 && sAnon.result?.annualProfitImpact === 0 && quiet(sAnon), brief(sAnon));
reseed();
browser(jarA);
const sA = await observe(() => scenarios.runEnterpriseScenario(INPUT, CO_A));
check("F2. tenant A passing its verified company: tenant A only, writes only to A", !sA.error && only(sA, CO_A) && writesTo(sA, CO_A), brief(sA));
reseed();
const sCross = await observe(() => scenarios.runEnterpriseScenario(INPUT, CO_B));
check("F3. tenant A naming tenant B: refused (neutral), B never queried", !sCross.error && sCross.result?.currentGpPct === 0 && !sCross.vals.has(CO_B) && sCross.writes.length === 0, brief(sCross));
const pageSrc = source("src/app/scenario-modelling/page.tsx");
check("F4. the scenario-modelling page passes the company from the verified-session gate explicitly", /const \{ companyId \} = await requireWorkspacePage\("reports\.view"\);/.test(pageSrc) && /runEnterpriseScenario\([\s\S]*?,\s*companyId\s*\)/.test(pageSrc) && !/resolveApiCompanyId|VYRON_DEFAULT_TENANT_ID/.test(pageSrc));
const aiSrc = source("src/lib/vyron-ai-financial-intelligence.ts");
check("F5. vyron-ai-financial-intelligence passes the verified company explicitly", /const scenarioCompanyId = await resolveApiCompanyId\(\)/.test(aiSrc) && /\},\s*scenarioCompanyId\)/.test(aiSrc));

/* ---------------------------------------------------- the resolver itself */

console.log("\nresolveEngineTenant");
check("R0. the engine tenant resolver exists", Boolean(engineTenant?.resolveEngineTenant));
const resolve = async (jar, requested) => {
  browser(jar);
  return engineTenant ? engineTenant.resolveEngineTenant(requested) : "(missing)";
};
check("R1. anonymous -> null (fail closed; no default, no env tenant)", (await resolve({})) === null);
check("R2. forged / plain-JSON sessions -> null", (await resolve(FORGED_TOKEN)) === null && (await resolve(PLAIN_JSON)) === null);
check("R3. tenant A -> tenant A", (await resolve(jarA)) === CO_A);
check("R4. tenant A requesting A -> A; requesting B, the sandbox or the env default -> null (refused, never substituted)", (await resolve(jarA, CO_A)) === CO_A && (await resolve(jarA, CO_B)) === null && (await resolve(jarA, SANDBOX)) === null && (await resolve(jarA, CO_ENV)) === null);
check("R5. tenant A's cookie claiming demo mode -> still tenant A", (await resolve(FORGED_DEMO_A)) === CO_A);
check("R6. tenant A's cookie naming the sandbox workspaces -> still tenant A", (await resolve(hint(jarA, WS_SANDBOX, SANDBOX, { tradingName: "QA", demoMode: true, status: "Demo" }))) === CO_A && (await resolve(hint(jarA, "handcrafted-fp", SANDBOX, { tradingName: "QA", demoMode: true, status: "Demo" }))) === CO_A);
check("R7. tenant A with a conflicting company hint -> null", (await resolve(hint(jarA, WS_A, CO_B))) === null);
check("R8. the verified sandbox member -> the sandbox company; requesting a real tenant -> null", (await resolve(jarS)) === SANDBOX && (await resolve(jarS, CO_A)) === null);

/* ------------------------------------------------------------ engine source */

console.log("\nEngine source");
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ENGINE_FILES = [
  "src/lib/vyron-recovery-intelligence-v2.ts",
  "src/lib/vyron-procurement-ai-engine.ts",
  "src/lib/vyron-procurement-ai-data.ts",
  "src/lib/vyron-cost-recovery-data.ts",
  "src/lib/vyron-supplier-intelligence-engine.ts",
  "src/lib/vyron-enterprise-scenarios.ts",
];
for (const file of ENGINE_FILES) {
  const text = strip(source(file));
  check(`${file}: no fixed or default tenant (literal, DEMO_TENANT_ID, VYRON_DEFAULT_TENANT_ID, cookie-trusting scope)`, !text.includes(SANDBOX) && !/DEMO_TENANT_ID|VYRON_DEFAULT_TENANT_ID|workspaceScope\(|getWorkspaceTenantId\(/.test(text));
}
for (const [file, names] of [
  ["src/lib/vyron-recovery-intelligence-v2.ts", ["getRecoveryCalculationsV2", "getRecoveryCalculationByKey", "recomputeRecoveryIntelligenceV2"]],
  ["src/lib/vyron-procurement-ai-engine.ts", ["generateProcurementRecommendations", "importRecoveryOpportunitiesAsRecommendations", "computeProcurementHealthScore", "recomputeProcurementRecommendations"]],
  ["src/lib/vyron-procurement-ai-data.ts", ["getProcurementRecommendations"]],
  ["src/lib/vyron-cost-recovery-data.ts", ["getRecoveryOpportunities"]],
  ["src/lib/vyron-supplier-intelligence-engine.ts", ["getSupplierPriceWidgetSummary", "getProductImpactFromRecentMovements", "getPhase4RecoveryInsights", "getRecoveryInsightDrilldown", "getProcurementRiskAlerts"]],
]) {
  const text = strip(source(file));
  for (const name of names) {
    const fnBody = body(text, name);
    const gate = fnBody.indexOf("resolveEngineTenant(");
    const access = [fnBody.indexOf(".from("), fnBody.indexOf("getSupabaseAdmin("), fnBody.indexOf("await get"), fnBody.indexOf("await recompute")].filter((i) => i >= 0 && i !== gate);
    check(`${name}: resolves the verified company before any data access`, gate > 0 && access.every((i) => i > gate), file);
  }
}
const platformText = strip(source("src/lib/vyron-enterprise-platform-architecture.ts"));
const loadBody = platformText.slice(platformText.indexOf("async function loadOrgUnits("), platformText.indexOf("export async function getEnterprisePlatformPayload"));
check("loadOrgUnits: DEMO_GROUP_ID and the synthetic demo units are used only for the verified sandbox company", /resolveEngineTenant\(/.test(loadBody) && /isDemoSandbox\s*\?[\s\S]*DEMO_GROUP_ID/.test(loadBody) && /if \(isDemoSandbox\) return buildDemoOrgUnits/.test(loadBody));
check("tracking readers are scoped by company as well as key", /getTrackingMap\(keys: string\[\], tenantId: string\)[\s\S]*?\.eq\("tenant_id", tenantId\)/.test(strip(source("src/lib/vyron-procurement-ai-data.ts"))) && /getRecoveryTrackingMap\(opportunityKeys: string\[\], tenantId: string\)[\s\S]*?\.eq\("tenant_id", tenantId\)/.test(strip(source("src/lib/vyron-cost-recovery-data.ts"))));

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
