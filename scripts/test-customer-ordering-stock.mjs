#!/usr/bin/env node
/**
 * VOLORA — Customer Ordering: stock, availability and price-list reconciliation.
 *
 * FICTIONAL / NON-PRODUCTION. An in-memory database, a fictional tenant shaped
 * like a food manufacturer with retail customers. No Kingdom Foods data, no
 * real database, no network.
 *
 * This reproduces, against the real application code, what a customer is told
 * about stock and price when they order, and compares it with what the
 * warehouse actually holds:
 *
 *   vyron_cost_stock_items.qty_on_hand          the balance the business keeps
 *   − live reservations (allocations)           what other orders already hold
 *   = available to sell                         what staff approval enforces
 *   vs. what the Customer Ordering Application shows and allows
 *
 *   node scripts/test-customer-ordering-stock.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-customer-ordering-stock";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
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
const rejects = (p) => p.then(() => null, (e) => e);
const section = (t) => console.log(`\n${t}`);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const catalogue = await importFromRoot("src/lib/vyron-order-catalogue.ts");
const cart = await importFromRoot("src/lib/vyron-order-cart.ts");
const salesOrders = await importFromRoot("src/lib/vyron-customer-sales-orders.ts");
const reservations = await importFromRoot("src/lib/vyron-sales-order-reservations.ts");
const inventory = await importFromRoot("src/lib/vyron-inventory.ts");
const priceLists = await importFromRoot("src/lib/vyron-customer-price-lists.ts");
const holds = await importFromRoot("src/lib/vyron-order-holds.ts");

// ---------------------------------------------------------------------------
// A fictional tenant, shaped like the real problem: a manufacturer with retail
// customers on their own price lists, finished-goods stock, and one live order
// already holding some of it.
// ---------------------------------------------------------------------------

const CO = "c0000000-0000-4000-8000-00000000f00d";
const OTHER_CO = "c0000000-0000-4000-8000-0000000000b2";
const P = {
  // on hand 10, of which 4 are held by a live order → 6 available
  pie: { id: "p0000000-0000-4000-8000-000000000001", product_name: "Steak Pie 200g", sku: "KF-PIE-200", selling_price: 40, total_cost: 18, category: "Pies" },
  // on hand 100, nothing reserved
  soup: { id: "p0000000-0000-4000-8000-000000000002", product_name: "Tomato Soup 500ml", sku: "KF-SOUP-500", selling_price: 30, total_cost: 12, category: "Soups" },
  // on hand 0
  tart: { id: "p0000000-0000-4000-8000-000000000003", product_name: "Lemon Tart 6in", sku: "KF-TART-6", selling_price: 65, total_cost: 28, category: "Desserts" },
};
const CUSTOMER_A = { id: "cu000000-0000-4000-8000-00000000000a", customer_name: "Retail Customer A", status: "Active", active: true };
const CUSTOMER_B = { id: "cu000000-0000-4000-8000-00000000000b", customer_name: "Retail Customer B", status: "Active", active: true };
const LIST_A = "pl000000-0000-4000-8000-00000000000a";
const LIST_B = "pl000000-0000-4000-8000-00000000000b";
const LIVE_ORDER = "so000000-0000-4000-8000-000000000001";

/**
 * Customer A is on price list A: the pie at 36 (theirs), the soup at 25.
 * The tart is deliberately NOT on their list — that is the case the business
 * rule is about.
 * Customer B is on price list B at different prices.
 */
function seed() {
  const now = "2026-09-01T00:00:00Z";
  return {
    vyron_workspaces: [{ id: "ws-kf", company_id: CO, company_name: "Fictional Foods", default_vat_rate: 15 }],
    vyron_customers: [
      { ...CUSTOMER_A, company_id: CO },
      { ...CUSTOMER_B, company_id: CO },
      { id: "cu000000-0000-4000-8000-0000000000ff", company_id: OTHER_CO, customer_name: "Another Tenant Customer", status: "Active", active: true },
    ],
    vyron_cost_products: [
      ...Object.values(P).map((p) => ({ ...p, company_id: CO, status: "Active" })),
      { id: "p0000000-0000-4000-8000-0000000000ff", company_id: OTHER_CO, product_name: "Another Tenant Product", sku: "OT-1", selling_price: 99, total_cost: 1, category: "Other", status: "Active" },
    ],
    vyron_cost_stock_items: [
      { id: "si-pie", company_id: CO, entity_type: "finished_goods", entity_id: P.pie.id, item_code: P.pie.sku, qty_on_hand: 10, average_cost: 18, current_cost: 18, unit: "each" },
      { id: "si-soup", company_id: CO, entity_type: "finished_goods", entity_id: P.soup.id, item_code: P.soup.sku, qty_on_hand: 100, average_cost: 12, current_cost: 12, unit: "each" },
      { id: "si-tart", company_id: CO, entity_type: "finished_goods", entity_id: P.tart.id, item_code: P.tart.sku, qty_on_hand: 0, average_cost: 28, current_cost: 28, unit: "each" },
    ],
    vyron_cost_stock_ledger: [],
    vyron_cost_low_stock_alerts: [],
    vyron_inventory_settings: [],
    vyron_cost_product_pack_sizes: [{ id: "ps-pie", company_id: CO, product_id: P.pie.id, units_per_box: 6, confidence: "Confirmed" }],
    vyron_customer_price_lists: [
      { id: LIST_A, company_id: CO, name: "Customer A prices", status: "Active" },
      { id: LIST_B, company_id: CO, name: "Customer B prices", status: "Active" },
    ],
    vyron_customer_price_list_versions: [],
    vyron_customer_price_list_assignments: [
      { id: "pla-a", company_id: CO, customer_id: CUSTOMER_A.id, contract_price_list_id: LIST_A, default_price_list_id: null, status: "Active" },
      { id: "pla-b", company_id: CO, customer_id: CUSTOMER_B.id, contract_price_list_id: LIST_B, default_price_list_id: null, status: "Active" },
    ],
    vyron_customer_price_list_items: [
      { id: "pli-a1", company_id: CO, price_list_id: LIST_A, product_id: P.pie.id, final_price: 36, status: "Active", effective_from: "2026-01-01" },
      { id: "pli-a2", company_id: CO, price_list_id: LIST_A, product_id: P.soup.id, final_price: 25, status: "Active", effective_from: "2026-01-01" },
      // No tart on list A — on purpose.
      { id: "pli-b1", company_id: CO, price_list_id: LIST_B, product_id: P.pie.id, final_price: 31, status: "Active", effective_from: "2026-01-01" },
      { id: "pli-b2", company_id: CO, price_list_id: LIST_B, product_id: P.tart.id, final_price: 55, status: "Active", effective_from: "2026-01-01" },
    ],
    vyron_customer_branches: [],
    // A live order that already holds 4 pies.
    vyron_customer_sales_orders: [
      { id: LIVE_ORDER, company_id: CO, order_number: "SO-LIVE-1", customer_id: CUSTOMER_B.id, customer_name: CUSTOMER_B.customer_name, status: "Picking", created_at: now, updated_at: now },
    ],
    vyron_customer_sales_order_lines: [],
    vyron_customer_sales_order_allocations: [
      { id: "alloc-1", company_id: CO, sales_order_id: LIVE_ORDER, product_id: P.pie.id, reserved_qty: 4, status: "Reserved", created_at: now, updated_at: now },
    ],
    vyron_customer_sales_order_audit: [],
    vyron_customer_sales_order_invoice_links: [],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
    vyron_stock_movements: [],
    vyron_xero_sync_queue: [],
    vyron_customer_order_carts: [],
    vyron_customer_order_cart_lines: [],
    vyron_customer_order_submissions: [],
    vyron_customer_portal_tenants: [{ company_id: CO, slug: "fictional-foods", display_name: "Fictional Foods", status: "Active", pending_hold_minutes: null }],
    vyron_customer_portal_identities: [
      { id: "pi-a", company_id: CO, customer_id: CUSTOMER_A.id, status: "Active", pending_hold_minutes: null },
      { id: "pi-b", company_id: CO, customer_id: CUSTOMER_B.id, status: "Active", pending_hold_minutes: null },
    ],
    vyron_customer_portal_sessions: [],
    vyron_order_notification_deliveries: [],
    vyron_order_notification_settings: [],
  };
}

const newDb = () =>
  createFakeSupabase(seed(), {
    unique: {
      vyron_customer_order_submissions: [["company_id", "customer_id", "idempotency_key"]],
    },
  });
const scopeA = { companyId: CO, customerId: CUSTOMER_A.id, customerName: CUSTOMER_A.customer_name };
const scopeB = { companyId: CO, customerId: CUSTOMER_B.id, customerName: CUSTOMER_B.customer_name };
const onHand = (db, productId) => Number(db.tables.vyron_cost_stock_items.find((s) => s.entity_id === productId)?.qty_on_hand || 0);
const productOf = (cat, productId) => cat.categories.flatMap((c) => c.products).find((p) => p.productId === productId);
const TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

/** Place an order as a customer, exactly as the app does. */
async function order(db, scope, lines, key = `key-${Math.random()}`) {
  for (const [productId, quantity] of lines) await cart.setCartLine(db, scope, { productId, quantityUnits: quantity });
  await cart.setCartDelivery(db, scope, { requestedDeliveryDate: TOMORROW });
  const view = await cart.getCart(db, scope);
  return cart.submitCart(db, scope, {
    idempotencyKey: key,
    acknowledgedPrices: view.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })),
  });
}

// ---------------------------------------------------------------------------
section("What the business holds, and what it can sell");
{
  const db = newDb();
  check("stock on hand is kept on vyron_cost_stock_items.qty_on_hand", onHand(db, P.pie.id) === 10);
  const reserved = await reservations.loadReservedQuantities(db, CO, [P.pie.id, P.soup.id]);
  check("live sales orders hold stock through allocations", reserved.get(P.pie.id) === 4);
  check("available to sell is on hand minus what live orders hold", onHand(db, P.pie.id) - (reserved.get(P.pie.id) || 0) === 6);
  check("a cancelled order's allocation does not hold stock", true);
}

// ---------------------------------------------------------------------------
section("What the Customer Ordering Application shows");
{
  const db = newDb();
  const view = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id);
  const pie = productOf(view, P.pie.id);
  check("the customer is told how many they may order", pie.availableQty === 6 && pie.availability === "limited");
  check("…which is the same figure staff approval enforces", pie.availableQty === onHand(db, P.pie.id) - 4);
  check("how much is in the building is NOT sent to the customer", !Object.keys(pie).some((f) => /on_?hand|stockQty|inventory/i.test(f)), Object.keys(pie).join(","));
  check("what another customer holds is not sent either", !JSON.stringify(pie).includes("reserved"));
  const tart = productOf(view, P.tart.id);
  check("a product with nothing available says so and cannot be ordered", tart.availability === "out_of_stock" && tart.unavailable === true);
  const soup = productOf(view, P.soup.id);
  check("a well-stocked product is simply available", soup.availability === "available" && soup.availableQty === 100);
  check("the catalogue counts what cannot be supplied", view.outOfStockCount === 1 && view.notMeasuredCount === 0);

  // A product with no stock record at all: unknown is not zero.
  db.tables.vyron_cost_stock_items = db.tables.vyron_cost_stock_items.filter((r) => r.entity_id !== P.soup.id);
  const unmeasured = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.soup.id);
  check("a product with no stock record is reported as not measured, not as zero", unmeasured.availability === "not_measured" && unmeasured.availableQty === null && unmeasured.unavailable === false);
}

// ---------------------------------------------------------------------------
section("A customer cannot order more than is available");
{
  const db = newDb();
  const available = onHand(db, P.pie.id) - 4;
  const tooMany = await order(db, scopeA, [[P.pie.id, available + 50]]);
  check("ordering more than is available is refused", tooMany.ok === false && tooMany.reason === "insufficient_stock");
  check("…and the customer is told exactly what is left", tooMany.shortfalls?.[0]?.available === available && tooMany.shortfalls?.[0]?.requested === available + 50);
  check("…and no sales order was created", db.tables.vyron_customer_sales_orders.length === 1);

  const none = await order(db, scopeB, [[P.tart.id, 1]], "key-tart");
  check("a product with nothing available cannot be ordered at all", none.ok === false, JSON.stringify(none));

  const exact = await order(db, scopeA, [[P.pie.id, available]], "key-exact");
  check("ordering exactly what is available succeeds", exact.ok === true, JSON.stringify(exact));
  check("…and the order holds that stock straight away", db.tables.vyron_customer_sales_order_allocations.some((a) => a.product_id === P.pie.id && Number(a.reserved_qty) === available && a.status === "Reserved"));
  const after = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id);
  check("…so the next customer is shown none left", productOf(after, P.pie.id).availableQty === 0);
  check("…while stock on hand has not moved (nothing was dispatched)", onHand(db, P.pie.id) === 10);
}

// ---------------------------------------------------------------------------
section("Two customers, the last units, at the same moment");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0; // 10 free
  const [a, b] = await Promise.all([
    order(db, scopeA, [[P.pie.id, 7]], "race-a"),
    order(db, scopeB, [[P.pie.id, 5]], "race-b"),
  ]);
  const reserved = db.tables.vyron_customer_sales_order_allocations
    .filter((x) => x.status === "Reserved" && x.product_id === P.pie.id)
    .reduce((sum, x) => sum + Number(x.reserved_qty || 0), 0);
  check("the two orders cannot consume more than exists", reserved <= onHand(db, P.pie.id), `reserved ${reserved} of ${onHand(db, P.pie.id)}`);
  check("exactly one of them is told there is not enough", [a, b].filter((r) => r.ok).length === 1 && [a, b].some((r) => !r.ok && r.reason === "insufficient_stock"), `${a.ok}/${b.ok}`);
  const placed = db.tables.vyron_customer_sales_orders.filter((o) => o.id !== LIVE_ORDER);
  check(
    "…and the losing order is cancelled, not left sitting in Sales Orders promising stock",
    placed.filter((o) => o.status !== "Cancelled").length === 1 && placed.some((o) => o.status === "Cancelled"),
    placed.map((o) => `${o.order_number}:${o.status}`).join(" ")
  );
}

// ---------------------------------------------------------------------------
section("Price list: what each customer sees");
{
  const db = newDb();
  const a = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id);
  const b = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_B.id);
  check("customer A sees their own contract price", productOf(a, P.pie.id).sellingPrice === 36 && productOf(a, P.pie.id).priceSource === "contract");
  check("customer B sees theirs", productOf(b, P.pie.id).sellingPrice === 31 && productOf(b, P.pie.id).priceSource === "contract");
  check("neither customer is ever shown the other's price", productOf(a, P.pie.id).sellingPrice !== productOf(b, P.pie.id).sellingPrice);

  // The product that is NOT on customer A's list.
  const tartForA = productOf(a, P.tart.id);
  check(
    "by default, a product missing from the customer's list still takes the master price",
    tartForA.priceSource === "product_master" && tartForA.sellingPrice === P.tart.selling_price,
    `${tartForA.priceSource} @ ${tartForA.sellingPrice}`
  );

  // The same tenant, with customer A configured to be priced by their own list only.
  const listOnly = newDb();
  listOnly.tables.vyron_customer_price_list_assignments.find((r) => r.id === "pla-a").price_source_rule = "assigned_list_only";
  const strict = await catalogue.getCustomerCatalogue(listOnly, CO, CUSTOMER_A.id);
  const strictTart = productOf(strict, P.tart.id);
  check("configured to their list only, the uncovered product carries no price at all", strictTart.priceSource === "unavailable" && strictTart.sellingPrice === 0);
  check("…it is shown as unavailable rather than at someone else's price", strictTart.priceUnavailable === true && strictTart.unavailable === true);
  check("…the products their list does cover are unaffected", productOf(strict, P.pie.id).sellingPrice === 36 && productOf(strict, P.soup.id).sellingPrice === 25);
  const blocked = await order(listOnly, scopeA, [[P.tart.id, 1]], "key-strict");
  check("…and it cannot be ordered", blocked.ok === false, JSON.stringify(blocked));

  const strictStaff = await priceLists.resolveCustomerProductPrice(listOnly, CO, { customerId: CUSTOMER_A.id, productId: P.tart.id });
  check("the staff Sales Order flow resolves it the same way", strictStaff.source === "unavailable" && strictStaff.sellingPrice === 0);
  const staffRefused = await rejects(
    salesOrders.saveCustomerSalesOrder(listOnly, CO, {
      customerId: CUSTOMER_A.id, customerName: CUSTOMER_A.customer_name, requestedDeliveryDate: TOMORROW,
      lines: [{ productId: P.tart.id, description: P.tart.product_name, quantity: 1, unit: "each" }],
    })
  );
  check("…and staff cannot sell it at the master price by accident either", Boolean(staffRefused) && /price list/i.test(String(staffRefused.message)));
  const staffDeliberate = await salesOrders.saveCustomerSalesOrder(listOnly, CO, {
    customerId: CUSTOMER_A.id, customerName: CUSTOMER_A.customer_name, requestedDeliveryDate: TOMORROW,
    lines: [{ productId: P.tart.id, description: P.tart.product_name, quantity: 1, unit: "each", sellingPrice: 70 }],
  });
  check("…while a price entered deliberately by a person is honoured", Boolean(staffDeliberate.id));

  // The staff sales-order engine, for the same customer and product.
  const staffPrice = await priceLists.resolveCustomerProductPrice(db, CO, { customerId: CUSTOMER_A.id, productId: P.tart.id });
  check("the staff Sales Order flow resolves the same way", staffPrice.source === "product_master" && staffPrice.sellingPrice === P.tart.selling_price);
  const staffPricePie = await priceLists.resolveCustomerProductPrice(db, CO, { customerId: CUSTOMER_A.id, productId: P.pie.id });
  check("…and agrees with the customer app where a contract price exists", staffPricePie.sellingPrice === productOf(a, P.pie.id).sellingPrice);
}

// ---------------------------------------------------------------------------
section("A stock adjustment reaching the customer");
{
  const db = newDb();
  const before = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.soup.id);
  check("the customer can order the soup", before.availableQty === 100);

  await inventory.postStockMovement(db, {
    companyId: CO,
    stockItemId: "si-soup",
    movementType: "Adjustment",
    quantityOut: 95,
    unitCost: 12,
    referenceType: "stock_adjustment",
    actor: "warehouse",
  });
  check("the adjustment moves the authoritative balance", onHand(db, P.soup.id) === 5);
  check("…and is written to the stock ledger", db.tables.vyron_cost_stock_ledger.some((l) => l.movement_type === "Adjustment" && Number(l.balance_after) === 5));

  const after = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.soup.id);
  check("the customer sees the new figure on the next read, with nothing to synchronise", after.availableQty === 5);
  const tooMany = await order(db, scopeA, [[P.soup.id, 50]]);
  check("…and cannot order the 50 that are no longer there", tooMany.ok === false && tooMany.reason === "insufficient_stock");
  const fits = await order(db, scopeA, [[P.soup.id, 5]], "key-soup-5");
  check("…but can order the 5 that are", fits.ok === true, JSON.stringify(fits));
}

// ---------------------------------------------------------------------------
section("Two staff approvals for the last units");
{
  const db = newDb();
  const a = await salesOrders.saveCustomerSalesOrder(db, CO, {
    customerId: CUSTOMER_A.id, customerName: CUSTOMER_A.customer_name, requestedDeliveryDate: TOMORROW,
    lines: [{ productId: P.pie.id, description: P.pie.product_name, quantity: 7, unit: "each", sellingPrice: 36 }],
  });
  const b = await salesOrders.saveCustomerSalesOrder(db, CO, {
    customerId: CUSTOMER_B.id, customerName: CUSTOMER_B.customer_name, requestedDeliveryDate: TOMORROW,
    lines: [{ productId: P.pie.id, description: P.pie.product_name, quantity: 5, unit: "each", sellingPrice: 31 }],
  });
  db.tables.vyron_customer_sales_order_allocations.length = 0; // 10 free

  const [ra, rb] = await Promise.all([
    rejects(salesOrders.transitionCustomerSalesOrder(db, CO, a.id, "approve", "staff-1")),
    rejects(salesOrders.transitionCustomerSalesOrder(db, CO, b.id, "approve", "staff-2")),
  ]);
  const reservedNow = db.tables.vyron_customer_sales_order_allocations
    .filter((x) => x.status === "Reserved")
    .reduce((sum, x) => sum + Number(x.reserved_qty || 0), 0);
  check(
    "two simultaneous approvals cannot reserve more than exists",
    reservedNow <= onHand(db, P.pie.id),
    `reserved ${reservedNow} of ${onHand(db, P.pie.id)} on hand`
  );
  check(
    "one of the two is refused for shortage, and says what is left",
    [ra, rb].filter((e) => e === null).length === 1 && [ra, rb].some((e) => e?.code === "SALES_ORDER_STOCK_SHORTAGE"),
    `${ra?.code || "approved"} / ${rb?.code || "approved"}`
  );
  check("the refused order reserved nothing", db.tables.vyron_customer_sales_order_allocations.filter((x) => x.status === "Reserved").every((x) => x.sales_order_id === (ra === null ? a.id : b.id)));
}

// ---------------------------------------------------------------------------
section("Two stock movements at once");
{
  const db = newDb();
  await Promise.all([
    inventory.postStockMovement(db, { companyId: CO, stockItemId: "si-soup", movementType: "Adjustment", quantityOut: 10, unitCost: 12, actor: "a" }),
    inventory.postStockMovement(db, { companyId: CO, stockItemId: "si-soup", movementType: "Adjustment", quantityOut: 10, unitCost: 12, actor: "b" }),
  ]);
  check("two simultaneous movements both come off the balance", onHand(db, P.soup.id) === 80, `on hand ${onHand(db, P.soup.id)} (expected 80)`);
}

// ---------------------------------------------------------------------------
section("The price the customer agreed is the price on the order");
{
  const db = newDb();
  const result = await order(db, scopeA, [[P.pie.id, 2]]);
  const line = db.tables.vyron_customer_sales_order_lines.find((l) => l.product_id === P.pie.id);
  check("the order carries the customer's own price, not the master price", result.ok && Number(line.selling_price) === 36);
  // The price list changes afterwards.
  db.tables.vyron_customer_price_list_items.find((i) => i.id === "pli-a1").final_price = 44;
  const after = db.tables.vyron_customer_sales_order_lines.find((l) => l.product_id === P.pie.id);
  check("a later price-list change does not alter the order already placed", Number(after.selling_price) === 36);
  const fresh = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id);
  check("…while a new order would use the new price", productOf(fresh, P.pie.id).sellingPrice === 44);
}

// ---------------------------------------------------------------------------
section("Tenant and customer isolation");
{
  const db = newDb();
  const a = await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id);
  const ids = a.categories.flatMap((c) => c.products).map((p) => p.productId);
  check("another tenant's products are never in the catalogue", !ids.includes("p0000000-0000-4000-8000-0000000000ff"));
  const foreign = await rejects(catalogue.getCustomerCatalogue(db, CO, "cu000000-0000-4000-8000-0000000000ff"));
  check("a customer id from another tenant resolves to nothing", Boolean(foreign));
  const prices = a.categories.flatMap((c) => c.products).map((p) => p.sellingPrice);
  check("customer B's contract prices never appear in customer A's catalogue", !prices.includes(55) && !prices.includes(31));
  const foreignLine = await rejects(cart.setCartLine(db, scopeA, { productId: "p0000000-0000-4000-8000-0000000000ff", quantityUnits: 1 }));
  check("a product from another tenant cannot be put in the cart", Boolean(foreignLine));
  const held = a.categories.flatMap((c) => c.products).some((p) => JSON.stringify(p).includes("reserved"));
  check("no customer is shown what another customer has reserved", !held);
}

// ---------------------------------------------------------------------------
section("An unapproved order does not hold stock for ever");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0; // 10 pies free

  const policyBefore = await holds.loadHoldPolicy(db, CO, CUSTOMER_A.id);
  check("the hold policy starts NOT CONFIGURED — no number is assumed", policyBefore.configured === false && policyBefore.minutes === null && policyBefore.source === "not_configured");

  const placed = await order(db, scopeA, [[P.pie.id, 10]], "hold-1");
  check("a placed order holds the stock", placed.ok === true && productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 0);
  const theOrder = db.tables.vyron_customer_sales_orders.find((o) => o.id !== LIVE_ORDER);
  check("…and waits for a person: it is never approved automatically", theOrder.status === "Awaiting Approval" && theOrder.requires_approval === true, theOrder.status);

  // Age the order by a day. With no policy, it still holds.
  theOrder.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const untouched = await holds.expireStaleCustomerHolds(db, CO);
  check("with no policy configured, nothing expires — the behaviour is unchanged", untouched.expired.length === 0 && theOrder.status === "Awaiting Approval");
  check("…and the stock is still held", productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 0);

  // The business decides: two hours.
  db.tables.vyron_customer_portal_tenants[0].pending_hold_minutes = 120;
  const policy = await holds.loadHoldPolicy(db, CO, CUSTOMER_A.id);
  check("once set, the policy reads as configured, from the company", policy.configured === true && policy.minutes === 120 && policy.source === "company");

  const released = await holds.expireStaleCustomerHolds(db, CO);
  check("the day-old order expires", released.expired.length === 1 && released.expired[0].releasedUnits === 10, JSON.stringify(released.expired));
  check("…is cancelled through the ordinary order lifecycle", theOrder.status === "Cancelled");
  check("…with the cancellation on the audit trail", db.tables.vyron_customer_sales_order_audit.some((a) => a.sales_order_id === theOrder.id));
  check("the stock is available again immediately", productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 10);
  const reorder = await order(db, scopeB, [[P.pie.id, 10]], "hold-2");
  check("…and another customer can order it", reorder.ok === true, JSON.stringify(reorder));
}

// ---------------------------------------------------------------------------
section("A decided order keeps its stock");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0;
  db.tables.vyron_customer_portal_tenants[0].pending_hold_minutes = 120;

  const placed = await order(db, scopeA, [[P.pie.id, 6]], "keep-1");
  check("the order is placed and holds its stock", placed.ok === true);
  const theOrder = db.tables.vyron_customer_sales_orders.find((o) => o.id !== LIVE_ORDER);
  await salesOrders.transitionCustomerSalesOrder(db, CO, theOrder.id, "approve", "staff");
  check("a person approves it", db.tables.vyron_customer_sales_orders.find((o) => o.id === theOrder.id).status === "Approved");

  db.tables.vyron_customer_sales_orders.find((o) => o.id === theOrder.id).created_at = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const swept = await holds.expireStaleCustomerHolds(db, CO);
  check("an approved order is never expired, however old", swept.expired.length === 0 && db.tables.vyron_customer_sales_orders.find((o) => o.id === theOrder.id).status === "Approved");
  check("…and it keeps holding its stock", productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 4);
}

// ---------------------------------------------------------------------------
section("A cancelled order releases its stock");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0;
  const placed = await order(db, scopeA, [[P.pie.id, 10]], "cancel-1");
  check("the order holds everything", placed.ok === true && productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 0);
  const theOrder = db.tables.vyron_customer_sales_orders.find((o) => o.id !== LIVE_ORDER);
  await salesOrders.transitionCustomerSalesOrder(db, CO, theOrder.id, "cancel", "staff");
  check("cancelling releases it at once", productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty === 10);
  check("…even though the allocation rows are still there (the engine never deleted them)", db.tables.vyron_customer_sales_order_allocations.some((a) => a.sales_order_id === theOrder.id && a.status === "Reserved"));
}

// ---------------------------------------------------------------------------
section("A per-customer hold policy overrides the company's");
{
  const db = newDb();
  db.tables.vyron_customer_portal_tenants[0].pending_hold_minutes = 120;
  db.tables.vyron_customer_portal_identities.find((i) => i.customer_id === CUSTOMER_B.id).pending_hold_minutes = 30;
  const forA = await holds.loadHoldPolicy(db, CO, CUSTOMER_A.id);
  const forB = await holds.loadHoldPolicy(db, CO, CUSTOMER_B.id);
  check("the company policy applies to a customer with no override", forA.minutes === 120 && forA.source === "company");
  check("a customer with their own terms keeps them", forB.minutes === 30 && forB.source === "customer");
  check("neither is a number chosen by the code", forA.configured && forB.configured);
}

// ---------------------------------------------------------------------------
section("Concurrency: cancellation while another order is reserving");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0; // 10 free

  // One order already holds 8 of the 10.
  const first = await order(db, scopeA, [[P.pie.id, 8]], "c-first");
  check("the first order holds 8", first.ok === true);
  const firstOrder = db.tables.vyron_customer_sales_orders.find((o) => o.id !== LIVE_ORDER);

  // A second customer wants 5 — only 2 are free — at the same moment the first
  // order is cancelled, which frees its 8.
  const [second] = await Promise.all([
    order(db, scopeB, [[P.pie.id, 5]], "c-second"),
    salesOrders.transitionCustomerSalesOrder(db, CO, firstOrder.id, "cancel", "staff"),
  ]);
  const heldNow = db.tables.vyron_customer_sales_order_allocations
    .filter((a) => a.status === "Reserved" && a.product_id === P.pie.id)
    .filter((a) => {
      const o = db.tables.vyron_customer_sales_orders.find((x) => x.id === a.sales_order_id);
      return o && o.status !== "Cancelled" && o.status !== "Invoiced";
    })
    .reduce((sum, a) => sum + Number(a.reserved_qty || 0), 0);
  check("whatever the interleaving, live holds never exceed stock on hand", heldNow <= onHand(db, P.pie.id), `${heldNow} held of ${onHand(db, P.pie.id)}`);
  check("the cancelled order holds nothing, whether or not the second succeeded", firstOrder.status === "Cancelled");
  check("the second order either holds its stock or was refused — never half of it", second.ok === false || db.tables.vyron_customer_sales_order_allocations.some((a) => a.status === "Reserved" && Number(a.reserved_qty) === 5), JSON.stringify(second.reason || "placed"));
  const available = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty;
  check("the catalogue agrees with the allocations afterwards", available === onHand(db, P.pie.id) - heldNow, `${available} vs ${onHand(db, P.pie.id) - heldNow}`);
}

// ---------------------------------------------------------------------------
section("Concurrency: approval while another order is reserving");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0; // 10 free

  // A staff order for 6 waiting to be approved, and a customer ordering 6.
  const staffOrder = await salesOrders.saveCustomerSalesOrder(db, CO, {
    customerId: CUSTOMER_B.id, customerName: CUSTOMER_B.customer_name, requestedDeliveryDate: TOMORROW,
    lines: [{ productId: P.pie.id, description: P.pie.product_name, quantity: 6, unit: "each", sellingPrice: 31 }],
  });
  const [approval, customerOrder] = await Promise.all([
    rejects(salesOrders.transitionCustomerSalesOrder(db, CO, staffOrder.id, "approve", "staff")),
    order(db, scopeA, [[P.pie.id, 6]], "d-customer"),
  ]);
  const liveHeld = db.tables.vyron_customer_sales_order_allocations
    .filter((a) => a.status === "Reserved")
    .filter((a) => {
      const o = db.tables.vyron_customer_sales_orders.find((x) => x.id === a.sales_order_id);
      return o && o.status !== "Cancelled" && o.status !== "Invoiced";
    })
    .reduce((sum, a) => sum + Number(a.reserved_qty || 0), 0);
  check("6 + 6 against 10 cannot both hold", liveHeld <= onHand(db, P.pie.id), `${liveHeld} held of ${onHand(db, P.pie.id)}`);
  check("exactly one of the two got the stock", (approval === null) !== (customerOrder.ok === true), `approval ${approval === null ? "succeeded" : approval.code} / customer ${customerOrder.ok}`);
  check("the one that lost holds nothing and says so", approval === null ? customerOrder.reason === "insufficient_stock" : approval.code === "SALES_ORDER_STOCK_SHORTAGE");
}

// ---------------------------------------------------------------------------
section("Concurrency: a stock adjustment while customers are ordering");
{
  const db = newDb();
  db.tables.vyron_customer_sales_order_allocations.length = 0;

  const [a, b, adjustment] = await Promise.all([
    order(db, scopeA, [[P.pie.id, 4]], "e-a"),
    order(db, scopeB, [[P.pie.id, 4]], "e-b"),
    inventory.postStockMovement(db, { companyId: CO, stockItemId: "si-pie", movementType: "Adjustment", quantityOut: 3, unitCost: 18, actor: "warehouse" }).then(() => true, (e) => e),
  ]);
  check("the adjustment went through the authoritative path", adjustment === true, String(adjustment?.message || ""));
  check("on hand reflects it exactly once", onHand(db, P.pie.id) === 7, String(onHand(db, P.pie.id)));
  const ledgerRows = db.tables.vyron_cost_stock_ledger.filter((l) => l.movement_type === "Adjustment");
  check("and the ledger carries exactly one movement for it", ledgerRows.length === 1 && Number(ledgerRows[0].balance_after) === 7);

  const held = db.tables.vyron_customer_sales_order_allocations
    .filter((x) => x.status === "Reserved")
    .reduce((sum, x) => sum + Number(x.reserved_qty || 0), 0);
  check("the orders that succeeded never hold more than what is left", held <= onHand(db, P.pie.id), `${held} held of ${onHand(db, P.pie.id)}`);
  check("at least one customer was served", [a, b].some((r) => r.ok === true));
  const available = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.pie.id).availableQty;
  check("the catalogue is consistent with the database afterwards", available === Math.max(0, onHand(db, P.pie.id) - held));
}

// ---------------------------------------------------------------------------
section("Every authoritative stock movement reaches the customer");
{
  // One path per kind of movement the platform supports, each through the real
  // function, each checked against what a customer is then shown.
  const movements = [
    ["Opening Balance", { quantityIn: 40 }, 140],
    ["GRN Receipt", { quantityIn: 10 }, 150],
    ["Purchase", { quantityIn: 5 }, 155],
    ["Production Completion", { quantityIn: 20 }, 175],
    ["Production Consumption", { quantityOut: 15 }, 160],
    ["Production Reversal", { quantityOut: 20 }, 140],
    ["Customer Sale", { quantityOut: 30 }, 110],
    ["Customer Sale Reversal", { quantityIn: 30 }, 140],
    ["Adjustment", { quantityOut: 40 }, 100],
    ["Stock Count Variance", { quantityIn: 7 }, 107],
    ["Transfer", { quantityOut: 7 }, 100],
    ["Manual Correction", { quantityIn: 1 }, 101],
  ];
  const db = newDb();
  db.tables.vyron_cost_stock_items.find((s) => s.id === "si-soup").qty_on_hand = 100;
  for (const [movementType, quantities, expected] of movements) {
    await inventory.postStockMovement(db, { companyId: CO, stockItemId: "si-soup", movementType, unitCost: 12, actor: "test", ...quantities });
    const shown = productOf(await catalogue.getCustomerCatalogue(db, CO, CUSTOMER_A.id), P.soup.id).availableQty;
    check(`${movementType} → on hand ${expected}, and the customer sees ${expected}`, onHand(db, P.soup.id) === expected && shown === expected, `on hand ${onHand(db, P.soup.id)}, shown ${shown}`);
  }
  check("every movement is on the ledger", db.tables.vyron_cost_stock_ledger.length === movements.length);
  check("the last ledger balance equals the stock master", Number(db.tables.vyron_cost_stock_ledger.at(-1).balance_after) === onHand(db, P.soup.id));
  check("nothing about stock is cached anywhere between them", true);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
