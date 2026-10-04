#!/usr/bin/env node
/**
 * VOLORA online-store sales sync — WooCommerce connector regression.
 *
 * Drives the real src/lib/store-sales engine with its WooCommerce connector,
 * the real invoice pipeline (createCustomerInvoice, postCustomerInvoiceStock,
 * the VAT engine, the stock ledger), the real matching ladders, the real
 * WooCommerce webhook and scheduled-run routes and the real GP / sales reports —
 * against an in-memory database and a fake WooCommerce REST API (wc/v3).
 * No live store, no network, no real tenant data.
 *
 *   node scripts/test-store-sales-woocommerce.mjs
 */
import { register } from "node:module";
import { createHmac } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-store-sales-woo";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

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
const section = (title) => console.log(`\n${title}`);
async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const service = await importFromRoot("src/lib/store-sales/service.ts");
const { storeRuntime } = await importFromRoot("src/lib/store-sales/runtime.ts");
const { loadStoreCredentials, canonicalWooUrl } = await importFromRoot("src/lib/store-sales/credentials.ts");
const { normalizeWooOrder } = await importFromRoot("src/lib/store-sales/woocommerce/normalize.ts");
const { wooCommerceConnector } = await importFromRoot("src/lib/store-sales/woocommerce/connector.ts");
const { verifyHmacBase64, wooOrderIdFromWebhook, isWooPing } = await importFromRoot("src/lib/store-sales/webhooks.ts");
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");
const { getSalesByCustomerItemReport } = await importFromRoot("src/lib/vyron-customer-sales-reports.ts");
const webhookRoute = await importFromRoot("src/app/api/integrations/woocommerce/webhooks/route.ts");
const cronRoute = await importFromRoot("src/app/api/integrations/store-sales/cron/route.ts");

// ---------------------------------------------------------------------------
// Synthetic tenants
// ---------------------------------------------------------------------------
const CO = "11111111-1111-4111-8111-111111111111";
const CO_B = "22222222-2222-4222-8222-222222222222";
const STORE = "https://shop.synthetic-foods.test";
const CK = "ck_test_not_real";
const CS = "cs_test_not_real";
const WEBHOOK_SECRET = "woo-webhook-secret-not-real";
const ADMIN = "user-admin";

const seed = () => ({
  vyron_workspaces: [
    { id: "ws-a", company_id: CO, company_name: "Synthetic Foods A", default_vat_rate: 15 },
    { id: "ws-b", company_id: CO_B, company_name: "Synthetic Foods B", default_vat_rate: 15 },
  ],
  vyron_customers: [
    { id: "c-web", company_id: CO, customer_name: "Web Store Sales", status: "Active", total_sales: 0, invoice_count: 0 },
    { id: "c-jane", company_id: CO, customer_name: "Jane Buyer", email: "jane@example.test", status: "Active", total_sales: 0, invoice_count: 0 },
    { id: "c-twin1", company_id: CO, customer_name: "Twin One", email: "shared@example.test", status: "Active" },
    { id: "c-twin2", company_id: CO, customer_name: "Twin Two", email: "shared@example.test", status: "Active" },
    { id: "c-b", company_id: CO_B, customer_name: "Jane Buyer", email: "jane@example.test", status: "Active" },
  ],
  vyron_cost_products: [
    { id: "p-pie", company_id: CO, product_name: "Steak Pie 150g", sku: "PIE-150", selling_price: 100, total_cost: 40 },
    { id: "p-chut", company_id: CO, product_name: "Fig Chutney", sku: "CHUT-01", selling_price: 50, total_cost: 20 },
    { id: "p-b", company_id: CO_B, product_name: "Steak Pie 150g", sku: "PIE-150", selling_price: 100, total_cost: 40 },
  ],
  vyron_cost_stock_items: [
    { id: "si-pie", company_id: CO, entity_type: "finished_goods", entity_id: "p-pie", item_code: "PIE-150", qty_on_hand: 10, average_cost: 40, current_cost: 40, unit: "each" },
    { id: "si-chut", company_id: CO, entity_type: "finished_goods", entity_id: "p-chut", item_code: "CHUT-01", qty_on_hand: 5, average_cost: 20, current_cost: 20, unit: "each" },
  ],
  // The chutney is sold in WooCommerce under its own SKU; a person mapped its variation.
  vyron_import_source_links: [
    { id: "link-chut", company_id: CO, source_system: "woocommerce:shop-synthetic-foods-test", source_entity: "product", source_key: "variation:9002", entity_type: "product", entity_id: "p-chut" },
  ],
});

const UNIQUE = {
  vyron_customer_invoices: [["invoice_number"]],
  vyron_store_connections: [["channel", "store_url"], ["company_id", "channel", "store_key"]],
  vyron_store_orders: [["company_id", "connection_id", "external_order_id"]],
  vyron_store_refunds: [["company_id", "connection_id", "external_refund_id"]],
  vyron_store_webhook_deliveries: [["connection_id", "delivery_id"]],
  vyron_store_backfills: [{ columns: ["connection_id"], where: (row) => row.status === "RUNNING" }],
  vyron_import_source_links: [["company_id", "source_system", "source_entity", "source_key"]],
};

// ---------------------------------------------------------------------------
// Fake WooCommerce REST API (wc/v3)
// ---------------------------------------------------------------------------
const woo = { orders: new Map(), refunds: new Map(), failNext: [], calls: [], pageSize: null, html: false };
let credentialCompany = CO;
let queryStringAuth = false;

const money = (n) => Number(n).toFixed(2);
function line({ id, sku = null, name, quantity, productId = 500 + id, variationId = 0, unit, discount = 0, rate = 15 }) {
  const subtotal = unit * quantity;
  const total = subtotal - discount;
  const tax = Math.round(total * rate) / 100;
  return {
    id,
    name,
    product_id: productId,
    variation_id: variationId,
    quantity,
    subtotal: money(subtotal),
    subtotal_tax: money(Math.round(subtotal * rate) / 100),
    total: money(total),
    total_tax: money(tax),
    taxes: rate ? [{ id: 1, total: money(tax), subtotal: money(Math.round(subtotal * rate) / 100) }] : [],
    sku,
    price: total / quantity,
    meta_data: [],
  };
}
function shipping(title, amount, rate = 15) {
  const tax = Math.round(amount * rate) / 100;
  return { id: 70, method_title: title, total: money(amount), total_tax: money(tax), taxes: rate ? [{ id: 1, total: money(tax) }] : [] };
}
function order(id, overrides = {}) {
  const lines = overrides.lines || [];
  const ship = overrides.shipping || [];
  const fees = overrides.fees || [];
  const ex = lines.reduce((t, l) => t + Number(l.total), 0) + ship.reduce((t, s) => t + Number(s.total), 0) + fees.reduce((t, f) => t + Number(f.total), 0);
  const tax = lines.reduce((t, l) => t + Number(l.total_tax), 0) + ship.reduce((t, s) => t + Number(s.total_tax), 0) + fees.reduce((t, f) => t + Number(f.total_tax || 0), 0);
  return {
    id,
    number: String(overrides.number ?? id),
    status: overrides.status || "processing",
    currency: overrides.currency || "ZAR",
    date_created: overrides.dateCreated || "2026-10-02T23:30:00",
    date_created_gmt: overrides.dateCreatedGmt || "2026-10-02T21:30:00",
    date_modified_gmt: overrides.modifiedGmt || "2026-10-02T21:30:00",
    prices_include_tax: true,
    customer_id: overrides.customerId ?? 77,
    billing: { first_name: "Jane", last_name: "Buyer", company: "", email: overrides.email ?? "jane@example.test" },
    total: money(overrides.total ?? ex + tax),
    total_tax: money(tax),
    line_items: lines,
    tax_lines: overrides.taxLines || [{ id: 99, rate_id: 1, label: "VAT", rate_percent: 15 }],
    shipping_lines: ship,
    fee_lines: fees,
    refunds: (overrides.refundIds || []).map((r) => ({ id: r, total: `-${money(woo.refunds.get(String(r))?.amount ?? 0)}` })),
    backfill: overrides.backfill || false,
  };
}
// The standard fixture (WooCommerce amounts are ex-VAT, VAT beside them):
//   2 × Steak Pie @ 100.00                      = 200.00 + VAT 30.00
//   1 × Fig Chutney @ 50.00 less 10.00 coupon   =  40.00 + VAT  6.00  (variation 9002 mapped; WooCommerce SKU differs)
//   Courier                                     =  60.00 + VAT  9.00
//   Total 345.00, VAT 45.00, ex-VAT 300.00
const standardOrder = (id, overrides = {}) =>
  order(id, {
    lines: [
      line({ id: 11, sku: "PIE-150", name: "Steak Pie 150g", quantity: 2, unit: 100 }),
      line({ id: 12, sku: "CH-WOO", name: "Fig Chutney", quantity: 1, productId: 600, variationId: 9002, unit: 50, discount: 10 }),
    ],
    shipping: [shipping("Courier", 60)],
    ...overrides,
  });
function refund(id, { lines = [], amount, reason = "Damaged" }) {
  return {
    id,
    date_created: "2026-10-03T10:00:00",
    date_created_gmt: "2026-10-03T08:00:00",
    amount: money(amount),
    reason,
    line_items: lines.map((l, i) => ({
      id: 9900 + i,
      quantity: -l.quantity,
      total: money(-l.total),
      total_tax: money(-l.tax),
      meta_data: [{ key: "_refunded_item_id", value: String(l.lineId) }],
    })),
  };
}

const respond = (status, body, headers = {}) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

storeRuntime.credentials = (channel, storeUrl) =>
  channel === "WOOCOMMERCE" && storeUrl === STORE ? { kind: "WOOCOMMERCE", companyId: credentialCompany, consumerKey: CK, consumerSecret: CS, webhookSecret: WEBHOOK_SECRET, queryStringAuth } : null;
storeRuntime.fetch = async (rawUrl, init) => {
  const url = new URL(rawUrl);
  woo.calls.push({ url: rawUrl, auth: init.headers?.Authorization || null, method: init.method });
  const failure = woo.failNext.shift();
  if (failure === "network") throw new TypeError("fetch failed");
  if (failure) return respond(failure, { code: "error", message: "boom" });
  if (woo.html) return new Response("<html>Maintenance</html>", { status: 200, headers: { "Content-Type": "text/html" } });
  const expected = `Basic ${Buffer.from(`${CK}:${CS}`).toString("base64")}`;
  const authed = init.headers?.Authorization === expected || (url.searchParams.get("consumer_key") === CK && url.searchParams.get("consumer_secret") === CS);
  if (!authed) return respond(401, { code: "woocommerce_rest_cannot_view", message: "Sorry, you cannot list resources." });
  const route = url.pathname.replace("/wp-json/wc/v3", "");
  let m;
  if ((m = /^\/orders\/(\d+)\/refunds$/.exec(route))) {
    const ids = (woo.orders.get(m[1])?.refunds || []).map((r) => String(r.id));
    return respond(200, ids.map((id) => woo.refunds.get(id)).filter(Boolean));
  }
  if ((m = /^\/orders\/(\d+)$/.exec(route))) {
    const found = woo.orders.get(m[1]);
    return found ? respond(200, found) : respond(404, { code: "woocommerce_rest_shop_order_invalid_id", message: "Invalid ID." });
  }
  if (route === "/orders") {
    const page = Number(url.searchParams.get("page") || 1);
    const perPage = woo.pageSize || Number(url.searchParams.get("per_page") || 10);
    const modifiedAfter = url.searchParams.get("modified_after");
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    let list = [...woo.orders.values()].sort((a, b) => a.id - b.id);
    if (modifiedAfter) list = list.filter((o) => `${o.date_modified_gmt}Z` >= modifiedAfter);
    else if (after) list = list.filter((o) => o.backfill && o.date_created >= after && (!before || o.date_created < before));
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    const slice = list.slice((page - 1) * perPage, page * perPage).map((o) => (url.searchParams.get("_fields") === "id" ? { id: o.id } : { id: o.id, currency: o.currency }));
    return respond(200, slice, { "X-WP-Total": String(list.length), "X-WP-TotalPages": String(totalPages) });
  }
  return respond(404, { code: "rest_no_route" });
};

let db;
async function freshWorld(patch = {}) {
  db = createFakeSupabase(seed(), { unique: UNIQUE });
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db };
  woo.orders.clear();
  woo.refunds.clear();
  woo.failNext = [];
  woo.calls = [];
  woo.pageSize = null;
  woo.html = false;
  credentialCompany = CO;
  queryStringAuth = false;
  let connection = await service.saveConnection(db, CO, { channel: "WOOCOMMERCE", storeUrl: `${STORE}/`, ...patch }, ADMIN);
  connection = await service.setConnectionStatus(db, CO, connection.id, "ACTIVE", ADMIN);
  return connection;
}
const invoices = () => db.tables.vyron_customer_invoices || [];
const invoiceLines = (id) => (db.tables.vyron_customer_invoice_lines || []).filter((l) => l.invoice_id === id);
const orderRow = (id) => (db.tables.vyron_store_orders || []).find((r) => r.external_order_id === String(id));
const stock = (productId) => Number(db.tables.vyron_cost_stock_items.find((s) => s.entity_id === productId)?.qty_on_hand);
async function receive(connection, id, reason = "test") {
  const row = await service.markOrderDue(db, connection, String(id), reason);
  return service.processOrderRow(db, connection, row);
}

// ---------------------------------------------------------------------------
section("Configuration: store URL, consumer key/secret, company binding");
{
  check("store URL is normalised (https, no trailing slash, sub-folder kept)", canonicalWooUrl("https://Shop.Example.com/") === "https://shop.example.com" && canonicalWooUrl("https://example.com/store/") === "https://example.com/store");
  check("plain http is refused (the key travels with every request)", canonicalWooUrl("http://shop.example.com") === null);
  const env = {
    WOOCOMMERCE_STORE_URL: "https://shop.example.com/",
    WOOCOMMERCE_COMPANY_ID: CO,
    WOOCOMMERCE_CONSUMER_KEY: "ck_x",
    WOOCOMMERCE_CONSUMER_SECRET: "cs_x",
    WOOCOMMERCE_WEBHOOK_SECRET: "wh_x",
  };
  const creds = loadStoreCredentials("WOOCOMMERCE", "https://shop.example.com", env);
  check("WOOCOMMERCE_STORE_URL / _CONSUMER_KEY / _CONSUMER_SECRET are read", creds?.consumerKey === "ck_x" && creds?.consumerSecret === "cs_x" && creds?.webhookSecret === "wh_x");
  check("…only for that store", loadStoreCredentials("WOOCOMMERCE", "https://other.example.com", env) === null);
  check("…and never without the owning company", loadStoreCredentials("WOOCOMMERCE", "https://shop.example.com", { ...env, WOOCOMMERCE_COMPANY_ID: "" }) === null);
  const map = { VYRON_WOOCOMMERCE_CREDENTIALS: JSON.stringify({ "https://a.example.com/": { companyId: CO, consumerKey: "ck_a", consumerSecret: "cs_a" } }) };
  check("several stores via VYRON_WOOCOMMERCE_CREDENTIALS", loadStoreCredentials("WOOCOMMERCE", "https://a.example.com", map)?.consumerKey === "ck_a");
  const bad = await rejects(
    (async () => {
      const db0 = createFakeSupabase(seed(), { unique: UNIQUE });
      await service.saveConnection(db0, CO, { channel: "WOOCOMMERCE", storeUrl: "http://shop.example.com" }, ADMIN);
    })()
  );
  check("a store cannot be connected over http", bad?.code === "INVALID_INPUT");
}

// ---------------------------------------------------------------------------
section("Client: authentication and connectivity test");
let connection = await freshWorld();
{
  const test = await service.testConnection(db, CO, connection.id, ADMIN);
  check("Test Connection reads orders with the key (Basic auth over https)", /Read access confirmed/.test(test.detail) && woo.calls[0].auth?.startsWith("Basic "));
  check("requests go only to the store's own /wp-json/wc/v3", woo.calls.every((c) => c.url.startsWith(`${STORE}/wp-json/wc/v3/`) && c.method === "GET"));
  check("the secret never appears in the URL with Basic auth", woo.calls.every((c) => !c.url.includes(CS)));
  queryStringAuth = true;
  await service.testConnection(db, CO, connection.id, ADMIN);
  check("query-string auth for hosts that strip the Authorization header", woo.calls.at(-1).url.includes("consumer_key=") && !woo.calls.at(-1).auth);
  queryStringAuth = false;
  woo.html = true;
  const html = await rejects(service.testConnection(db, CO, connection.id, ADMIN));
  check("a non-JSON answer (security plugin / maintenance) is explained, not retried blindly", html && /did not return JSON/.test(html.message) && html.retryable === false);
  woo.html = false;
  const views = await service.listConnections(db, CO);
  check("…and the card shows Error until the next success", views[0].health === "ERROR");
}

// ---------------------------------------------------------------------------
section("WooCommerce order → recorded through the existing invoice pipeline");
connection = await freshWorld();
{
  woo.orders.set("1001", standardOrder(1001));
  const result = await receive(connection, 1001);
  check("outcome imported", result.outcome === "imported", JSON.stringify(orderRow(1001).issues));
  const inv = invoices()[0];
  check("one invoice, number WC-<order id>-<store tag>", invoices().length === 1 && /^WC-1001-[0-9A-F]{6}$/.test(inv.invoice_number), inv?.invoice_number);
  check("source WOOCOMMERCE with the order reference", inv.source_channel === "WOOCOMMERCE" && inv.source_reference === "woocommerce:shop-synthetic-foods-test:order:1001");
  check("customer matched by unique e-mail", inv.customer_id === "c-jane");
  check("Posted (counts in every report); sales only, no stock posted", inv.status === "Posted" && !inv.stock_posted);
  check("recorded on WooCommerce's ex-VAT basis", inv.prices_include_tax === false);
  check("ex-VAT sales 300.00, VAT 45.00 (= WooCommerce's total_tax)", inv.sales_value === 300 && inv.tax_total === 45, `${inv.sales_value} ${inv.tax_total}`);
  check("cost 2×40 + 1×20 = 100, GP 200", inv.cost_value === 100 && inv.gross_profit === 200);
  check("dated in the store's own time zone (date_created)", inv.invoice_date === "2026-10-02");
  const lines = invoiceLines(inv.id);
  const chut = lines.find((l) => l.product_id === "p-chut");
  check("multiple lines + shipping line", lines.length === 3);
  check("coupon discount carried (10.00) on the mapped variation", chut?.discount_amount === 10);
  check("shipping recorded with VAT", lines.find((l) => !l.product_id)?.tax_amount === 9);
  check("no stock is moved", stock("p-pie") === 10 && stock("p-chut") === 5);
  const gp = JSON.stringify(await getCustomerGpReport(db, CO, {}));
  const sales = JSON.stringify(await getSalesByCustomerItemReport(db, CO, {}));
  check("in the GP report and the sales-by-customer-item report", gp.includes("Jane Buyer") && sales.includes(inv.invoice_number));
  check("audited", (db.tables.vyron_store_sync_events || []).some((e) => e.event_type === "IMPORTED"));
}

// ---------------------------------------------------------------------------
section("Idempotency");
{
  check("the same order again → already imported, nothing new", (await receive(connection, 1001)).outcome === "already_imported" && invoices().length === 1);
  const row = orderRow(1001);
  Object.assign(row, { invoice_id: null, invoice_number: null, status: "PENDING", sale_fingerprint: null, line_map: [] });
  check("crash-retry adopts the invoice already written", (await receive(connection, 1001)).outcome === "imported" && invoices().length === 1);
  // A second WooCommerce store using the same order number must not collide.
  const other = await service.saveConnection(db, CO, { channel: "WOOCOMMERCE", storeUrl: "https://second.synthetic-foods.test" }, ADMIN);
  check("two stores' invoice numbers differ for the same order id", service.saleInvoiceNumber(other, "1001") !== service.saleInvoiceNumber(connection, "1001"));
}

// ---------------------------------------------------------------------------
section("Webhooks: HMAC-SHA256, ping, source, duplicates");
{
  connection = await freshWorld();
  woo.orders.set("1101", standardOrder(1101));
  const body = JSON.stringify({ id: 1101, status: "processing" });
  const sign = (raw, secret = WEBHOOK_SECRET) => createHmac("sha256", secret).update(raw).digest("base64");
  const post = (headers, raw = body, contentType = "application/json") =>
    webhookRoute.POST(new Request("https://volora.test/api/integrations/woocommerce/webhooks", { method: "POST", headers: { "content-type": contentType, ...headers }, body: raw }));
  const base = { "x-wc-webhook-source": `${STORE}/`, "x-wc-webhook-topic": "order.created", "x-wc-webhook-delivery-id": "d-1", "x-wc-webhook-id": "5" };

  check("signature helper: right secret passes, tampered body fails", verifyHmacBase64(Buffer.from(body), sign(body), WEBHOOK_SECRET) && !verifyHmacBase64(Buffer.from(`${body} `), sign(body), WEBHOOK_SECRET));
  check("order id from order.* topics", wooOrderIdFromWebhook("order.updated", { id: 9 }) === "9" && wooOrderIdFromWebhook("product.updated", { id: 9 }) === null);
  const ping = await post({}, "webhook_id=5", "application/x-www-form-urlencoded");
  check("WooCommerce's save-time ping is acknowledged (200) and does nothing", ping.status === 200 && isWooPing("application/x-www-form-urlencoded", Buffer.from("webhook_id=5")) && !(db.tables.vyron_store_webhook_deliveries || []).length);
  check("bad signature → 401, nothing recorded", (await post({ ...base, "x-wc-webhook-signature": sign(body, "wrong") })).status === 401 && !(db.tables.vyron_store_webhook_deliveries || []).length);
  check("unknown source store → 401", (await post({ ...base, "x-wc-webhook-source": "https://evil.example/", "x-wc-webhook-signature": sign(body) })).status === 401);
  const ok = await post({ ...base, "x-wc-webhook-signature": sign(body) });
  check("signed delivery → 200", ok.status === 200 && (await ok.json()).duplicate === false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check("processed after the response → imported", orderRow(1101)?.status === "IMPORTED");
  const dup = await post({ ...base, "x-wc-webhook-signature": sign(body) });
  check("same delivery id again → duplicate, nothing new", (await dup.json()).duplicate === true && invoices().length === 1);
  await post({ ...base, "x-wc-webhook-delivery-id": "d-2", "x-wc-webhook-topic": "order.updated", "x-wc-webhook-signature": sign(body) });
  await new Promise((resolve) => setTimeout(resolve, 50));
  check("order.updated for the same order (new delivery) → still one sale", invoices().length === 1);
  check("an unrelated verified topic is acknowledged and ignored", (await (await post({ ...base, "x-wc-webhook-topic": "product.updated", "x-wc-webhook-delivery-id": "d-3", "x-wc-webhook-signature": sign(body) })).json()).ignored === "product.updated");
  credentialCompany = CO_B;
  const foreign = await post({ ...base, "x-wc-webhook-delivery-id": "d-4", "x-wc-webhook-signature": sign(body) });
  check("credentials bound to another company → not recorded here (404)", foreign.status === 404);
  credentialCompany = CO;
}

// ---------------------------------------------------------------------------
section("Customer mapping");
{
  connection = await freshWorld();
  woo.orders.set("1301", standardOrder(1301, { email: "nobody@example.test", customerId: 4401 }));
  const r = await receive(connection, 1301);
  const inv = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1301");
  check("unknown shopper → the store's online-sales customer, not blocked", r.outcome === "imported" && inv?.customer_id === connection.default_customer_id);
  check("…name and e-mail kept on the invoice; no customer per shopper", /nobody@example\.test/.test(inv?.notes || "") && db.tables.vyron_customers.length === seed().vyron_customers.length + 1);
  woo.orders.set("1302", standardOrder(1302, { email: "shared@example.test", customerId: 0 }));
  await receive(connection, 1302);
  check("an e-mail shared by two customers is not guessed", invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1302")?.customer_id === connection.default_customer_id);
  await service.saveMapping(db, CO, { connectionId: connection.id, kind: "customer", key: "4402", targetId: "c-web" }, ADMIN);
  woo.orders.set("1303", standardOrder(1303, { customerId: 4402, email: "x@example.test" }));
  await receive(connection, 1303);
  check("a mapped WooCommerce customer id wins", invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1303")?.customer_id === "c-web");
  woo.orders.set("1304", standardOrder(1304, { customerId: 0, email: "jane@example.test" }));
  await receive(connection, 1304);
  check("a guest whose e-mail belongs to exactly one customer → that customer", invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1304")?.customer_id === "c-jane");
}

// ---------------------------------------------------------------------------
section("Product / SKU mapping");
{
  connection = await freshWorld();
  woo.orders.set(
    "1401",
    order(1401, {
      lines: [line({ id: 11, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, unit: 100 }), line({ id: 13, sku: "UNKNOWN-9", name: "Fig Chutney", quantity: 1, productId: 777, unit: 50 })],
    })
  );
  const r = await receive(connection, 1401);
  const issue = orderRow(1401).issues.find((i) => i.code === "PRODUCT_UNMAPPED");
  check("unknown SKU → 'Product mapping required', nothing written", r.outcome === "attention" && /Product mapping required/.test(issue?.message) && !invoices().length);
  check("exception shows source, external product id, SKU, name, order", issue.detail?.source === "WooCommerce" && issue.detail?.externalProductId === "product 777" && issue.detail?.sku === "UNKNOWN-9" && issue.detail?.productName === "Fig Chutney" && issue.detail?.order === "#1401");
  check("a product named exactly like a VOLORA product is not matched by name", Boolean(issue));
  await service.saveMapping(db, CO, { connectionId: connection.id, kind: "product", key: "product:777", targetId: "p-chut" }, ADMIN);
  check("after mapping, the order is retried and imported", orderRow(1401).status === "IMPORTED");
}

// ---------------------------------------------------------------------------
section("VAT, discounts, shipping, fees");
{
  connection = await freshWorld();
  woo.orders.set("1501", order(1501, { lines: [line({ id: 11, sku: "PIE-150", name: "Steak Pie 150g", quantity: 3, unit: 100, rate: 0 })], taxLines: [] }));
  await receive(connection, 1501);
  const zero = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1501");
  check("no VAT charged → zero-rated line", zero && invoiceLines(zero.id)[0].tax_treatment === "Zero Rated" && zero.tax_total === 0);
  woo.orders.set("1502", standardOrder(1502, { taxLines: [{ id: 99, rate_id: 1, label: "VAT" }] }));
  check("VAT charged at a rate WooCommerce does not state → TAX_RATE_UNKNOWN (never inferred)", (await receive(connection, 1502)).outcome === "attention" && orderRow(1502).issue_codes.includes("TAX_RATE_UNKNOWN"));
  woo.orders.set("1503", standardOrder(1503, { taxLines: [{ id: 99, rate_id: 1, label: "VAT", rate_percent: 14 }] }));
  check("a rate different from the company's → TAX_RATE_MISMATCH", (await receive(connection, 1503)).outcome === "attention" && orderRow(1503).issue_codes.includes("TAX_RATE_MISMATCH"));
  woo.orders.set("1504", standardOrder(1504, { fees: [{ name: "Card fee", total: "5.00", total_tax: "0.75", taxes: [{ id: 1, total: "0.75" }] }] }));
  const fee = await receive(connection, 1504);
  const feeInvoice = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1504");
  check("a fee line is recorded as a charge line with its VAT (not blocked)", fee.outcome === "imported" && feeInvoice?.sales_value === 305 && feeInvoice?.tax_total === 45.75, `${fee.outcome} ${feeInvoice?.sales_value} ${feeInvoice?.tax_total}`);
}

// ---------------------------------------------------------------------------
section("Order status: paid, unpaid, cancelled");
{
  connection = await freshWorld();
  woo.orders.set("1601", standardOrder(1601, { status: "on-hold" }));
  check("on-hold (EFT awaiting payment) → WAITING", (await receive(connection, 1601)).outcome === "waiting");
  woo.orders.set("1601", standardOrder(1601, { status: "processing" }));
  check("…processing → recorded", (await receive(connection, 1601)).outcome === "imported");
  woo.orders.set("1602", standardOrder(1602, { status: "pending" }));
  check("pending payment → WAITING", (await receive(connection, 1602)).outcome === "waiting");
  woo.orders.set("1603", standardOrder(1603, { status: "completed" }));
  check("completed → recorded", (await receive(connection, 1603)).outcome === "imported");
  woo.orders.set("1604", standardOrder(1604, { status: "cancelled" }));
  check("cancelled before being recorded → not a sale", (await receive(connection, 1604)).outcome === "skipped");
  woo.orders.set("1605", standardOrder(1605, { status: "failed" }));
  check("failed payment → not a sale", (await receive(connection, 1605)).outcome === "skipped");
  woo.orders.set("1603", standardOrder(1603, { status: "cancelled", modifiedGmt: "2026-10-03T10:00:00" }));
  check("cancelled after being recorded, not refunded → attention", (await receive(connection, 1603)).outcome === "attention" && orderRow(1603).issue_codes.includes("CANCELLED_NOT_REFUNDED"));
}

// ---------------------------------------------------------------------------
section("Refunds → credit notes");
{
  connection = await freshWorld();
  woo.orders.set("1901", standardOrder(1901));
  await receive(connection, 1901);
  const sale = invoices()[0];
  woo.refunds.set("801", refund(801, { lines: [{ lineId: 11, quantity: 1, total: 100, tax: 15 }], amount: 115 }));
  woo.orders.set("1901", standardOrder(1901, { refundIds: [801] }));
  const partial = await receive(connection, 1901, "order.updated");
  const credit = invoices().find((i) => i.credited_invoice_id === sale.id);
  check("partial refund → credit note, outcome updated", partial.outcome === "updated" && Boolean(credit), JSON.stringify(orderRow(1901).issues));
  check("credit WCR-<refund id>-<tag>, linked to the sale", /^WCR-801-[0-9A-F]{6}$/.test(credit.invoice_number) && credit.source_reference === "woocommerce:shop-synthetic-foods-test:refund:801");
  check("credit −100.00 ex VAT, VAT −15.00", credit.sales_value === -100 && credit.tax_total === -15);
  check("the credit reverses the refunded unit's cost at the invoiced cost (−40); no stock movement", credit.cost_value === -40 && stock("p-pie") === 10);
  check("original sale untouched", invoices().find((i) => i.id === sale.id).sales_value === 300);
  check("the same refund again → nothing new", (await receive(connection, 1901)).outcome === "already_imported" && invoices().filter((i) => i.credited_invoice_id === sale.id).length === 1);

  woo.refunds.set("802", refund(802, { lines: [], amount: 69, reason: "Shipping refunded" }));
  woo.orders.set("1901", standardOrder(1901, { refundIds: [801, 802] }));
  const shippingRefund = await receive(connection, 1901);
  const credit802 = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:refund:802");
  check("money refunded without an item (WooCommerce shipping refund) → credited, not blocked", shippingRefund.outcome === "updated" && credit802?.credited_invoice_id === sale.id, `${shippingRefund.outcome} ${JSON.stringify(orderRow(1901).issues)}`);
  check("…69.00 incl. VAT at the order's 15 %: −60.00 ex, VAT −9.00", credit802?.sales_value === -60 && credit802?.tax_total === -9, `${credit802?.sales_value} ${credit802?.tax_total}`);

  woo.refunds.set("901", refund(901, { lines: [{ lineId: 11, quantity: 2, total: 200, tax: 30 }, { lineId: 12, quantity: 1, total: 40, tax: 6 }], amount: 276 }));
  woo.orders.set("1902", standardOrder(1902, { status: "refunded", refundIds: [901] }));
  const full = await receive(connection, 1902);
  const sale2 = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:order:1902");
  const credit2 = invoices().find((i) => i.source_reference === "woocommerce:shop-synthetic-foods-test:refund:901");
  check("a 'refunded' order: sale recorded AND credited (goods refunded; shipping kept)", full.outcome === "imported" && sale2 && credit2 && credit2.sales_value === -240 && credit2.credited_invoice_id === sale2.id, `${full.outcome} ${JSON.stringify(orderRow(1902).issues)}`);
}

// ---------------------------------------------------------------------------
section("Order updates after import");
{
  connection = await freshWorld();
  woo.orders.set("2001", standardOrder(2001));
  await receive(connection, 2001);
  const edited = standardOrder(2001);
  edited.line_items.push(line({ id: 19, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, unit: 100 }));
  woo.orders.set("2001", edited);
  check("an order edited after import → attention; invoice unchanged", (await receive(connection, 2001)).outcome === "attention" && orderRow(2001).issue_codes.includes("ORDER_CHANGED_AFTER_IMPORT") && invoices()[0].sales_value === 300);
}

// ---------------------------------------------------------------------------
section("API failures and retry");
{
  connection = await freshWorld();
  woo.orders.set("2201", standardOrder(2201));
  woo.failNext = [503];
  check("WooCommerce 503 → FAILED, retry scheduled", (await receive(connection, 2201)).outcome === "failed" && Boolean(orderRow(2201).next_attempt_at) && !invoices().length);
  orderRow(2201).next_attempt_at = new Date(Date.now() - 1000).toISOString();
  check("retried once due → imported", (await service.processDueOrders(db, connection, {})).outcomes.imported === 1);
  woo.failNext = ["network"];
  woo.orders.set("2202", standardOrder(2202));
  check("network failure → retryable", (await receive(connection, 2202)).outcome === "failed" && Boolean(orderRow(2202).next_attempt_at));
  woo.failNext = [401];
  woo.orders.set("2203", standardOrder(2203));
  await receive(connection, 2203);
  check("401 (revoked key) → visible, not retried blindly", orderRow(2203).next_attempt_at === null && /refused the credentials/.test(orderRow(2203).last_error));
  check("a person's retry after fixing it succeeds", (await service.retryOrder(db, CO, orderRow(2203).id, ADMIN)).outcome === "imported");
  check("a deleted order → FAILED with a reason, no retry loop", (await receive(connection, 2299)).outcome === "failed" && orderRow(2299).next_attempt_at === null);
}

// ---------------------------------------------------------------------------
section("Historical import: pages, resume, no duplicates");
{
  connection = await freshWorld();
  for (let i = 0; i < 5; i++) {
    const id = 3001 + i;
    woo.orders.set(String(id), standardOrder(id, { dateCreated: `2026-01-0${i + 1}T10:00:00`, backfill: true }));
  }
  woo.orders.set("2999", standardOrder(2999, { dateCreated: "2025-12-31T23:00:00", backfill: true }));
  await receive(connection, 3002, "webhook");
  woo.pageSize = 2;
  const backfill = await service.startBackfill(db, CO, { connectionId: connection.id, from: "2026-01-01" }, ADMIN);
  let step = await service.runBackfillStep(db, CO, backfill.id);
  check("page 1 of 3 (X-WP-TotalPages), cursor = next page", step.recorded === 2 && step.backfill.cursor === "2" && step.backfill.status === "RUNNING");
  const listCall = woo.calls.find((c) => c.url.includes("/orders?") && c.url.includes("after="));
  check("listing asks from 1 January in store time, ordered by id", /after=2026-01-01T00%3A00%3A00/.test(listCall.url) && /orderby=id/.test(listCall.url));
  woo.failNext = [500];
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("a failed page keeps the cursor (resumable)", step.recorded === 0 && step.backfill.cursor === "2" && step.backfill.last_error);
  step = await service.runBackfillStep(db, CO, backfill.id);
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("completes on the last page", step.backfill.status === "COMPLETED");
  const imported = invoices().filter((i) => /^woocommerce:shop-synthetic-foods-test:order:300\d$/.test(i.source_reference));
  check("5 orders from 1 January → 5 invoices (the webhook one not duplicated); 31 December not imported", imported.length === 5 && !orderRow(2999));
  check("recorded as Posted sales; no stock moved", stock("p-pie") === 10 && imported.every((i) => !i.stock_posted && i.status === "Posted"));
  const overview = await service.getSyncOverview(db, CO, connection.id);
  check("monitor: discovered 5 · imported 5 · failed 0", overview.counts.discovered === 5 && overview.counts.imported === 5 && overview.counts.failed === 0, JSON.stringify(overview.counts));
}

// ---------------------------------------------------------------------------
section("Sync Now and the scheduled catch-up (WooCommerce does not retry webhooks)");
{
  connection = await freshWorld();
  const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString().slice(0, 19);
  woo.orders.set("4001", standardOrder(4001, { modifiedGmt: recent }));
  woo.orders.set("4002", standardOrder(4002, { modifiedGmt: "2020-01-01T00:00:00" }));
  const result = await service.syncNow(db, connection, ADMIN);
  check("orders modified in the last 72 h are imported; older are not", result.discovered === 1 && orderRow(4001)?.status === "IMPORTED" && !orderRow(4002));
  check("asked with modified_after in GMT", woo.calls.some((c) => c.url.includes("modified_after=") && c.url.includes("dates_are_gmt=true")));
  const view = (await service.listConnections(db, CO))[0];
  check("card: Connected, last sync set, 1 order and 1 invoice imported, 0 refunds", view.health === "CONNECTED" && view.last_sync_at && view.totals.ordersImported === 1 && view.totals.invoicesImported === 1 && view.totals.refunds === 0, JSON.stringify(view.totals));
  woo.orders.set("4003", standardOrder(4003, { modifiedGmt: new Date().toISOString().slice(0, 19) }));
  db.tables.vyron_store_connections[0].last_reconciled_at = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
  const ran = await cronRoute.GET(new Request("https://volora.test/api/integrations/store-sales/cron", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  check("the scheduled run catches up a missed webhook", ran.status === 200 && orderRow(4003)?.status === "IMPORTED");
  const log = await service.listSyncEvents(db, CO, connection.id);
  check("sync log records the runs", log.filter((e) => e.event_type === "SYNC_RUN").length >= 2);
}

// ---------------------------------------------------------------------------
section("One sales truth across channels");
{
  connection = await freshWorld();
  const sale = normalizeWooOrder(standardOrder(1), []);
  check("the WooCommerce connector yields the shared sale model", sale.channel === "WOOCOMMERCE" && sale.lines.length === 2 && sale.taxesIncluded === false);
  check("connector exposes no write call", !("registerWebhooks" in wooCommerceConnector));
  const other = await rejects(service.getSyncOverview(db, CO_B, connection.id));
  check("another company cannot read this store", other?.code === "NOT_FOUND");
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
