#!/usr/bin/env node
/**
 * VOLORA — Customer Ordering: a customer may see and order their price list,
 * and nothing else.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (2026-09-28)
 * ----------------------------------------------
 * The customer catalogue (GET /api/vyron-order/catalogue) listed every active
 * product in the tenant. Price lists only decided the PRICE: a product missing
 * from the customer's list was priced from the product master and could be
 * ordered (or, under "assigned_list_only", was still listed as unavailable).
 * Any customer could therefore see, and usually order, any stock item.
 *
 * Now a product reaches a customer only through their Active price-list
 * assignment -> an Active, in-date list -> an Active, effective item. The
 * catalogue, cart, favourites and usuals are built from that, and order
 * submission checks it again, independently, immediately before writing.
 *
 * Drives the REAL /api/vyron-order routes with real customer sign-in (synthetic
 * PINs), real session resolution and the real catalogue/cart/sales-order code.
 * Only the process boundary is replaced: an in-memory database and cookies.
 * FICTIONAL / NON-PRODUCTION. No network, no database, no credentials.
 *
 *   npm run test:customer-price-list-security
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-customer-price-list-security";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

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

// ---------------------------------------------------------------------------
// Two fictional companies. Company 1 has customers A and B on different lists.
// ---------------------------------------------------------------------------
const CO1 = "c1000000-0000-4000-8000-000000000001";
const CO2 = "c2000000-0000-4000-8000-000000000002";
const CUST_A = "ca000000-0000-4000-8000-00000000000a";
const CUST_B = "cb000000-0000-4000-8000-00000000000b";
const CUST_C = "cc000000-0000-4000-8000-00000000000c"; // company 2
const LIST_A = "1a000000-0000-4000-8000-00000000000a";
const LIST_B = "1b000000-0000-4000-8000-00000000000b";
const LIST_C = "1c000000-0000-4000-8000-00000000000c";
const P = {
  a: { id: "9a000000-0000-4000-8000-00000000000a", product_name: "Alpha Pie", sku: "QA-A", selling_price: 40, total_cost: 18 },
  b: { id: "9b000000-0000-4000-8000-00000000000b", product_name: "Bravo Tart", sku: "QA-B", selling_price: 60, total_cost: 25 },
  shared: { id: "95000000-0000-4000-8000-000000000005", product_name: "Shared Soup", sku: "QA-S", selling_price: 30, total_cost: 12 },
  // In stock, in the product master, on NO price list.
  stockOnly: { id: "90000000-0000-4000-8000-000000000009", product_name: "Warehouse Only Loaf", sku: "QA-X", selling_price: 20, total_cost: 8 },
  c: { id: "9c000000-0000-4000-8000-00000000000c", product_name: "Charlie Roll", sku: "QA-C", selling_price: 15, total_cost: 6 },
};
const LIST_PRICE = { a_a: 36, a_shared: 27, b_b: 55, b_shared: 25, c_c: 14 };
const PIN = { A: "482913", B: "715204", C: "360587" };
const TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

function seed() {
  const product = (co, p) => ({ ...p, company_id: co, category: "Bakery", status: "Active" });
  const stock = (co, p, qty) => ({ id: `si-${p.sku}`, company_id: co, entity_type: "finished_goods", entity_id: p.id, item_code: p.sku, qty_on_hand: qty, average_cost: p.total_cost, current_cost: p.total_cost, unit: "each" });
  const item = (co, list, p, price) => ({ id: `pli-${list.slice(0, 2)}-${p.sku}`, company_id: co, price_list_id: list, product_id: p.id, final_price: price, status: "Active", effective_from: "2026-01-01" });
  return {
    vyron_workspaces: [
      { id: "ws1", company_id: CO1, company_name: "QA Foods One (fictional)", default_vat_rate: 15 },
      { id: "ws2", company_id: CO2, company_name: "QA Foods Two (fictional)", default_vat_rate: 15 },
    ],
    vyron_customers: [
      { id: CUST_A, company_id: CO1, customer_name: "Customer A", status: "Active", active: true },
      { id: CUST_B, company_id: CO1, customer_name: "Customer B", status: "Active", active: true },
      { id: CUST_C, company_id: CO2, customer_name: "Customer C", status: "Active", active: true },
    ],
    vyron_cost_products: [product(CO1, P.a), product(CO1, P.b), product(CO1, P.shared), product(CO1, P.stockOnly), product(CO2, P.c)],
    vyron_cost_stock_items: [stock(CO1, P.a, 50), stock(CO1, P.b, 50), stock(CO1, P.shared, 50), stock(CO1, P.stockOnly, 500), stock(CO2, P.c, 50)],
    vyron_cost_stock_ledger: [],
    vyron_cost_low_stock_alerts: [],
    vyron_inventory_settings: [],
    vyron_cost_product_pack_sizes: [],
    vyron_cost_boms: [],
    vyron_customer_price_lists: [
      { id: LIST_A, company_id: CO1, name: "List A", status: "Active" },
      { id: LIST_B, company_id: CO1, name: "List B", status: "Active" },
      { id: LIST_C, company_id: CO2, name: "List C", status: "Active" },
    ],
    vyron_customer_price_list_versions: [],
    vyron_customer_price_list_assignments: [
      // A is on the historical default rule — which used to let off-list products through.
      { id: "pla-a", company_id: CO1, customer_id: CUST_A, contract_price_list_id: LIST_A, default_price_list_id: null, status: "Active", price_source_rule: "fallback_to_master" },
      { id: "pla-b", company_id: CO1, customer_id: CUST_B, contract_price_list_id: LIST_B, default_price_list_id: null, status: "Active", price_source_rule: "assigned_list_only" },
      { id: "pla-c", company_id: CO2, customer_id: CUST_C, contract_price_list_id: LIST_C, default_price_list_id: null, status: "Active" },
    ],
    vyron_customer_price_list_items: [
      item(CO1, LIST_A, P.a, LIST_PRICE.a_a),
      item(CO1, LIST_A, P.shared, LIST_PRICE.a_shared),
      item(CO1, LIST_B, P.b, LIST_PRICE.b_b),
      item(CO1, LIST_B, P.shared, LIST_PRICE.b_shared),
      item(CO2, LIST_C, P.c, LIST_PRICE.c_c),
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
    vyron_customer_order_favourites: [],
    vyron_customer_portal_tenants: [
      { company_id: CO1, slug: "qa-one", display_name: "QA Foods One", status: "Active" },
      { company_id: CO2, slug: "qa-two", display_name: "QA Foods Two", status: "Active" },
    ],
    vyron_customer_portal_identities: [],
    vyron_customer_portal_sessions: [],
    vyron_customer_portal_auth_events: [],
    vyron_order_notification_deliveries: [],
    vyron_order_notification_settings: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const auth = await importFromRoot("src/lib/vyron-order-customer-auth.ts");
const loginRoute = await importFromRoot("src/app/api/vyron-order/auth/login/route.ts");
const catalogueRoute = await importFromRoot("src/app/api/vyron-order/catalogue/route.ts");
const cartRoute = await importFromRoot("src/app/api/vyron-order/cart/route.ts");
const ordersRoute = await importFromRoot("src/app/api/vyron-order/orders/route.ts");
const favouritesRoute = await importFromRoot("src/app/api/vyron-order/favourites/route.ts");
const usualsRoute = await importFromRoot("src/app/api/vyron-order/usuals/route.ts");

globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: [], cookies: new Map(), headers: {} };
let db = null;
async function freshDb() {
  db = createFakeSupabase(seed(), { unique: { vyron_customer_order_submissions: [["company_id", "customer_id", "idempotency_key"]] } });
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  await auth.setCustomerPortalPin(db, CO1, { customerId: CUST_A, pin: PIN.A });
  await auth.setCustomerPortalPin(db, CO1, { customerId: CUST_B, pin: PIN.B });
  await auth.setCustomerPortalPin(db, CO2, { customerId: CUST_C, pin: PIN.C });
  // The database default for a new identity; the in-memory stand-in has no defaults.
  for (const identity of db.tables.vyron_customer_portal_identities) identity.status ??= "Active";
  return db;
}

/** Route tracing is verbose; keep the output to the checks. Safe under concurrency. */
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

async function http(jar, handler, { method = "GET", url, body, params } = {}) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new NextRequest(new URL(url, "http://qa.local"), init);
  const res = await quietly(() => (params ? handler(request, { params: Promise.resolve(params) }) : handler(request)));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

/** Sign in through the real login route and keep the session cookie it set. */
async function session(customerId, pin, tenant) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map();
  const request = new NextRequest(new URL("/api/vyron-order/auth/login", "http://qa.local"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerId, pin, tenant }) });
  const res = await quietly(() => loginRoute.POST(request));
  const token = res.cookies.get(auth.CUSTOMER_SESSION_COOKIE)?.value;
  return token ? { [auth.CUSTOMER_SESSION_COOKIE]: token } : null;
}

const getCatalogue = (jar, url = "/api/vyron-order/catalogue") => http(jar, catalogueRoute.GET, { url });
const addToCart = (jar, body) => http(jar, cartRoute.POST, { method: "POST", url: "/api/vyron-order/cart", body });
const getCartView = (jar) => http(jar, cartRoute.GET, { url: "/api/vyron-order/cart" });
const setDelivery = (jar) => http(jar, cartRoute.PATCH, { method: "PATCH", url: "/api/vyron-order/cart", body: { requestedDeliveryDate: TOMORROW } });
const submit = (jar, body) => http(jar, ordersRoute.POST, { method: "POST", url: "/api/vyron-order/orders", body });
const productIds = (catalogueJson) => (catalogueJson?.catalogue?.categories || []).flatMap((c) => c.products.map((p) => p.productId));
const productIn = (catalogueJson, id) => (catalogueJson?.catalogue?.categories || []).flatMap((c) => c.products).find((p) => p.productId === id);
const cartOf = (customerId) => db.tables.vyron_customer_order_carts.find((c) => c.customer_id === customerId);
const cartLinesOf = (customerId) => {
  const c = cartOf(customerId);
  return c ? db.tables.vyron_customer_order_cart_lines.filter((l) => l.cart_id === c.id) : [];
};
const ordersOf = (customerId) => db.tables.vyron_customer_sales_orders.filter((o) => o.customer_id === customerId);
const orderLines = () => db.tables.vyron_customer_sales_order_lines;
const acknowledge = (cartJson) => (cartJson?.cart?.lines || []).map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice }));


// ---------------------------------------------------------------------------
section("Unauthenticated requests reach no customer data");
{
  await freshDb();
  const results = await Promise.all([
    getCatalogue({}),
    getCartView({}),
    addToCart({}, { productId: P.a.id, quantityUnits: 1 }),
    submit({}, { idempotencyKey: "anon", acknowledgedPrices: [] }),
    http({}, favouritesRoute.GET, { url: "/api/vyron-order/favourites" }),
    http({}, usualsRoute.GET, { url: "/api/vyron-order/usuals" }),
    getCatalogue({ [auth.CUSTOMER_SESSION_COOKIE]: "forged-token" }),
  ]);
  check("catalogue, cart, add, submit, favourites, usuals, forged token → 401", results.every((r) => r.status === 401), results.map((r) => r.status).join(","));
  check("no response carries a product name", results.every((r) => !Object.values(P).some((p) => r.text.includes(p.product_name))));
  check("nothing was written", db.tables.vyron_customer_order_carts.length === 0 && db.tables.vyron_customer_sales_orders.length === 0);
}

// ---------------------------------------------------------------------------
section("Each customer sees their own price list, and nothing else");
let jarA, jarB, jarC;
{
  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  jarB = await session(CUST_B, PIN.B, "qa-one");
  jarC = await session(CUST_C, PIN.C, "qa-two");
  check("customers A, B and C sign in through the real login route", Boolean(jarA && jarB && jarC));

  const a = await getCatalogue(jarA);
  check("A: catalogue loads", a.status === 200 && a.json?.ok === true);
  check("A sees Product A — it is on Price List A", Boolean(productIn(a.json, P.a.id)));
  check("…at the List A price", productIn(a.json, P.a.id)?.sellingPrice === LIST_PRICE.a_a && productIn(a.json, P.a.id)?.priceSource === "contract");
  check("A sees the shared product at A's own price", productIn(a.json, P.shared.id)?.sellingPrice === LIST_PRICE.a_shared);
  check("A does NOT see Product B — it is only on Price List B", !productIn(a.json, P.b.id));
  check("A does NOT see the stock-only product (in inventory, on no list)", !productIn(a.json, P.stockOnly.id));
  check("A does NOT see another company's product", !productIn(a.json, P.c.id));
  check("A's catalogue is exactly List A", productIds(a.json).sort().join() === [P.a.id, P.shared.id].sort().join(), productIds(a.json).join());
  check("…and the response body names nothing else", ![P.b, P.stockOnly, P.c].some((p) => a.text.includes(p.id) || a.text.includes(p.product_name)));
  check("…and carries no cost", !/total_cost|cost|margin|\"gp\"/i.test(a.text.replace(/"customerName"[^,]*,/, "")));

  const b = await getCatalogue(jarB);
  check("B independently sees its own permitted products", productIds(b.json).sort().join() === [P.b.id, P.shared.id].sort().join(), productIds(b.json).join());
  check("B sees Product B at the List B price", productIn(b.json, P.b.id)?.sellingPrice === LIST_PRICE.b_b);
  check("B does not see Product A", !productIn(b.json, P.a.id));

  const c = await getCatalogue(jarC);
  check("C (another company) sees only its own list", productIds(c.json).join() === P.c.id);

  // "Search" is the customer app filtering the catalogue it was given; the
  // route takes no query at all, so a query naming Product B changes nothing.
  const probe = await getCatalogue(jarA, `/api/vyron-order/catalogue?q=${encodeURIComponent(P.b.product_name)}&productId=${P.b.id}&customerId=${CUST_B}&priceListId=${LIST_B}&companyId=${CO2}`);
  check("A cannot search/retrieve Product B through the catalogue API (query ignored)", probe.status === 200 && !productIn(probe.json, P.b.id) && !probe.text.includes(P.b.product_name));
  check("…nor switch to B's list, customer or another company by query", productIds(probe.json).sort().join() === [P.a.id, P.shared.id].sort().join());
}

// ---------------------------------------------------------------------------
section("A cannot put an unpermitted product in the cart");
{
  const tries = [
    ["Product B by its id", { productId: P.b.id, quantityUnits: 1 }],
    ["the stock-only product by its id", { productId: P.stockOnly.id, quantityUnits: 1 }],
    ["another company's product by its id", { productId: P.c.id, quantityUnits: 1 }],
    ["Product B while naming B's customer, list and company", { productId: P.b.id, quantityUnits: 1, customerId: CUST_B, priceListId: LIST_B, companyId: CO1, sellingPrice: 1 }],
  ];
  for (const [label, body] of tries) {
    const r = await addToCart(jarA, body);
    check(`A cannot add ${label}`, r.status === 400 && /not available/i.test(r.json?.error || ""), `${r.status} ${r.text.slice(0, 160)}`);
  }
  check("A's cart holds none of them", !cartLinesOf(CUST_A).some((l) => [P.b.id, P.stockOnly.id, P.c.id].includes(l.product_id)));
  check("B's cart was not touched by A's attempts", cartLinesOf(CUST_B).length === 0);

  const fav = await http(jarA, favouritesRoute.POST, { method: "POST", url: "/api/vyron-order/favourites", body: { productId: P.b.id } });
  check("A cannot favourite Product B", fav.status === 400 && db.tables.vyron_customer_order_favourites.length === 0);
}

// ---------------------------------------------------------------------------
section("Existing valid ordering still works — and every identifier comes from the session");
{
  const added = await addToCart(jarA, { productId: P.a.id, quantityUnits: 3, customerId: CUST_B, companyId: CO2, priceListId: LIST_B, sellingPrice: 1 });
  check("A adds Product A (spoofed customer/company/list/price fields in the body)", added.status === 200 && added.json?.cart?.lines?.length === 1);
  check("…the line is priced from List A, not the body", added.json?.cart?.lines?.[0]?.sellingPrice === LIST_PRICE.a_a);
  check("…and sits in A's own cart in A's company", cartOf(CUST_A)?.company_id === CO1 && cartLinesOf(CUST_A).length === 1 && !cartOf(CUST_B));
  await setDelivery(jarA);

  const cheap = await submit(jarA, { idempotencyKey: "a-cheap", acknowledgedPrices: [{ productId: P.a.id, sellingPrice: 1 }] });
  check("A cannot submit at a manually supplied price (409 price_changed)", cheap.status === 409 && cheap.json?.reason === "price_changed" && cheap.json?.priceChanges?.[0]?.now === LIST_PRICE.a_a);
  check("…and no order was created", ordersOf(CUST_A).length === 0);

  const cartView = await getCartView(jarA);
  const placed = await submit(jarA, {
    idempotencyKey: "a-good",
    acknowledgedPrices: acknowledge(cartView.json),
    // Every one of these must be ignored.
    customerId: CUST_B, companyId: CO2, workspaceId: "ws2", priceListId: LIST_B,
    lines: [{ productId: P.b.id, quantity: 99, sellingPrice: 1 }],
  });
  check("A places a valid order", placed.status === 200 && placed.json?.ok === true, placed.text.slice(0, 300));
  const order = ordersOf(CUST_A)[0];
  check("the order is A's, in A's company — not the customer/company in the body", Boolean(order) && order.company_id === CO1 && ordersOf(CUST_B).length === 0 && !db.tables.vyron_customer_sales_orders.some((o) => o.company_id === CO2));
  const lines = orderLines().filter((l) => l.sales_order_id === order?.id);
  check("the order holds only Product A, not the body's injected Product B", lines.length === 1 && lines[0].product_id === P.a.id && !orderLines().some((l) => l.product_id === P.b.id));
  check("…at the List A price", Number(lines[0]?.unit_price ?? lines[0]?.selling_price) === LIST_PRICE.a_a, JSON.stringify(lines[0]));
  check("stock is held for it (existing stock safety intact)", db.tables.vyron_customer_sales_order_allocations.some((x) => x.sales_order_id === order?.id && x.product_id === P.a.id));
  const replay = await submit(jarA, { idempotencyKey: "a-good", acknowledgedPrices: acknowledge(cartView.json) });
  check("replaying the same submission returns the same order, not a second one", replay.json?.order?.duplicate === true && ordersOf(CUST_A).length === 1);

  await addToCart(jarB, { productId: P.b.id, quantityUnits: 2 });
  await setDelivery(jarB);
  const bCart = await getCartView(jarB);
  const bPlaced = await submit(jarB, { idempotencyKey: "b-good", acknowledgedPrices: acknowledge(bCart.json) });
  check("B can independently order its own Product B", bPlaced.status === 200 && ordersOf(CUST_B).length === 1);
}

// ---------------------------------------------------------------------------
section("Submission refuses an unpermitted product even if it reaches the cart");
{
  // Simulate any other path getting a row into A's cart (a manipulated or
  // stale write): the product id alone must never make it orderable.
  for (const [label, product] of [
    ["Product B (another customer's list)", P.b],
    ["the stock-only product", P.stockOnly],
  ]) {
    await freshDb();
    jarA = await session(CUST_A, PIN.A, "qa-one");
    await addToCart(jarA, { productId: P.a.id, quantityUnits: 1 });
    await setDelivery(jarA);
    const cartRow = cartOf(CUST_A);
    db.tables.vyron_customer_order_cart_lines.push({ id: `tamper-${product.sku}`, cart_id: cartRow.id, company_id: CO1, product_id: product.id, quantity_units: 1, entry_mode: "units" });
    const view = await getCartView(jarA);
    check(`A's cart view marks ${label} unavailable, with no price`, view.json?.cart?.lines?.some((l) => l.productId === product.id && l.unavailable === true && l.sellingPrice === 0));
    const r = await submit(jarA, {
      idempotencyKey: `tamper-${product.sku}`,
      acknowledgedPrices: [{ productId: P.a.id, sellingPrice: LIST_PRICE.a_a }, { productId: product.id, sellingPrice: product.selling_price }],
    });
    check(`A cannot submit ${label} by supplying its product id`, r.status === 400 && r.json?.reason === "unavailable", `${r.status} ${r.text.slice(0, 200)}`);
    check("…no order, no order line, no stock held", db.tables.vyron_customer_sales_orders.length === 0 && orderLines().length === 0 && db.tables.vyron_customer_sales_order_allocations.length === 0);
  }
}

// ---------------------------------------------------------------------------
section("The list is the authority at the moment of ordering");
{
  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  await addToCart(jarA, { productId: P.a.id, quantityUnits: 1 });
  await setDelivery(jarA);
  const shown = await getCartView(jarA);
  // Product A leaves List A after the customer saw it.
  db.tables.vyron_customer_price_list_items.find((i) => i.price_list_id === LIST_A && i.product_id === P.a.id).status = "Inactive";
  const r = await submit(jarA, { idempotencyKey: "removed", acknowledgedPrices: acknowledge(shown.json) });
  check("a product removed from the list after it was carted cannot be ordered", r.status === 400 && r.json?.reason === "unavailable" && db.tables.vyron_customer_sales_orders.length === 0);
  check("…and it is gone from the catalogue", !productIn((await getCatalogue(jarA)).json, P.a.id));

  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  db.tables.vyron_customer_price_lists.find((l) => l.id === LIST_A).status = "Inactive";
  const off = await getCatalogue(jarA);
  check("an Inactive price list grants nothing", off.status === 200 && productIds(off.json).length === 0);

  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  db.tables.vyron_customer_price_list_items.find((i) => i.price_list_id === LIST_A && i.product_id === P.a.id).effective_to = "2026-01-31";
  check("an expired price-list item grants nothing", !productIn((await getCatalogue(jarA)).json, P.a.id));

  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  db.tables.vyron_customer_price_list_assignments.find((x) => x.id === "pla-a").status = "Inactive";
  const unassigned = await getCatalogue(jarA);
  check("a customer with no active price-list assignment is offered nothing", unassigned.status === 200 && productIds(unassigned.json).length === 0);
  const refused = await addToCart(jarA, { productId: P.a.id, quantityUnits: 1 });
  check("…and can order nothing — not even from the product master", refused.status === 400);

  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  db.tables.vyron_customer_order_favourites.push({ id: "fav-old", company_id: CO1, customer_id: CUST_A, product_id: P.stockOnly.id });
  const favs = await http(jarA, favouritesRoute.GET, { url: "/api/vyron-order/favourites" });
  check("a stale favourite for an unpermitted product is not returned", favs.status === 200 && !(favs.json?.favourites || []).includes(P.stockOnly.id));
}

// ---------------------------------------------------------------------------
section("Usuals come from history but never offer an unpermitted product");
{
  await freshDb();
  jarA = await session(CUST_A, PIN.A, "qa-one");
  const now = new Date().toISOString();
  for (let i = 1; i <= 3; i++) {
    db.tables.vyron_customer_sales_orders.push({ id: `hist-${i}`, company_id: CO1, customer_id: CUST_A, customer_name: "Customer A", order_number: `SO-H${i}`, status: "Completed", created_at: now, updated_at: now });
    db.tables.vyron_customer_sales_order_lines.push({ id: `hl-a-${i}`, company_id: CO1, sales_order_id: `hist-${i}`, product_id: P.a.id, description: P.a.product_name, quantity: 4 });
    db.tables.vyron_customer_sales_order_lines.push({ id: `hl-x-${i}`, company_id: CO1, sales_order_id: `hist-${i}`, product_id: P.stockOnly.id, description: P.stockOnly.product_name, quantity: 2 });
  }
  const usuals = await http(jarA, usualsRoute.GET, { url: "/api/vyron-order/usuals" });
  const ids = (usuals.json?.usuals || []).map((u) => u.productId);
  check("a permitted product A orders regularly is offered", usuals.status === 200 && ids.includes(P.a.id));
  check("a product A once bought but that is not on List A is not offered", !ids.includes(P.stockOnly.id) && !usuals.text.includes(P.stockOnly.product_name));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
