#!/usr/bin/env node
/**
 * VYRON — server-page tenant security test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * Server-rendered finance pages (AI CFO command centre, boardroom insights,
 * board pack, executive reporting, finance intelligence, financial leakage,
 * compliance and risk centres, the enterprise platform, the VYRON command
 * centre, scenario modelling) had no authentication or permission check — no
 * proxy or layout sits in front of them — and most called finance libraries
 * without a company, so the fixed default tenant applied. Several of those
 * libraries INSERT on every call (intelligence score, leakage, business health,
 * finance health snapshots; board-pack audit), so an anonymous page view read
 * and wrote company data.
 *
 * WHAT THIS PROVES
 * ----------------
 * The real page modules run, unmodified, against synthetic tenants: sessions
 * come from the real login route; only cookies()/headers(), the database
 * (server and browser client) and the password check are substituted
 * (scripts/support/session-security-test-hook.mjs, plus
 * scripts/support/server-page-test-hook.mjs for next/link and
 * next/navigation). Every database access is logged in order —
 *   AUTH     the membership read that verifies the session and its permissions
 *   COMPANY  the workspace read that resolves the company
 *   READ     any company_id / tenant_id filter
 *   WRITE    any insert / upsert / update / delete, with the company it targets
 * — so each page is held to AUTH -> AUTHZ -> COMPANY -> READ/WRITE, and any
 * write or tenant read before that fails the test. The fixed sandbox company is
 * imported from source and a synthetic VYRON_DEFAULT_TENANT_ID is set; neither
 * may ever be reached by a real tenant.
 *
 * Family A: in-memory database with disposable QA tenants, no network, no
 * credentials (a random signing key for this process only), no writes outside
 * this process. Production pages are never loaded.
 *
 *   npm run test:server-page-tenant-security
 */

import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
register("./support/server-page-test-hook.mjs", import.meta.url);

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** A synthetic "default tenant" env value: nothing may ever query or write it. */
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
  if (condition) return;
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}

/* ---------------------------------------------------------------- fixtures */

let SANDBOX = "";
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
let WS_SANDBOX = "";
const U_A = uuid("a", 10), U_A_VIEWER = uuid("a", 11), U_A_LAPSED = uuid("a", 12), U_B = uuid("b", 10), U_S = uuid("c", 10);

const USERS = [
  { id: U_A, email: "analyst@qa-a.test", password: "qa-pass-a" },
  { id: U_A_VIEWER, email: "viewer@qa-a.test", password: "qa-pass-viewer" },
  { id: U_A_LAPSED, email: "lapsed@qa-a.test", password: "qa-pass-lapsed" },
  { id: U_B, email: "analyst@qa-b.test", password: "qa-pass-b" },
  { id: U_S, email: "demo@qa-sandbox.test", password: "qa-pass-sandbox" },
];
const REPORTS = { "reports.view": true, "dashboard.view": true };
const NO_REPORTS = { "reports.view": false, "dashboard.view": true };

function seed() {
  const tables = {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
      { id: WS_SANDBOX, company_id: SANDBOX, company_name: "QA Sandbox", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_A, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
      { id: "m2", workspace_id: WS_A, user_id: U_A_VIEWER, role: "PROCUREMENT", status: "Active", permissions: NO_REPORTS },
      { id: "m3", workspace_id: WS_A, user_id: U_A_LAPSED, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
      { id: "m4", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
      { id: "m5", workspace_id: WS_SANDBOX, user_id: U_S, role: "PROCUREMENT", status: "Active", permissions: REPORTS },
    ],
    vyron_cost_products: [],
    vyron_cost_suppliers: [],
    vyron_cost_purchase_orders: [],
    vyron_cost_ingredients: [],
  };
  for (const [co, tag] of [[CO_A, "A"], [CO_B, "B"], [SANDBOX, "S"]]) {
    tables.vyron_cost_products.push({ id: `prod-${tag}`, company_id: co, product_name: `QA-${tag}-MARKER product`, selling_price: 30, total_cost: 12, target_gp: 40, product_status: "Active" });
    tables.vyron_cost_suppliers.push({ id: `sup-${tag}`, company_id: co, supplier_name: `QA-${tag}-MARKER supplier`, status: "Active" });
    tables.vyron_cost_purchase_orders.push({ id: `po-${tag}`, company_id: co, po_number: `QA-${tag}-MARKER-PO`, supplier_name: `QA-${tag}-MARKER supplier`, variance: 10, total_amount: 100, status: "Approved" });
    tables.vyron_cost_ingredients.push({ id: `ing-${tag}`, company_id: co, ingredient_name: `QA-${tag}-MARKER ingredient`, unit_cost: 5 });
  }
  return tables;
}

/* --------------------------------------------- database, logs, then modules */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase({});
const reseed = () => { for (const [table, rows] of Object.entries(seed())) db.tables[table] = rows; };

let events = [];
/**
 * Every logged event carries the run (one page render / one call) whose async
 * context caused it, so work a previous run left in flight can never be
 * mistaken for this run's — and each run is allowed to settle completely.
 */
const als = new AsyncLocalStorage();
let runSeq = 0;
const tag = () => als.getStore();
async function settle() {
  let last = -1, stable = 0;
  for (let i = 0; i < 400 && stable < 8; i++) {
    await new Promise((r) => setImmediate(r));
    if (events.length === last) stable += 1;
    else { stable = 0; last = events.length; }
  }
}
const TENANT_COLUMNS = new Set(["company_id", "tenant_id"]);
const ACTOR_FIELDS = ["generated_by", "actor", "changed_by", "created_by", "updated_by"];
const originalFrom = db.from.bind(db);
db.from = (table) => {
  if (table === "vyron_workspace_memberships") events.push({ run: tag(), kind: "AUTH", table });
  if (table === "vyron_workspaces") events.push({ run: tag(), kind: "COMPANY", table });
  const query = originalFrom(table);
  for (const method of ["eq", "in"]) {
    if (typeof query[method] !== "function") continue;
    const original = query[method].bind(query);
    query[method] = (column, value) => {
      if (TENANT_COLUMNS.has(column)) {
        for (const v of Array.isArray(value) ? value : [value]) events.push({ run: tag(), kind: "READ", table, v: String(v) });
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
        const actor = row && typeof row === "object" ? ACTOR_FIELDS.map((f) => row[f]).find((x) => x !== undefined) : undefined;
        events.push({ run: tag(), kind: "WRITE", table, method, target, actor });
      }
      return original(payload, ...rest);
    };
  }
  return query;
};
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map(), headers: {} };
const browser = (jar, headers = {}) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
  globalThis.__VYRON_SESSION_TEST__.headers = headers;
};

// Imported only once the harness is in place (modules capture the browser client at import).
({ HANDCRAFTED_COMPANY_ID: SANDBOX } = await importFromRoot("src/lib/vyron-handcrafted-intelligence.ts"));
WS_SANDBOX = uuid("c", 2);
reseed();
const { loadHandcraftedTenant } = await importFromRoot("src/lib/handcrafted-tenant.ts");
/** Real names from the bundled Handcrafted demo data: they must never reach a real tenant's page. */
const HANDCRAFTED_MARKERS = (loadHandcraftedTenant()?.products || []).slice(0, 5).map((p) => String(p.product_name || p.name || "")).filter((n) => n.length > 6);

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
async function login(email, password) {
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

/* ------------------------------------------------------------------ pages */

const PAGES = [
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/benchmarks/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/budget/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/forecast/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/leakage/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/strategic/page.tsx"],
  ["ai-cfo-command-centre", "src/app/ai-cfo-command-centre/timeline/page.tsx"],
  ["ai-cfo-command-centre", "src/app/boardroom-insights/page.tsx"],
  ["board-pack", "src/app/board-pack-centre/page.tsx"],
  ["board-pack", "src/app/executive-reporting/page.tsx"],
  ["finance", "src/app/compliance-centre/page.tsx"],
  ["finance", "src/app/risk-centre/page.tsx"],
  ["finance", "src/app/finance-intelligence/page.tsx"],
  ["finance", "src/app/financial-leakage/page.tsx"],
  ["finance", "src/app/scenario-modelling/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/ai-assistant/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/benchmarking/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/command-centre/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/data-warehouse/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/foundation/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/global-permissions/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/group-reporting/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/intercompany/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/knowledge-graph/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/multi-company/page.tsx"],
  ["enterprise-platform", "src/app/enterprise-platform/performance/page.tsx"],
  ["vyron-command-centre", "src/app/vyron-command-centre/knowledge/page.tsx"],
  ["vyron-command-centre", "src/app/vyron-command-centre/performance/page.tsx"],
  ["vyron-command-centre", "src/app/vyron-command-centre/scorecards/page.tsx"],
  ["vyron-command-centre", "src/app/vyron-command-centre/strategic/page.tsx"],
];

function serialise(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, v) => {
      if (key === "_owner" || key === "_store" || typeof v === "function" || typeof v === "symbol") return undefined;
      if (v && typeof v === "object") {
        if (seen.has(v)) return undefined;
        seen.add(v);
      }
      return v;
    }) || "";
  } catch {
    return "";
  }
}

/** Render one page as one request and report exactly what it touched, in order. */
async function render(file, jar, { headers = {}, searchParams = {}, params = {} } = {}) {
  const mod = await importFromRoot(file);
  await settle();
  browser(jar, headers);
  events = [];
  const run = ++runSeq;
  let element = null, redirect = null, error = null;
  await als.run(run, async () => {
    try {
      element = await mod.default({ searchParams: Promise.resolve(searchParams), params: Promise.resolve(params) });
    } catch (e) {
      const digest = String(e?.digest || "");
      if (digest.startsWith("NEXT_REDIRECT")) redirect = digest.split(";")[2] || "";
      else error = e;
    }
  });
  await settle();
  const mine = events.filter((e) => e.run === run);
  const idx = (kind) => mine.findIndex((e) => e.kind === kind);
  const reads = mine.filter((e) => e.kind === "READ");
  const writes = mine.filter((e) => e.kind === "WRITE");
  return {
    element, redirect, error, events: mine, writes,
    vals: new Set(reads.map((e) => e.v)),
    firstAuth: idx("AUTH"), firstCompany: idx("COMPANY"), firstRead: idx("READ"), firstWrite: idx("WRITE"),
    html: element ? serialise(element) : "",
  };
}
const quiet = (r) => r.vals.size === 0 && r.writes.length === 0;
const own = (co) => new Set(co === CO_A ? [CO_A, WS_A] : co === CO_B ? [CO_B, WS_B] : [SANDBOX, WS_SANDBOX]);
const onlyOwn = (r, co) => r.vals.has(co) && [...r.vals].every((v) => own(co).has(v));
const writesTo = (r, co) => r.writes.every((w) => w.target === co);
const toLogin = (r) => typeof r.redirect === "string" && r.redirect.startsWith("/login");
const brief = (r) => {
  const fixed = r.events.filter((e) => (e.kind === "READ" && (e.v === SANDBOX || e.v === CO_ENV)) || (e.kind === "WRITE" && (e.target === SANDBOX || e.target === CO_ENV))).map((e) => `${e.kind}:${e.table}`);
  return `redirect=${r.redirect ?? "-"} element=${Boolean(r.element)} tenants=[${[...r.vals].join(",")}] writes=${r.writes.map((w) => `${w.table}->${w.target}`).join(",") || "none"}${fixed.length ? ` FIXED: ${[...new Set(fixed)].join(",")}` : ""}${r.error ? ` error=${String(r.error.message).slice(0, 140)}` : ""}`;
};
const enc = (o) => encodeURIComponent(JSON.stringify(o));
const activeClient = (jar, ws, companyId, extra = {}) => ({ ...jar, vyron_cost_active_client: enc({ id: ws, workspaceId: ws, companyId, companyName: "QA", ...extra }) });

const jarA = await login("analyst@qa-a.test", "qa-pass-a");
const jarViewer = await login("viewer@qa-a.test", "qa-pass-viewer");
const jarLapsed = await login("lapsed@qa-a.test", "qa-pass-lapsed");
const jarB = await login("analyst@qa-b.test", "qa-pass-b");
const jarS = await login("demo@qa-sandbox.test", "qa-pass-sandbox");
check("synthetic members sign in through the real login route", [jarA, jarViewer, jarLapsed, jarB, jarS].every((j) => Boolean(j.vyron_workspace_user_session)));
check("the fixed sandbox company is read from source and no synthetic id coincides with it", Boolean(SANDBOX) && ![CO_A, CO_B, CO_ENV, WS_A, WS_B].includes(SANDBOX));
check("Handcrafted demo-bundle markers are available to detect demo data leaking", HANDCRAFTED_MARKERS.length > 0, JSON.stringify(HANDCRAFTED_MARKERS));

const FORGED_TOKEN = { vyron_workspace_user_session: `v1.${Buffer.from(JSON.stringify({ v: 1, k: "ws", sub: U_A, wid: WS_A, iat: 1, exp: 9999999999 })).toString("base64url")}.AAAA` };
const PLAIN_JSON = { vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_A, companyId: CO_A, role: "OWNER" }) };
/** Tenant A's own cookie, rewritten in the full active-client format to claim demo mode every way it can. */
const DEMO_CLAIM_A = activeClient(jarA, WS_A, CO_A, { tradingName: "QA", demoMode: true, status: "Demo", packageName: "Demo" });
const OVERRIDE_PARAMS = { companyId: CO_B, company_id: CO_B, tenantId: SANDBOX, tenant_id: CO_ENV, workspaceId: WS_B, workspace_id: WS_B, id: CO_B };
const OVERRIDE_HEADERS = { "x-company-id": CO_B, "x-tenant-id": SANDBOX, "x-workspace-id": WS_B, "x-vyron-company-id": CO_B };

const perPage = new Map();
const tally = (family, file, name, ok, detail) => {
  const key = `${family}|${file}`;
  if (!perPage.has(key)) perPage.set(key, { total: 0, failed: 0 });
  perPage.get(key).total += 1;
  if (!ok) perPage.get(key).failed += 1;
  check(`${file}: ${name}`, ok, detail);
};

for (const [family, file] of PAGES) {
  const t = (name, ok, detail = "") => tally(family, file, name, ok, detail);

  // 1, 2, 22 — anonymous
  reseed();
  const anon = await render(file, {});
  t("1. anonymous: redirected to sign-in, no page rendered", toLogin(anon) && !anon.element, brief(anon));
  t("1. anonymous: no tenant data read", anon.vals.size === 0, brief(anon));
  t("2. anonymous: no write", anon.writes.length === 0, brief(anon));
  t("22. the public (redirect) response carries no company id or finance data", !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(anon.redirect || "") && !/MARKER/.test(anon.redirect || ""), anon.redirect || "");

  // 3-6 — sessions that are not a verified member
  const fakes = [];
  for (const jar of [
    { vyron_workspace_user_session: "not-a-session" },
    FORGED_TOKEN,
    PLAIN_JSON,
    { vyron_auth_user_id: U_A },
    { vyron_auth_user_id: jarA.vyron_auth_user_id },
    activeClient({}, WS_A, CO_A),
  ]) fakes.push(await render(file, jar));
  t("3-6. malformed / forged / plain-JSON sessions, bare or genuine auth id, cookie hint alone: sign-in, nothing read or written", fakes.every((r) => toLogin(r) && quiet(r)), fakes.map(brief).join(" | "));

  // lapsed membership: validly signed, no longer Active
  reseed();
  db.tables.vyron_workspace_memberships.find((m) => m.user_id === U_A_LAPSED).status = "Suspended";
  const lapsed = await render(file, jarLapsed);
  t("a signed session whose membership is no longer Active: sign-in, nothing read or written", toLogin(lapsed) && quiet(lapsed), brief(lapsed));

  // 8 — authenticated, no permission
  reseed();
  const viewer = await render(file, jarViewer);
  t("8. member without reports.view: denied, nothing read or written, company never resolved", toLogin(viewer) && /access/i.test(decodeURIComponent(viewer.redirect || "")) && quiet(viewer) && viewer.firstCompany < 0, brief(viewer));

  // 7, 14-21 — tenant A
  reseed();
  const a = await render(file, jarA);
  t("7. member with reports.view: the page renders", Boolean(a.element) && !a.redirect && !a.error, brief(a));
  t("7. tenant A: only tenant A's data is read", onlyOwn(a, CO_A), brief(a));
  t("14. the fixed sandbox company and the env default tenant are never read or written", ![SANDBOX, CO_ENV].some((x) => a.vals.has(x)) && !a.writes.some((w) => [SANDBOX, CO_ENV].includes(w.target)), brief(a));
  t("15-17. AUTH -> COMPANY happen before any tenant read or write", a.firstAuth >= 0 && a.firstCompany > a.firstAuth && (a.firstRead < 0 || a.firstRead > a.firstCompany) && (a.firstWrite < 0 || a.firstWrite > a.firstCompany), `auth=${a.firstAuth} company=${a.firstCompany} read=${a.firstRead} write=${a.firstWrite}`);
  t("18. the page's snapshot / audit writes happen, and every one carries tenant A", a.writes.length > 0 && writesTo(a, CO_A), brief(a));
  t("19. audit / snapshot actors are server constants, never request values", a.writes.every((w) => w.actor === undefined || w.actor === "system"), JSON.stringify(a.writes.map((w) => w.actor)));
  t("20. tenant B's data is never read or shown", !a.vals.has(CO_B) && !a.html.includes("QA-B-MARKER"), brief(a));
  t("21. nothing is written to tenant B", !a.writes.some((w) => w.target === CO_B), brief(a));

  // 9-11 — company / tenant / workspace supplied by the caller
  reseed();
  const over = await render(file, jarA, { headers: OVERRIDE_HEADERS, searchParams: OVERRIDE_PARAMS, params: OVERRIDE_PARAMS });
  t("9-11. company, tenant and workspace ids in the query, route params or headers change nothing", Boolean(over.element) && onlyOwn(over, CO_A) && writesTo(over, CO_A) && !over.vals.has(CO_B) && !over.vals.has(SANDBOX), brief(over));

  // 12 — demo claim
  reseed();
  const demo = await render(file, DEMO_CLAIM_A);
  t("12. tenant A's cookie claiming demo mode: still tenant A only, no sandbox or Handcrafted demo data", Boolean(demo.element) && onlyOwn(demo, CO_A) && writesTo(demo, CO_A) && !demo.vals.has(SANDBOX) && !HANDCRAFTED_MARKERS.some((m) => demo.html.includes(m)), brief(demo));

  // 13 — active-client cookie
  reseed();
  const hinted = await render(file, activeClient(jarA, WS_A, CO_B));
  t("13. an active-client cookie naming another company: refused (sign-in), nothing read or written", toLogin(hinted) && quiet(hinted), brief(hinted));
  const otherCookie = await render(file, { ...jarA, vyron_cost_active_client: jarB.vyron_cost_active_client });
  t("13. tenant B's active-client cookie with tenant A's session: still tenant A only", Boolean(otherCookie.element) && onlyOwn(otherCookie, CO_A) && writesTo(otherCookie, CO_A), brief(otherCookie));

  // isolation the other way, and the explicit sandbox
  reseed();
  const b = await render(file, jarB);
  t("tenant B: only B read, only B written, A never shown", Boolean(b.element) && onlyOwn(b, CO_B) && b.writes.length > 0 && writesTo(b, CO_B) && !b.html.includes("QA-A-MARKER"), brief(b));
  reseed();
  const s = await render(file, jarS);
  t("a verified member of the sandbox workspace (explicit demo): the sandbox company only", Boolean(s.element) && onlyOwn(s, SANDBOX) && writesTo(s, SANDBOX), brief(s));

  // 23 + source — the gate is the page's first statement, and the page is not statically cached
  const src = source(file).replace(/\r\n/g, "\n");
  const body = src.slice(src.indexOf("export default async function"));
  const firstStatement = body.split("\n")[1] || "";
  t("source: the verified-session gate (reports.view) is the page's first statement", /^\s*const \{ companyId \} = await requireWorkspacePage\("reports\.view"\);$/.test(firstStatement), firstStatement);
  t("source: no fixed or default tenant, and every tenant call is given the verified company", !/VYRON_DEFAULT_TENANT_ID|48002864|resolveApiCompanyId|getWorkspaceCompanyId/.test(src) && /\(companyId\)|, companyId\)|\n\s*companyId\n/.test(body));
  t("23. not statically cached: no force-static / revalidate export; the gate reads the session cookie, so every response is rendered per request", !/export const (dynamic\s*=\s*["']force-static["']|revalidate\s*=)/.test(src));
}

/* --------------------------------------------- write-capable finance modules */

console.log("\nWrite-capable finance modules, called directly");
const aiFinancial = await importFromRoot("src/lib/vyron-ai-financial-intelligence.ts");
const finance = await importFromRoot("src/lib/vyron-finance-intelligence.ts");
const financeLayer = await importFromRoot("src/lib/vyron-finance-intelligence-layer.ts");
async function call(fn, jar) {
  await settle();
  browser(jar);
  events = [];
  const run = ++runSeq;
  let result, error = null;
  await als.run(run, async () => {
    try { result = await fn(); } catch (e) { error = e; }
  });
  await settle();
  const mine = events.filter((e) => e.run === run);
  const reads = mine.filter((e) => e.kind === "READ");
  return { result, error, events: mine, writes: mine.filter((e) => e.kind === "WRITE"), vals: new Set(reads.map((e) => e.v)), firstCompany: mine.findIndex((e) => e.kind === "COMPANY"), firstWrite: mine.findIndex((e) => e.kind === "WRITE"), firstRead: mine.findIndex((e) => e.kind === "READ") };
}
const refused = (r) => r.error && Number(r.error.status) === 401 && quiet(r);
for (const [name, fn] of [
  ["getAiFinancialIntelligence", (co) => aiFinancial.getAiFinancialIntelligence(co)],
  ["getFinanceLeakageCentre", (co) => finance.getFinanceLeakageCentre(co)],
  ["buildBoardPackData", (co) => finance.buildBoardPackData("Current month to date", co)],
  ["getVyronFinanceIntelligence", (co) => financeLayer.getVyronFinanceIntelligence(co)],
]) {
  reseed();
  const anon = await call(() => fn(), {});
  check(`${name}: anonymous is refused before anything is read or written (the old fixed-tenant default is gone)`, refused(anon), `${anon.error?.message} tenants=[${[...anon.vals]}] writes=${anon.writes.length}`);
  const cross = await call(() => fn(CO_B), jarA);
  const fixed = await call(() => fn(SANDBOX), jarA);
  const env = await call(() => fn(CO_ENV), jarA);
  check(`${name}: tenant A naming tenant B, the sandbox or the env default is refused before any read or write`, [cross, fixed, env].every(refused), [cross, fixed, env].map((r) => `${r.error?.message}/${r.vals.size}/${r.writes.length}`).join(" | "));
  reseed();
  const mine = await call(() => fn(CO_A), jarA);
  check(`${name}: tenant A's own company: runs, reads only A, writes only A, after the company is resolved`, !mine.error && onlyOwn(mine, CO_A) && mine.writes.length > 0 && writesTo(mine, CO_A) && mine.firstCompany >= 0 && mine.firstWrite > mine.firstCompany && mine.firstRead > mine.firstCompany, `${mine.error?.message || ""} tenants=[${[...mine.vals]}] writes=${mine.writes.map((w) => `${w.table}->${w.target}`)}`);
  const body = source(["getFinanceLeakageCentre", "buildBoardPackData"].includes(name) ? "src/lib/vyron-finance-intelligence.ts" : name === "getAiFinancialIntelligence" ? "src/lib/vyron-ai-financial-intelligence.ts" : "src/lib/vyron-finance-intelligence-layer.ts");
  const fnSrc = body.slice(body.indexOf(`export async function ${name}(`));
  const gate = fnSrc.indexOf("requireEngineTenant(");
  const firstData = Math.min(...["getSupabaseAdmin(", "Promise.all(", ".from("].map((m) => fnSrc.indexOf(m)).filter((i) => i >= 0));
  check(`${name}: source — the verified company is required before any data access, with no default`, gate > 0 && gate < firstData && !/=\s*VYRON_DEFAULT_TENANT_ID/.test(fnSrc.slice(0, gate)));
}

/* ------------------------------------------------------------------ report */

console.log("\nPer page");
for (const [key, { total, failed }] of perPage) {
  const [family, file] = key.split("|");
  console.log(`  ${failed ? "FAIL" : "ok  "}  ${family.padEnd(22)} ${file}  ${total - failed}/${total}`);
}
delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
