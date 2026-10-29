#!/usr/bin/env node
/**
 * VOLORA — a purchase order cannot be saved into approval, and production runs,
 * inventory postings and Xero actions record the signed-in member.
 *
 * DEFECTS THIS LOCKS DOWN (2026-10-29)
 * ------------------------------------
 * 1. savePurchaseOrder took its status from the request. A member with only
 *    purchase_orders.create (POST) or .edit (PUT) could save an order straight
 *    to Approved, Sent or Closed without purchase_orders.approve, and re-saving
 *    replaced the lines of approved and received orders. (Isolated from
 *    unreleased 4d53980; its transition table, item lookup and pricing are not
 *    part of this change.)
 * 2. Production run create/approve/start/cancel, inventory transactions, every
 *    Xero action and invoice approval recorded the `actor` / `created_by` /
 *    `approvedBy` the browser sent. Xero's sync-queue "fail" action also had no
 *    permission check.
 *
 * Drives the REAL route handlers with the real session, tenant and permission
 * code against an in-memory database. Family A: no network, no database, no
 * credentials, no real tenant data.
 *
 *   npm run test:po-save-and-actor-identity
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";
process.env.XERO_CLIENT_ID = "qa-xero-client";
process.env.XERO_CLIENT_SECRET = "qa-xero-secret";
process.env.XERO_REDIRECT_URI = "http://qa.local/api/integrations/xero/callback";

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
const section = (title) => console.log(`\n${title}`);

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10), U_BUYER = uuid("a", 11), U_VIEW = uuid("a", 12), U_PROD = uuid("a", 13), U_INV = uuid("a", 14);
const U_B_OWNER = uuid("b", 10);
const SPOOF = "Someone Else (spoofed)";

const MEMBERS = [
  [U_OWNER, "owner@qa-a.test", WS_A, "OWNER", "Synthetic", "Owner"],
  [U_BUYER, "buyer@qa-a.test", WS_A, "PROCUREMENT", "Synthetic", "Buyer"],
  [U_VIEW, "view@qa-a.test", WS_A, "VIEW_ONLY", "Synthetic", "Viewer"],
  [U_PROD, "prod@qa-a.test", WS_A, "PRODUCTION", "Synthetic", "Operator"],
  [U_INV, "inv@qa-a.test", WS_A, "INVENTORY", "Synthetic", "Storeman"],
  [U_B_OWNER, "owner@qa-b.test", WS_B, "OWNER", "Tenant B", "Owner"],
];
const USERS = MEMBERS.map(([id, email]) => ({ id, email, password: `qa-pass-${id.slice(-4)}` }));

const po = (id, company, number, status, extra = {}) => ({
  id, company_id: company, po_number: number, supplier_id: null, supplier_name_snapshot: "QA Supplier", status,
  order_date: "2026-10-20", subtotal: 1000, vat_amount: 0, total: 1000, expected_total: 1000, outstanding_amount: 1000,
  notes: null, created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-20T08:00:00Z", ...extra,
});
const poLine = (id, poId, company, extra = {}) => ({
  id, purchase_order_id: poId, company_id: company, item_type: "non_stock", item_name: "Flour 25kg", quantity: 10, ordered_qty: 10,
  unit: "bag", unit_price: 100, vat_rate: 0, vat_amount: 0, line_total: 1000, received_qty: 0, damaged_qty: 0, rejected_qty: 0,
  outstanding_qty: 10, sort_order: 0, ...extra,
});
const run = (id, company, status) => ({
  id, company_id: company, run_number: `PR-${id}`, bom_id: null, recipe_id: null, product_id: null, bom_name_snapshot: "Synthetic Pie",
  product_name_snapshot: "Synthetic Pie", status, batch_multiplier: 1, planned_qty: 10, actual_qty: 0, planned_cost: 0, planned_usage_value: 0,
  ingredient_cost: 0, packaging_cost: 0, labour_cost: 0, overhead_cost: 0, stock_override: false, created_by: "Original Creator", created_at: "2026-10-20T08:00:00Z",
});

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Full", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Full", status: "Setup" },
    ],
    vyron_workspace_memberships: MEMBERS.map(([userId, , ws, role], i) => ({ id: `m${i}`, workspace_id: ws, user_id: userId, role, status: "Active", permissions: {} })),
    vyron_user_profiles: MEMBERS.map(([id, email, , , first_name, surname]) => ({ id, email, first_name, surname })),
    // A high auto-approve threshold of 0 keeps "Submitted" a real approval step.
    vyron_po_approval_rules: [
      { id: "r-a", company_id: CO_A, auto_approve_below: 0, supervisor_approve_below: 25000, require_po_before_invoice_approval: false },
      { id: "r-b", company_id: CO_B, auto_approve_below: 0, supervisor_approve_below: 25000, require_po_before_invoice_approval: false },
    ],
    vyron_cost_purchase_orders: [
      po("po-draft", CO_A, "PO-DRAFT", "Draft"),
      po("po-sub", CO_A, "PO-SUB", "Submitted"),
      po("po-appr", CO_A, "PO-APPR", "Approved", { approved_by: "Original Approver" }),
      po("po-recv", CO_A, "PO-RECV", "Submitted"),
      po("po-b", CO_B, "PO-B", "Draft"),
    ],
    vyron_cost_purchase_order_lines: [
      poLine("l-draft", "po-draft", CO_A), poLine("l-sub", "po-sub", CO_A), poLine("l-appr", "po-appr", CO_A),
      poLine("l-recv", "po-recv", CO_A, { received_qty: 4, outstanding_qty: 6 }), poLine("l-b", "po-b", CO_B),
    ],
    vyron_procurement_audit_log: [],
    vyron_cost_production_runs: [run("r-plan", CO_A, "Planned"), run("r-plan2", CO_A, "Planned"), run("r-appr", CO_A, "Approved"), run("r-b", CO_B, "Planned")],
    vyron_cost_production_run_lines: [],
    vyron_cost_production_labour: [],
    vyron_cost_production_overhead: [],
    vyron_cost_production_audit_log: [],
    vyron_stock_minimum_levels: [],
    vyron_cost_stock_items: [
      { id: "si-a", company_id: CO_A, entity_type: "ingredient", entity_id: "ing-a", description: "Flour", unit: "kg", qty_on_hand: 100, average_cost: 10, current_cost: 10, inventory_value: 1000 },
      { id: "si-b", company_id: CO_B, entity_type: "ingredient", entity_id: "ing-b", description: "B Flour", unit: "kg", qty_on_hand: 100, average_cost: 10, current_cost: 10, inventory_value: 1000 },
    ],
    vyron_cost_inventory_transactions: [],
    vyron_cost_stock_ledger: [],
    vyron_inventory_audit_log: [],
    vyron_xero_workspace_settings: [],
    vyron_xero_sync_queue: [
      { id: "q-a1", company_id: CO_A, workspace_id: WS_A, entity_type: "customer", entity_id: "c1", status: "Pending", created_at: "2026-10-20T08:00:00Z" },
      { id: "q-a2", company_id: CO_A, workspace_id: WS_A, entity_type: "customer", entity_id: "c2", status: "Pending", created_at: "2026-10-20T08:00:00Z" },
    ],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function resetDb() {
  db = createFakeSupabase(seed(), { honourOrder: true });
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const rows = (table) => db.tables[table] || [];
const row = (table, id) => rows(table).find((r) => r.id === id) || {};
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};
const noSpoof = (...tables) => !tables.some((t) => JSON.stringify(rows(t)).includes(SPOOF));

async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const poListRoute = await importFromRoot("src/app/api/purchase-orders/route.ts");
const poItemRoute = await importFromRoot("src/app/api/purchase-orders/[id]/route.ts");
const runApprove = await importFromRoot("src/app/api/production/runs/[id]/approve/route.ts");
const runStart = await importFromRoot("src/app/api/production/runs/[id]/start/route.ts");
const runCancel = await importFromRoot("src/app/api/production/runs/[id]/cancel/route.ts");
const runCreate = await importFromRoot("src/app/api/production/runs/route.ts");
const invRoute = await importFromRoot("src/app/api/inventory-transactions/route.ts");
const xeroQueue = await importFromRoot("src/app/api/integrations/xero/sync-queue/route.ts");

async function login(userId) {
  const user = USERS.find((u) => u.id === userId);
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: user.email, password: user.password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, url, { method = "POST", id, body } = {}) {
  setCookieJar(jar);
  const request = new NextRequest(new URL(url, "http://qa.local"), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const res = await quietly(() => (id === undefined ? handler(request) : handler(request, { params: Promise.resolve({ id }) })));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
const createPo = (jar, body) => call(jar, poListRoute.POST, "/api/purchase-orders", { body });
const savePo = (jar, id, body) => call(jar, poItemRoute.PUT, `/api/purchase-orders/${id}`, { method: "PUT", id, body });
const patchPo = (jar, id, body) => call(jar, poItemRoute.PATCH, `/api/purchase-orders/${id}`, { method: "PATCH", id, body });
const runAction = (jar, handler, verb, id, body) => call(jar, handler, `/api/production/runs/${id}/${verb}`, { id, body });
const postInv = (jar, body) => call(jar, invRoute.POST, "/api/inventory-transactions", { body });
const queue = (jar, body) => call(jar, xeroQueue.POST, "/api/integrations/xero/sync-queue", { body });
const denied = (r) => r.status === 401 || r.status === 403;
const lines = [{ item_type: "non_stock", item_name: "Flour 25kg", quantity: 10, unit: "bag", unit_price: 100, vat_rate: 0 }];
const poCount = () => rows("vyron_cost_purchase_orders").length;

resetDb();
const jar = {};
for (const [userId] of MEMBERS) jar[userId] = await login(userId);
check("every synthetic member signs in through the real login route", Object.values(jar).every((j) => Boolean(j.vyron_workspace_user_session)));

section("1. Saving a purchase order cannot approve it");
{
  resetDb();
  const before = poCount();
  for (const status of ["Approved", "Sent", "Closed", "Fully Received"]) {
    const r = await createPo(jar[U_BUYER], { po_number: `PO-NEW-${status}`, status, lines, approvedBy: SPOOF, actor: SPOOF });
    check(`buyer (create, no approve) creating a PO as ${status} → refused (400)`, r.status === 400 && /cannot set it to/.test(r.json?.error || ""), `${r.status} ${JSON.stringify(r.json)}`);
  }
  check("…and no order was created", poCount() === before);
  const ownerCreate = await createPo(jar[U_OWNER], { po_number: "PO-OWNER-APPR", status: "Approved", lines });
  check("even an owner cannot create a PO already Approved (approval is its own action)", ownerCreate.status === 400 && poCount() === before);

  const r = await savePo(jar[U_BUYER], "po-sub", { po_number: "PO-SUB", status: "Approved", lines, approvedBy: SPOOF });
  check("buyer re-saving a Submitted PO as Approved → 400, unchanged", r.status === 400 && row("vyron_cost_purchase_orders", "po-sub").status === "Submitted", `${r.status} ${JSON.stringify(r.json)}`);
  const sent = await savePo(jar[U_BUYER], "po-draft", { po_number: "PO-DRAFT", status: "Sent", lines });
  check("buyer re-saving a Draft as Sent → 400, unchanged", sent.status === 400 && row("vyron_cost_purchase_orders", "po-draft").status === "Draft");
}

section("2. Approved and received orders are locked against re-saving");
{
  resetDb();
  const appr = await savePo(jar[U_OWNER], "po-appr", { po_number: "PO-APPR", status: "Approved", lines: [{ ...lines[0], quantity: 99 }] });
  check("saving an Approved PO → 409 locked", appr.status === 409 && /can no longer be edited/.test(appr.json?.error || ""), `${appr.status} ${JSON.stringify(appr.json)}`);
  check("…its lines and approver are untouched", row("vyron_cost_purchase_order_lines", "l-appr").quantity === 10 && row("vyron_cost_purchase_orders", "po-appr").approved_by === "Original Approver");
  const recv = await savePo(jar[U_OWNER], "po-recv", { po_number: "PO-RECV", status: "Submitted", lines });
  check("saving an order with goods received → 409", recv.status === 409 && /received/.test(recv.json?.error || ""), `${recv.status}`);
  check("…its received line is untouched", row("vyron_cost_purchase_order_lines", "l-recv").received_qty === 4);
}

section("3. Ordinary saves and the real approval path still work");
{
  resetDb();
  const created = await createPo(jar[U_BUYER], { po_number: "PO-NEW-DRAFT", status: "Draft", lines, actor: SPOOF });
  check("buyer creates a Draft → 200", created.status === 200 && created.json?.purchaseOrder?.status === "Draft", `${created.status} ${JSON.stringify(created.json).slice(0, 200)}`);
  const submitted = await createPo(jar[U_BUYER], { po_number: "PO-NEW-SUB", status: "Submitted", lines });
  check("buyer creates and submits for approval → 200, Submitted", submitted.status === 200 && submitted.json?.purchaseOrder?.status === "Submitted");
  const edit = await savePo(jar[U_BUYER], "po-draft", { po_number: "PO-DRAFT", status: "Draft", lines: [{ ...lines[0], quantity: 12 }] });
  check("buyer edits a Draft's lines → 200", edit.status === 200 && rows("vyron_cost_purchase_order_lines").some((l) => l.purchase_order_id === "po-draft" && Number(l.quantity ?? l.ordered_qty) === 12), `${edit.status} ${JSON.stringify(edit.json).slice(0, 200)}`);
  const resubmit = await savePo(jar[U_BUYER], "po-draft", { po_number: "PO-DRAFT", status: "Submitted", lines });
  check("buyer submits the Draft → 200, Submitted", resubmit.status === 200 && row("vyron_cost_purchase_orders", "po-draft").status === "Submitted");
  const buyerApprove = await patchPo(jar[U_BUYER], "po-sub", { status: "Approved" });
  check("buyer cannot approve through the approval action either (403)", buyerApprove.status === 403 && row("vyron_cost_purchase_orders", "po-sub").status === "Submitted");
  const ownerApprove = await patchPo(jar[U_OWNER], "po-sub", { status: "Approved", approvedBy: SPOOF, actor: SPOOF });
  check("owner approves through the approval action → 200, approved_by is the owner", ownerApprove.status === 200 && row("vyron_cost_purchase_orders", "po-sub").approved_by === "Synthetic Owner");
  check("no PO record or audit carries a spoofed name", noSpoof("vyron_cost_purchase_orders", "vyron_procurement_audit_log"));
  const crossSave = await savePo(jar[U_B_OWNER], "po-draft", { po_number: "PO-DRAFT", status: "Draft", lines: [] });
  check("tenant B's owner cannot save tenant A's PO", crossSave.json?.ok !== true && rows("vyron_cost_purchase_order_lines").some((l) => l.purchase_order_id === "po-draft"));
  const anon = await createPo({}, { po_number: "PO-ANON", status: "Draft", lines });
  check("signed-out create → 401/403", denied(anon));
}

section("4. Production run approve / start / cancel record the signed-in member");
{
  resetDb();
  const appr = await runAction(jar[U_OWNER], runApprove.POST, "approve", "r-plan", { actor: SPOOF });
  check("owner approves → approved_by is the owner", appr.status === 200 && row("vyron_cost_production_runs", "r-plan").approved_by === "Synthetic Owner", `${appr.status} ${JSON.stringify(appr.json).slice(0, 200)}`);
  const start = await runAction(jar[U_PROD], runStart.POST, "start", "r-appr", { actor: SPOOF });
  check("PRODUCTION starts → started_by is the operator", start.status === 200 && row("vyron_cost_production_runs", "r-appr").started_by === "Synthetic Operator", `${start.status} ${JSON.stringify(start.json).slice(0, 200)}`);
  const cancel = await runAction(jar[U_PROD], runCancel.POST, "cancel", "r-plan2", { actor: SPOOF });
  const ev = rows("vyron_cost_production_audit_log").find((a) => a.production_run_id === "r-plan2") || {};
  check("PRODUCTION cancels → the audit event names the operator", cancel.status === 200 && ev.actor === "Synthetic Operator", JSON.stringify(ev));
  check("no run or audit carries a spoofed name", noSpoof("vyron_cost_production_runs", "vyron_cost_production_audit_log"));

  resetDb();
  const buyer = await runAction(jar[U_BUYER], runApprove.POST, "approve", "r-plan", { actor: "Synthetic Owner" });
  check("PROCUREMENT (no manufacturing rights) approving → 403", buyer.status === 403 && row("vyron_cost_production_runs", "r-plan").status === "Planned");
  const anon = await runAction({}, runStart.POST, "start", "r-plan", {});
  check("signed-out start → 401/403", denied(anon) && row("vyron_cost_production_runs", "r-plan").status === "Planned");
  const cross = await runAction(jar[U_B_OWNER], runCancel.POST, "cancel", "r-plan", {});
  check("tenant B's owner cannot cancel tenant A's run", cross.json?.ok !== true && row("vyron_cost_production_runs", "r-plan").status === "Planned");
  const create = await call(jar[U_BUYER], runCreate.POST, "/api/production/runs", { body: { bom_id: "x", created_by: SPOOF } });
  check("PROCUREMENT creating a run → 403", create.status === 403);
}

section("5. Inventory transactions record the signed-in member");
{
  resetDb();
  const r = await postInv(jar[U_INV], { action: "receive", stock_item_id: "si-a", entity_type: "ingredient", entity_id: "ing-a", quantity: 5, unit_cost: 10, created_by: SPOOF });
  const tx = rows("vyron_cost_inventory_transactions")[0] || {};
  check("INVENTORY posts a receipt → 200, created_by is the storeman", r.status === 200 && tx.created_by === "Synthetic Storeman", `${r.status} ${JSON.stringify(r.json).slice(0, 200)} ${tx.created_by}`);
  check("no transaction carries the spoofed name", noSpoof("vyron_cost_inventory_transactions", "vyron_cost_stock_ledger"));
  const buyer = await postInv(jar[U_BUYER], { action: "receive", stock_item_id: "si-a", quantity: 5 });
  check("PROCUREMENT (no adjustments.post) → 403", buyer.status === 403);
  const anon = await postInv({}, { action: "receive", stock_item_id: "si-a", quantity: 5 });
  check("signed-out → 401/403", denied(anon));
  const cross = await postInv(jar[U_OWNER], { action: "receive", stock_item_id: "si-b", quantity: 5 });
  check("tenant A posting to tenant B's stock item is refused; B unchanged", cross.json?.ok !== true && row("vyron_cost_stock_items", "si-b").qty_on_hand === 100, `${cross.status} ${JSON.stringify(cross.json)}`);
  check("only the one valid transaction exists", rows("vyron_cost_inventory_transactions").length === 1);
}

section("6. Xero sync-queue actions: permission on 'fail', and the member as actor");
{
  resetDb();
  const view = await queue(jar[U_VIEW], { action: "fail", id: "q-a1", reason: "x", actor: SPOOF });
  check("VIEW_ONLY marking a queue item failed → 403 (was allowed)", view.status === 403 && row("vyron_xero_sync_queue", "q-a1").status === "Pending", `${view.status} ${JSON.stringify(view.json)}`);
  const owner = await queue(jar[U_OWNER], { action: "fail", id: "q-a1", reason: "Contact rejected by Xero", actor: SPOOF });
  check("owner marks it failed → 200", owner.status === 200 && row("vyron_xero_sync_queue", "q-a1").status === "Failed", `${owner.status} ${JSON.stringify(owner.json).slice(0, 200)}`);
  const settings = rows("vyron_xero_workspace_settings").find((s) => s.workspace_id === WS_A) || {};
  const events = settings.connection?.auditEvents || [];
  check("the Xero audit event names the owner, not the browser's actor", events.some((e) => e.actor === "Synthetic Owner") && !events.some((e) => e.actor === SPOOF), JSON.stringify(events.map((e) => e.actor)));
  const cancel = await queue(jar[U_OWNER], { action: "cancel", id: "q-a2", actor: SPOOF });
  check("cancel also records the owner", cancel.status === 200 && !JSON.stringify(rows("vyron_xero_workspace_settings")).includes(SPOOF));
  const anon = await queue({}, { action: "cancel", id: "q-a2" });
  check("signed-out → refused", anon.json?.ok !== true);
  const cross = await queue(jar[U_B_OWNER], { action: "fail", id: "q-a2", reason: "x" });
  check("tenant B's owner cannot touch tenant A's queue item (404)", cross.status === 404, `${cross.status}`);
}

section("7. No route records an identity taken from the request");
{
  const ROUTES = [
    "production/runs/route.ts", "production/runs/[id]/approve/route.ts", "production/runs/[id]/start/route.ts", "production/runs/[id]/cancel/route.ts",
    "inventory-transactions/route.ts", "integrations/xero/accounts/route.ts", "integrations/xero/connection/route.ts",
    "integrations/xero/import-contacts/route.ts", "integrations/xero/mapping/route.ts", "integrations/xero/sync-queue/route.ts",
    "documents/[id]/review/approve/route.ts",
  ];
  const BODY_IDENTITY = /body\??\.(actor|approvedBy|approved_by|created_by|createdBy|completed_by)\b/;
  const offenders = ROUTES.filter((r) => BODY_IDENTITY.test(readFileSync(path.join(ROOT, "src/app/api", r), "utf8")));
  check("none of these 11 routes reads actor / approvedBy / created_by from the body", offenders.length === 0, offenders.join(", "));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
