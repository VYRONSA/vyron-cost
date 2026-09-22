#!/usr/bin/env node
/**
 * VYRON Order Engine — permission matrix.
 *
 * Every Order Engine endpoint and lifecycle action, against every VYRON
 * workspace role (default permissions from the real catalogue) and an
 * anonymous caller, through the real route handlers, session, membership and
 * company resolution. Expected access is derived from the role's effective
 * permissions and the mapping in docs/order-engine/APPROVAL_MODEL.md, plus
 * fixed spot checks that do not depend on that derivation.
 *
 * Also: JSON-only mutations (415), body size limit (413), and tenant isolation
 * of the Exception Centre, mappings and policies.
 *
 *   node scripts/test-order-engine-permissions.mjs
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

const fixtures = await importFromRoot("src/lib/order-engine/demo/fixtures.ts");
const perms = await importFromRoot("src/lib/vyron-workspace-permissions.ts");
const { DEMO_COMPANY_ID: CO, DEMO_WORKSPACE_ID: WS, demoSeed } = fixtures;
const CO_B = "b0000000-0000-4000-8000-00000000000b";
const WS_B = "b0000000-0000-4000-8000-0000000000bb";

const ROLES = ["OWNER", "ADMIN", "SUPERVISOR", "MANAGER", "SALES", "PROCUREMENT", "PRODUCTION", "INVENTORY", "VIEW_ONLY", "USER"];
const uid = (i) => `u0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const USERS = ROLES.map((role, i) => ({ id: uid(i + 1), email: `${role.toLowerCase()}@qa.test`, password: `qa-pass-${role}`, role }));
USERS.push({ id: uid(99), email: "owner@qa-b.test", password: "qa-pass-b", role: "OWNER", workspace: WS_B });

const seed = demoSeed();
seed.vyron_workspaces.push({ id: WS_B, company_id: CO_B, company_name: "Other Co", default_vat_rate: 15 });
seed.vyron_workspaces.forEach((w) => Object.assign(w, { package_name: "Enterprise", status: "Setup" }));
seed.vyron_workspace_memberships = USERS.map((u, i) => ({ id: `m${i}`, workspace_id: u.workspace || WS, user_id: u.id, role: u.role, status: "Active", permissions: {} }));

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase(seed);
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map(), headers: {} };
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const R = {
  list: await importFromRoot("src/app/api/order-intake/route.ts"),
  item: await importFromRoot("src/app/api/order-intake/[id]/route.ts"),
  lookup: await importFromRoot("src/app/api/order-intake/lookup/route.ts"),
  exceptions: await importFromRoot("src/app/api/order-intake/exceptions/route.ts"),
  mappings: await importFromRoot("src/app/api/order-intake/mappings/route.ts"),
  policies: await importFromRoot("src/app/api/order-intake/policies/route.ts"),
  sources: await importFromRoot("src/app/api/order-intake/sources/route.ts"),
  settings: await importFromRoot("src/app/api/order-intake/settings/route.ts"),
};

async function login(email, password) {
  setCookieJar({});
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, { method = "GET", url = "/api/order-intake", body, id, raw, contentType = "application/json", headers = {} } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": contentType, ...headers } };
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = id ? await handler(request, { params: Promise.resolve({ id }) }) : await handler(request);
  return { status: res.status, json: await res.json().catch(() => null) };
}

const jars = {};
for (const u of USERS) jars[u.workspace ? "OTHER_OWNER" : u.role] = await login(u.email, u.password);
check("every role signs in through the real login route", Object.values(jars).every((j) => Boolean(j.vyron_workspace_user_session)));

// One order to act on; created by the owner.
const created = await call(jars.OWNER, R.list.POST, { method: "POST", body: { kind: "manual", customerName: "Bay Street Deli", customerPoNumber: "PERM-1", lines: [{ sku: "HK-PIE-BEEF", quantity: 1, unitPrice: 38 }] } });
const ORDER = created.json.intake.id;
check("fixture order created", created.status === 201);

const ENDPOINTS = [
  { name: "list orders", permission: "sales_orders.view", run: (jar) => call(jar, R.list.GET) },
  { name: "receive order", permission: "sales_orders.create", run: (jar) => call(jar, R.list.POST, { method: "POST", body: { kind: "manual", customerName: "Bay Street Deli", lines: [{ sku: "HK-SOUP-TOM", quantity: 1 }] } }) },
  { name: "read order", permission: "sales_orders.view", run: (jar) => call(jar, R.item.GET, { id: ORDER }) },
  { name: "edit order", permission: "sales_orders.edit", run: (jar) => call(jar, R.item.PATCH, { method: "PATCH", id: ORDER, body: { notes: "n" } }) },
  ...["validate", "approve", "confirm", "hold", "release", "request_changes", "reject", "cancel"].map((action) => ({
    name: `action ${action}`,
    permission: { validate: "sales_orders.create", cancel: "sales_orders.edit" }[action] || "sales_orders.approve",
    run: (jar) => call(jar, R.item.POST, { method: "POST", id: ORDER, body: { action, reason: "r", validationHash: "x" } }),
  })),
  { name: "exception centre", permission: "sales_orders.view", run: (jar) => call(jar, R.exceptions.GET) },
  { name: "list mappings", permission: "sales_orders.view", run: (jar) => call(jar, R.mappings.GET, { url: "/api/order-intake/mappings" }) },
  { name: "revoke mapping", permission: "sales_orders.approve", run: (jar) => call(jar, R.mappings.POST, { method: "POST", body: { action: "revoke", kind: "product_alias", id: "nope" } }) },
  { name: "list policies", permission: "sales_orders.view", run: (jar) => call(jar, R.policies.GET) },
  { name: "save policy", permission: "sales_orders.approve", run: (jar) => call(jar, R.policies.PUT, { method: "PUT", body: { customerId: null, requirePo: false } }) },
  { name: "read ordering settings", permission: "sales_orders.view", run: (jar) => call(jar, R.settings.GET) },
  { name: "save ordering settings", permission: "sales_orders.approve", run: (jar) => call(jar, R.settings.PUT, { method: "PUT", body: { duplicatePoAction: "warn" } }) },
  { name: "sources", permission: "sales_orders.view", run: (jar) => call(jar, R.sources.GET) },
  { name: "lookup", permission: "sales_orders.view", run: (jar) => call(jar, R.lookup.GET, { url: "/api/order-intake/lookup?type=product&q=pie" }) },
];

const effective = (role) => perms.resolveEffectivePermissions(role, {});
const allowed = (role, permission) => perms.sessionHasPermission({ role, permissions: effective(role) }, permission);

console.log("\nAnonymous");
for (const e of ENDPOINTS) {
  const r = await e.run({});
  check(`anonymous: ${e.name} → 401`, r.status === 401, String(r.status));
}

console.log("\nRole × endpoint");
const matrix = [];
for (const role of ROLES) {
  for (const e of ENDPOINTS) {
    const expected = allowed(role, e.permission);
    const r = await e.run(jars[role]);
    const denied = r.status === 403;
    matrix.push({ role, endpoint: e.name, expected, status: r.status });
    check(`${role}: ${e.name} ${expected ? "allowed" : "denied"}`, expected ? r.status !== 401 && r.status !== 403 : denied, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  }
}

console.log("\nFixed expectations (independent of the derivation)");
const cell = (role, endpoint) => matrix.find((m) => m.role === role && m.endpoint === endpoint);
check("OWNER can approve", cell("OWNER", "action approve").status !== 403);
check("VIEW_ONLY cannot receive, edit, approve or save policy", ["receive order", "edit order", "action approve", "save policy"].every((e) => cell("VIEW_ONLY", e).status === 403));
check("VIEW_ONLY can read the inbox and exceptions", ["list orders", "exception centre"].every((e) => cell("VIEW_ONLY", e).status === 200));
check("SALES can approve (existing RBAC: sales_orders.approve)", cell("SALES", "action approve").status !== 403);
check("PROCUREMENT and PRODUCTION cannot approve orders", cell("PROCUREMENT", "action approve").status === 403 && cell("PRODUCTION", "action approve").status === 403);
check("SUPERVISOR / MANAGER can approve but not receive (existing RBAC)", cell("SUPERVISOR", "action approve").status !== 403 && cell("SUPERVISOR", "receive order").status === 403 && cell("MANAGER", "action approve").status !== 403);

console.log("\nRequest hygiene");
{
  const form = await call(jars.OWNER, R.list.POST, { method: "POST", raw: "kind=manual", contentType: "application/x-www-form-urlencoded" });
  check("a form-encoded POST (cross-site form shape) → 415", form.status === 415);
  const textPlain = await call(jars.OWNER, R.item.POST, { method: "POST", id: ORDER, raw: JSON.stringify({ action: "cancel", reason: "x" }), contentType: "text/plain" });
  check("a text/plain JSON body → 415", textPlain.status === 415);
  const huge = await call(jars.OWNER, R.list.POST, { method: "POST", raw: JSON.stringify({ kind: "csv", text: "x".repeat(3_200_000) }) });
  check("a body over 3 MB → 413", huge.status === 413);
  const array = await call(jars.OWNER, R.list.POST, { method: "POST", raw: "[1,2]" });
  check("a JSON array body → 400", array.status === 400);
}

console.log("\nTenant isolation of the new endpoints");
{
  db.tables.vyron_order_product_aliases.push({ id: "alias-a", company_id: CO, customer_id: fixtures.DEMO_CUSTOMERS.bayStreet.id, source_code: "X", source_code_normalized: "sku:X", product_id: fixtures.DEMO_PRODUCTS.beefPie.id, created_by: "u", created_at: "2026-09-01T00:00:00Z", revoked_at: null });
  const mappingsB = await call(jars.OTHER_OWNER, R.mappings.GET, { url: "/api/order-intake/mappings" });
  check("another tenant's owner sees none of tenant A's mappings", mappingsB.status === 200 && mappingsB.json.mappings.length === 0);
  const revokeB = await call(jars.OTHER_OWNER, R.mappings.POST, { method: "POST", body: { action: "revoke", kind: "product_alias", id: "alias-a" } });
  check("…and cannot revoke one (404)", revokeB.status === 404 && !db.tables.vyron_order_product_aliases[0].revoked_at);
  const policyB = await call(jars.OTHER_OWNER, R.policies.PUT, { method: "PUT", body: { customerId: fixtures.DEMO_CUSTOMERS.bayStreet.id, requirePo: true } });
  check("…cannot set a policy for tenant A's customer (400)", policyB.status === 400);
  const settingsB = await call(jars.OTHER_OWNER, R.settings.PUT, { method: "PUT", body: { b2cCustomerId: fixtures.DEMO_CUSTOMERS.bayStreet.id } });
  check("…cannot choose tenant A's customer as its B2C account (400)", settingsB.status === 400);
  const ownB = await call(jars.OTHER_OWNER, R.settings.PUT, { method: "PUT", body: { duplicatePoAction: "block" } });
  const readA = await call(jars.OWNER, R.settings.GET);
  check("…and its own settings never apply to tenant A", ownB.status === 200 && readA.status === 200 && readA.json.settings.duplicatePoAction !== "block");
  const excB = await call(jars.OTHER_OWNER, R.exceptions.GET);
  check("…and sees none of tenant A's exceptions", excB.status === 200 && excB.json.open.length === 0);
  const readB = await call(jars.OTHER_OWNER, R.item.GET, { id: ORDER });
  check("…and cannot read tenant A's order (404)", readB.status === 404);
}

console.log(`\n${checks - failures}/${checks} checks passed (${ROLES.length} roles × ${ENDPOINTS.length} endpoints + anonymous)`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
