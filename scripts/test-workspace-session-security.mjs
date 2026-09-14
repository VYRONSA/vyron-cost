#!/usr/bin/env node
/**
 * VYRON — workspace session security regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * The workspace session cookie was plain JSON — { workspaceId, userId, role,
 * companyId } — not signed and not httpOnly. The server took the user and the
 * workspace straight from it and only then asked the database what that user
 * could do. Anyone who knew a member's user id and workspace id could write
 * the cookie and be that member. The auth cookie was worse: it held the bare
 * auth user id, and /api/workspace/restore-session turned it into a full
 * session for whoever it named.
 *
 * WHAT THIS PROVES
 * ----------------
 * The session, access and workspace modules and the routes run unmodified
 * against synthetic tenants. Only cookies(), the database and the password
 * check are substituted (scripts/support/session-security-test-hook.mjs).
 *
 *   Authentication   valid / missing / malformed / tampered / expired / revoked
 *   Identity         forged user, forged workspace, forged company, forged role,
 *                    cookie contents never override the server's identity
 *   Authorisation    permissions still decide; tenants stay apart
 *   Regression       login, BOMs, item lookup, invoices, sales orders,
 *                    read-only reporting, logout, expiry
 *   Cookie           HttpOnly, Secure in production, SameSite=Lax, Path=/, Max-Age
 *   Property         no source file reads identity from an unsigned cookie
 *
 * Family A: no database (in-memory stand-in with disposable QA tenants), no
 * network, no credentials, no writes outside this process. The signing key is
 * a random value generated for this process only.
 *
 *   npm run test:session-security
 */

import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

// A throwaway key for this process. Never a real credential.
process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
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

const uuid = (tenant, n) => `${tenant}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1), CO_C = uuid("c", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2), WS_C = uuid("c", 2);
const U_INVOICER = uuid("a", 10), U_NO_INVOICE = uuid("a", 11), U_BOM = uuid("a", 12);
const U_B = uuid("b", 10), U_C = uuid("c", 10), U_MULTI = uuid("d", 10);

const USERS = [
  { id: U_INVOICER, email: "invoicer@qa-a.test", password: "qa-pass-invoicer" },
  { id: U_NO_INVOICE, email: "viewer@qa-a.test", password: "qa-pass-viewer" },
  { id: U_BOM, email: "boms@qa-a.test", password: "qa-pass-boms" },
  { id: U_B, email: "member@qa-b.test", password: "qa-pass-b" },
  { id: U_C, email: "member@qa-c.test", password: "qa-pass-c" },
  { id: U_MULTI, email: "multi@qa-ab.test", password: "qa-pass-multi" },
];

const INVOICER = { "products.view": true, "invoices.view": true, "invoices.create": true, "sales_orders.view": true, "reports.view": true, "dashboard.view": true };
const VIEWER = { "products.view": true, "invoices.view": true, "invoices.create": false, "dashboard.view": true };
const BOMS = { "boms.view": true, "boms.create": true, "boms.edit": true, "products.view": true, "dashboard.view": true };
const TENANT = { "products.view": true, "invoices.view": true, "invoices.create": true, "boms.view": true, "dashboard.view": true };

const product = (id, companyId, name) => ({ id, company_id: companyId, product_name: name, category: "QA", product_category: "QA", product_status: "Active", linked_bom_id: null, selling_price: 10, total_cost: 4 });

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Professional", status: "Setup", default_vat_rate: 15 },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
      { id: WS_C, company_id: CO_C, company_name: "QA Tenant C", package_name: "Professional", status: "Setup", default_vat_rate: 15 },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_INVOICER, role: "PROCUREMENT", status: "Active", permissions: INVOICER },
      { id: "m2", workspace_id: WS_A, user_id: U_NO_INVOICE, role: "PROCUREMENT", status: "Active", permissions: VIEWER },
      { id: "m3", workspace_id: WS_A, user_id: U_BOM, role: "PROCUREMENT", status: "Active", permissions: BOMS },
      { id: "m4", workspace_id: WS_B, user_id: U_B, role: "PROCUREMENT", status: "Active", permissions: TENANT },
      { id: "m5", workspace_id: WS_C, user_id: U_C, role: "PROCUREMENT", status: "Active", permissions: TENANT },
      // One person, two workspaces. The first Active membership is the one they sign in to.
      { id: "m6", workspace_id: WS_A, user_id: U_MULTI, role: "PROCUREMENT", status: "Active", permissions: VIEWER },
      { id: "m7", workspace_id: WS_B, user_id: U_MULTI, role: "PROCUREMENT", status: "Active", permissions: TENANT },
    ],
    vyron_contacts: [],
    vyron_customers: [],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
    vyron_customer_sales_orders: [],
    vyron_cost_ingredients: [],
    vyron_cost_boms: [],
    vyron_cost_bom_lines: [],
    vyron_cost_stock_items: [],
    vyron_cost_products: [
      product(uuid("a", 100), CO_A, "QA Tenant A Pie"),
      product(uuid("b", 100), CO_B, "QA Tenant B Loaf"),
      product(uuid("c", 100), CO_C, "QA Tenant C Tart"),
    ],
  };
}

/* ------------------------------------------------------------ route calls */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const logoutRoute = await importFromRoot("src/app/api/workspace/logout/route.ts");
const restoreRoute = await importFromRoot("src/app/api/workspace/restore-session/route.ts");
const statusRoute = await importFromRoot("src/app/api/workspace/status/route.ts");
const lookupRoute = await importFromRoot("src/app/api/item-lookup/search/route.ts");
const invoicesRoute = await importFromRoot("src/app/api/customer-invoices/route.ts");
const recipesRoute = await importFromRoot("src/app/api/recipes/route.ts");
const salesOrdersRoute = await importFromRoot("src/app/api/customer-sales-orders/route.ts");
const cookiesModule = await importFromRoot("src/lib/vyron-workspace-cookies.ts");
let tokenModule = null;
try {
  tokenModule = await importFromRoot("src/lib/vyron-workspace-session-token.ts");
} catch {
  tokenModule = null;
}

const SESSION = "vyron_workspace_user_session";
const ACTIVE = "vyron_cost_active_client";
const AUTH = "vyron_auth_user_id";

let db;
function reset() {
  db = createFakeSupabase(seed());
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db, users: USERS, cookies: new Map() };
}
function browser(cookies) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(cookies || {}));
}
async function call(handler, url, init) {
  const response = await handler(new NextRequest(new URL(url, "http://qa.local"), init));
  let body = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  return { status: response.status, body, response };
}
const json = (method, body) => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

/** Sign in the way the login page does, and keep what the browser would keep. */
async function login(email, password) {
  const res = await call(loginRoute.POST, "/api/workspace/login", json("POST", { email, password }));
  const jar = {};
  for (const c of res.response.cookies.getAll()) if (c.value) jar[c.name] = c.value;
  return { ...res, jar, setCookie: res.response.headers.getSetCookie() };
}
const lookup = (q = "") => call(lookupRoute.GET, `/api/item-lookup/search?type=all&status=all&limit=200${q}`);
const names = (res) => (res.body?.items || []).map((i) => i.productName);
const legacyJson = (payload) => encodeURIComponent(JSON.stringify(payload));

/* ================================================================ run */

reset();

console.log("\nLogin issues a session");
const inv = await login("invoicer@qa-a.test", "qa-pass-invoicer");
check("password login succeeds", inv.status === 200 && inv.body?.ok === true, JSON.stringify(inv.body).slice(0, 160));
check("login sets the session cookie", Boolean(inv.jar[SESSION]));
check("login sets the auth cookie", Boolean(inv.jar[AUTH]));
const badPass = await login("invoicer@qa-a.test", "wrong");
check("a wrong password is refused", badPass.status === 401 && !badPass.jar[SESSION]);

console.log("\n1-6. Authentication");
browser(inv.jar);
const valid = await lookup();
check("1. a valid session is accepted", valid.status === 200 && names(valid).includes("QA Tenant A Pie"), `${valid.status}`);
browser({});
check("2. no session -> 401", (await lookup()).status === 401);
browser({ [SESSION]: "not-a-session" });
check("3. malformed session -> 401", (await lookup()).status === 401);
browser({ [SESSION]: "%7B%22broken" });
check("3. malformed JSON-looking session -> 401", (await lookup()).status === 401);

const token = inv.jar[SESSION] || "";
const parts = token.split(".");
const flip = (s) => (s ? s.slice(0, -1) + (s.endsWith("A") ? "B" : "A") : s);
browser({ ...inv.jar, [SESSION]: parts.length === 3 ? `${parts[0]}.${parts[1]}.${flip(parts[2])}` : `${token}x` });
check("4. tampered signature -> 401", (await lookup()).status === 401);
const forgedPayload = parts.length === 3
  ? Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], "base64url").toString()), sub: U_B, wid: WS_B })).toString("base64url")
  : "";
browser({ ...inv.jar, [SESSION]: parts.length === 3 ? `${parts[0]}.${forgedPayload}.${parts[2]}` : legacyJson({ workspaceId: WS_B, userId: U_B, role: "OWNER" }) });
check("4. tampered claims with the original signature -> 401", (await lookup()).status === 401);

if (tokenModule?.signWorkspaceToken) {
  const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 3600;
  const expired = tokenModule.signWorkspaceToken({ kind: "ws", userId: U_INVOICER, workspaceId: WS_A }, { issuedAt: eightDaysAgo });
  browser({ ...inv.jar, [SESSION]: expired });
  check("5. expired session -> 401", (await lookup()).status === 401);
  const tooLong = tokenModule.signWorkspaceToken({ kind: "ws", userId: U_INVOICER, workspaceId: WS_A }, { ttlSeconds: 365 * 24 * 3600 });
  browser({ ...inv.jar, [SESSION]: tooLong });
  check("5. a token claiming a longer life than sessions have -> 401", (await lookup()).status === 401);
  const authKind = tokenModule.signWorkspaceToken({ kind: "au", userId: U_INVOICER });
  browser({ [SESSION]: authKind });
  check("4. an auth-cookie token cannot be used as a session", (await lookup()).status === 401);
} else {
  check("5. expired session -> 401 (no signed tokens exist in this build)", false);
  check("5. a token claiming a longer life than sessions have -> 401", false);
  check("4. an auth-cookie token cannot be used as a session", false);
}

browser(inv.jar);
db.tables.vyron_workspace_memberships.find((m) => m.id === "m1").status = "Disabled";
check("6. disabled membership -> 401 immediately", (await lookup()).status === 401);
db.tables.vyron_workspace_memberships.find((m) => m.id === "m1").status = "Active";
check("6. re-enabled membership -> accepted again", (await lookup()).status === 200);
const removed = db.tables.vyron_workspace_memberships.splice(db.tables.vyron_workspace_memberships.findIndex((m) => m.id === "m1"), 1)[0];
check("6. deleted membership -> 401", (await lookup()).status === 401);
db.tables.vyron_workspace_memberships.push(removed);

console.log("\n7-11. Identity integrity: knowing the ids is not enough");
browser({ [SESSION]: legacyJson({ workspaceId: WS_A, userId: U_INVOICER, companyId: CO_A, role: "PROCUREMENT" }) });
const forged = await lookup();
check("7. a hand-written session naming a real member is refused", forged.status === 401, `${forged.status} ${names(forged).join(",")}`);
browser({ [SESSION]: legacyJson({ workspaceId: WS_A, userId: U_INVOICER, companyId: CO_A, role: "PROCUREMENT" }), [ACTIVE]: legacyJson({ id: WS_A, workspaceId: WS_A, companyId: CO_A, companyName: "QA Tenant A" }) });
check("7. ...even with a matching active-client cookie", (await lookup()).status === 401);
browser({ [SESSION]: legacyJson({ userId: U_INVOICER, email: "invoicer@qa-a.test", firstName: "QA", surname: "Member", workspaceId: WS_A, companyId: CO_A, role: "OWNER", permissions: {} }) });
check("10. a hand-written full-shape OWNER session is refused", (await lookup()).status === 401);
browser({ [AUTH]: U_INVOICER });
const restoreForged = await call(restoreRoute.POST, "/api/workspace/restore-session", { method: "POST" });
check("7. a bare auth user id cannot restore that user's session", restoreForged.status === 401 && !restoreForged.response.cookies.get(SESSION)?.value, `${restoreForged.status}`);
browser({ [AUTH]: legacyJson({ sub: U_INVOICER }) });
check("7. a hand-written auth cookie cannot restore a session", (await call(restoreRoute.POST, "/api/workspace/restore-session", { method: "POST" })).status === 401);

const bTokenSession = (await login("member@qa-b.test", "qa-pass-b")).jar;
browser({ ...inv.jar, [ACTIVE]: bTokenSession[ACTIVE] });
const crossHint = await lookup();
check("8. a member of A presenting B's active-client cookie never sees B", !names(crossHint).includes("QA Tenant B Loaf"), names(crossHint).join(","));
check("8. ...and still sees only A (or nothing), never a mix", names(crossHint).every((n) => n === "QA Tenant A Pie"));
browser({ ...inv.jar, [ACTIVE]: legacyJson({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA Tenant A" }) });
const companyHint = await lookup();
check("9. an active-client cookie naming B's company cannot select B", !names(companyHint).includes("QA Tenant B Loaf"), `${companyHint.status} ${names(companyHint).join(",")}`);
browser({ [SESSION]: bTokenSession[SESSION], [ACTIVE]: inv.jar[ACTIVE] });
check("8. B's session with A's active-client cookie still sees only B", names(await lookup()).every((n) => n === "QA Tenant B Loaf"));

const viewer = await login("viewer@qa-a.test", "qa-pass-viewer");
browser(viewer.jar);
const status = await call(statusRoute.GET, "/api/workspace/status");
check("11. the server reports the role from the membership", status.body?.sessionRole === "PROCUREMENT", status.body?.sessionRole);
check("11. and the permissions from the membership", status.body?.sessionPermissions?.["invoices.create"] !== true);

console.log("\n12-16. Authorisation still decides, tenants stay apart");
const invoiceBody = { customerName: "QA Customer", lines: [{ productId: uuid("a", 100), productName: "QA Tenant A Pie", quantity: 1, sellingPrice: 10, costPerUnit: 4 }] };
browser(inv.jar);
const invoiced = await call(invoicesRoute.POST, "/api/customer-invoices", json("POST", invoiceBody));
check("12. a member with invoices.create can invoice", invoiced.status === 200 && invoiced.body?.ok === true, JSON.stringify(invoiced.body).slice(0, 200));
browser(viewer.jar);
const refused = await call(invoicesRoute.POST, "/api/customer-invoices", json("POST", invoiceBody));
check("13. a member without invoices.create cannot", refused.status === 403, `${refused.status}`);
browser({ ...viewer.jar, [ACTIVE]: legacyJson({ id: WS_A, workspaceId: WS_A, companyId: CO_A, companyName: "QA Tenant A", role: "OWNER" }) });
check("10. a cookie claiming OWNER does not grant invoicing", (await call(invoicesRoute.POST, "/api/customer-invoices", json("POST", invoiceBody))).status === 403);
browser(bTokenSession);
const bLookup = await lookup();
check("14. tenant B cannot see tenant A's items", !names(bLookup).includes("QA Tenant A Pie"));
check("15. tenant B keeps its own access", names(bLookup).includes("QA Tenant B Loaf"));
check("14. searching A's item name from B finds nothing", (await lookup("&q=Tenant%20A")).body?.items?.length === 0);
const cJar = (await login("member@qa-c.test", "qa-pass-c")).jar;
browser(cJar);
const cLookup = await lookup();
check("16. tenant C keeps its own access", names(cLookup).includes("QA Tenant C Tart") && names(cLookup).length === 1, names(cLookup).join(","));

console.log("\n9 (multi-membership). A member of two workspaces gets only the one signed in to");
const multi = await login("multi@qa-ab.test", "qa-pass-multi");
browser(multi.jar);
const mA = await lookup();
check("signed in to A: sees A", names(mA).includes("QA Tenant A Pie") && !names(mA).includes("QA Tenant B Loaf"), names(mA).join(","));
browser({ ...multi.jar, [ACTIVE]: bTokenSession[ACTIVE] });
check("cannot switch to B by presenting B's active-client cookie", !names(await lookup()).includes("QA Tenant B Loaf"));
browser({ [SESSION]: legacyJson({ workspaceId: WS_B, userId: U_MULTI, role: "PROCUREMENT" }) });
check("cannot switch to B with a hand-written session, though a real member there", (await lookup()).status === 401);
browser(multi.jar);
check("A permissions apply in A (no invoicing), not B's", (await call(invoicesRoute.POST, "/api/customer-invoices", json("POST", invoiceBody))).status === 403);

console.log("\n17-24. Regression");
const bom = await login("boms@qa-a.test", "qa-pass-boms");
browser(bom.jar);
const savedBom = await call(recipesRoute.POST, "/api/recipes", json("POST", { recipe_name: "QA Session Bake", bom_purpose: "Finished Good", status: "Approved", yield_qty: 1, selling_price: 12, product_id: null, lines: [] }));
check("17. BOM create works", savedBom.status === 200 && savedBom.body?.ok === true, JSON.stringify(savedBom.body).slice(0, 200));
check("17. BOM list works", (await call(recipesRoute.GET, "/api/recipes")).body?.recipes?.some((r) => r.recipe_name === "QA Session Bake"));
browser(inv.jar);
check("18. item lookup works and finds the new finished good", names(await lookup()).includes("QA Session Bake"));
check("19. invoice list works", (await call(invoicesRoute.GET, "/api/customer-invoices")).status === 200);
const so = await call(salesOrdersRoute.GET, "/api/customer-sales-orders");
check("20. sales order list works", so.status === 200, `${so.status} ${JSON.stringify(so.body).slice(0, 160)}`);
check("21. read-only workspace status reports the tenant", (await call(statusRoute.GET, "/api/workspace/status")).body?.companyId === CO_A);
const out = await call(logoutRoute.POST, "/api/workspace/logout", { method: "POST" });
const cleared = out.response.headers.getSetCookie();
check("22. logout expires the session cookie", cleared.some((c) => c.startsWith(`${SESSION}=;`) && /Max-Age=0/i.test(c)), cleared.join(" | "));
check("22. logout expires the auth cookie", cleared.some((c) => c.startsWith(`${AUTH}=;`) && /Max-Age=0/i.test(c)));
browser({});
check("22. after logout the browser has no session: 401", (await lookup()).status === 401);
const again = await login("invoicer@qa-a.test", "qa-pass-invoicer");
check("23. login works again", again.status === 200 && Boolean(again.jar[SESSION]));
browser({ [AUTH]: again.jar[AUTH] });
const restored = await call(restoreRoute.POST, "/api/workspace/restore-session", { method: "POST" });
check("23. a genuine auth cookie restores the member's own session", restored.status === 200 && restored.body?.workspaceId === WS_A, `${restored.status}`);
if (tokenModule?.signWorkspaceToken) {
  const expiredAuth = tokenModule.signWorkspaceToken({ kind: "au", userId: U_INVOICER }, { issuedAt: Math.floor(Date.now() / 1000) - 8 * 24 * 3600 });
  browser({ [AUTH]: expiredAuth });
  check("24. an expired auth cookie cannot restore a session", (await call(restoreRoute.POST, "/api/workspace/restore-session", { method: "POST" })).status === 401);
} else {
  check("24. an expired auth cookie cannot restore a session (no signed tokens in this build)", false);
}

console.log("\nImpersonation (platform Login As / repair) is carried in the signed session");
if (tokenModule?.verifyWorkspaceToken) {
  const { NextResponse } = await import("next/server");
  const impersonation = NextResponse.json({ ok: true });
  cookiesModule.setWorkspaceAuthCookiesOnResponse(
    impersonation,
    { id: WS_A, companyId: CO_A, companyName: "QA Tenant A", tradingName: "QA Tenant A", packageName: "Professional", status: "Active", impersonating: true },
    { userId: U_INVOICER, email: "", firstName: "", surname: "", role: "OWNER", permissions: {} }
  );
  const impJar = Object.fromEntries(impersonation.cookies.getAll().map((c) => [c.name, c.value]));
  const claims = tokenModule.verifyWorkspaceToken(impJar[SESSION], "ws");
  check("the session records it was issued by impersonation", claims?.imp === true && claims?.sub === U_INVOICER && claims?.wid === WS_A);
  check("the session carries no role (the membership decides)", claims && !("role" in claims) && !("permissions" in claims));
  browser(impJar);
  check("the status report shows impersonation from the signed session", (await call(statusRoute.GET, "/api/workspace/status")).body?.impersonating === true);
} else {
  check("the session records it was issued by impersonation (no signed tokens in this build)", false);
}

console.log("\nCookie attributes");
const attrs = (name, list) => (list.find((c) => c.startsWith(`${name}=`)) || "");
for (const name of [SESSION, AUTH, ACTIVE]) {
  const c = attrs(name, again.setCookie);
  check(`${name}: HttpOnly`, /;\s*HttpOnly/i.test(c), c.slice(0, 180));
  check(`${name}: SameSite=Lax`, /;\s*SameSite=Lax/i.test(c));
  check(`${name}: Path=/`, /;\s*Path=\//i.test(c));
  check(`${name}: Max-Age 7 days`, /;\s*Max-Age=604800/i.test(c));
}
const previousEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const prodLogin = await login("invoicer@qa-a.test", "qa-pass-invoicer");
process.env.NODE_ENV = previousEnv;
for (const name of [SESSION, AUTH, ACTIVE]) check(`${name}: Secure in production`, /;\s*Secure/i.test(attrs(name, prodLogin.setCookie)), attrs(name, prodLogin.setCookie).slice(0, 180));
check("the session cookie holds no readable identity", !String(again.jar[SESSION] || "").includes(U_INVOICER) && !decodeURIComponent(String(again.jar[SESSION] || "")).includes('"userId"'));
check("the auth cookie is not the bare user id", again.jar[AUTH] && again.jar[AUTH] !== U_INVOICER);

console.log("\n25. No server code reads identity from an unsigned cookie");
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const sources = walk(path.join(ROOT, "src")).map((f) => ({ f: path.relative(ROOT, f), s: readFileSync(f, "utf8") }));
const readsSessionCookie = sources.filter(({ s }) => /\.get\(\s*WORKSPACE_SESSION_KEY\s*\)|\.get\(\s*["']vyron_workspace_user_session["']\s*\)/.test(s));
check("exactly one place reads the session cookie", readsSessionCookie.length === 1, readsSessionCookie.map((x) => x.f).join(", "));
check("...and it only verifies a signed token", readsSessionCookie.every(({ s }) => /verifyWorkspaceToken\([^)]*WORKSPACE_SESSION_KEY/.test(s.replace(/\s+/g, " "))));
const readsAuthCookie = sources.filter(({ s }) => /\.get\(\s*VYRON_AUTH_USER_COOKIE\s*\)|\.get\(\s*["']vyron_auth_user_id["']\s*\)/.test(s));
check("the auth cookie is read in one place, through verification", readsAuthCookie.length === 1 && /verifyWorkspaceToken\(/.test(readsAuthCookie[0].s), readsAuthCookie.map((x) => x.f).join(", "));
check("nothing expands a session from cookie JSON any more", !sources.some(({ s }) => /expandWorkspaceSessionFromCookie/.test(s)));
check("nothing parses the session cookie as JSON", !sources.some(({ s }) => /parseCookieJsonValue[^;]*WORKSPACE_SESSION_KEY/.test(s.replace(/\s+/g, " "))));

delete globalThis.__VYRON_SESSION_TEST__;
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
