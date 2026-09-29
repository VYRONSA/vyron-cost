#!/usr/bin/env node
/**
 * VOLORA — Customer Price Lists editor: view, edit, add, remove; tenant-safe.
 *
 * Drives the REAL /api/customer-price-lists routes with the REAL workspace
 * session, membership, permission and company-resolution code, and the REAL
 * customer catalogue / cart code for the ordering-integrity checks. Only the
 * process boundary is replaced (cookies, an in-memory database, synthetic
 * passwords). Two synthetic tenants. FICTIONAL / NON-PRODUCTION.
 *
 * Proves: staff can open a list and see its products, customers and history;
 * edit a price; add a product; duplicates are refused; remove/restore keeps
 * the row; view-only members cannot write; another tenant's list, item,
 * product and customer ids are refused on every route (including the older
 * upsert_items and assign modes); and the customer catalogue follows the list
 * exactly — no fallback, no browser price, no off-list product.
 *
 * Family A: no network, no database, no credentials.
 *
 *   npm run test:customer-price-list-editor
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
const section = (t) => console.log(`\n${t}`);

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_STAFF = uuid("a", 10), U_VIEWER = uuid("a", 11), U_B = uuid("b", 10);
// Members whose SAVED permission maps are partial: absent keys must keep the role default.
const U_NOEDIT = uuid("a", 12), U_EXPORTONLY = uuid("a", 13);
const LIST_A = uuid("a", 20), LIST_A2 = uuid("a", 21), LIST_B = uuid("b", 20);
const P_PIE = uuid("a", 30), P_SOUP = uuid("a", 31), P_TART = uuid("a", 32), P_OLD = uuid("a", 33), P_B = uuid("b", 30);
const CUST_A = uuid("a", 40), CUST_B = uuid("b", 40);
const ITEM_PIE = uuid("a", 50), ITEM_SOUP = uuid("a", 51), ITEM_A2 = uuid("a", 52), ITEM_B = uuid("b", 50);

const USERS = [
  { id: U_STAFF, email: "staff@qa-a.test", password: "qa-pass-staff" },
  { id: U_VIEWER, email: "viewer@qa-a.test", password: "qa-pass-viewer" },
  { id: U_B, email: "staff@qa-b.test", password: "qa-pass-b" },
  { id: U_NOEDIT, email: "noedit@qa-a.test", password: "qa-pass-noedit" },
  { id: U_EXPORTONLY, email: "exportonly@qa-a.test", password: "qa-pass-exportonly" },
];

const seed = () => ({
  vyron_workspaces: [
    { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
  ],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS_A, user_id: U_STAFF, role: "SALES", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS_A, user_id: U_VIEWER, role: "VIEW_ONLY", status: "Active", permissions: {} },
    { id: "m3", workspace_id: WS_B, user_id: U_B, role: "SALES", status: "Active", permissions: {} },
    { id: "m4", workspace_id: WS_A, user_id: U_NOEDIT, role: "SALES", status: "Active", permissions: { "sales_orders.edit": false } },
    { id: "m5", workspace_id: WS_A, user_id: U_EXPORTONLY, role: "SALES", status: "Active", permissions: { "reports.export": true } },
  ],
  vyron_customers: [
    { id: CUST_A, company_id: CO_A, customer_name: "Retailer A", status: "Active", active: true },
    { id: CUST_B, company_id: CO_B, customer_name: "Retailer B", status: "Active", active: true },
  ],
  vyron_cost_products: [
    { id: P_PIE, company_id: CO_A, product_name: "Beef Pie", sku: "A-PIE", selling_price: 40, total_cost: 18, category: "Pies", status: "Active" },
    { id: P_SOUP, company_id: CO_A, product_name: "Tomato Soup", sku: "A-SOUP", selling_price: 30, total_cost: 12, category: "Soup", status: "Active" },
    { id: P_TART, company_id: CO_A, product_name: "Lemon Tart", sku: "A-TART", selling_price: 65, total_cost: 28, category: "Desserts", status: "Active" },
    { id: P_OLD, company_id: CO_A, product_name: "Retired Loaf", sku: "A-OLD", selling_price: 20, total_cost: 8, category: "Bread", status: "Archived" },
    { id: P_B, company_id: CO_B, product_name: "Tenant B Secret Roll", sku: "B-ROLL", selling_price: 15, total_cost: 6, category: "Bread", status: "Active" },
  ],
  vyron_cost_stock_items: [
    { id: "si-pie", company_id: CO_A, entity_type: "finished_goods", entity_id: P_PIE, item_code: "A-PIE", qty_on_hand: 100, average_cost: 18, current_cost: 18, unit: "each" },
    { id: "si-soup", company_id: CO_A, entity_type: "finished_goods", entity_id: P_SOUP, item_code: "A-SOUP", qty_on_hand: 100, average_cost: 12, current_cost: 12, unit: "each" },
    { id: "si-tart", company_id: CO_A, entity_type: "finished_goods", entity_id: P_TART, item_code: "A-TART", qty_on_hand: 100, average_cost: 28, current_cost: 28, unit: "each" },
  ],
  vyron_cost_stock_ledger: [],
  vyron_cost_low_stock_alerts: [],
  vyron_inventory_settings: [],
  vyron_cost_product_pack_sizes: [],
  vyron_cost_boms: [],
  vyron_customer_price_lists: [
    { id: LIST_A, company_id: CO_A, list_name: "Retail A", list_type: "Contract", status: "Active", version: 1 },
    { id: LIST_A2, company_id: CO_A, list_name: "Wholesale A", list_type: "Standard", status: "Active", version: 1 },
    { id: LIST_B, company_id: CO_B, list_name: "Retail B", list_type: "Contract", status: "Active", version: 1 },
  ],
  vyron_customer_price_list_versions: [],
  vyron_customer_price_list_audit_log: [],
  vyron_customer_price_list_assignments: [
    { id: "pla-a", company_id: CO_A, customer_id: CUST_A, contract_price_list_id: LIST_A, default_price_list_id: null, status: "Active" },
    { id: "pla-b", company_id: CO_B, customer_id: CUST_B, contract_price_list_id: LIST_B, default_price_list_id: null, status: "Active" },
  ],
  vyron_customer_price_list_items: [
    { id: ITEM_PIE, company_id: CO_A, price_list_id: LIST_A, product_id: P_PIE, base_price: 36, override_price: null, final_price: 36, status: "Active", effective_from: "2026-01-01" },
    { id: ITEM_SOUP, company_id: CO_A, price_list_id: LIST_A, product_id: P_SOUP, base_price: 25, override_price: null, final_price: 25, status: "Active", effective_from: "2026-01-01" },
    { id: ITEM_A2, company_id: CO_A, price_list_id: LIST_A2, product_id: P_TART, base_price: 50, override_price: null, final_price: 50, status: "Active" },
    { id: ITEM_B, company_id: CO_B, price_list_id: LIST_B, product_id: P_B, base_price: 14, override_price: null, final_price: 14, status: "Active" },
  ],
  vyron_customer_branches: [],
  vyron_customer_sales_orders: [],
  vyron_customer_sales_order_lines: [],
  vyron_customer_sales_order_allocations: [],
  vyron_customer_sales_order_audit: [],
  vyron_customer_sales_order_invoice_links: [],
  vyron_customer_invoices: [],
  vyron_customer_invoice_lines: [],
  vyron_stock_movements: [],
  vyron_xero_sync_queue: [],
  vyron_customer_order_carts: [],
  vyron_customer_order_cart_lines: [],
  vyron_customer_order_submissions: [],
  vyron_order_notification_deliveries: [],
  vyron_order_notification_settings: [],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
let db = null;
function freshDb() {
  db = createFakeSupabase(seed(), {
    // Postgres behaviour: a malformed id in a uuid filter is an error, not an empty result.
    strictUuid: true,
    unique: {
      vyron_customer_price_list_items: [["price_list_id", "product_id"]],
      vyron_customer_order_submissions: [["company_id", "customer_id", "idempotency_key"]],
    },
  });
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
freshDb();

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const listsRoute = await importFromRoot("src/app/api/customer-price-lists/route.ts");
const listRoute = await importFromRoot("src/app/api/customer-price-lists/[id]/route.ts");
const catalogue = await importFromRoot("src/lib/vyron-order-catalogue.ts");
const cart = await importFromRoot("src/lib/vyron-order-cart.ts");

const realConsole = { log: console.log, info: console.info, warn: console.warn };
let quietDepth = 0;
async function quietly(fn) {
  if (quietDepth++ === 0) console.log = console.info = console.warn = () => {};
  try {
    return await fn();
  } finally {
    if (--quietDepth === 0) Object.assign(console, realConsole);
  }
}

const setCookieJar = (jar) => {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
};
async function login(email, password) {
  setCookieJar({});
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, { method = "GET", url, body, id } = {}) {
  setCookieJar(jar);
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = await quietly(() => (id !== undefined ? handler(request, { params: Promise.resolve({ id }) }) : handler(request)));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const open = (jar, id) => call(jar, listRoute.GET, { url: `/api/customer-price-lists/${id}`, id });
const add = (jar, id, body) => call(jar, listRoute.POST, { method: "POST", url: `/api/customer-price-lists/${id}`, id, body });
const patch = (jar, id, body) => call(jar, listRoute.PATCH, { method: "PATCH", url: `/api/customer-price-lists/${id}`, id, body });
const legacy = (jar, body) => call(jar, listsRoute.POST, { method: "POST", url: "/api/customer-price-lists", body });
const item = (id) => db.tables.vyron_customer_price_list_items.find((r) => r.id === id);
const itemsFor = (listId, productId) => db.tables.vyron_customer_price_list_items.filter((r) => r.price_list_id === listId && r.product_id === productId);
const audit = () => db.tables.vyron_customer_price_list_audit_log;
const shownTo = async (customerId, companyId = CO_A) =>
  (await catalogue.getCustomerCatalogue(db, companyId, customerId)).categories.flatMap((c) => c.products);
const TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const jarStaff = await login("staff@qa-a.test", "qa-pass-staff");
const jarViewer = await login("viewer@qa-a.test", "qa-pass-viewer");
const jarB = await login("staff@qa-b.test", "qa-pass-b");
const jarNoEdit = await login("noedit@qa-a.test", "qa-pass-noedit");
const jarExportOnly = await login("exportonly@qa-a.test", "qa-pass-exportonly");
check("synthetic members sign in through the real login route", [jarStaff, jarViewer, jarB].every((j) => Boolean(j.vyron_workspace_user_session)));

section("Authentication and permission");
{
  freshDb();
  const anon = [await open({}, LIST_A), await add({}, LIST_A, { productId: P_TART, price: 60 }), await patch({}, LIST_A, { itemId: ITEM_PIE, price: 1 })];
  check("anonymous view/add/edit → refused (401/403)", anon.every((r) => r.status === 401 || r.status === 403), anon.map((r) => r.status).join(","));
  const viewerOpen = await open(jarViewer, LIST_A);
  check("a view-only member can open a list", viewerOpen.status === 200 && viewerOpen.json?.items?.length === 2);
  const viewerEdit = await patch(jarViewer, LIST_A, { itemId: ITEM_PIE, price: 1 });
  const viewerAdd = await add(jarViewer, LIST_A, { productId: P_TART, price: 60 });
  const viewerRemove = await patch(jarViewer, LIST_A, { itemId: ITEM_PIE, status: "Inactive" });
  check("a view-only member cannot edit, add or remove (403)", [viewerEdit, viewerAdd, viewerRemove].every((r) => r.status === 403), [viewerEdit, viewerAdd, viewerRemove].map((r) => r.status).join(","));
  check("…and nothing changed", item(ITEM_PIE).final_price === 36 && item(ITEM_PIE).status === "Active" && itemsFor(LIST_A, P_TART).length === 0 && audit().length === 0);
}

section("Staff can open a price list");
{
  freshDb();
  const r = await open(jarStaff, LIST_A);
  check("opens (200)", r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 200));
  check("shows name, type, status and version", r.json?.list?.list_name === "Retail A" && r.json.list.list_type === "Contract" && r.json.list.status === "Active" && r.json.list.version === 1);
  const names = (r.json?.items || []).map((i) => `${i.productName}|${i.sku}|${i.finalPrice}|${i.status}`).sort();
  check("shows every product on the list with SKU, price and status", names.join(";") === ["Beef Pie|A-PIE|36|Active", "Tomato Soup|A-SOUP|25|Active"].join(";"), names.join(";"));
  check("shows the effective date where set", r.json?.items?.find((i) => i.productId === P_PIE)?.effectiveFrom === "2026-01-01");
  check("shows which customers are assigned to it", r.json?.assignedCustomers?.length === 1 && r.json.assignedCustomers[0].customerName === "Retailer A" && r.json.assignedCustomers[0].role === "Contract");
  check("carries no cost or margin", !/total_cost|cost_per|margin|gp_pct/i.test(JSON.stringify(r.json?.items)));
  const other = await open(jarStaff, LIST_A2);
  check("a second list opens with only its own products", other.status === 200 && other.json.items.length === 1 && other.json.items[0].productId === P_TART && other.json.assignedCustomers.length === 0);
}

section("Staff can edit a price");
{
  freshDb();
  const r = await patch(jarStaff, LIST_A, { itemId: ITEM_PIE, price: "38.50" });
  check("price change accepted (200)", r.status === 200 && r.json?.price === 38.5 && r.json?.previousPrice === 36, JSON.stringify(r.json));
  check("the list price is now 38.50", item(ITEM_PIE).final_price === 38.5 && item(ITEM_PIE).override_price === 38.5);
  const a = audit().find((e) => e.event_type === "Price List Item Price Changed");
  check("the change is audited with before, after, list, item and the signed-in user", Boolean(a) && a.metadata.previousPrice === 36 && a.metadata.newPrice === 38.5 && a.price_list_id === LIST_A && a.price_list_item_id === ITEM_PIE && a.actor === U_STAFF && a.company_id === CO_A);
  for (const [label, bad] of [["text", "abc"], ["zero", 0], ["negative", -5], ["absurd", 1e12], ["empty", ""], ["missing", null]]) {
    const res = await patch(jarStaff, LIST_A, { itemId: ITEM_PIE, price: bad });
    check(`an invalid price (${label}) is refused (400)`, res.status === 400, `${res.status} ${JSON.stringify(res.json)}`);
  }
  check("…and the price is unchanged by any of them", item(ITEM_PIE).final_price === 38.5);
  const both = await patch(jarStaff, LIST_A, { itemId: ITEM_PIE, price: 40, status: "Inactive" });
  check("price and status together are refused (400)", both.status === 400 && item(ITEM_PIE).final_price === 38.5 && item(ITEM_PIE).status === "Active");
}

section("Staff can add a product; duplicates are refused");
{
  freshDb();
  const r = await add(jarStaff, LIST_A, { productId: P_TART, price: 60 });
  check("adds the product (201)", r.status === 201 && r.json?.reactivated === false, JSON.stringify(r.json));
  check("…one Active row at the price, in this company and list", itemsFor(LIST_A, P_TART).length === 1 && itemsFor(LIST_A, P_TART)[0].final_price === 60 && itemsFor(LIST_A, P_TART)[0].status === "Active" && itemsFor(LIST_A, P_TART)[0].company_id === CO_A);
  check("…and audited", audit().some((e) => e.event_type === "Price List Item Added" && e.metadata.productId === P_TART && e.metadata.newPrice === 60));
  const dup = await add(jarStaff, LIST_A, { productId: P_TART, price: 61 });
  check("adding it again is refused as a duplicate (409)", dup.status === 409 && /already on this price list/.test(dup.json?.error || ""), JSON.stringify(dup.json));
  check("…still exactly one row, price unchanged", itemsFor(LIST_A, P_TART).length === 1 && itemsFor(LIST_A, P_TART)[0].final_price === 60);
  const dupExisting = await add(jarStaff, LIST_A, { productId: P_PIE, price: 1 });
  check("adding a product already on the list is refused (409)", dupExisting.status === 409 && item(ITEM_PIE).final_price === 36);
  const inactive = await add(jarStaff, LIST_A, { productId: P_OLD, price: 10 });
  check("an archived product cannot be added (400)", inactive.status === 400 && itemsFor(LIST_A, P_OLD).length === 0);
  const badPrice = await add(jarStaff, LIST_A, { productId: P_TART, price: 0 });
  check("an add with a zero price is refused (400)", badPrice.status === 400);
  const noProduct = await add(jarStaff, LIST_A, { price: 10 });
  check("an add with no product is refused (400)", noProduct.status === 400);
}

section("Remove and restore keep the row and its history");
{
  freshDb();
  const r = await patch(jarStaff, LIST_A, { itemId: ITEM_SOUP, status: "Inactive" });
  check("removes the product (200)", r.status === 200 && r.json?.changed === true);
  check("…the row is kept, Inactive, price preserved (no hard delete)", item(ITEM_SOUP)?.status === "Inactive" && item(ITEM_SOUP).final_price === 25);
  check("…and audited", audit().some((e) => e.event_type === "Price List Item Deactivated" && e.price_list_item_id === ITEM_SOUP));
  const listed = await open(jarStaff, LIST_A);
  check("the editor still shows it, as removed", listed.json.items.some((i) => i.id === ITEM_SOUP && i.status === "Inactive"));
  const readd = await add(jarStaff, LIST_A, { productId: P_SOUP, price: 27 });
  check("adding a removed product restores that row at the new price (no duplicate)", readd.status === 200 && readd.json?.reactivated === true && itemsFor(LIST_A, P_SOUP).length === 1 && item(ITEM_SOUP).status === "Active" && item(ITEM_SOUP).final_price === 27);
  await patch(jarStaff, LIST_A, { itemId: ITEM_SOUP, status: "Inactive" });
  const restore = await patch(jarStaff, LIST_A, { itemId: ITEM_SOUP, status: "Active" });
  check("Restore brings it back at its kept price", restore.status === 200 && item(ITEM_SOUP).status === "Active" && item(ITEM_SOUP).final_price === 27);
  const badStatus = await patch(jarStaff, LIST_A, { itemId: ITEM_SOUP, status: "Deleted" });
  check("an unknown status is refused (400)", badStatus.status === 400);
  const history = await open(jarStaff, LIST_A);
  check("the editor shows the recent history", history.json.history.length >= 4 && history.json.history.every((h) => h.event && h.at));
}

section("Cross-tenant access is refused everywhere");
{
  freshDb();
  const bOpensA = await open(jarB, LIST_A);
  check("tenant B cannot open tenant A's list (404, reveals nothing)", bOpensA.status === 404 && !JSON.stringify(bOpensA.json).includes("Retail A"));
  const bEditsA = await patch(jarB, LIST_A, { itemId: ITEM_PIE, price: 1 });
  const bRemovesA = await patch(jarB, LIST_A, { itemId: ITEM_PIE, status: "Inactive" });
  const bAddsA = await add(jarB, LIST_A, { productId: P_B, price: 1 });
  check("tenant B cannot edit, remove or add on tenant A's list (404)", [bEditsA, bRemovesA, bAddsA].every((r) => r.status === 404), [bEditsA, bRemovesA, bAddsA].map((r) => r.status).join(","));
  const aOpensB = await open(jarStaff, LIST_B);
  check("tenant A cannot open tenant B's list (404)", aOpensB.status === 404);
  const aAddsBProduct = await add(jarStaff, LIST_A, { productId: P_B, price: 5 });
  check("tenant A cannot put tenant B's product on its own list (404)", aAddsBProduct.status === 404 && itemsFor(LIST_A, P_B).length === 0);
  const aEditsBItem = await patch(jarStaff, LIST_A, { itemId: ITEM_B, price: 1 });
  check("tenant A cannot edit tenant B's item through its own list (404)", aEditsBItem.status === 404 && item(ITEM_B).final_price === 14);
  const wrongList = await patch(jarStaff, LIST_A, { itemId: ITEM_A2, price: 1 });
  check("an item must belong to the list in the path, even within one tenant (404)", wrongList.status === 404 && item(ITEM_A2).final_price === 50);
  const spoof = await add(jarStaff, LIST_A, { productId: P_TART, price: 60, companyId: CO_B, company_id: CO_B, priceListId: LIST_B });
  check("company / list ids in the body are ignored: the row lands in A's list", spoof.status === 201 && itemsFor(LIST_A, P_TART)[0]?.company_id === CO_A && itemsFor(LIST_B, P_TART).length === 0);
  check("tenant B's data is untouched by all of it", item(ITEM_B).final_price === 14 && item(ITEM_B).status === "Active" && db.tables.vyron_customer_price_list_items.filter((r) => r.company_id === CO_B).length === 1);

  // The older modes on /api/customer-price-lists used to accept any ids.
  const legacyItems = await legacy(jarStaff, { mode: "upsert_items", priceListId: LIST_B, items: [{ productId: P_PIE, overridePrice: 1 }] });
  check("upsert_items into another tenant's list is refused (404)", legacyItems.status === 404 && itemsFor(LIST_B, P_PIE).length === 0, JSON.stringify(legacyItems.json));
  const legacyAssignCustomer = await legacy(jarStaff, { mode: "assign", customerId: CUST_B, contractPriceListId: LIST_A });
  check("assign for another tenant's customer is refused (404)", legacyAssignCustomer.status === 404 && !db.tables.vyron_customer_price_list_assignments.some((a) => a.customer_id === CUST_B && a.company_id === CO_A));
  const legacyAssignList = await legacy(jarStaff, { mode: "assign", customerId: CUST_A, contractPriceListId: LIST_B });
  check("assigning another tenant's list is refused (404)", legacyAssignList.status === 404 && db.tables.vyron_customer_price_list_assignments.find((a) => a.id === "pla-a").contract_price_list_id === LIST_A);
  const legacyOwn = await legacy(jarStaff, { mode: "upsert_items", priceListId: LIST_A2, items: [{ productId: P_PIE, overridePrice: 33 }] });
  check("the older upsert_items still works on the tenant's own list", legacyOwn.status === 200 && itemsFor(LIST_A2, P_PIE)[0]?.final_price === 33);
  const lists = await call(jarStaff, listsRoute.GET, { url: "/api/customer-price-lists" });
  check("the list index shows only the tenant's own lists", lists.status === 200 && lists.json.lists.every((l) => l.company_id === CO_A) && lists.json.lists.length === 2);
}

section("Malformed and unknown ids are 404, never 500");
{
  freshDb();
  const BAD = "not-a-uuid";
  const UNKNOWN = uuid("e", 999);
  const openBad = await open(jarStaff, BAD);
  const addBad = await add(jarStaff, BAD, { productId: P_TART, price: 60 });
  const patchBad = await patch(jarStaff, BAD, { itemId: ITEM_PIE, price: 1 });
  check("malformed list id → 404 on open, add and edit", [openBad, addBad, patchBad].every((r) => r.status === 404), [openBad, addBad, patchBad].map((r) => r.status).join(","));
  const itemBad = await patch(jarStaff, LIST_A, { itemId: BAD, price: 1 });
  const itemBadStatus = await patch(jarStaff, LIST_A, { itemId: "'; drop table x; --", status: "Inactive" });
  check("malformed item id → 404 (price and status)", itemBad.status === 404 && itemBadStatus.status === 404, `${itemBad.status},${itemBadStatus.status}`);
  const productBad = await add(jarStaff, LIST_A, { productId: BAD, price: 60 });
  check("malformed product id → 404", productBad.status === 404, String(productBad.status));
  const unknownList = await open(jarStaff, UNKNOWN);
  const unknownItem = await patch(jarStaff, LIST_A, { itemId: UNKNOWN, price: 1 });
  const unknownProduct = await add(jarStaff, LIST_A, { productId: UNKNOWN, price: 60 });
  check("well-formed but nonexistent list / item / product → 404", [unknownList, unknownItem, unknownProduct].every((r) => r.status === 404), [unknownList, unknownItem, unknownProduct].map((r) => r.status).join(","));
  const crossList = await open(jarStaff, LIST_B);
  const crossItem = await patch(jarStaff, LIST_A, { itemId: ITEM_B, price: 1 });
  check("valid ids of another tenant → still 404", crossList.status === 404 && crossItem.status === 404);
  const legacyBadProduct = await legacy(jarStaff, { mode: "upsert_items", priceListId: LIST_A, items: [{ productId: BAD, overridePrice: 1 }] });
  const legacyBadList = await legacy(jarStaff, { mode: "upsert_items", priceListId: BAD, items: [{ productId: P_PIE, overridePrice: 1 }] });
  const legacyBadCustomer = await legacy(jarStaff, { mode: "assign", customerId: BAD, contractPriceListId: LIST_A });
  check("older modes: malformed product / list / customer id → 404", [legacyBadProduct, legacyBadList, legacyBadCustomer].every((r) => r.status === 404), [legacyBadProduct, legacyBadList, legacyBadCustomer].map((r) => r.status).join(","));
  check("…and nothing was written", audit().length === 0 && item(ITEM_PIE).final_price === 36 && item(ITEM_B).final_price === 14);
}

section("Partial saved permissions keep the role's defaults");
{
  freshDb();
  const noEditOpen = await open(jarNoEdit, LIST_A);
  const noEditPatch = await patch(jarNoEdit, LIST_A, { itemId: ITEM_PIE, price: 1 });
  check("saved { sales_orders.edit: false }: view is kept (200)", noEditOpen.status === 200, String(noEditOpen.status));
  check("…and the explicit deny still denies edit (403)", noEditPatch.status === 403 && item(ITEM_PIE).final_price === 36, String(noEditPatch.status));
  const exportOnlyOpen = await open(jarExportOnly, LIST_A);
  const exportOnlyPatch = await patch(jarExportOnly, LIST_A, { itemId: ITEM_PIE, price: 37 });
  check("saved { reports.export: true } only: the role's view and edit are kept", exportOnlyOpen.status === 200 && exportOnlyPatch.status === 200 && item(ITEM_PIE).final_price === 37, `${exportOnlyOpen.status},${exportOnlyPatch.status}`);
}

section("Customer ordering follows the list exactly");
{
  freshDb();
  const scope = { companyId: CO_A, customerId: CUST_A, customerName: "Retailer A" };
  const before = await shownTo(CUST_A);
  check("the customer sees exactly the list's products", before.map((p) => p.productId).sort().join() === [P_PIE, P_SOUP].sort().join());

  await patch(jarStaff, LIST_A, { itemId: ITEM_PIE, price: 39 });
  check("a staff price change is what the customer is offered", (await shownTo(CUST_A)).find((p) => p.productId === P_PIE)?.sellingPrice === 39);

  await patch(jarStaff, LIST_A, { itemId: ITEM_SOUP, status: "Inactive" });
  check("a removed product disappears from the customer's catalogue", !(await shownTo(CUST_A)).some((p) => p.productId === P_SOUP));
  const soupRefused = await cart.setCartLine(db, scope, { productId: P_SOUP, quantityUnits: 1 }).then(() => null, (e) => e);
  check("…and cannot be put in the cart", Boolean(soupRefused));

  await add(jarStaff, LIST_A, { productId: P_TART, price: 61 });
  check("an added product appears at the list price — not the master price (65)", (await shownTo(CUST_A)).find((p) => p.productId === P_TART)?.sellingPrice === 61);

  const offList = await cart.setCartLine(db, scope, { productId: P_OLD, quantityUnits: 1 }).then(() => null, (e) => e);
  const otherTenant = await cart.setCartLine(db, scope, { productId: P_B, quantityUnits: 1 }).then(() => null, (e) => e);
  check("a product off the list, or another tenant's, cannot be ordered by id", Boolean(offList) && Boolean(otherTenant));

  await cart.setCartLine(db, scope, { productId: P_PIE, quantityUnits: 2 });
  await cart.setCartDelivery(db, scope, { requestedDeliveryDate: TOMORROW });
  const cheap = await cart.submitCart(db, scope, { idempotencyKey: "cheap", acknowledgedPrices: [{ productId: P_PIE, sellingPrice: 1 }] });
  check("a browser-supplied price is refused (price_changed)", cheap.ok === false && cheap.reason === "price_changed");
  // The price moves after the customer saw it: the order is stopped, not written at the old price.
  const view = await cart.getCart(db, scope);
  await patch(jarStaff, LIST_A, { itemId: ITEM_PIE, price: 42 });
  const stale = await cart.submitCart(db, scope, { idempotencyKey: "stale", acknowledgedPrices: view.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })) });
  check("a price changed by staff after the customer saw it stops the order", stale.ok === false && stale.reason === "price_changed" && db.tables.vyron_customer_sales_orders.length === 0);
  const fresh = await cart.getCart(db, scope);
  const placed = await cart.submitCart(db, scope, { idempotencyKey: "good", acknowledgedPrices: fresh.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })) });
  const line = db.tables.vyron_customer_sales_order_lines[0];
  check("the order is written at the current list price", placed.ok === true && Number(line?.selling_price) === 42, JSON.stringify(line));

  const otherCustomer = await shownTo(CUST_B, CO_B);
  check("tenant B's customer still sees only tenant B's list", otherCustomer.map((p) => p.productId).join() === P_B && otherCustomer[0].sellingPrice === 14);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
