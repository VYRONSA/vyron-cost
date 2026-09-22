#!/usr/bin/env node
/**
 * VYRON — existing sales-order engine safety regression (2026-09-22).
 *
 * Proves the fixes made while integrating the Order Engine, through the REAL
 * route handlers, session, membership and company resolution (only cookies,
 * the database and password checks are stand-ins):
 *
 *  1. Audit identity: sales-order and invoice routes, and the Order Centre,
 *     record the verified member — a request body naming another actor is
 *     ignored (approved_by, audit actor, creation audit).
 *  2. Pricing: a line without a price takes the customer's price list before
 *     the product master; a stated price is kept; a contract price beats a
 *     default price deterministically.
 *  3. Reservations: stock reserved by other LIVE sales orders is not available
 *     to a new approval (no double reservation); a cancelled order's leftover
 *     reservation does not block stock; re-approval replaces its own.
 *  4. Portal access: setting a customer PIN, suspending access or changing the
 *     ordering link needs customers.edit; reading needs customers.view.
 *  5. Static guard: no sales-order, invoice or Order Engine route reads an
 *     actor from the request.
 *
 * Family A: no network, no database, no credentials.
 *
 *   node scripts/test-sales-order-safety.mjs
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
delete process.env.RESEND_API_KEY;
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
const CO = uuid("a", 1);
const WS = uuid("a", 2);
const U_SALES = uuid("a", 10), U_VIEW = uuid("a", 11), U_OTHER = uuid("a", 12);
const USERS = [
  { id: U_SALES, email: "sales@qa.test", password: "qa-pass-sales" },
  { id: U_VIEW, email: "view@qa.test", password: "qa-pass-view" },
];

const seed = () => ({
  vyron_workspaces: [{ id: WS, company_id: CO, company_name: "QA Foods", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 }],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS, user_id: U_SALES, role: "SALES", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS, user_id: U_VIEW, role: "VIEW_ONLY", status: "Active", permissions: {} },
  ],
  vyron_customers: [
    { id: "c-list", company_id: CO, customer_name: "Listed Customer", status: "Active" },
    { id: "c-plain", company_id: CO, customer_name: "Plain Customer", status: "Active" },
  ],
  vyron_cost_products: [
    { id: "p1", company_id: CO, product_name: "Pie", sku: "PIE", selling_price: 20, total_cost: 8 },
    { id: "p2", company_id: CO, product_name: "Tart", sku: "TART", selling_price: 30, total_cost: 12 },
  ],
  vyron_customer_price_list_assignments: [
    { id: "as1", company_id: CO, customer_id: "c-list", default_price_list_id: "pl-default", contract_price_list_id: "pl-contract", status: "Active" },
  ],
  // The default item is listed FIRST so a first-row choice would pick it.
  vyron_customer_price_list_items: [
    { id: "i1", company_id: CO, price_list_id: "pl-default", product_id: "p1", final_price: 18, status: "Active", effective_from: "2026-01-01" },
    { id: "i2", company_id: CO, price_list_id: "pl-contract", product_id: "p1", final_price: 16.5, status: "Active", effective_from: "2026-01-01" },
    { id: "i3", company_id: CO, price_list_id: "pl-default", product_id: "p2", final_price: 27, status: "Active", effective_from: "2026-01-01" },
  ],
  vyron_customer_price_lists: [],
  vyron_customer_price_list_versions: [],
  vyron_customer_branches: [],
  vyron_customer_invoices: [],
  vyron_customer_invoice_lines: [],
  vyron_cost_stock_items: [{ id: "s1", company_id: CO, entity_type: "finished_goods", entity_id: "p1", qty_on_hand: 10 }],
  vyron_customer_sales_orders: [],
  vyron_customer_sales_order_lines: [],
  vyron_customer_sales_order_allocations: [],
  vyron_customer_sales_order_audit: [],
  vyron_order_notification_recipients: [],
  vyron_order_notification_deliveries: [],
  vyron_customer_portal_identities: [],
  vyron_customer_portal_tenants: [],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const db = createFakeSupabase(seed());
globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map(), headers: {} };
const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const soRoute = await importFromRoot("src/app/api/customer-sales-orders/route.ts");
const soItemRoute = await importFromRoot("src/app/api/customer-sales-orders/[id]/route.ts");
const staffRoute = await importFromRoot("src/app/api/vyron-order/staff/orders/[id]/route.ts");
const accessRoute = await importFromRoot("src/app/api/vyron-order/admin/access/route.ts");
const { saveCustomerSalesOrder } = await importFromRoot("src/lib/vyron-customer-sales-orders.ts");
const { resolveCustomerProductPrice } = await importFromRoot("src/lib/vyron-customer-price-lists.ts");

async function login(email, password) {
  setCookieJar({});
  const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, { method = "GET", url = "/x", body, id } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = id ? await handler(request, { params: Promise.resolve({ id }) }) : await handler(request);
  return { status: res.status, json: await res.json().catch(() => null) };
}

const jarSales = await login("sales@qa.test", "qa-pass-sales");
const jarView = await login("view@qa.test", "qa-pass-view");
check("synthetic members sign in", Boolean(jarSales.vyron_workspace_user_session && jarView.vyron_workspace_user_session));

console.log("\n1. Audit identity comes from the session");
{
  const created = await call(jarSales, soRoute.POST, {
    method: "POST",
    body: { customerId: "c-plain", customerName: "Plain Customer", actor: U_OTHER, auditActor: U_OTHER, lines: [{ productId: "p1", description: "Pie", quantity: 2, sellingPrice: 20 }] },
  });
  check("create sales order (200)", created.status === 200, JSON.stringify(created.json).slice(0, 200));
  const orderId = created.json.order.id;
  const createdAudit = db.tables.vyron_customer_sales_order_audit.find((a) => a.sales_order_id === orderId && a.event_type === "SALES_ORDER_CREATED");
  check("creation audit records the member, not the body", createdAudit?.actor === U_SALES, createdAudit?.actor);

  const approved = await call(jarSales, soItemRoute.PATCH, { method: "PATCH", id: orderId, body: { action: "approve", actor: U_OTHER } });
  check("approve (200)", approved.status === 200, JSON.stringify(approved.json).slice(0, 200));
  const row = db.tables.vyron_customer_sales_orders.find((o) => o.id === orderId);
  check("approved_by is the member, not body.actor", row.approved_by === U_SALES, row.approved_by);
  const approveAudit = db.tables.vyron_customer_sales_order_audit.find((a) => a.sales_order_id === orderId && a.event_type === "SALES_ORDER_APPROVE");
  check("approval audit actor is the member", approveAudit?.actor === U_SALES, approveAudit?.actor);
  check("no audit row carries the spoofed actor", db.tables.vyron_customer_sales_order_audit.every((a) => a.actor !== U_OTHER));

  const viewer = await call(jarView, soItemRoute.PATCH, { method: "PATCH", id: orderId, body: { action: "start_picking", actor: U_SALES } });
  check("a viewer cannot move the order by naming a permitted actor (403)", viewer.status === 403);

  // Order Centre staff transition: the member, not the literal "VYRON ORDER CENTRE".
  const staff = await call(jarSales, staffRoute.POST, { method: "POST", id: orderId, body: { action: "start_picking", actor: U_OTHER } });
  check("Order Centre start picking (200)", staff.status === 200, JSON.stringify(staff.json).slice(0, 200));
  const pickAudit = db.tables.vyron_customer_sales_order_audit.find((a) => a.sales_order_id === orderId && a.event_type === "SALES_ORDER_START_PICKING");
  check("Order Centre audit records the member", pickAudit?.actor === U_SALES, pickAudit?.actor);
}

console.log("\n2. Pricing precedence");
{
  const contract = await resolveCustomerProductPrice(db, CO, { customerId: "c-list", productId: "p1", asOfDate: "2026-09-22" });
  check("contract price beats default price even when the default row comes first", contract.source === "contract" && contract.sellingPrice === 16.5, JSON.stringify(contract));
  const onlyDefault = await resolveCustomerProductPrice(db, CO, { customerId: "c-list", productId: "p2", asOfDate: "2026-09-22" });
  check("default list price when no contract price", onlyDefault.source === "default" && onlyDefault.sellingPrice === 27);
  const master = await resolveCustomerProductPrice(db, CO, { customerId: "c-plain", productId: "p1", asOfDate: "2026-09-22" });
  check("product master when the customer has no list", master.source === "product_master" && master.sellingPrice === 20);

  const blank = await saveCustomerSalesOrder(db, CO, { customerId: "c-list", customerName: "Listed Customer", lines: [{ productId: "p1", description: "Pie", quantity: 1, sellingPrice: 0 }] });
  const blankLine = db.tables.vyron_customer_sales_order_lines.find((l) => l.sales_order_id === blank.id);
  check("a line saved without a price takes the customer's contract price (not the master 20)", blankLine?.selling_price === 16.5, String(blankLine?.selling_price));
  const stated = await saveCustomerSalesOrder(db, CO, { customerId: "c-list", customerName: "Listed Customer", lines: [{ productId: "p1", description: "Pie", quantity: 1, sellingPrice: 19 }] });
  check("a stated price is kept", db.tables.vyron_customer_sales_order_lines.find((l) => l.sales_order_id === stated.id)?.selling_price === 19);
  const plain = await saveCustomerSalesOrder(db, CO, { customerId: "c-plain", customerName: "Plain Customer", lines: [{ productId: "p1", description: "Pie", quantity: 1, sellingPrice: 0 }] });
  check("no list → product master price, as before", db.tables.vyron_customer_sales_order_lines.find((l) => l.sales_order_id === plain.id)?.selling_price === 20);
  check("cost is still the product master cost (never the browser's)", db.tables.vyron_customer_sales_order_lines.find((l) => l.sales_order_id === blank.id)?.cost_per_unit === 8);
}

console.log("\n3. No double reservation");
{
  // Fresh stock picture: 10 on hand of p1. The order from section 1 reserved 2 and is now Picking.
  const reservedBefore = db.tables.vyron_customer_sales_order_allocations.filter((a) => a.product_id === "p1" && a.status === "Reserved").reduce((s, a) => s + a.reserved_qty, 0);
  check("the live Picking order holds 2", reservedBefore === 2, String(reservedBefore));
  const mk = async (qty) => (await call(jarSales, soRoute.POST, { method: "POST", body: { customerId: "c-plain", customerName: "Plain Customer", lines: [{ productId: "p1", description: "Pie", quantity: qty, sellingPrice: 20 }] } })).json.order.id;
  const a = await mk(7);
  const approveA = await call(jarSales, soItemRoute.PATCH, { method: "PATCH", id: a, body: { action: "approve" } });
  check("order A (7 of 8 free) approves", approveA.status === 200, JSON.stringify(approveA.json).slice(0, 200));
  const b = await mk(5);
  const approveB = await call(jarSales, soItemRoute.PATCH, { method: "PATCH", id: b, body: { action: "approve" } });
  check("order B (5, only 1 free) is refused — no double reservation (409)", approveB.status === 409 && approveB.json?.shortages?.[0]?.available_qty === 1, JSON.stringify(approveB.json));
  check("order B reserved nothing", !db.tables.vyron_customer_sales_order_allocations.some((x) => x.sales_order_id === b));
  const reapprove = await (await importFromRoot("src/lib/vyron-customer-sales-orders.ts")).transitionCustomerSalesOrder(db, CO, a, "start_picking", U_SALES);
  check("order A proceeds", reapprove.status === "Picking");
  await call(jarSales, soItemRoute.PATCH, { method: "PATCH", id: a, body: { action: "cancel" } });
  check("cancelling A leaves its rows Reserved (existing behaviour)", db.tables.vyron_customer_sales_order_allocations.some((x) => x.sales_order_id === a && x.status === "Reserved"));
  const approveB2 = await call(jarSales, soItemRoute.PATCH, { method: "PATCH", id: b, body: { action: "approve" } });
  check("…but a cancelled order no longer blocks stock: B now approves", approveB2.status === 200, JSON.stringify(approveB2.json).slice(0, 200));
}

console.log("\n4. Portal access needs customer permissions");
{
  const anonymous = await call({}, accessRoute.POST, { method: "POST", body: { customerId: "c-plain", pin: "123456" } });
  check("anonymous PIN change → 401", anonymous.status === 401);
  const viewPin = await call(jarView, accessRoute.POST, { method: "POST", body: { customerId: "c-plain", pin: "123456" } });
  check("view-only member cannot set a PIN (403)", viewPin.status === 403);
  const viewSuspend = await call(jarView, accessRoute.PATCH, { method: "PATCH", body: { customerId: "c-plain", status: "Suspended" } });
  check("view-only member cannot suspend access (403)", viewSuspend.status === 403);
  const viewLink = await call(jarView, accessRoute.PUT, { method: "PUT", body: { slug: "hijack", displayName: "x" } });
  check("view-only member cannot change the ordering link (403)", viewLink.status === 403);
  const viewRead = await call(jarView, accessRoute.GET);
  check("view-only member may read the access list (customers.view)", viewRead.status !== 401 && viewRead.status !== 403, String(viewRead.status));
  const salesPin = await call(jarSales, accessRoute.POST, { method: "POST", body: { customerId: "c-plain", pin: "123456" } });
  check("a member with customers.edit passes the permission gate", salesPin.status !== 401 && salesPin.status !== 403, String(salesPin.status));
}

console.log("\n5. Static guard: no order or invoice route reads a client actor");
{
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
  const dirs = ["src/app/api/customer-sales-orders", "src/app/api/customer-invoices", "src/app/api/order-intake", "src/app/api/vyron-order"].map((d) => path.join(ROOT, d));
  const offenders = dirs.flatMap(walk).filter((file) => /body\??\.(actor|approvedBy|approved_by|createdBy|created_by|completedBy|completed_by|receivedBy|received_by)\b/.test(readFileSync(file, "utf8")));
  check("no client-supplied actor in sales-order, invoice, Order Engine or VYRON ORDER routes", offenders.length === 0, offenders.map((f) => path.relative(ROOT, f)).join(", "));
  const staffSource = readFileSync(path.join(ROOT, "src/app/api/vyron-order/staff/orders/[id]/route.ts"), "utf8");
  check("Order Centre no longer records the literal actor", !staffSource.includes('"VYRON ORDER CENTRE"'));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
