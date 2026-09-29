#!/usr/bin/env node
/**
 * VOLORA — Customer Price List report and Sales by Customer / Item / Date.
 *
 * Drives the REAL /api/reports/customer-price-list and
 * /api/reports/sales-by-customer-item routes (and the real price-list editor
 * route, cart and order submission) with the REAL workspace session,
 * membership, permission and company-resolution code. Only the process
 * boundary is replaced: cookies and an in-memory database. Two synthetic
 * tenants. FICTIONAL / NON-PRODUCTION — nothing here is real sales data.
 *
 * The central guarantee: sales are reported at the price RECORDED on the
 * transaction line. A customer is priced R100, buys at R100, the list moves to
 * R120 — the sale stays R100. Removing and restoring the item changes nothing.
 *
 * Family A: no network, no database, no credentials.
 *
 *   npm run test:customer-sales-reports
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
const U_STAFF = uuid("a", 10), U_NOREPORTS = uuid("a", 11), U_B = uuid("b", 10);
const L_CONTRACT = uuid("a", 20), L_DEFAULT = uuid("a", 21), L_B = uuid("b", 20);
const P1 = uuid("a", 30), P2 = uuid("a", 31), P3 = uuid("a", 32), PB = uuid("b", 30);
const C1 = uuid("a", 40), C2 = uuid("a", 41), C3 = uuid("a", 42), CB = uuid("b", 40);
const I_P1_CONTRACT = uuid("a", 50), I_P2_CONTRACT = uuid("a", 51), I_P1_DEFAULT = uuid("a", 52), I_P3_FUTURE = uuid("a", 53), I_P3_REMOVED = uuid("a", 54), I_B = uuid("b", 50);
const INV1 = uuid("a", 60), INV2 = uuid("a", 61), INV3 = uuid("a", 62), INV4 = uuid("a", 63), INVB = uuid("b", 60);
const SO_LINKED = uuid("a", 70);
const FUTURE = "2099-01-01";
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

const USERS = [
  { id: U_STAFF, email: "staff@qa-a.test", password: "qa-pass-staff" },
  { id: U_NOREPORTS, email: "noreports@qa-a.test", password: "qa-pass-noreports" },
  { id: U_B, email: "staff@qa-b.test", password: "qa-pass-b" },
];

const product = (id, co, name, sku, master) => ({ id, company_id: co, product_name: name, sku, selling_price: master, total_cost: 10, category: "Bakery", status: "Active" });
const stock = (co, id, sku) => ({ id: `si-${sku}`, company_id: co, entity_type: "finished_goods", entity_id: id, item_code: sku, qty_on_hand: 1000, average_cost: 10, current_cost: 10, unit: "each" });

const seed = () => ({
  vyron_workspaces: [
    { id: WS_A, company_id: CO_A, company_name: "QA Foods A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    { id: WS_B, company_id: CO_B, company_name: "QA Foods B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
  ],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS_A, user_id: U_STAFF, role: "SALES", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS_A, user_id: U_NOREPORTS, role: "SALES", status: "Active", permissions: { "reports.view": false } },
    { id: "m3", workspace_id: WS_B, user_id: U_B, role: "SALES", status: "Active", permissions: {} },
  ],
  vyron_customers: [
    { id: C1, company_id: CO_A, customer_name: "Alpha Deli", status: "Active", active: true },
    { id: C2, company_id: CO_A, customer_name: "Beta Cafe", status: "Active", active: true },
    { id: C3, company_id: CO_A, customer_name: "Gamma Store", status: "Active", active: true },
    { id: CB, company_id: CO_B, customer_name: "Tenant B Secret Customer", status: "Active", active: true },
  ],
  vyron_cost_products: [
    product(P1, CO_A, "Beef Pie", "A-PIE", 150),
    product(P2, CO_A, "Tomato Soup", "A-SOUP", 60),
    product(P3, CO_A, "Lemon Tart", "A-TART", 80),
    product(PB, CO_B, "Tenant B Secret Roll", "B-ROLL", 15),
  ],
  vyron_cost_stock_items: [stock(CO_A, P1, "A-PIE"), stock(CO_A, P2, "A-SOUP"), stock(CO_A, P3, "A-TART"), stock(CO_B, PB, "B-ROLL")],
  vyron_cost_stock_ledger: [],
  vyron_cost_low_stock_alerts: [],
  vyron_inventory_settings: [],
  vyron_cost_product_pack_sizes: [],
  vyron_cost_boms: [],
  vyron_customer_price_lists: [
    { id: L_CONTRACT, company_id: CO_A, list_name: "Deli Contract", list_type: "Contract", status: "Active", version: 2 },
    { id: L_DEFAULT, company_id: CO_A, list_name: "Standard Trade", list_type: "Standard", status: "Active", version: 1 },
    { id: L_B, company_id: CO_B, list_name: "Tenant B Secret List", list_type: "Contract", status: "Active", version: 1 },
  ],
  vyron_customer_price_list_versions: [],
  vyron_customer_price_list_audit_log: [],
  vyron_customer_price_list_assignments: [
    { id: "pla-1", company_id: CO_A, customer_id: C1, contract_price_list_id: L_CONTRACT, default_price_list_id: null, status: "Active" },
    { id: "pla-2", company_id: CO_A, customer_id: C2, contract_price_list_id: L_CONTRACT, default_price_list_id: L_DEFAULT, status: "Active" },
    { id: "pla-b", company_id: CO_B, customer_id: CB, contract_price_list_id: L_B, default_price_list_id: null, status: "Active" },
  ],
  vyron_customer_price_list_items: [
    { id: I_P1_CONTRACT, company_id: CO_A, price_list_id: L_CONTRACT, product_id: P1, final_price: 100, status: "Active", effective_from: "2026-01-01" },
    { id: I_P2_CONTRACT, company_id: CO_A, price_list_id: L_CONTRACT, product_id: P2, final_price: 50, status: "Active" },
    { id: I_P1_DEFAULT, company_id: CO_A, price_list_id: L_DEFAULT, product_id: P1, final_price: 110, status: "Active" },
    { id: I_P3_FUTURE, company_id: CO_A, price_list_id: L_DEFAULT, product_id: P3, final_price: 75, status: "Active", effective_from: FUTURE },
    { id: I_P3_REMOVED, company_id: CO_A, price_list_id: L_CONTRACT, product_id: P3, final_price: 70, status: "Inactive" },
    { id: I_B, company_id: CO_B, price_list_id: L_B, product_id: PB, final_price: 14, status: "Active" },
  ],
  vyron_customer_invoices: [
    { id: INV1, company_id: CO_A, customer_id: C1, customer_name: "Alpha Deli", invoice_number: "INV-0001", invoice_date: "2026-09-01", status: "Posted", stock_posted: true },
    { id: INV2, company_id: CO_A, customer_id: C2, customer_name: "Beta Cafe", invoice_number: "INV-0002", invoice_date: "2026-09-10", status: "Paid", stock_posted: true },
    { id: INV3, company_id: CO_A, customer_id: C1, customer_name: "Alpha Deli", invoice_number: "INV-0003", invoice_date: "2026-09-15", status: "Draft", stock_posted: false },
    { id: INV4, company_id: CO_A, customer_id: C1, customer_name: "Alpha Deli", invoice_number: "INV-0004", invoice_date: "2026-08-01", status: "Posted", stock_posted: true },
    { id: INVB, company_id: CO_B, customer_id: CB, customer_name: "Tenant B Secret Customer", invoice_number: "INV-B-SECRET", invoice_date: "2026-09-05", status: "Posted", stock_posted: true },
  ],
  // Recorded lines. line_total mirrors the generated column (quantity × price); taxable_amount is after discount.
  vyron_customer_invoice_lines: [
    { id: "il1", invoice_id: INV1, product_id: P1, product_name: "Beef Pie", quantity: 2, selling_price: 100, discount_percent: 0, taxable_amount: 200, line_total: 200 },
    { id: "il2", invoice_id: INV1, product_id: P2, product_name: "Tomato Soup", quantity: 1, selling_price: 50, discount_percent: 10, taxable_amount: 45, line_total: 50 },
    { id: "il3", invoice_id: INV2, product_id: P1, product_name: "Beef Pie", quantity: 3, selling_price: 95, discount_percent: 0, taxable_amount: 285, line_total: 285 },
    { id: "il4", invoice_id: INV3, product_id: P1, product_name: "Beef Pie", quantity: 10, selling_price: 100, discount_percent: 0, taxable_amount: 1000, line_total: 1000 },
    { id: "il5", invoice_id: INV4, product_id: P1, product_name: "Beef Pie", quantity: 1, selling_price: 90, discount_percent: 0, taxable_amount: null, line_total: 90 },
    { id: "ilb", invoice_id: INVB, product_id: PB, product_name: "Tenant B Secret Roll", quantity: 9, selling_price: 14, discount_percent: 0, taxable_amount: 126, line_total: 126 },
  ],
  vyron_customer_sales_orders: [
    { id: SO_LINKED, company_id: CO_A, order_number: "SO-0042", customer_id: C2, customer_name: "Beta Cafe", status: "Invoiced", created_at: "2026-09-09T08:00:00Z", updated_at: "2026-09-09T08:00:00Z" },
  ],
  vyron_customer_sales_order_lines: [
    { id: "sol-linked", company_id: CO_A, sales_order_id: SO_LINKED, product_id: P1, description: "Beef Pie", quantity: 3, selling_price: 95, discount_pct: 0, tax_rate: 15, line_total: 327.75 },
  ],
  vyron_customer_sales_order_invoice_links: [{ id: "link-1", company_id: CO_A, sales_order_id: SO_LINKED, invoice_id: INV2 }],
  vyron_customer_sales_order_allocations: [],
  vyron_customer_sales_order_audit: [],
  vyron_customer_branches: [],
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
const priceListReportRoute = await importFromRoot("src/app/api/reports/customer-price-list/route.ts");
const salesReportRoute = await importFromRoot("src/app/api/reports/sales-by-customer-item/route.ts");
const editorRoute = await importFromRoot("src/app/api/customer-price-lists/[id]/route.ts");
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
async function get(jar, handler, pathAndQuery) {
  setCookieJar(jar);
  const res = await quietly(() => handler(new NextRequest(new URL(pathAndQuery, "http://qa.local"))));
  const raw = await res.text();
  let json = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  return { status: res.status, json, raw };
}
async function editor(jar, method, id, body) {
  setCookieJar(jar);
  const req = new NextRequest(new URL(`/api/customer-price-lists/${id}`, "http://qa.local"), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const res = await quietly(() => editorRoute[method](req, { params: Promise.resolve({ id }) }));
  return { status: res.status, json: await res.json().catch(() => null) };
}
const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
const priceReport = (jar, params = {}) => get(jar, priceListReportRoute.GET, `/api/reports/customer-price-list?${qs(params)}`);
const salesReport = (jar, params = {}) => get(jar, salesReportRoute.GET, `/api/reports/sales-by-customer-item?${qs(params)}`);
const rowFor = (report, customerId, productId, listId) => report.rows.find((r) => r.customerId === customerId && r.productId === productId && (!listId || r.priceListId === listId));
const leaksTenantB = (raw) => ["Tenant B Secret", "INV-B-SECRET", CO_B, CB, PB, L_B, "B-ROLL"].some((s) => raw.includes(s));

const jarStaff = await login("staff@qa-a.test", "qa-pass-staff");
const jarNoReports = await login("noreports@qa-a.test", "qa-pass-noreports");
const jarB = await login("staff@qa-b.test", "qa-pass-b");
check("synthetic members sign in through the real login route", [jarStaff, jarNoReports, jarB].every((j) => Boolean(j.vyron_workspace_user_session)));

/* ======================================================= PRICE LIST REPORT */

section("Customer Price List report — permission and tenant");
{
  freshDb();
  const anon = await priceReport({});
  check("anonymous → refused (401/403)", anon.status === 401 || anon.status === 403, String(anon.status));
  const denied = await priceReport(jarNoReports);
  check("a member without reports.view → 403", denied.status === 403, String(denied.status));
  const r = await priceReport(jarStaff);
  check("staff with reports.view → 200", r.status === 200 && r.json?.ok === true, r.raw.slice(0, 200));
  check("only tenant A data, and nothing of tenant B anywhere in the response", r.json.report.rows.every((row) => [C1, C2, C3].includes(row.customerId)) && !leaksTenantB(r.raw));
  const b = await priceReport(jarB);
  check("tenant B sees only its own customer, list and product", b.json.report.rows.length === 1 && b.json.report.rows[0].customerId === CB && b.json.report.rows[0].listPrice === 14 && !b.raw.includes("Alpha Deli"));
  for (const [label, params] of [
    ["customer", { customerId: CB }],
    ["price list", { priceListId: L_B }],
    ["product", { productId: PB }],
  ]) {
    const x = await priceReport(jarStaff, params);
    check(`tenant A filtering by tenant B's ${label} id → 404, reveals nothing`, x.status === 404 && !leaksTenantB(x.raw), `${x.status} ${x.raw.slice(0, 120)}`);
  }
  for (const [label, params] of [
    ["malformed customer id", { customerId: "not-a-uuid" }],
    ["malformed price-list id", { priceListId: "1; drop table x" }],
    ["malformed product id", { productId: "abc" }],
    ["nonexistent customer id", { customerId: uuid("e", 991) }],
    ["nonexistent price-list id", { priceListId: uuid("e", 992) }],
    ["nonexistent product id", { productId: uuid("e", 993) }],
  ]) {
    const x = await priceReport(jarStaff, params);
    check(`price-list report: ${label} → 404, never 500`, x.status === 404, `${x.status} ${x.raw.slice(0, 120)}`);
  }
  const bad = await priceReport(jarStaff, { asOf: "28/09/2026" });
  check("an invalid date is refused (400)", bad.status === 400);
}

section("Customer Price List report — the price each customer is entitled to");
{
  freshDb();
  const r = (await priceReport(jarStaff)).json.report;
  check("default view is 'entitled today'", r.status === "entitled" && r.rows.every((row) => row.entitled));
  check("Alpha Deli: Beef Pie at the contract price R100", rowFor(r, C1, P1)?.listPrice === 100 && rowFor(r, C1, P1)?.priceListName === "Deli Contract" && rowFor(r, C1, P1)?.version === 2);
  check("Beta Cafe (contract + default): Beef Pie at the contract R100, not the default R110", r.rows.filter((row) => row.customerId === C2 && row.productId === P1).length === 1 && rowFor(r, C2, P1)?.listPrice === 100);
  check("a removed item and a not-yet-effective item are not entitled today", !rowFor(r, C1, P3) && !rowFor(r, C2, P3));
  check("the entitled prices are exactly what the order catalogue offers", await (async () => {
    for (const cid of [C1, C2]) {
      const offered = (await catalogue.getCustomerCatalogue(db, CO_A, cid)).categories.flatMap((c) => c.products);
      const reported = r.rows.filter((row) => row.customerId === cid);
      if (offered.length !== reported.length) return false;
      for (const p of offered) if (reported.find((row) => row.productId === p.productId)?.listPrice !== p.sellingPrice) return false;
    }
    return true;
  })());
  check("the customer without a price list is counted", r.summary.activeCustomersWithoutPriceList === 1 && !r.rows.some((row) => row.customerId === C3));

  const all = (await priceReport(jarStaff, { status: "all" })).json.report;
  const superseded = rowFor(all, C2, P1, L_DEFAULT);
  check("'All' shows the default-list row, marked as superseded by the contract", superseded && !superseded.entitled && superseded.note === "Superseded by contract price" && superseded.listPrice === 110);
  check("'All' shows the removed item, marked removed", rowFor(all, C1, P3, L_CONTRACT)?.note === "Removed from list");
  check("'All' shows the future item, marked not yet effective", rowFor(all, C2, P3, L_DEFAULT)?.note === "Not yet effective");

  const inactive = (await priceReport(jarStaff, { status: "inactive" })).json.report;
  check("'Inactive' shows only removed items", inactive.rows.length > 0 && inactive.rows.every((row) => row.itemStatus !== "Active"));
  const asOfFuture = (await priceReport(jarStaff, { asOf: FUTURE })).json.report;
  check("judged as at the item's start date, the future item becomes entitled", rowFor(asOfFuture, C2, P3)?.entitled === true && rowFor(asOfFuture, C2, P3)?.listPrice === 75);
  const range = (await priceReport(jarStaff, { status: "all", effectiveTo: "2030-12-31" })).json.report;
  check("an effective-date range excludes items that start after it", !rowFor(range, C2, P3, L_DEFAULT) && Boolean(rowFor(range, C1, P1)));

  const byCustomer = (await priceReport(jarStaff, { customerId: C1 })).json.report;
  check("customer filter", byCustomer.rows.length > 0 && byCustomer.rows.every((row) => row.customerId === C1));
  const byList = (await priceReport(jarStaff, { priceListId: L_DEFAULT, status: "all" })).json.report;
  check("price-list filter", byList.rows.length > 0 && byList.rows.every((row) => row.priceListId === L_DEFAULT));
  const byProduct = (await priceReport(jarStaff, { productId: P2 })).json.report;
  check("product filter", byProduct.rows.length > 0 && byProduct.rows.every((row) => row.productId === P2));
  const bySku = (await priceReport(jarStaff, { search: "a-soup" })).json.report;
  check("SKU search", bySku.rows.length > 0 && bySku.rows.every((row) => row.sku === "A-SOUP"));
  check("filter options are tenant A's only", r.options.customers.every((o) => [C1, C2, C3].includes(o.id)) && r.options.priceLists.every((o) => [L_CONTRACT, L_DEFAULT].includes(o.id)));

  await editor(jarStaff, "PATCH", L_CONTRACT, { itemId: I_P1_CONTRACT, price: 105 });
  const after = (await priceReport(jarStaff, { customerId: C1 })).json.report;
  check("after a staff price change the report shows the current price", rowFor(after, C1, P1)?.listPrice === 105);
}

/* ============================================================ SALES REPORT */

section("Sales report — permission and tenant");
{
  freshDb();
  const anon = await salesReport({}, { from: "2026-09-01", to: "2026-09-30" });
  check("anonymous → refused (401/403)", anon.status === 401 || anon.status === 403, String(anon.status));
  const denied = await salesReport(jarNoReports, { from: "2026-09-01", to: "2026-09-30" });
  check("a member without reports.view → 403", denied.status === 403);
  const r = await salesReport(jarStaff, { from: "2026-01-01", to: "2026-12-31", status: "all" });
  check("staff → 200", r.status === 200 && r.json?.ok === true, r.raw.slice(0, 200));
  check("only tenant A's invoices; nothing of tenant B anywhere in the response", r.json.report.lines.every((l) => [INV1, INV2, INV3, INV4].includes(l.transactionId)) && !leaksTenantB(r.raw));
  const b = await salesReport(jarB, { from: "2026-01-01", to: "2026-12-31" });
  check("tenant B sees only its own sale", b.json.report.lines.length === 1 && b.json.report.lines[0].reference === "INV-B-SECRET" && !b.raw.includes("Alpha Deli"));
  for (const [label, params] of [["customer", { customerId: CB }], ["product", { productId: PB }]]) {
    const x = await salesReport(jarStaff, params);
    check(`tenant A filtering by tenant B's ${label} id → 404, reveals nothing`, x.status === 404 && !leaksTenantB(x.raw));
  }
  for (const [label, params] of [
    ["malformed customer id", { customerId: "not-a-uuid" }],
    ["malformed product id", { productId: "abc" }],
    ["nonexistent customer id", { customerId: uuid("e", 994) }],
    ["nonexistent product id", { productId: uuid("e", 995) }],
  ]) {
    const x = await salesReport(jarStaff, params);
    check(`sales report: ${label} → 404, never 500`, x.status === 404, `${x.status} ${x.raw.slice(0, 120)}`);
  }
  const badDate = await salesReport(jarStaff, { from: "2026-13-45" });
  const reversed = await salesReport(jarStaff, { from: "2026-09-30", to: "2026-09-01" });
  check("invalid or reversed dates are refused (400)", badDate.status === 400 && reversed.status === 400);
}

section("Sales report — figures from the recorded lines");
{
  freshDb();
  const r = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30" })).json.report;
  check("date range + default 'posted' status: INV-0001 and INV-0002 only (draft and August excluded)", [...new Set(r.lines.map((l) => l.reference))].sort().join() === "INV-0001,INV-0002");
  check("quantity total", r.summary.totalQuantity === 6);
  check("sales value total uses recorded line values (after the 10% discount)", r.summary.totalValue === 530, String(r.summary.totalValue));
  check("transactions counted", r.summary.transactions === 2 && r.summary.lines === 3);
  check("average selling price is withheld across several products", r.summary.averageSellingPrice === null);
  const soup = r.lines.find((l) => l.productId === P2);
  check("each line keeps its recorded unit price, discount and value", soup.unitPrice === 50 && soup.discountPct === 10 && soup.lineValue === 45 && soup.quantity === 1);
  const inv2 = r.lines.find((l) => l.reference === "INV-0002");
  check("the linked sales order reference is shown", inv2.orderReference === "SO-0042");
  check("SKU comes from the tenant's product record", r.lines.every((l) => l.sku && l.sku.startsWith("A-")));

  const c1 = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30", customerId: C1 })).json.report;
  check("customer filter", c1.lines.length === 2 && c1.lines.every((l) => l.customerId === C1));
  const pie = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30", productId: P1 })).json.report;
  check("item filter: quantity 5, value 485", pie.summary.totalQuantity === 5 && pie.summary.totalValue === 485);
  check("one item: average selling price = value ÷ quantity (97)", pie.summary.averageSellingPrice === 97);
  const sku = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30", search: "A-SOUP" })).json.report;
  check("SKU search", sku.lines.length === 1 && sku.lines[0].productId === P2);
  const allStatuses = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30", status: "all" })).json.report;
  check("'All invoices' includes the draft", allStatuses.lines.some((l) => l.reference === "INV-0003"));
  const draftOnly = (await salesReport(jarStaff, { from: "2026-09-01", to: "2026-09-30", status: "Draft" })).json.report;
  check("a specific status filter", draftOnly.lines.length === 1 && draftOnly.lines[0].reference === "INV-0003");
  const august = (await salesReport(jarStaff, { from: "2026-08-01", to: "2026-08-31" })).json.report;
  check("an older line without taxable_amount falls back to its recorded line_total", august.lines.length === 1 && august.lines[0].lineValue === 90 && august.lines[0].unitPrice === 90);

  const alpha = r.byCustomer.find((c) => c.customerId === C1);
  check("Customer → Items: Alpha Deli R245 over 2 items", alpha.value === 245 && alpha.items.length === 2 && alpha.items.find((i) => i.productId === P1).quantity === 2);
  const pieGroup = r.byProduct.find((p) => p.productId === P1);
  check("Item → Customers: Beef Pie R485 over 2 customers, each at their own recorded price", pieGroup.value === 485 && pieGroup.customers.length === 2 && pieGroup.customers.find((c) => c.customerId === C2).averagePrice === 95 && pieGroup.customers.find((c) => c.customerId === C1).averagePrice === 100);
  check("groups carry their dates", alpha.firstDate === "2026-09-01" && alpha.lastDate === "2026-09-01");
  check("filter options: tenant A customers; items sold in the period", r.options.customers.every((o) => [C1, C2, C3].includes(o.id)) && r.options.products.map((o) => o.id).sort().join() === [P1, P2].sort().join());

  const orders = (await salesReport(jarStaff, { source: "orders", from: "2026-09-01", to: "2026-09-30" })).json.report;
  check("sales-order source: recorded order lines, value excluding VAT", orders.lines.length === 1 && orders.lines[0].reference === "SO-0042" && orders.lines[0].unitPrice === 95 && orders.lines[0].lineValue === 285);
}

section("Historical price: R100 today, sold at R100, list moves to R120 — the sale stays R100");
{
  freshDb();
  // 1. Alpha Deli's price for Beef Pie is R100 today.
  const offered = (await catalogue.getCustomerCatalogue(db, CO_A, C1)).categories.flatMap((c) => c.products).find((p) => p.productId === P1);
  check("1. the customer's price today is R100", offered?.sellingPrice === 100);

  // 2. A sale is recorded at R100: a real customer order through the real cart and submission,
  //    and the matching invoice line as recorded.
  const scope = { companyId: CO_A, customerId: C1, customerName: "Alpha Deli" };
  await cart.setCartLine(db, scope, { productId: P1, quantityUnits: 4 });
  await cart.setCartDelivery(db, scope, { requestedDeliveryDate: TOMORROW });
  const view = await cart.getCart(db, scope);
  const placed = await cart.submitCart(db, scope, { idempotencyKey: "hist-1", acknowledgedPrices: view.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })) });
  check("2. the order is placed at R100", placed.ok === true, JSON.stringify(placed));
  const invHist = uuid("a", 99);
  db.tables.vyron_customer_invoices.push({ id: invHist, company_id: CO_A, customer_id: C1, customer_name: "Alpha Deli", invoice_number: "INV-HIST", invoice_date: TODAY, status: "Posted", stock_posted: true });
  db.tables.vyron_customer_invoice_lines.push({ id: "il-hist", invoice_id: invHist, product_id: P1, product_name: "Beef Pie", quantity: 4, selling_price: 100, discount_percent: 0, taxable_amount: 400, line_total: 400 });

  const orderSale = async () => (await salesReport(jarStaff, { source: "orders", from: TODAY, to: TODAY, customerId: C1 })).json.report;
  const invoiceSale = async () => (await salesReport(jarStaff, { from: TODAY, to: TODAY, customerId: C1 })).json.report;
  const before = { order: await orderSale(), invoice: await invoiceSale() };
  check("the sales report shows the order at R100 × 4 = R400", before.order.lines.length === 1 && before.order.lines[0].unitPrice === 100 && before.order.summary.totalValue === 400);
  check("the sales report shows the invoice at R100 × 4 = R400", before.invoice.lines.length === 1 && before.invoice.lines[0].unitPrice === 100 && before.invoice.summary.totalValue === 400);

  // 3. The price list is changed to R120 through the real editor route.
  const changed = await editor(jarStaff, "PATCH", L_CONTRACT, { itemId: I_P1_CONTRACT, price: 120 });
  check("3. staff change the list price to R120", changed.status === 200 && db.tables.vyron_customer_price_list_items.find((i) => i.id === I_P1_CONTRACT).final_price === 120);
  check("…the customer is now offered R120", (await catalogue.getCustomerCatalogue(db, CO_A, C1)).categories.flatMap((c) => c.products).find((p) => p.productId === P1)?.sellingPrice === 120);
  check("…and the price list report shows R120", rowFor((await priceReport(jarStaff, { customerId: C1 })).json.report, C1, P1)?.listPrice === 120);

  // 4. The historical sale is unchanged.
  const afterChange = { order: await orderSale(), invoice: await invoiceSale() };
  check("4. the sales report still shows the order at R100 (R400)", afterChange.order.lines[0].unitPrice === 100 && afterChange.order.summary.totalValue === 400);
  check("4. the sales report still shows the invoice at R100 (R400)", afterChange.invoice.lines[0].unitPrice === 100 && afterChange.invoice.summary.totalValue === 400);

  // Removing and restoring the item changes no historical sale either.
  await editor(jarStaff, "PATCH", L_CONTRACT, { itemId: I_P1_CONTRACT, status: "Inactive" });
  const removed = { order: await orderSale(), invoice: await invoiceSale() };
  await editor(jarStaff, "PATCH", L_CONTRACT, { itemId: I_P1_CONTRACT, status: "Active" });
  const restored = { order: await orderSale(), invoice: await invoiceSale() };
  check("removing the price-list item leaves the sales unchanged", JSON.stringify(removed.order.lines) === JSON.stringify(before.order.lines) && JSON.stringify(removed.invoice.lines) === JSON.stringify(before.invoice.lines));
  check("restoring it leaves the sales unchanged", JSON.stringify(restored.order.lines) === JSON.stringify(before.order.lines) && JSON.stringify(restored.invoice.lines) === JSON.stringify(before.invoice.lines));
  const older = (await salesReport(jarStaff, { from: "2026-08-01", to: "2026-09-30" })).json.report.lines.filter((l) => ["INV-0001", "INV-0002", "INV-0004"].includes(l.reference));
  check("older sales are untouched too (INV-0001/0002/0004 still R620)", Math.round(older.reduce((s, l) => s + l.lineValue, 0) * 100) === 62000, String(older.reduce((s, l) => s + l.lineValue, 0)));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
