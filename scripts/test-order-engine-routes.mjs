#!/usr/bin/env node
/**
 * VYRON Order Engine — API route security and workflow regression.
 *
 * Drives the real /api/order-intake route handlers with the REAL session,
 * membership, permission and company-resolution code. Only the process
 * boundary is replaced (cookies, an in-memory database, synthetic passwords):
 * see scripts/support/session-security-test-hook.mjs. Two synthetic tenants.
 *
 * Proves: unauthenticated → 401; missing permission → 403 (viewer cannot
 * create, clerk cannot approve); the company comes from the verified session,
 * never the body; a conflicting company cookie is refused; another tenant's
 * order is 404; the audit actor is the session user even when the body names
 * another; cost/margin hidden from non-approvers; the full demo workflow
 * (create → validate → approve → Draft sales order) through the HTTP layer;
 * every write lands in the caller's own tenant.
 *
 * Family A: no network, no database, no credentials.
 *
 *   node scripts/test-order-engine-routes.mjs
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

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_APPROVER = uuid("a", 10), U_CLERK = uuid("a", 11), U_VIEWER = uuid("a", 12), U_B = uuid("b", 10);

const USERS = [
  { id: U_APPROVER, email: "approver@qa-a.test", password: "qa-pass-approver" },
  { id: U_CLERK, email: "clerk@qa-a.test", password: "qa-pass-clerk" },
  { id: U_VIEWER, email: "viewer@qa-a.test", password: "qa-pass-viewer" },
  { id: U_B, email: "approver@qa-b.test", password: "qa-pass-b" },
];

const seed = () => ({
  vyron_workspaces: [
    { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
  ],
  vyron_workspace_memberships: [
    // SALES holds sales_orders.approve by default.
    { id: "m1", workspace_id: WS_A, user_id: U_APPROVER, role: "SALES", status: "Active", permissions: {} },
    // A clerk who may create and edit but not approve.
    { id: "m2", workspace_id: WS_A, user_id: U_CLERK, role: "PROCUREMENT", status: "Active", permissions: { "sales_orders.view": true, "sales_orders.create": true, "sales_orders.edit": true } },
    { id: "m3", workspace_id: WS_A, user_id: U_VIEWER, role: "VIEW_ONLY", status: "Active", permissions: {} },
    { id: "m4", workspace_id: WS_B, user_id: U_B, role: "SALES", status: "Active", permissions: {} },
  ],
  vyron_customers: [
    { id: "c-a", company_id: CO_A, customer_name: "Demo Retailer", status: "Active", active: true },
    { id: "c-b", company_id: CO_B, customer_name: "Demo Retailer", status: "Active", active: true },
  ],
  vyron_cost_products: [
    { id: "p-a", company_id: CO_A, product_name: "Demo Pie", sku: "DEMO-1", selling_price: 20, total_cost: 11 },
    { id: "p-b", company_id: CO_B, product_name: "Other Pie", sku: "DEMO-1", selling_price: 90, total_cost: 1 },
  ],
  vyron_cost_stock_items: [{ id: "s-a", company_id: CO_A, entity_type: "finished_goods", entity_id: "p-a", qty_on_hand: 500 }],
  vyron_customer_sales_order_allocations: [],
  vyron_cost_boms: [],
  vyron_customer_price_list_assignments: [],
  vyron_customer_price_list_items: [],
  vyron_customer_price_lists: [],
  vyron_customer_price_list_versions: [],
  vyron_customer_branches: [],
  vyron_customer_invoices: [],
  vyron_customer_sales_orders: [],
  vyron_customer_sales_order_lines: [],
  vyron_customer_sales_order_audit: [],
  vyron_xero_sync_queue: [],
  vyron_order_intakes: [],
  vyron_order_intake_lines: [],
  vyron_order_intake_events: [],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase(seed());

// Record the tenant of every write to an Order Engine or sales-order table.
const writes = [];
const originalFrom = db.from.bind(db);
db.from = (table) => {
  const query = originalFrom(table);
  for (const method of ["insert", "update", "upsert"]) {
    const original = query[method].bind(query);
    query[method] = (payload, ...rest) => {
      for (const row of Array.isArray(payload) ? payload : [payload]) writes.push({ table, method, company: row?.company_id });
      return original(payload, ...rest);
    };
  }
  return query;
};

globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map(), headers: {} };
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const listRoute = await importFromRoot("src/app/api/order-intake/route.ts");
const itemRoute = await importFromRoot("src/app/api/order-intake/[id]/route.ts");
const lookupRoute = await importFromRoot("src/app/api/order-intake/lookup/route.ts");

async function login(email, password) {
  setCookieJar({});
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}

async function call(jar, handler, { method = "GET", url = "/api/order-intake", body, id, raw } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": "application/json" } };
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = id ? await handler(request, { params: Promise.resolve({ id }) }) : await handler(request);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const enc = (o) => encodeURIComponent(JSON.stringify(o));
const jarApprover = await login("approver@qa-a.test", "qa-pass-approver");
const jarClerk = await login("clerk@qa-a.test", "qa-pass-clerk");
const jarViewer = await login("viewer@qa-a.test", "qa-pass-viewer");
const jarB = await login("approver@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", [jarApprover, jarClerk, jarViewer, jarB].every((j) => Boolean(j.vyron_workspace_user_session)));

const ORDER = {
  kind: "manual",
  customerName: "Demo Retailer",
  customerPoNumber: "PO-DEMO-1",
  requestedDeliveryDate: "2099-01-15",
  idempotencyKey: "form-draft-1",
  lines: [{ sku: "DEMO-1", description: "Demo pie", quantity: 12, unitPrice: 20 }],
};

console.log("\nAuthentication");
{
  const anonymous = {};
  const r1 = await call(anonymous, listRoute.GET);
  const r2 = await call(anonymous, listRoute.POST, { method: "POST", body: ORDER });
  const r3 = await call(anonymous, itemRoute.GET, { id: "x" });
  const r4 = await call(anonymous, itemRoute.POST, { method: "POST", id: "x", body: { action: "approve" } });
  const r5 = await call(anonymous, itemRoute.PATCH, { method: "PATCH", id: "x", body: { notes: "x" } });
  const r6 = await call(anonymous, lookupRoute.GET, { url: "/api/order-intake/lookup?type=product&q=demo" });
  check("anonymous list/create/read/act/edit/lookup → 401", [r1, r2, r3, r4, r5, r6].every((r) => r.status === 401), [r1, r2, r3, r4, r5, r6].map((r) => r.status).join(","));
  check("anonymous requests wrote nothing", writes.length === 0);
  const forged = { vyron_workspace_user_session: enc({ workspaceId: WS_A, userId: U_APPROVER, companyId: CO_A, role: "OWNER" }) };
  check("a forged plain-JSON session cookie → 401", (await call(forged, listRoute.GET)).status === 401);
}

console.log("\nPermissions");
let intakeId = null;
{
  const viewerCreate = await call(jarViewer, listRoute.POST, { method: "POST", body: ORDER });
  check("viewer cannot create (403)", viewerCreate.status === 403);
  const viewerList = await call(jarViewer, listRoute.GET);
  check("viewer can list (200)", viewerList.status === 200 && Array.isArray(viewerList.json.rows));

  // The body tries to pick tenant B and a spoofed actor: both must be ignored.
  const created = await call(jarClerk, listRoute.POST, { method: "POST", body: { ...ORDER, companyId: CO_B, company_id: CO_B, actor: "someone-else", created_by: "someone-else" } });
  check("clerk creates an order (201)", created.status === 201 && created.json.intake.status === "RECEIVED", JSON.stringify(created.json).slice(0, 300));
  intakeId = created.json.intake.id;
  check("company comes from the session, not the body", created.json.intake.company_id === CO_A);
  check("created_by is the session user, not the body", created.json.intake.created_by === U_CLERK);
  const again = await call(jarClerk, listRoute.POST, { method: "POST", body: ORDER });
  check("double-submit with the same idempotency key → 200 duplicate", again.status === 200 && again.json.duplicate === true && again.json.intake.id === intakeId);

  const validated = await call(jarClerk, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "validate" } });
  check("clerk validates → awaiting approval", validated.status === 200 && validated.json.intake.status === "AWAITING_APPROVAL", JSON.stringify(validated.json).slice(0, 400));
  check("clerk (no approve permission) does not see cost or margin", validated.json.permissions.canSeeCost === false && validated.json.intake.validation.lines.every((l) => l.unitCost === null && l.lineGp === null) && validated.json.intake.validation.totals.expectedGp === null);
  const belowCost = await call(jarClerk, listRoute.POST, { method: "POST", body: { ...ORDER, customerPoNumber: "PO-BELOW-COST", idempotencyKey: "below-cost", lines: [{ sku: "DEMO-1", quantity: 1, unitPrice: 5 }] } });
  const belowCostValidated = await call(jarClerk, itemRoute.POST, { method: "POST", id: belowCost.json.intake.id, body: { action: "validate" } });
  const leak = JSON.stringify(belowCostValidated.json.intake.validation.issues);
  check("issue messages shown to a non-approver carry no cost figure", belowCostValidated.json.intake.validation.issues.some((i) => i.code === "NEGATIVE_MARGIN") && !/11(\.00)?\b/.test(leak), leak);
  check("clerk is offered no approve action", !validated.json.permissions.actions.includes("approve") && validated.json.permissions.actions.includes("cancel"));
  const clerkApprove = await call(jarClerk, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "approve", validationHash: validated.json.intake.validation_hash } });
  check("clerk cannot approve (403)", clerkApprove.status === 403);
  const viewerHold = await call(jarViewer, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "hold", reason: "x" } });
  check("viewer cannot hold (403)", viewerHold.status === 403);
  const viewerEdit = await call(jarViewer, itemRoute.PATCH, { method: "PATCH", id: intakeId, body: { notes: "x" } });
  check("viewer cannot edit (403)", viewerEdit.status === 403);
  const unknown = await call(jarApprover, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "delete_everything" } });
  check("unknown action → 400", unknown.status === 400);
}

console.log("\nTenant isolation");
{
  const read = await call(jarB, itemRoute.GET, { id: intakeId });
  check("tenant B cannot read tenant A's order (404)", read.status === 404);
  const act = await call(jarB, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "reject", reason: "x" } });
  check("tenant B cannot act on tenant A's order (404)", act.status === 404);
  const edit = await call(jarB, itemRoute.PATCH, { method: "PATCH", id: intakeId, body: { notes: "x" } });
  check("tenant B cannot edit tenant A's order (404)", edit.status === 404);
  const list = await call(jarB, listRoute.GET, { url: "/api/order-intake?view=all" });
  check("tenant B's list is empty", list.status === 200 && list.json.rows.length === 0);
  const lookup = await call(jarB, lookupRoute.GET, { url: "/api/order-intake/lookup?type=product&q=pie" });
  check("lookup is tenant scoped", lookup.status === 200 && lookup.json.results.every((r) => r.id === "p-b"));
  // A cookie naming another workspace is ignored: the member stays in their own company.
  const otherWs = { ...jarApprover, vyron_cost_active_client: enc({ id: WS_B, workspaceId: WS_B, companyId: CO_B, companyName: "QA" }) };
  const ignored = await call(otherWs, listRoute.GET, { url: "/api/order-intake?view=all" });
  check("a cookie naming another workspace cannot switch tenant", ignored.status === 200 && ignored.json.rows.every((r) => r.company_id === CO_A) && ignored.json.rows.length > 0);
  // A cookie naming the member's own workspace but another company is refused.
  const ownWsForeignCo = { ...jarApprover, vyron_cost_active_client: enc({ id: WS_A, workspaceId: WS_A, companyId: CO_B, companyName: "QA" }) };
  const refused = await call(ownWsForeignCo, listRoute.GET, { url: "/api/order-intake?view=all" });
  check("a cookie claiming another company for this workspace is refused (403)", refused.status === 403, `${refused.status}`);
}

console.log("\nApproval through HTTP (the demo workflow)");
{
  const detail = await call(jarApprover, itemRoute.GET, { id: intakeId });
  check("approver sees cost and margin", detail.json.permissions.canSeeCost === true && detail.json.intake.validation.totals.expectedGp === 108, JSON.stringify(detail.json.intake.validation.totals));
  check("approver is offered approve/hold/reject/request changes", ["approve", "hold", "reject", "request_changes"].every((a) => detail.json.permissions.actions.includes(a)));
  const stale = await call(jarApprover, itemRoute.POST, { method: "POST", id: intakeId, body: { action: "approve", validationHash: "not-what-i-saw" } });
  check("approval against a stale validation → 409", stale.status === 409 && stale.json.code === "CONFLICT");
  const approved = await call(jarApprover, itemRoute.POST, {
    method: "POST",
    id: intakeId,
    body: { action: "approve", validationHash: detail.json.intake.validation_hash, reason: "OK to ship", actor: "spoofed-actor", companyId: CO_B },
  });
  check("approve → CONFIRMED with a Draft sales order", approved.status === 200 && approved.json.intake.status === "CONFIRMED" && approved.json.salesOrder?.status === "Draft", JSON.stringify(approved.json).slice(0, 400));
  const events = approved.json.events;
  check("approval audited with the session user, not the body", events.find((e) => e.event_type === "APPROVED")?.actor === U_APPROVER && events.every((e) => e.actor !== "spoofed-actor"));
  check("derived statuses shown", approved.json.derived.fulfilmentStatus === "NOT_STARTED" && approved.json.derived.invoiceStatus === "NOT_INVOICED");
  check("nothing posted to Xero or invoiced", db.tables.vyron_xero_sync_queue.length === 0 && db.tables.vyron_customer_invoices.length === 0);
  check("sales order belongs to tenant A", db.tables.vyron_customer_sales_orders.every((o) => o.company_id === CO_A));
}

console.log("\nInput handling");
{
  const malformed = await call(jarClerk, listRoute.POST, { method: "POST", raw: "{not json" });
  check("malformed JSON → 400", malformed.status === 400);
  const noKind = await call(jarClerk, listRoute.POST, { method: "POST", body: { lines: [] } });
  check("missing kind → 400", noKind.status === 400);
  const noLines = await call(jarClerk, listRoute.POST, { method: "POST", body: { kind: "manual", customerName: "x", lines: [] } });
  check("no lines → 400", noLines.status === 400 && noLines.json.code === "INVALID_INPUT");
  const csv = await call(jarClerk, listRoute.POST, { method: "POST", body: { kind: "csv", fileName: "po.csv", text: "customer,sku,qty,price\nDemo Retailer,DEMO-1,3,20\n" } });
  check("CSV order → 201", csv.status === 201 && csv.json.intake.source === "csv");
  const csvAgain = await call(jarClerk, listRoute.POST, { method: "POST", body: { kind: "csv", fileName: "po-copy.csv", text: "customer,sku,qty,price\nDemo Retailer,DEMO-1,3,20\n" } });
  check("same CSV again → duplicate", csvAgain.status === 200 && csvAgain.json.duplicate === true);
  const badCsv = await call(jarClerk, listRoute.POST, { method: "POST", body: { kind: "csv", text: "sku\nX\n" } });
  check("unreadable CSV → 400 with the reason", badCsv.status === 400 && /quantity/.test(badCsv.json.error));
  const reasonless = await call(jarApprover, itemRoute.POST, { method: "POST", id: csv.json.intake.id, body: { action: "cancel" } });
  check("cancel without a reason → 400", reasonless.status === 400);
}

console.log("\nEvery write stayed in its own tenant");
{
  const offenders = writes.filter((w) => w.company !== undefined && w.company !== CO_A && w.company !== CO_B);
  check("no write without the caller's company", offenders.length === 0, JSON.stringify(offenders.slice(0, 3)));
  check("tenant A's requests wrote only to tenant A", writes.filter((w) => w.table.startsWith("vyron_order_intake") || w.table.startsWith("vyron_customer_sales_order")).every((w) => w.company === CO_A || w.company === undefined));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
