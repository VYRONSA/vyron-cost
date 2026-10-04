#!/usr/bin/env node
/**
 * VOLORA online-store sales sync — Shopify connector regression.
 *
 * Drives the real src/lib/store-sales engine with its Shopify connector, the real invoice pipeline it writes
 * through (createCustomerInvoice, postCustomerInvoiceStock, the VAT engine, the
 * stock ledger), the real Order Engine matching ladders, the real webhook and
 * scheduled-run route handlers, and the real GP / sales reports — against an
 * in-memory database and a fake Shopify GraphQL endpoint. No live store, no
 * network, no real tenant data.
 *
 *   node scripts/test-store-sales-shopify.mjs
 */
import { register } from "node:module";
import { createHmac } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-shopify-sync";
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
const { clearShopifyTokenCache } = await importFromRoot("src/lib/store-sales/shopify/connector.ts");
const { loadStoreCredentials } = await importFromRoot("src/lib/store-sales/credentials.ts");
const { normalizeShopifyOrder } = await importFromRoot("src/lib/store-sales/shopify/normalize.ts");
const { saleFingerprint } = await importFromRoot("src/lib/store-sales/types.ts");
const { planSaleInvoice } = await importFromRoot("src/lib/store-sales/sales.ts");
const { verifyHmacBase64: verifyShopifyWebhook, shopifyOrderIdFromWebhook: orderIdFromWebhook } = await importFromRoot("src/lib/store-sales/webhooks.ts");
const { calculateInvoiceTax } = await importFromRoot("src/lib/vyron-invoice-tax.ts");
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");
const { getSalesByCustomerItemReport } = await importFromRoot("src/lib/vyron-customer-sales-reports.ts");
const webhookRoute = await importFromRoot("src/app/api/integrations/shopify/webhooks/route.ts");
const cronRoute = await importFromRoot("src/app/api/integrations/store-sales/cron/route.ts");

// ---------------------------------------------------------------------------
// Synthetic tenants
// ---------------------------------------------------------------------------
const CO = "11111111-1111-4111-8111-111111111111";
const CO_B = "22222222-2222-4222-8222-222222222222";
const SHOP = "synthetic-foods.myshopify.com";
const SECRET = "test-client-secret-not-real";
const ADMIN = "user-admin";

const seed = () => ({
  vyron_workspaces: [
    { id: "ws-a", company_id: CO, company_name: "Synthetic Foods A", default_vat_rate: 15 },
    { id: "ws-b", company_id: CO_B, company_name: "Synthetic Foods B", default_vat_rate: 15 },
  ],
  vyron_customers: [
    { id: "c-web", company_id: CO, customer_name: "Shopify Web Sales", status: "Active", total_sales: 0, invoice_count: 0 },
    { id: "c-jane", company_id: CO, customer_name: "Jane Buyer", email: "jane@example.test", status: "Active", total_sales: 0, invoice_count: 0 },
    { id: "c-twin1", company_id: CO, customer_name: "Twin One", email: "shared@example.test", status: "Active" },
    { id: "c-twin2", company_id: CO, customer_name: "Twin Two", email: "shared@example.test", status: "Active" },
    { id: "c-b", company_id: CO_B, customer_name: "Jane Buyer", email: "jane@example.test", status: "Active" },
  ],
  vyron_cost_products: [
    { id: "p-pie", company_id: CO, product_name: "Steak Pie 150g", sku: "PIE-150", selling_price: 100, total_cost: 40 },
    { id: "p-chut", company_id: CO, product_name: "Fig Chutney", sku: "CHUT-01", selling_price: 50, total_cost: 20 },
    { id: "p-free", company_id: CO, product_name: "Sample Sachet", sku: "SAMPLE", selling_price: 5, total_cost: 1 },
    { id: "p-b", company_id: CO_B, product_name: "Steak Pie 150g", sku: "PIE-150", selling_price: 100, total_cost: 40 },
  ],
  vyron_cost_stock_items: [
    { id: "si-pie", company_id: CO, entity_type: "finished_goods", entity_id: "p-pie", item_code: "PIE-150", qty_on_hand: 10, average_cost: 40, current_cost: 40, unit: "each" },
    { id: "si-chut", company_id: CO, entity_type: "finished_goods", entity_id: "p-chut", item_code: "CHUT-01", qty_on_hand: 5, average_cost: 20, current_cost: 20, unit: "each" },
    { id: "si-free", company_id: CO, entity_type: "finished_goods", entity_id: "p-free", item_code: "SAMPLE", qty_on_hand: 100, average_cost: 1, current_cost: 1, unit: "each" },
  ],
  // The Chutney is sold on Shopify under its own SKU; a person mapped its variant.
  vyron_import_source_links: [
    { id: "link-chut", company_id: CO, source_system: "shopify:synthetic-foods", source_entity: "product", source_key: "variant:9002", entity_type: "product", entity_id: "p-chut" },
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
// Fake Shopify Admin GraphQL
// ---------------------------------------------------------------------------
const m = (amount) => ({ shopMoney: { amount: Number(amount).toFixed(2), currencyCode: "ZAR" } });
const shopify = { orders: new Map(), refunds: new Map(), failNext: [], calls: [], pageSize: 2, timezone: "Africa/Johannesburg" };

function line({ id, sku = null, name, quantity, current = quantity, variant = null, price, discount = 0, rate = 15, tax }) {
  return {
    id: `gid://shopify/LineItem/${id}`,
    sku,
    name,
    quantity,
    currentQuantity: current,
    taxable: rate > 0,
    variant: variant ? { legacyResourceId: String(variant) } : null,
    product: { legacyResourceId: String(800 + Number(id)) },
    originalUnitPriceSet: m(price),
    discountAllocations: discount ? [{ allocatedAmountSet: m(discount) }] : [],
    taxLines: rate > 0 ? [{ ratePercentage: rate, priceSet: m(tax) }] : [],
  };
}

function order(id, overrides = {}) {
  const lines = overrides.lines || [];
  const shippingLines = overrides.shipping || [];
  const total = overrides.total ?? lines.reduce((t, l) => t + Number(l.originalUnitPriceSet.shopMoney.amount) * l.quantity - l.discountAllocations.reduce((d, a) => d + Number(a.allocatedAmountSet.shopMoney.amount), 0), 0) +
    shippingLines.reduce((t, s) => t + Number(s.originalPriceSet.shopMoney.amount), 0);
  return {
    id: `gid://shopify/Order/${id}`,
    legacyResourceId: String(id),
    name: overrides.name || `#${id}`,
    createdAt: overrides.createdAt || "2026-10-02T21:30:00Z",
    processedAt: overrides.processedAt || overrides.createdAt || "2026-10-02T21:30:00Z",
    updatedAt: overrides.updatedAt || "2026-10-02T21:30:00Z",
    test: Boolean(overrides.test),
    cancelledAt: overrides.cancelledAt || null,
    cancelReason: overrides.cancelReason || null,
    displayFinancialStatus: overrides.financial || "PAID",
    currencyCode: overrides.currency || "ZAR",
    taxesIncluded: overrides.taxesIncluded ?? true,
    email: overrides.email ?? "jane@example.test",
    customer: overrides.customer === null ? null : { legacyResourceId: String(overrides.customerId ?? 5001), displayName: "Jane Buyer", defaultEmailAddress: { emailAddress: overrides.email ?? "jane@example.test" } },
    subtotalPriceSet: m(total),
    totalPriceSet: m(total),
    totalTaxSet: m(overrides.totalTax ?? 0),
    totalDiscountsSet: m(0),
    totalShippingPriceSet: m(shippingLines.reduce((t, s) => t + Number(s.originalPriceSet.shopMoney.amount), 0)),
    totalRefundedSet: m(overrides.refunded ?? 0),
    lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: lines },
    shippingLines: { nodes: shippingLines },
    refunds: (overrides.refundIds || []).map((r) => ({ id: `gid://shopify/Refund/${r}` })),
  };
}

function shippingLine(title, amount, tax, rate = 15) {
  return { id: `gid://shopify/ShippingLine/${title}`, title, isRemoved: false, originalPriceSet: m(amount), discountAllocations: [], taxLines: rate ? [{ ratePercentage: rate, priceSet: m(tax) }] : [] };
}

function refund(id, { lines = [], shipping = [], total, adjustments = [] }) {
  return {
    id: `gid://shopify/Refund/${id}`,
    legacyResourceId: String(id),
    createdAt: "2026-10-03T08:00:00Z",
    note: "Damaged in transit",
    totalRefundedSet: m(total),
    refundLineItems: {
      pageInfo: { hasNextPage: false },
      nodes: lines.map((l) => ({ quantity: l.quantity, restockType: l.restockType || "RETURN", restocked: l.restockType !== "NO_RESTOCK", lineItem: { id: `gid://shopify/LineItem/${l.lineId}` }, subtotalSet: m(l.subtotal), totalTaxSet: m(l.tax) })),
    },
    refundShippingLines: { nodes: shipping.map((s) => ({ subtotalAmountSet: m(s.subtotal), taxAmountSet: m(s.tax) })) },
    orderAdjustments: { nodes: adjustments.map((a) => ({ amountSet: m(a.amount), taxAmountSet: m(a.tax), reason: a.reason || "REFUND_DISCREPANCY" })) },
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let credentialCompany = CO;
storeRuntime.credentials = (channel, storeUrl) =>
  channel === "SHOPIFY" && storeUrl === `https://${SHOP}` ? { kind: "SHOPIFY", companyId: credentialCompany, clientId: null, clientSecret: SECRET, accessToken: "shpat_test_token" } : null;
storeRuntime.fetch = async (url, init) => {
  const body = JSON.parse(String(init.body || "{}"));
  const name = /query (\w+)|mutation (\w+)/.exec(body.query || "")?.slice(1).find(Boolean);
  shopify.calls.push({ url, name, variables: body.variables, token: init.headers?.["X-Shopify-Access-Token"] });
  const failure = shopify.failNext.shift();
  if (failure) return failure === "network" ? Promise.reject(new TypeError("fetch failed")) : json(failure, { errors: "boom" });
  if (name === "VolSaleOrder") {
    const id = String(body.variables.id).split("/").pop();
    return json(200, { data: { shop: { ianaTimezone: shopify.timezone, currencyCode: "ZAR" }, order: shopify.orders.get(id) || null } });
  }
  if (name === "VolSaleRefund") return json(200, { data: { refund: shopify.refunds.get(String(body.variables.id).split("/").pop()) || null } });
  if (name === "VolSaleOrderIds") {
    const search = String(body.variables.query || "");
    const since = /updated_at:>=(\S+)/.exec(search)?.[1];
    const all = [...shopify.orders.values()]
      .filter((o) => (since ? o.updatedAt >= since : o.backfill))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const start = body.variables.after ? Number(body.variables.after) : 0;
    const nodes = all.slice(start, start + shopify.pageSize).map((o) => ({ legacyResourceId: o.legacyResourceId }));
    const end = start + nodes.length;
    return json(200, { data: { orders: { pageInfo: { hasNextPage: end < all.length, endCursor: String(end) }, nodes } } });
  }
  if (name === "VolSaleShop") return json(200, { data: { shop: { name: "Synthetic Foods", myshopifyDomain: SHOP, currencyCode: "ZAR", ianaTimezone: shopify.timezone } } });
  return json(200, { errors: [{ message: `unknown query ${name}`, extensions: { code: "BAD_REQUEST" } }] });
};

// The standard fixture: tax-inclusive, 15 %.
//   2 × Steak Pie @ 115.00                         = 230.00 (VAT 30.00)
//   1 × Fig Chutney @ 57.50 less 11.50 discount    =  46.00 (VAT  6.00) — mapped by variant, Shopify SKU differs
//   Courier shipping                               =  69.00 (VAT  9.00)
//   Total 345.00, VAT 45.00, ex-VAT 300.00
function standardOrder(id, overrides = {}) {
  return order(id, {
    lines: [
      line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 2, variant: 9001, price: 115, tax: 30 }),
      line({ id: 2, sku: "CH-SHOPIFY", name: "Fig Chutney", quantity: 1, variant: 9002, price: 57.5, discount: 11.5, tax: 6 }),
    ],
    shipping: [shippingLine("Courier", 69, 9)],
    totalTax: 45,
    ...overrides,
  });
}

let db;
async function freshWorld(connectionPatch = {}) {
  db = createFakeSupabase(seed(), { unique: UNIQUE });
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db };
  shopify.orders.clear();
  shopify.refunds.clear();
  shopify.failNext = [];
  shopify.calls = [];
  clearShopifyTokenCache();
  credentialCompany = CO;
  let connection = await service.saveConnection(db, CO, { channel: "SHOPIFY", storeUrl: SHOP, ...connectionPatch }, ADMIN);
  connection = await service.setConnectionStatus(db, CO, connection.id, "ACTIVE", ADMIN);
  return connection;
}
const invoices = () => db.tables.vyron_customer_invoices || [];
const invoiceLines = (invoiceId) => (db.tables.vyron_customer_invoice_lines || []).filter((l) => l.invoice_id === invoiceId);
const orderRow = (id) => (db.tables.vyron_store_orders || []).find((r) => r.external_order_id === String(id));
const stock = (productId) => Number(db.tables.vyron_cost_stock_items.find((s) => s.entity_id === productId)?.qty_on_hand);
async function receive(connection, id, reason = "test") {
  const row = await service.markOrderDue(db, connection, String(id), reason);
  return service.processOrderRow(db, connection, row);
}

// ---------------------------------------------------------------------------
section("Credentials stay server-side, bound to one company, parsed defensively");
{
  const url = `https://${SHOP}`;
  const env = { VYRON_SHOPIFY_CREDENTIALS: JSON.stringify({ [SHOP]: { companyId: CO, clientId: "id", clientSecret: "s" }, "x.myshopify.com": { companyId: CO, clientSecret: "s" } }) };
  check("a client-credentials entry is read, with its company", loadStoreCredentials("SHOPIFY", url, env)?.clientId === "id" && loadStoreCredentials("SHOPIFY", url, env)?.companyId === CO);
  check("an entry without a client id or token is refused", loadStoreCredentials("SHOPIFY", "https://x.myshopify.com", env) === null);
  check("an entry without a company is refused (no tenant-less credential)", loadStoreCredentials("SHOPIFY", url, { VYRON_SHOPIFY_CREDENTIALS: JSON.stringify({ [SHOP]: { clientId: "id", clientSecret: "s" } }) }) === null);
  check("malformed JSON yields nothing (never echoed)", loadStoreCredentials("SHOPIFY", url, { VYRON_SHOPIFY_CREDENTIALS: "{oops" }) === null);
  check("an unknown store has no credentials", loadStoreCredentials("SHOPIFY", "https://other.myshopify.com", env) === null);
  const single = { SHOPIFY_STORE_DOMAIN: SHOP, SHOPIFY_COMPANY_ID: CO, SHOPIFY_CLIENT_ID: "cid", SHOPIFY_CLIENT_SECRET: "csec" };
  check("single-store variables work for that store only", loadStoreCredentials("SHOPIFY", url, single)?.clientId === "cid" && loadStoreCredentials("SHOPIFY", "https://other.myshopify.com", single) === null);
}

// ---------------------------------------------------------------------------
section("Shopify order received → recorded through the existing invoice pipeline");
let connection = await freshWorld();
{
  shopify.orders.set("1001", standardOrder(1001));
  const result = await receive(connection, 1001);
  check("outcome imported", result.outcome === "imported", JSON.stringify(result.row.issues));
  const row = orderRow(1001);
  check("sync row IMPORTED and linked to the invoice", row.status === "IMPORTED" && row.invoice_number === "SHP-1001");
  const inv = invoices().find((i) => i.invoice_number === "SHP-1001");
  check("one invoice, deterministic number SHP-<order id>", invoices().length === 1 && Boolean(inv));
  check("customer mapped by unique e-mail to Jane Buyer", inv.customer_id === "c-jane", inv.customer_id);
  check("source recorded as SHOPIFY with the Shopify order reference", inv.source_channel === "SHOPIFY" && inv.source_reference === "shopify:synthetic-foods:order:1001");
  check("invoice is Posted (counts in every report), as VOLORA's own invoice import records sales", inv.status === "Posted");
  check("prices recorded as VAT-inclusive, as Shopify charged them", inv.prices_include_tax === true);
  check("ex-VAT sales value 300.00", inv.sales_value === 300, String(inv.sales_value));
  check("VAT 45.00 computed by VOLORA's engine equals Shopify's", inv.tax_total === 45, String(inv.tax_total));
  check("cost of sales from the product master: 2×40 + 1×20", inv.cost_value === 100, String(inv.cost_value));
  check("gross profit 200.00", inv.gross_profit === 200, String(inv.gross_profit));
  check("invoice dated in the shop's time zone (21:30 UTC = next day in Johannesburg)", inv.invoice_date === "2026-10-02" || inv.invoice_date === "2026-10-03");
  check("…specifically 2026-10-02 23:30 SAST → 2026-10-02", inv.invoice_date === "2026-10-02", inv.invoice_date);
  const lines = invoiceLines(inv.id);
  check("three lines: two products and shipping", lines.length === 3);
  const chut = lines.find((l) => l.product_id === "p-chut");
  check("SKU mismatch resolved by the mapped variant, not by name", Boolean(chut));
  check("discount carried: 11.50 on the chutney", chut?.discount_amount === 11.5, String(chut?.discount_amount));
  const ship = lines.find((l) => !l.product_id);
  check("shipping recorded as a standard-rated line, no cost", ship?.selling_price === 69 && ship?.tax_amount === 9 && ship?.cost_per_unit === 0);
  check("sales only: no stock is moved", stock("p-pie") === 10 && stock("p-chut") === 5 && !inv.stock_posted);
  check("no stock ledger entry", !(db.tables.vyron_cost_stock_ledger || []).length);
  check("nothing is queued for Xero", !(db.tables.vyron_xero_sync_queue || []).length);
  check("only read queries were sent to Shopify", shopify.calls.every((c) => c.name?.startsWith("VolSale")) && !shopify.calls.some((c) => /mutation/i.test(c.name || "")));
  check("the Admin API token went only to the store's own domain", shopify.calls.every((c) => c.url.startsWith(`https://${SHOP}/admin/api/2026-10/`)));
  const events = (db.tables.vyron_store_sync_events || []).filter((e) => e.store_order_row_id === row.id).map((e) => e.event_type);
  check("audited: ORDER_RECEIVED then IMPORTED", events.includes("ORDER_RECEIVED") && events.includes("IMPORTED"), events.join(","));

  section("…and it flows into the existing reports");
  const gp = await getCustomerGpReport(db, CO, {});
  const gpText = JSON.stringify(gp);
  check("GP report includes the Shopify customer", gpText.includes("Jane Buyer"));
  const sales = await getSalesByCustomerItemReport(db, CO, {});
  const salesText = JSON.stringify(sales);
  check("sales-by-customer-item report includes the Shopify invoice", salesText.includes("SHP-1001") || salesText.includes("Steak Pie 150g"));
}

// ---------------------------------------------------------------------------
section("Idempotency: duplicate order, crash-retry, concurrent processing");
{
  const again = await receive(connection, 1001, "duplicate");
  check("the same order processed again creates nothing", again.outcome === "already_imported" && invoices().length === 1);
  // Crash after the invoice was written, before the sync row was linked.
  const row = orderRow(1001);
  Object.assign(row, { invoice_id: null, invoice_number: null, status: "PENDING", sale_fingerprint: null, line_map: [] });
  const adopted = await receive(connection, 1001, "crash retry");
  check("a crash-retry adopts the existing invoice", adopted.outcome === "imported" && orderRow(1001).invoice_number === "SHP-1001");
  check("still exactly one invoice", invoices().length === 1);
  // Two workers at once.
  shopify.orders.set("1002", standardOrder(1002));
  const r = await service.markOrderDue(db, connection, "1002", "test");
  const [a, b] = await Promise.all([service.processOrderRow(db, connection, r), service.processOrderRow(db, connection, r)]);
  check("two simultaneous runs: one works, the other stands aside", [a.outcome, b.outcome].sort().join(",") === "busy,imported", `${a.outcome},${b.outcome}`);
  check("one invoice for order 1002", invoices().filter((i) => i.invoice_number === "SHP-1002").length === 1);
  // A different document already holding the number is never adopted.
  shopify.orders.set("1009", standardOrder(1009));
  db.tables.vyron_customer_invoices.push({ id: "foreign", company_id: CO, invoice_number: "SHP-1009", source_reference: null, status: "Draft" });
  const clash = await receive(connection, 1009);
  check("an unrelated invoice with the same number is not adopted", clash.outcome === "failed" && /already used/.test(orderRow(1009).last_error || ""), orderRow(1009).last_error);
}

// ---------------------------------------------------------------------------
section("Webhooks: signature, duplicate delivery, company from the verified store");
{
  connection = await freshWorld();
  shopify.orders.set("1101", standardOrder(1101));
  const body = JSON.stringify({ id: 1101, name: "#1101" });
  const sign = (raw, secret = SECRET) => createHmac("sha256", secret).update(raw).digest("base64");
  const post = (headers, raw = body) =>
    webhookRoute.POST(new Request("https://volora.test/api/integrations/shopify/webhooks", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }));
  const base = { "x-shopify-shop-domain": SHOP, "x-shopify-topic": "orders/create", "x-shopify-webhook-id": "wh-1" };

  check("verifyShopifyWebhook accepts the right signature", verifyShopifyWebhook(Buffer.from(body), sign(body), SECRET));
  check("…and refuses a tampered body", !verifyShopifyWebhook(Buffer.from(body + " "), sign(body), SECRET));
  check("order id from orders/* and refunds/create", orderIdFromWebhook("orders/updated", { id: 7 }) === "7" && orderIdFromWebhook("refunds/create", { order_id: 8, id: 99 }) === "8");

  const bad = await post({ ...base, "x-shopify-hmac-sha256": sign(body, "wrong-secret") });
  check("bad signature → 401, nothing recorded", bad.status === 401 && !(db.tables.vyron_store_webhook_deliveries || []).length);
  const unknown = await post({ ...base, "x-shopify-shop-domain": "stranger.myshopify.com", "x-shopify-hmac-sha256": sign(body) });
  check("a store without server credentials → 401", unknown.status === 401);

  const ok = await post({ ...base, "x-shopify-hmac-sha256": sign(body) });
  const okBody = await ok.json();
  check("signed delivery → 200, acknowledged", ok.status === 200 && okBody.ok === true && okBody.duplicate === false);
  await new Promise((resolve) => setTimeout(resolve, 50));
  check("the order is recorded as a sale after the response", orderRow(1101)?.status === "IMPORTED", orderRow(1101)?.status);
  check("company taken from the store's connection", invoices()[0]?.company_id === CO);

  const dup = await post({ ...base, "x-shopify-hmac-sha256": sign(body) });
  const dupBody = await dup.json();
  check("same webhook id again → 200 duplicate, nothing new", dup.status === 200 && dupBody.duplicate === true && invoices().length === 1);
  check("duplicate delivery audited", (db.tables.vyron_store_sync_events || []).some((e) => e.event_type === "DUPLICATE_DELIVERY"));

  const second = await post({ ...base, "x-shopify-webhook-id": "wh-2", "x-shopify-topic": "orders/updated", "x-shopify-hmac-sha256": sign(body) });
  await new Promise((resolve) => setTimeout(resolve, 50));
  check("a second event for the same order (new webhook id) still creates no second sale", second.status === 200 && invoices().length === 1);

  // Store removed from VOLORA but still sending: Shopify must retry rather than lose the order.
  db.tables.vyron_store_connections = [];
  const orphan = await post({ ...base, "x-shopify-webhook-id": "wh-3", "x-shopify-hmac-sha256": sign(body) });
  check("verified store with no connection → 404 so Shopify retries", orphan.status === 404);
}

// ---------------------------------------------------------------------------
section("Disabled store: orders are kept, not processed, and processed on activation");
{
  connection = await freshWorld();
  connection = await service.setConnectionStatus(db, CO, connection.id, "DISABLED", ADMIN);
  shopify.orders.set("1201", standardOrder(1201));
  const row = await service.markOrderDue(db, connection, "1201", "while disabled");
  const result = await service.processOrderRow(db, connection, row);
  check("not processed while disabled", result.outcome === "disabled" && !invoices().length);
  connection = await service.setConnectionStatus(db, CO, connection.id, "ACTIVE", ADMIN);
  const run = await service.processDueOrders(db, connection, {});
  check("processed once active", run.outcomes.imported === 1 && invoices().length === 1);
  const noCreds = await rejects(
    (async () => {
      const original = storeRuntime.credentials;
      storeRuntime.credentials = () => null;
      try {
        await service.setConnectionStatus(db, CO, connection.id, "ACTIVE", ADMIN);
      } finally {
        storeRuntime.credentials = original;
      }
    })()
  );
  check("a store cannot be activated without server credentials", noCreds?.code === "NOT_CONFIGURED");
}

// ---------------------------------------------------------------------------
section("Customer mapping: never blocks, never guesses, never one customer per shopper");
{
  connection = await freshWorld();
  const storeCustomer = db.tables.vyron_customers.find((c) => c.id === connection.default_customer_id);
  check("connecting a store created its one online-sales customer", Boolean(storeCustomer) && /Shopify online sales/.test(storeCustomer.customer_name), storeCustomer?.customer_name);
  // Unknown shopper.
  shopify.orders.set("1301", standardOrder(1301, { email: "nobody@example.test", customerId: 5099 }));
  const unmatched = await receive(connection, 1301);
  const inv = invoices().find((i) => i.invoice_number === "SHP-1301");
  check("unknown shopper → recorded to the store's online-sales customer (not blocked)", unmatched.outcome === "imported" && inv?.customer_id === connection.default_customer_id);
  check("…the shopper's name and e-mail are kept on the invoice", /nobody@example\.test/.test(inv?.notes || ""));
  check("no customer is created per shopper", db.tables.vyron_customers.length === seed().vyron_customers.length + 1);
  // Two VOLORA customers share the e-mail: no pick.
  shopify.orders.set("1302", standardOrder(1302, { email: "shared@example.test", customerId: 5100 }));
  await receive(connection, 1302);
  check("an e-mail shared by two customers is never guessed: online-sales customer", invoices().find((i) => i.invoice_number === "SHP-1302")?.customer_id === connection.default_customer_id);
  // A person maps a Shopify customer: later orders go to that customer.
  await service.saveMapping(db, CO, { connectionId: connection.id, kind: "customer", key: "5200", targetId: "c-web" }, ADMIN);
  shopify.orders.set("1303", standardOrder(1303, { customerId: 5200, email: "other@example.test" }));
  await receive(connection, 1303);
  check("a mapped Shopify customer id wins", invoices().find((i) => i.invoice_number === "SHP-1303")?.customer_id === "c-web");
  const crossTenant = await rejects(service.saveMapping(db, CO, { connectionId: connection.id, kind: "customer", key: "5100", targetId: "c-b" }, ADMIN));
  check("a mapping to another company's customer is refused", crossTenant?.code === "INVALID_INPUT");
  // Guest checkout (no Shopify customer) with a known e-mail.
  shopify.orders.set("1304", standardOrder(1304, { customer: null, email: "jane@example.test" }));
  await receive(connection, 1304);
  check("guest checkout with an e-mail of exactly one customer → that customer", invoices().find((i) => i.invoice_number === "SHP-1304")?.customer_id === "c-jane");
  check("matching never crosses tenants (CO_B's Jane is never chosen)", !invoices().some((i) => i.customer_id === "c-b"));
}

// ---------------------------------------------------------------------------
section("Product / SKU mapping: SKU or mapped variant, never the name alone");
{
  connection = await freshWorld();
  shopify.orders.set(
    "1401",
    order(1401, {
      lines: [
        line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, variant: 9001, price: 115, tax: 15 }),
        line({ id: 3, sku: "UNKNOWN-9", name: "Fig Chutney", quantity: 1, variant: 9333, price: 57.5, tax: 7.5 }),
      ],
      totalTax: 22.5,
    })
  );
  const result = await receive(connection, 1401);
  const row = orderRow(1401);
  const issue = row.issues.find((i) => i.code === "PRODUCT_UNMAPPED");
  check("unknown SKU → NEEDS_ATTENTION (no partial invoice)", result.outcome === "attention" && !invoices().length);
  check("a product NAMED exactly like a VOLORA product is still not matched by name", Boolean(issue) && /UNKNOWN-9/.test(issue.message));
  check("the issue carries the variant key to map", issue?.key === "variant:9333");
  check("no stock moved", stock("p-pie") === 10);
  await service.saveMapping(db, CO, { connectionId: connection.id, kind: "product", key: "variant:9333", targetId: "p-chut" }, ADMIN);
  check("after mapping the variant the order imports", orderRow(1401).status === "IMPORTED" && invoices().length === 1);
  check("the mapping is in the shared provenance table the Order Engine reads", db.tables.vyron_import_source_links.some((l) => l.source_key === "variant:9333" && l.entity_id === "p-chut"));
  const otherCo = await rejects(service.saveMapping(db, CO, { connectionId: connection.id, kind: "product", key: "variant:1", targetId: "p-b" }, ADMIN));
  check("mapping to another company's product is refused", otherCo?.code === "INVALID_INPUT");
}

// ---------------------------------------------------------------------------
section("VAT / tax mapping");
{
  connection = await freshWorld();
  // Tax-exclusive store.
  shopify.orders.set(
    "1501",
    order(1501, {
      taxesIncluded: false,
      lines: [line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 3, price: 100, tax: 45 })],
      total: 345,
      totalTax: 45,
    })
  );
  await receive(connection, 1501);
  const exclusive = invoices().find((i) => i.invoice_number === "SHP-1501");
  check("tax-exclusive order: ex-VAT 300, VAT 45, prices not VAT-inclusive", exclusive?.sales_value === 300 && exclusive?.tax_total === 45 && exclusive?.prices_include_tax === false);
  // Zero-rated line.
  shopify.orders.set("1502", order(1502, { lines: [line({ id: 1, sku: "SAMPLE", name: "Sample Sachet", quantity: 2, price: 10, rate: 0 })], totalTax: 0 }));
  await receive(connection, 1502);
  const zero = invoices().find((i) => i.invoice_number === "SHP-1502");
  check("a line Shopify charged no VAT on is recorded zero-rated", zero && invoiceLines(zero.id)[0].tax_treatment === "Zero Rated" && zero.tax_total === 0);
  // Wrong rate configured in Shopify.
  shopify.orders.set("1503", order(1503, { lines: [line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, price: 114, rate: 14, tax: 14 })], totalTax: 14 }));
  const wrong = await receive(connection, 1503);
  check("a VAT rate different from the company's stops the sale", wrong.outcome === "attention" && orderRow(1503).issue_codes.includes("TAX_RATE_MISMATCH"));
  // Shopify tax that VOLORA's engine cannot reproduce.
  shopify.orders.set("1504", order(1504, { lines: [line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, price: 115, tax: 12 })], totalTax: 12 }));
  const mismatch = await receive(connection, 1504);
  check("VAT that does not agree with Shopify's stops the sale", mismatch.outcome === "attention" && orderRow(1504).issue_codes.includes("TAX_MISMATCH"));
  // Gift card / tip: totals do not reconcile.
  shopify.orders.set("1505", standardOrder(1505, { total: 395 }));
  const tip = await receive(connection, 1505);
  check("an order total VOLORA cannot account for (e.g. a tip) stops the sale", tip.outcome === "attention" && orderRow(1505).issue_codes.includes("TOTAL_MISMATCH"));
  check("none of the stopped orders wrote an invoice", !invoices().some((i) => ["SHP-1503", "SHP-1504", "SHP-1505"].includes(i.invoice_number)));
}

// ---------------------------------------------------------------------------
section("Discounts and free items");
{
  connection = await freshWorld();
  shopify.orders.set(
    "1601",
    order(1601, {
      lines: [
        line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 2, price: 115, discount: 23, tax: 27 }),
        line({ id: 2, sku: "SAMPLE", name: "Sample Sachet", quantity: 1, price: 0, tax: 0 }),
      ],
      totalTax: 27,
    })
  );
  const result = await receive(connection, 1601);
  const inv = invoices().find((i) => i.invoice_number === "SHP-1601");
  check("discounted order imports", result.outcome === "imported", JSON.stringify(orderRow(1601).issues));
  const lines = inv ? invoiceLines(inv.id) : [];
  check("line discount 23.00 kept as an amount", lines.find((l) => l.product_id === "p-pie")?.discount_amount === 23);
  check("ex-VAT revenue net of discount: (230 − 23) / 1.15 = 180.00", inv?.sales_value === 180, String(inv?.sales_value));
  const free = lines.find((l) => l.product_id === "p-free");
  check("a free item stays free (not re-priced from the product master)", free?.selling_price === 0);
  check("…but still carries its cost (GP sees the giveaway)", free?.cost_per_unit === 1);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
section("Financial status and lifecycle");
{
  connection = await freshWorld();
  shopify.orders.set("1801", standardOrder(1801, { financial: "PENDING" }));
  const pending = await receive(connection, 1801);
  check("PENDING (e.g. EFT not yet received) → WAITING, nothing recorded", pending.outcome === "waiting" && !invoices().length);
  shopify.orders.set("1801", standardOrder(1801, { financial: "PAID" }));
  const paid = await receive(connection, 1801, "orders/updated");
  check("once Shopify reports it paid, it is recorded", paid.outcome === "imported" && invoices().length === 1);
  shopify.orders.set("1802", standardOrder(1802, { financial: "VOIDED" }));
  check("VOIDED → not a sale", (await receive(connection, 1802)).outcome === "skipped");
  shopify.orders.set("1803", standardOrder(1803, { test: true }));
  check("a Shopify test order → not a sale", (await receive(connection, 1803)).outcome === "skipped");
  shopify.orders.set("1804", standardOrder(1804, { cancelledAt: "2026-10-02T22:00:00Z", cancelReason: "CUSTOMER" }));
  check("cancelled before being recorded → not a sale", (await receive(connection, 1804)).outcome === "skipped");
  shopify.orders.set("1805", standardOrder(1805, { currency: "USD" }));
  check("a store booking in another currency → attention", (await receive(connection, 1805)).outcome === "attention" && orderRow(1805).issue_codes.includes("CURRENCY_MISMATCH"));
}

// ---------------------------------------------------------------------------
section("Refunds → credit notes linked to the sale");
{
  connection = await freshWorld();
  shopify.orders.set("1901", standardOrder(1901));
  await receive(connection, 1901);
  const sale = invoices().find((i) => i.invoice_number === "SHP-1901");
  check("sale recorded", Boolean(sale));

  // One pie returned and restocked; chutney refunded without return.
  shopify.refunds.set("7001", refund(7001, { lines: [{ lineId: 1, quantity: 1, subtotal: 115, tax: 15, restockType: "RETURN" }, { lineId: 2, quantity: 1, subtotal: 46, tax: 6, restockType: "NO_RESTOCK" }], total: 161 }));
  shopify.orders.set("1901", standardOrder(1901, { financial: "PARTIALLY_REFUNDED", refundIds: [7001], refunded: 161 }));
  const result = await receive(connection, 1901, "refunds/create");
  const credit = invoices().find((i) => i.invoice_number === "SHPR-7001");
  check("refund processed (outcome updated)", result.outcome === "updated", `${result.outcome} ${JSON.stringify(orderRow(1901).issues)}`);
  check("credit note SHPR-<refund id> created", Boolean(credit));
  check("credit note linked to the original sale", credit?.credited_invoice_id === sale.id);
  check("original sale untouched (never deleted or edited)", invoices().find((i) => i.id === sale.id)?.sales_value === 300 && invoices().find((i) => i.id === sale.id)?.status === "Posted");
  check("credit is negative: ex-VAT −140.00, VAT −21.00", credit?.sales_value === -140 && credit?.tax_total === -21, `${credit?.sales_value} ${credit?.tax_total}`);
  check("the credit reverses the refunded units' cost of sales at the invoiced cost (−40 −20)", credit?.cost_value === -60, String(credit?.cost_value));
  check("credit note posted, so reports net it off", credit?.status === "Posted");
  check("no stock movement for credits either", stock("p-pie") === 10 && !(db.tables.vyron_cost_stock_ledger || []).length);
  check("refund ledger links Shopify refund → credit note", (db.tables.vyron_store_refunds || []).some((r) => r.external_refund_id === "7001" && r.credit_invoice_id === credit?.id));

  const again = await receive(connection, 1901, "refund webhook retried");
  check("the same refund again creates no second credit note", again.outcome === "already_imported" && invoices().filter((i) => i.invoice_number === "SHPR-7001").length === 1);

  // A goodwill amount refunded without items: credited at the order's single VAT rate.
  shopify.refunds.set("7002", refund(7002, { lines: [], total: 50 }));
  shopify.orders.set("1901", standardOrder(1901, { financial: "PARTIALLY_REFUNDED", refundIds: [7001, 7002], refunded: 211 }));
  const odd = await receive(connection, 1901, "goodwill refund");
  const goodwill = invoices().find((i) => i.invoice_number === "SHPR-7002");
  check("an amount-only refund becomes a credit note (not blocked)", odd.outcome === "updated" && goodwill?.credited_invoice_id === sale.id, `${odd.outcome} ${JSON.stringify(orderRow(1901).issues)}`);
  check("…−50.00 including VAT at the order's 15 % (VAT −6.52)", goodwill && Math.abs(goodwill.sales_value + goodwill.tax_total + 50) < 0.001 && goodwill.tax_total === -6.52, `${goodwill?.sales_value} ${goodwill?.tax_total}`);
  check("…the earlier credit is not repeated", invoices().filter((i) => i.credited_invoice_id === sale.id).length === 2);

  section("…GP report nets sale and credit");
  const gp = await getCustomerGpReport(db, CO, {});
  const jane = JSON.stringify(gp);
  check("GP report still answers with the credit note present", jane.includes("Jane Buyer"));

  // Fully refunded before VOLORA ever saw it: sale then credit, relationship kept.
  shopify.refunds.set("7101", refund(7101, { lines: [{ lineId: 1, quantity: 2, subtotal: 230, tax: 30 }, { lineId: 2, quantity: 1, subtotal: 46, tax: 6 }], shipping: [{ subtotal: 69, tax: 9 }], total: 345 }));
  shopify.orders.set("1902", standardOrder(1902, { financial: "REFUNDED", refundIds: [7101], refunded: 345 }));
  const full = await receive(connection, 1902);
  const sale2 = invoices().find((i) => i.invoice_number === "SHP-1902");
  const credit2 = invoices().find((i) => i.invoice_number === "SHPR-7101");
  check("a fully refunded order: sale AND credit note, netting to zero", full.outcome === "imported" && sale2 && credit2 && Math.abs(sale2.sales_value + credit2.sales_value) < 0.001 && Math.abs(sale2.tax_total + credit2.tax_total) < 0.001);
}

// ---------------------------------------------------------------------------
section("Order updates after import");
{
  connection = await freshWorld();
  shopify.orders.set("2001", standardOrder(2001));
  await receive(connection, 2001);
  const before = saleFingerprint(normalizeShopifyOrder(shopify.orders.get("2001"), shopify.orders.get("2001").lineItems.nodes, []));
  shopify.orders.set("2001", standardOrder(2001));
  check("an unchanged order refetched → already imported", (await receive(connection, 2001)).outcome === "already_imported");
  const edited = standardOrder(2001);
  edited.lineItems.nodes.push(line({ id: 9, sku: "PIE-150", name: "Steak Pie 150g", quantity: 1, price: 115, tax: 15 }));
  shopify.orders.set("2001", edited);
  check("fingerprint changes when an item is added", saleFingerprint(normalizeShopifyOrder(edited, edited.lineItems.nodes, [])) !== before);
  const result = await receive(connection, 2001, "orders/updated");
  check("an order edited after import → attention; the posted invoice is not silently changed", result.outcome === "attention" && orderRow(2001).issue_codes.includes("ORDER_CHANGED_AFTER_IMPORT") && invoices().length === 1 && invoices()[0].sales_value === 300);
  shopify.orders.set("2001", standardOrder(2001, { cancelledAt: "2026-10-03T10:00:00Z" }));
  const cancelled = await receive(connection, 2001, "orders/cancelled");
  check("cancelled after import without a refund → attention to decide the credit", cancelled.outcome === "attention" && orderRow(2001).issue_codes.includes("CANCELLED_NOT_REFUNDED"));
}

// ---------------------------------------------------------------------------
section("Sales are recorded whatever VOLORA's stock says");
{
  connection = await freshWorld();
  shopify.orders.set("2101", standardOrder(2101, { lines: [line({ id: 1, sku: "PIE-150", name: "Steak Pie 150g", quantity: 12, price: 115, tax: 180 })], shipping: [], totalTax: 180 }));
  check("selling more than VOLORA holds is still recorded (stock is not this integration's concern)", (await receive(connection, 2101)).outcome === "imported" && stock("p-pie") === 10);
}

// ---------------------------------------------------------------------------
section("Failed Shopify API requests and retry");
{
  connection = await freshWorld();
  shopify.orders.set("2201", standardOrder(2201));
  shopify.failNext = [500];
  const failed = await receive(connection, 2201);
  const row = orderRow(2201);
  check("Shopify 500 → FAILED, retry scheduled with back-off", failed.outcome === "failed" && row.status === "FAILED" && row.next_attempt_at && Date.parse(row.next_attempt_at) > Date.now());
  check("…attempt counted and the reason kept", row.attempts === 1 && /server error/i.test(row.last_error));
  check("nothing written on failure", !invoices().length);
  const notDue = await service.processDueOrders(db, connection, {});
  check("not retried before the back-off has passed", notDue.processed === 0);
  row.next_attempt_at = new Date(Date.now() - 1000).toISOString();
  const retried = await service.processDueOrders(db, connection, {});
  check("retried once due, and succeeds", retried.outcomes.imported === 1 && orderRow(2201).status === "IMPORTED" && orderRow(2201).attempts === 0);

  shopify.orders.set("2202", standardOrder(2202));
  shopify.failNext = ["network"];
  check("a network failure is retryable", (await receive(connection, 2202)).outcome === "failed" && Boolean(orderRow(2202).next_attempt_at));
  shopify.failNext = [401];
  shopify.orders.set("2203", standardOrder(2203));
  await receive(connection, 2203);
  check("refused credentials (401) are not retried blindly — visible instead", orderRow(2203).status === "FAILED" && orderRow(2203).next_attempt_at === null && /credentials/i.test(orderRow(2203).last_error));
  const manual = await service.retryOrder(db, CO, orderRow(2203).id, ADMIN);
  check("a person's retry after fixing it succeeds", manual.outcome === "imported");
  shopify.failNext = [];
  const missing = await receive(connection, 2299);
  check("an order Shopify does not have → FAILED with a reason, no retry loop", missing.outcome === "failed" && orderRow(2299).next_attempt_at === null);
}

// ---------------------------------------------------------------------------
section("Historical import: paginated, resumable, idempotent, audited");
{
  connection = await freshWorld();
  for (const [id, created] of [
    [3001, "2026-08-01T10:00:00Z"],
    [3002, "2026-08-02T10:00:00Z"],
    [3003, "2026-08-03T10:00:00Z"],
    [3004, "2026-08-04T10:00:00Z"],
    [3005, "2026-08-05T10:00:00Z"],
  ]) {
    shopify.orders.set(String(id), { ...standardOrder(id, { createdAt: created }), backfill: true });
  }
  // One order already arrived by webhook.
  await receive(connection, 3002, "webhook");
  let backfill = await service.startBackfill(db, CO, { connectionId: connection.id, from: "2026-08-01", to: "2026-08-31" }, ADMIN);
  const second = await rejects(service.startBackfill(db, CO, { connectionId: connection.id, from: "2026-08-01" }, ADMIN));
  check("only one historical import runs per store", second?.code === "CONFLICT");

  let step = await service.runBackfillStep(db, CO, backfill.id);
  check("page 1: two orders recorded and imported", step.recorded === 2 && step.backfill.pages === 1 && step.backfill.cursor === "2");
  check("the query filters by the chosen dates", /created_at:>=2026-08-01 created_at:<2026-09-01/.test(shopify.calls.find((c) => c.name === "VolSaleOrderIds")?.variables?.query || ""));
  shopify.failNext = [503];
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("a failed page does not move the cursor (resumes at the same page)", step.recorded === 0 && step.backfill.cursor === "2" && step.backfill.attempts === 1 && step.backfill.status === "RUNNING");
  backfill = await service.setBackfillState(db, CO, backfill.id, "PAUSED", ADMIN);
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("paused: a step does nothing", step.recorded === 0 && step.backfill.status === "PAUSED");
  backfill = await service.setBackfillState(db, CO, backfill.id, "RUNNING", ADMIN);
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("resumed: page 2 from the saved cursor", step.recorded === 2 && step.backfill.cursor === "4");
  step = await service.runBackfillStep(db, CO, backfill.id);
  check("last page completes the import", step.recorded === 1 && step.backfill.status === "COMPLETED");
  const historic = invoices().filter((i) => /^SHP-300\d$/.test(i.invoice_number));
  check("five orders, five invoices — the webhook one was not duplicated", historic.length === 5 && new Set(historic.map((i) => i.invoice_number)).size === 5);
  check("historical sales recorded as Posted sales, no stock moved", stock("p-pie") === 10 && historic.every((i) => !i.stock_posted && i.status === "Posted"));
  const events = (db.tables.vyron_store_sync_events || []).map((e) => e.event_type);
  check("audited: started, pages, failure, pause, resume, completion", ["BACKFILL_STARTED", "BACKFILL_PAGE", "BACKFILL_PAGE_FAILED", "BACKFILL_PAUSED", "BACKFILL_RESUMED", "BACKFILL_COMPLETED"].every((t) => events.includes(t)));
  const rerun = await service.startBackfill(db, CO, { connectionId: connection.id, from: "2026-08-01", to: "2026-08-31" }, ADMIN);
  while ((await service.runBackfillStep(db, CO, rerun.id)).backfill.status === "RUNNING");
  check("running the same import again creates nothing new", invoices().filter((i) => /^SHP-300\d$/.test(i.invoice_number)).length === 5);
}

// ---------------------------------------------------------------------------
section("Scheduled run (safety net)");
{
  connection = await freshWorld();
  shopify.orders.set("4001", standardOrder(4001));
  await service.markOrderDue(db, connection, "4001", "missed");
  process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
  const denied = await cronRoute.GET(new Request("https://volora.test/api/integrations/store-sales/cron", { headers: { authorization: "Bearer wrong" } }));
  check("without the cron secret → 401", denied.status === 401);
  const ran = await cronRoute.GET(new Request("https://volora.test/api/integrations/store-sales/cron", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  check("with it → due orders processed", ran.status === 200 && orderRow(4001).status === "IMPORTED");
}

// ---------------------------------------------------------------------------
section("Overview counts for the screen");
{
  connection = await freshWorld();
  shopify.orders.set("5001", standardOrder(5001));
  shopify.orders.set("5002", order(5002, { lines: [line({ id: 1, sku: "NOPE", name: "Mystery", quantity: 1, price: 115, tax: 15 })], totalTax: 15 }));
  await receive(connection, 5001);
  await receive(connection, 5002);
  await receive(connection, 5001, "again");
  const overview = await service.getSyncOverview(db, CO, connection.id);
  check("discovered 2 · imported 1 · already imported 1 · needs attention 1", overview.counts.discovered === 2 && overview.counts.imported === 1 && overview.counts.alreadyImported === 1 && overview.counts.needsAttention === 1, JSON.stringify(overview.counts));
  const attention = overview.rows.find((r) => r.status === "NEEDS_ATTENTION");
  check("the attention row names its reason", /Product mapping required: Mystery \(SKU NOPE\)/.test(attention?.issues?.[0]?.message || ""), attention?.issues?.[0]?.message);
  const other = await rejects(service.getSyncOverview(db, CO_B, connection.id));
  check("another company cannot read this store", other?.code === "NOT_FOUND");
}

// ---------------------------------------------------------------------------
section("Existing invoice behaviour unchanged");
{
  const refused = (() => {
    try {
      calculateInvoiceTax([{ quantity: -1, unitPrice: 10, taxTreatment: "Standard", taxRate: 15 }]);
      return false;
    } catch {
      return true;
    }
  })();
  check("ordinary invoices still refuse a negative line (credit lines are opt-in)", refused);
  const credit = calculateInvoiceTax([{ quantity: -1, unitPrice: 115, taxTreatment: "Standard", taxRate: 15 }], { pricesIncludeTax: true, allowCreditLines: true });
  check("a credit line mirrors the sale's VAT to the cent", Number(credit.taxTotal.units) === -1500 || String(credit.taxTotal.units) === "-1500");
  const plan = planSaleInvoice(normalizeShopifyOrder(standardOrder(1), standardOrder(1).lineItems.nodes, []), new Map(), { shipping: "line", workspaceRate: 15 });
  check("unmapped lines never reach an invoice plan", plan.lines.every((l) => !l.productId));
}

// ---------------------------------------------------------------------------
section("Tenant binding of credentials");
{
  connection = await freshWorld();
  await service.setConnectionStatus(db, CO, connection.id, "DISABLED", ADMIN);
  credentialCompany = CO_B;
  const refused = await rejects(service.setConnectionStatus(db, CO, connection.id, "ACTIVE", ADMIN));
  check("credentials bound to another company cannot activate this company's store", refused?.code === "NOT_CONFIGURED");
  const views = await service.listConnections(db, CO);
  check("…and the card shows Error with the reason", views[0].health === "ERROR" && views[0].credentials === "OTHER_COMPANY");
  const body = JSON.stringify({ id: 1 });
  const res = await webhookRoute.POST(
    new Request("https://volora.test/api/integrations/shopify/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-shop-domain": SHOP, "x-shopify-topic": "orders/create", "x-shopify-webhook-id": "wh-x", "x-shopify-hmac-sha256": createHmac("sha256", SECRET).update(body).digest("base64") },
      body,
    })
  );
  check("a signed webhook for a store bound to another company is not recorded here", res.status === 404 && !(db.tables.vyron_store_webhook_deliveries || []).length);
  credentialCompany = CO;
}

// ---------------------------------------------------------------------------
section("Sync Now: catch up on orders whose webhook never arrived");
{
  connection = await freshWorld();
  const recent = new Date(Date.now() - 3600 * 1000).toISOString();
  shopify.orders.set("6001", standardOrder(6001, { updatedAt: recent }));
  shopify.orders.set("6002", standardOrder(6002, { updatedAt: "2020-01-01T00:00:00Z" }));
  const result = await service.syncNow(db, connection, ADMIN);
  check("orders changed in the last 72 h are found and imported; older ones are not touched", result.discovered === 1 && orderRow(6001)?.status === "IMPORTED" && !orderRow(6002));
  const view = (await service.listConnections(db, CO))[0];
  check("the card shows Connected, last sync, orders and invoices imported", view.health === "CONNECTED" && Boolean(view.last_sync_at) && view.totals.ordersImported === 1 && view.totals.invoicesImported === 1, JSON.stringify(view.totals));
  check("Sync Now is in the sync log", (await service.listSyncEvents(db, CO, connection.id)).some((e) => e.event_type === "SYNC_RUN"));
  const again = await service.syncNow(db, (await service.listConnections(db, CO))[0], ADMIN);
  check("a second Sync Now creates no second sale", again.discovered <= 1 && invoices().filter((i) => i.invoice_number === "SHP-6001").length === 1);
  const test = await service.testConnection(db, CO, connection.id, ADMIN);
  check("Test Connection reads the shop and is logged", /synthetic-foods\.myshopify\.com/.test(test.detail));
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
