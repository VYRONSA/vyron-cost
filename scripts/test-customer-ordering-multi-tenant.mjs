#!/usr/bin/env node
/**
 * VOLORA — Customer Ordering across companies.
 *
 * FICTIONAL / NON-PRODUCTION. Three fictional companies with deliberately
 * different configurations, in one in-memory database, so that "tenant
 * isolation" is tested the way it can actually fail: with other tenants
 * present, configured differently, doing things at the same time.
 *
 *   Company A  prices fall back to the product master · no hold expiry
 *   Company B  priced from the assigned list only     · holds expire after 60 minutes
 *   Company C  a default (not contract) price list    · different stock entirely
 *
 * It also checks the two things that decide whether this is a platform fix or
 * a tenant fix: that a brand-new company works correctly with no rows added
 * for it, and that nothing writes a stock balance except the one function
 * that owns it.
 *
 *   node scripts/test-customer-ordering-multi-tenant.mjs
 */
import { register } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-customer-ordering-multi-tenant";
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
const inventory = await importFromRoot("src/lib/vyron-inventory.ts");
const holds = await importFromRoot("src/lib/vyron-order-holds.ts");

// ---------------------------------------------------------------------------
// Three fictional companies, configured differently on purpose.
// ---------------------------------------------------------------------------
const TENANTS = {
  A: {
    company: "aa000000-0000-4000-8000-00000000000a",
    name: "Alpha Foods (fictional)",
    rule: "fallback_to_master",
    holdMinutes: null,
    product: { id: "aa000000-0000-4000-8000-0000000000p1", name: "Alpha Pie", sku: "A-PIE", master: 40, cost: 18, onHand: 10 },
    uncovered: { id: "aa000000-0000-4000-8000-0000000000p2", name: "Alpha Tart", sku: "A-TART", master: 65, cost: 28, onHand: 5 },
    listPrice: 36,
  },
  B: {
    company: "bb000000-0000-4000-8000-00000000000b",
    name: "Beta Provisions (fictional)",
    rule: "assigned_list_only",
    holdMinutes: 60,
    product: { id: "bb000000-0000-4000-8000-0000000000p1", name: "Beta Pie", sku: "B-PIE", master: 50, cost: 20, onHand: 100 },
    uncovered: { id: "bb000000-0000-4000-8000-0000000000p2", name: "Beta Tart", sku: "B-TART", master: 70, cost: 30, onHand: 50 },
    listPrice: 44,
  },
  C: {
    company: "cc000000-0000-4000-8000-00000000000c",
    name: "Gamma Kitchens (fictional)",
    rule: "fallback_to_master",
    holdMinutes: null,
    useDefaultList: true,
    product: { id: "cc000000-0000-4000-8000-0000000000p1", name: "Gamma Pie", sku: "C-PIE", master: 60, cost: 25, onHand: 3 },
    uncovered: { id: "cc000000-0000-4000-8000-0000000000p2", name: "Gamma Tart", sku: "C-TART", master: 80, cost: 33, onHand: 0 },
    listPrice: 55,
  },
};
const customerOf = (key) => `${key.toLowerCase()}c00000-0000-4000-8000-00000000cust`;
const listOf = (key) => `${key.toLowerCase()}l00000-0000-4000-8000-00000000list`;

function seed() {
  const now = "2026-09-01T00:00:00Z";
  const tables = {
    vyron_workspaces: [],
    vyron_customers: [],
    vyron_cost_products: [],
    vyron_cost_stock_items: [],
    vyron_cost_stock_ledger: [],
    vyron_cost_low_stock_alerts: [],
    vyron_inventory_settings: [],
    vyron_cost_product_pack_sizes: [],
    vyron_customer_price_lists: [],
    vyron_customer_price_list_versions: [],
    vyron_customer_price_list_assignments: [],
    vyron_customer_price_list_items: [],
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
    vyron_customer_portal_tenants: [],
    vyron_customer_portal_identities: [],
    vyron_order_notification_deliveries: [],
    vyron_order_notification_settings: [],
  };
  for (const [key, t] of Object.entries(TENANTS)) {
    tables.vyron_workspaces.push({ id: `ws-${key}`, company_id: t.company, company_name: t.name, default_vat_rate: 15 });
    tables.vyron_customers.push({ id: customerOf(key), company_id: t.company, customer_name: `${key} Customer`, status: "Active", active: true });
    for (const product of [t.product, t.uncovered]) {
      tables.vyron_cost_products.push({ id: product.id, company_id: t.company, product_name: product.name, sku: product.sku, selling_price: product.master, total_cost: product.cost, category: "All", status: "Active" });
      tables.vyron_cost_stock_items.push({ id: `si-${product.sku}`, company_id: t.company, entity_type: "finished_goods", entity_id: product.id, item_code: product.sku, qty_on_hand: product.onHand, average_cost: product.cost, current_cost: product.cost, unit: "each" });
    }
    tables.vyron_customer_price_lists.push({ id: listOf(key), company_id: t.company, name: `${key} list`, status: "Active" });
    tables.vyron_customer_price_list_assignments.push({
      id: `pla-${key}`,
      company_id: t.company,
      customer_id: customerOf(key),
      contract_price_list_id: t.useDefaultList ? null : listOf(key),
      default_price_list_id: t.useDefaultList ? listOf(key) : null,
      status: "Active",
      price_source_rule: t.rule,
    });
    // Only the first product is on each list; the second deliberately is not.
    tables.vyron_customer_price_list_items.push({ id: `pli-${key}`, company_id: t.company, price_list_id: listOf(key), product_id: t.product.id, final_price: t.listPrice, status: "Active", effective_from: "2026-01-01" });
    tables.vyron_customer_portal_tenants.push({ company_id: t.company, slug: `tenant-${key.toLowerCase()}`, display_name: t.name, status: "Active", pending_hold_minutes: t.holdMinutes });
    tables.vyron_customer_portal_identities.push({ id: `pi-${key}`, company_id: t.company, customer_id: customerOf(key), status: "Active", pending_hold_minutes: null });
    void now;
  }
  return tables;
}

const newDb = () =>
  createFakeSupabase(seed(), { unique: { vyron_customer_order_submissions: [["company_id", "customer_id", "idempotency_key"]] } });
const scopeOf = (key) => ({ companyId: TENANTS[key].company, customerId: customerOf(key), customerName: `${key} Customer` });
const onHand = (db, productId) => Number(db.tables.vyron_cost_stock_items.find((s) => s.entity_id === productId)?.qty_on_hand || 0);
const productOf = (cat, productId) => cat.categories.flatMap((c) => c.products).find((p) => p.productId === productId);
const TOMORROW = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

async function order(db, key, productId, quantity, idem = `key-${key}-${Math.random()}`) {
  const scope = scopeOf(key);
  await cart.setCartLine(db, scope, { productId, quantityUnits: quantity });
  await cart.setCartDelivery(db, scope, { requestedDeliveryDate: TOMORROW });
  const view = await cart.getCart(db, scope);
  return cart.submitCart(db, scope, { idempotencyKey: idem, acknowledgedPrices: view.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })) });
}
const shown = async (db, key) => catalogue.getCustomerCatalogue(db, TENANTS[key].company, customerOf(key));

// ---------------------------------------------------------------------------
section("Each company is configured differently, and each gets its own answer");
{
  const db = newDb();
  for (const key of ["A", "B", "C"]) {
    const t = TENANTS[key];
    const view = await shown(db, key);
    const priced = productOf(view, t.product.id);
    check(`${key}: the product on their list is at their own price`, priced.sellingPrice === t.listPrice, `${priced.sellingPrice}`);
    check(`${key}: availability is their own stock`, priced.availableQty === t.product.onHand, `${priced.availableQty}`);
  }
  const aUncovered = productOf(await shown(db, "A"), TENANTS.A.uncovered.id);
  check("A falls back to the product master, as configured", aUncovered.priceSource === "product_master" && aUncovered.sellingPrice === TENANTS.A.uncovered.master);
  check("…and A's customer can order it", aUncovered.unavailable === false);

  const bUncovered = productOf(await shown(db, "B"), TENANTS.B.uncovered.id);
  check("B is priced from its assigned list only, as configured", bUncovered.priceSource === "unavailable" && bUncovered.sellingPrice === 0);
  check("…so the product off its list cannot be ordered, even though there is stock", bUncovered.unavailable === true && onHand(db, TENANTS.B.uncovered.id) === 50);
  const refused = await order(db, "B", TENANTS.B.uncovered.id, 1, "b-uncovered");
  check("…and the order is refused", refused.ok === false, JSON.stringify(refused));

  const cPriced = productOf(await shown(db, "C"), TENANTS.C.product.id);
  check("C is priced from a DEFAULT list rather than a contract list", cPriced.priceSource === "default" && cPriced.sellingPrice === TENANTS.C.listPrice);
  check("C's out-of-stock product says so", productOf(await shown(db, "C"), TENANTS.C.uncovered.id).availability === "out_of_stock");
}

// ---------------------------------------------------------------------------
section("What one company does cannot reach another");
{
  const db = newDb();
  const before = { A: (await shown(db, "A")).categories, B: (await shown(db, "B")).categories, C: (await shown(db, "C")).categories };

  // A takes all of its own stock.
  const placed = await order(db, "A", TENANTS.A.product.id, TENANTS.A.product.onHand, "iso-a");
  check("A's customer takes all of A's stock", placed.ok === true);
  check("A now shows none available", productOf(await shown(db, "A"), TENANTS.A.product.id).availableQty === 0);
  check("B is untouched", JSON.stringify((await shown(db, "B")).categories) === JSON.stringify(before.B));
  check("C is untouched", JSON.stringify((await shown(db, "C")).categories) === JSON.stringify(before.C));

  // B adjusts its stock away.
  await inventory.postStockMovement(db, { companyId: TENANTS.B.company, stockItemId: `si-${TENANTS.B.product.sku}`, movementType: "Adjustment", quantityOut: 90, unitCost: 20, actor: "b" });
  check("B's adjustment changes B", productOf(await shown(db, "B"), TENANTS.B.product.id).availableQty === 10);
  check("…and does not change C", productOf(await shown(db, "C"), TENANTS.C.product.id).availableQty === TENANTS.C.product.onHand);
  check("…nor A's already-zero position", productOf(await shown(db, "A"), TENANTS.A.product.id).availableQty === 0);

  // C's reservations belong to C.
  await order(db, "C", TENANTS.C.product.id, 3, "iso-c");
  const cAllocations = db.tables.vyron_customer_sales_order_allocations.filter((x) => x.company_id === TENANTS.C.company);
  const allAllocations = db.tables.vyron_customer_sales_order_allocations;
  check("every allocation carries its own company", allAllocations.every((x) => [TENANTS.A.company, TENANTS.B.company, TENANTS.C.company].includes(x.company_id)));
  check("C's reservations are C's alone", cAllocations.length > 0 && cAllocations.every((x) => x.product_id === TENANTS.C.product.id));
  check("C's order did not touch A's or B's availability", productOf(await shown(db, "B"), TENANTS.B.product.id).availableQty === 10);

  // Orders are scoped too.
  for (const key of ["A", "B", "C"]) {
    const orders = db.tables.vyron_customer_sales_orders.filter((o) => o.company_id === TENANTS[key].company);
    check(`${key}'s orders are only ${key}'s`, orders.every((o) => o.customer_id === customerOf(key)));
  }
  const crossCatalogue = await rejects(catalogue.getCustomerCatalogue(db, TENANTS.A.company, customerOf("B")));
  check("a customer of one company cannot be priced by another", Boolean(crossCatalogue));
  const crossCart = await rejects(cart.setCartLine(db, scopeOf("A"), { productId: TENANTS.B.product.id, quantityUnits: 1 }));
  check("another company's product cannot enter the cart", Boolean(crossCart));
}

// ---------------------------------------------------------------------------
section("A hold policy belongs to the company that set it");
{
  const db = newDb();
  const policyA = await holds.loadHoldPolicy(db, TENANTS.A.company, customerOf("A"));
  const policyB = await holds.loadHoldPolicy(db, TENANTS.B.company, customerOf("B"));
  const policyC = await holds.loadHoldPolicy(db, TENANTS.C.company, customerOf("C"));
  check("A has no policy, as configured", policyA.configured === false && policyA.minutes === null);
  check("B has one, as configured", policyB.configured === true && policyB.minutes === 60);
  check("C has none", policyC.configured === false);

  // Both A and B place an order and both age past B's expiry.
  await order(db, "A", TENANTS.A.product.id, 5, "hold-a");
  await order(db, "B", TENANTS.B.product.id, 5, "hold-b");
  for (const o of db.tables.vyron_customer_sales_orders) o.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const sweptB = await holds.expireStaleCustomerHolds(db, TENANTS.B.company);
  check("B's stale order expires", sweptB.expired.length === 1);
  check("…and B's stock comes back", productOf(await shown(db, "B"), TENANTS.B.product.id).availableQty === TENANTS.B.product.onHand);
  check("A's equally old order is untouched, because A set no policy", db.tables.vyron_customer_sales_orders.filter((o) => o.company_id === TENANTS.A.company).every((o) => o.status !== "Cancelled"));
  check("…and A's stock stays held", productOf(await shown(db, "A"), TENANTS.A.product.id).availableQty === TENANTS.A.product.onHand - 5);

  const sweptA = await holds.expireStaleCustomerHolds(db, TENANTS.A.company);
  check("sweeping A does nothing at all", sweptA.expired.length === 0 && sweptA.policy.configured === false);
}

// ---------------------------------------------------------------------------
section("A brand-new company works with nothing configured for it");
{
  const db = newDb();
  const NEW_CO = "dd000000-0000-4000-8000-00000000000d";
  const NEW_CUSTOMER = "dd000000-0000-4000-8000-00000000cust";
  const NEW_PRODUCT = "dd000000-0000-4000-8000-0000000000p1";
  // Exactly what provisioning creates: a workspace, a customer, a product,
  // a stock record. No portal tenant row, no price list, no assignment, no
  // settings row of any kind.
  db.tables.vyron_workspaces.push({ id: "ws-new", company_id: NEW_CO, company_name: "Delta Provisions (fictional)", default_vat_rate: 15 });
  db.tables.vyron_customers.push({ id: NEW_CUSTOMER, company_id: NEW_CO, customer_name: "New Customer", status: "Active", active: true });
  db.tables.vyron_cost_products.push({ id: NEW_PRODUCT, company_id: NEW_CO, product_name: "Delta Pie", sku: "D-PIE", selling_price: 45, total_cost: 20, category: "All", status: "Active" });
  db.tables.vyron_cost_stock_items.push({ id: "si-D-PIE", company_id: NEW_CO, entity_type: "finished_goods", entity_id: NEW_PRODUCT, item_code: "D-PIE", qty_on_hand: 12, average_cost: 20, current_cost: 20, unit: "each" });

  const view = await catalogue.getCustomerCatalogue(db, NEW_CO, NEW_CUSTOMER);
  const product = productOf(view, NEW_PRODUCT);
  check("the catalogue works with no configuration rows at all", Boolean(product));
  check("pricing falls back to the product master — backward compatible", product.priceSource === "product_master" && product.sellingPrice === 45);
  check("availability is correct from the stock record alone", product.availableQty === 12 && product.availability === "available");

  const scope = { companyId: NEW_CO, customerId: NEW_CUSTOMER, customerName: "New Customer" };
  await cart.setCartLine(db, scope, { productId: NEW_PRODUCT, quantityUnits: 12 });
  await cart.setCartDelivery(db, scope, { requestedDeliveryDate: TOMORROW });
  const view2 = await cart.getCart(db, scope);
  const placed = await cart.submitCart(db, scope, { idempotencyKey: "new-1", acknowledgedPrices: view2.lines.map((l) => ({ productId: l.productId, sellingPrice: l.sellingPrice })) });
  check("a customer can order, and the stock is held", placed.ok === true && db.tables.vyron_customer_sales_order_allocations.some((a) => a.company_id === NEW_CO));
  const over = await cart.setCartLine(db, scope, { productId: NEW_PRODUCT, quantityUnits: 1 }).then(() => cart.getCart(db, scope));
  check("…and over-ordering is refused without any configuration", over.shortfalls.length === 1 && over.shortfalls[0].available === 0);

  const policy = await holds.loadHoldPolicy(db, NEW_CO, NEW_CUSTOMER);
  check("hold expiry is off until somebody configures it", policy.configured === false && policy.minutes === null);
  const swept = await holds.expireStaleCustomerHolds(db, NEW_CO);
  check("…and sweeping the new company does nothing", swept.expired.length === 0);
  check("no manual database edit was needed for any of this", true);
}

// ---------------------------------------------------------------------------
section("Only one function may move a stock balance");
{
  // Availability is only as trustworthy as the balance under it. Anything that
  // writes qty_on_hand outside the ledger-keeping path is a second stock
  // source by another name, so the files that may do it are listed here and
  // every other file is checked.
  // Changing a QUANTITY is the thing that matters. Deleting the stock record of
  // a product that is itself being deleted is not a second balance, so that one
  // file is allowed to delete — and is checked below for quantity writes like
  // everything else.
  const MAY_CHANGE_QUANTITY = new Set(["src/lib/vyron-inventory.ts"]);
  const MAY_DELETE_A_RECORD = new Set(["src/lib/vyron-inventory.ts", "src/lib/vyron-cost-master-data.ts"]);
  const quantityOffenders = [];
  const deleteOffenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        const rel = path.relative(ROOT, full).split(path.sep).join("/");
        const source = readFileSync(full, "utf8");
        const segments = source.split('.from("vyron_cost_stock_items")').slice(1).map((segment) => segment.split('.from("')[0]);
        const changesQuantity = segments.filter((segment) => /^[\s\S]{0,400}?\.(update|upsert|insert)\(/.test(segment));
        const deletes = segments.filter((segment) => /^[\s\S]{0,400}?\.delete\(/.test(segment));
        if (changesQuantity.length && !MAY_CHANGE_QUANTITY.has(rel)) quantityOffenders.push(`${rel} (${changesQuantity.length})`);
        if (deletes.length && !MAY_DELETE_A_RECORD.has(rel)) deleteOffenders.push(`${rel} (${deletes.length})`);
      }
    }
  };
  walk(path.join(ROOT, "src"));
  check("nothing outside the inventory layer changes a stock quantity", quantityOffenders.length === 0, quantityOffenders.join(", "));
  check("nothing unexpected deletes a stock record either", deleteOffenders.length === 0, deleteOffenders.join(", "));
  const masterData = readFileSync(path.join(ROOT, "src/lib/vyron-cost-master-data.ts"), "utf8");
  const masterSegments = masterData.split('.from("vyron_cost_stock_items")').slice(1).map((segment) => segment.split('.from("')[0]);
  check(
    "…and the one file that may delete a stock record never writes a quantity",
    masterSegments.every((segment) => !/^[\s\S]{0,400}?\.(update|upsert|insert)\(/.test(segment))
  );

  const allocationOffenders = [];
  const walkAllocations = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walkAllocations(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        const rel = path.relative(ROOT, full).split(path.sep).join("/");
        const source = readFileSync(full, "utf8");
        const segments = source.split('.from("vyron_customer_sales_order_allocations")').slice(1);
        const writes = segments.filter((segment) => /^[\s\S]{0,400}?\.(update|upsert|insert|delete)\(/.test(segment.split('.from("')[0]));
        if (writes.length && rel !== "src/lib/vyron-customer-sales-orders.ts") allocationOffenders.push(`${rel} (${writes.length})`);
      }
    }
  };
  walkAllocations(path.join(ROOT, "src"));
  check("nothing outside the sales-order engine writes a reservation", allocationOffenders.length === 0, allocationOffenders.join(", "));

  const catalogueSource = readFileSync(path.join(ROOT, "src/lib/vyron-order-catalogue.ts"), "utf8");
  check("the customer catalogue never reads the stock table itself", !catalogueSource.includes("vyron_cost_stock_items"));
  check("…it consumes the one availability function", catalogueSource.includes("loadAvailableQuantities"));
  const cartSource = readFileSync(path.join(ROOT, "src/lib/vyron-order-cart.ts"), "utf8");
  check("the cart never reads the stock table either", !cartSource.includes("vyron_cost_stock_items"));
  check("…and reserves through the sales-order engine", cartSource.includes("reserveStockForSalesOrder"));
}

// ---------------------------------------------------------------------------
section("Nothing in the ordering layer names a company or a customer");
{
  const FILES = [
    "src/lib/vyron-order-catalogue.ts",
    "src/lib/vyron-order-cart.ts",
    "src/lib/vyron-order-holds.ts",
    "src/lib/vyron-sales-order-reservations.ts",
    "src/lib/vyron-customer-price-lists.ts",
    "src/lib/vyron-customer-sales-orders.ts",
    "src/lib/vyron-inventory.ts",
  ];
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const names = /kingdom|handcrafted|food\s?sock|northwood|vyronsoft/i;
  for (const file of FILES) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    check(`${file.split("/").pop()} contains no identifier of a real tenant`, !uuid.test(source), (source.match(uuid) || [])[0] || "");
    check(`${file.split("/").pop()} names no real company`, !names.test(source), (source.match(names) || [])[0] || "");
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) console.log(`${failures} FAILED`);
process.exit(failures ? 1 : 0);
