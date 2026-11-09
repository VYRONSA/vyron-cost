/**
 * A finished good renamed in Master Data → Finished Goods is offered under its
 * new name on a new customer invoice line (2026-11-09).
 *
 * The invoice line picker is the shared item lookup. It used to search and show
 * the stock item's own copy of the product name, made once when the stock item
 * was created, so a renamed product kept its old name on invoices and could not
 * be found by its new one.
 *
 *   1. Saving a new name updates the product record and keeps its id.
 *   2. The product's stock item follows the name; quantity, cost and value do not move.
 *   3. Prices, cost and VAT accounts on the product are untouched.
 *   4. The lookup finds the product by its new name, shows that name, and no longer offers the old one.
 *   5. A stock item still carrying an old name (written before this fix) is shown under the master name.
 *   6. Invoice lines already saved keep the name they were saved with.
 *   7. Another company's rows are never touched; a save that does not change the name touches no stock item.
 *
 * Synthetic data only — no network, no real company.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-finished-good-rename";
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

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { updateProduct } = await importFromRoot("src/lib/vyron-cost-master-data.ts");
const { searchItemLookupPage } = await importFromRoot("src/lib/platform/item-lookup/searchItemLookup.ts");

const CO = "a0000000-0000-4000-8000-0000000000aa";
const CO_B = "a0000000-0000-4000-8000-0000000000bb";
const P_PIE = "b0000000-0000-4000-8000-000000000001"; // has a stock item; renamed
const P_TART = "b0000000-0000-4000-8000-000000000002"; // no stock item yet
const P_ROLL = "b0000000-0000-4000-8000-000000000003"; // stock item carries a stale name from before the fix
const SI_PIE = "d0000000-0000-4000-8000-000000000001";
const SI_ROLL = "d0000000-0000-4000-8000-000000000003";
const SI_OTHER = "d0000000-0000-4000-8000-0000000000bb";

const OLD = "Chicken Pie 200g";
const NEW = "Chicken Mushroom Pie 200g";

function product(id, companyId, name, extra = {}) {
  return {
    id,
    company_id: companyId,
    product_name: name,
    category: "Pies",
    product_category: "Pies",
    selling_price: 45,
    total_cost: 21.5,
    target_gp: 40,
    product_status: "Active",
    financial_sales_account_id: "acc-sales",
    financial_cost_of_sales_account_id: "acc-cos",
    financial_inventory_asset_account_id: "acc-inv",
    financial_vat_tax_type: "OUTPUT",
    ...extra,
  };
}

function stockItem(id, companyId, entityId, description) {
  return {
    id,
    company_id: companyId,
    item_code: `FG-${entityId.slice(0, 8).toUpperCase()}`,
    description,
    category: "Pies",
    entity_type: "finished_goods",
    entity_id: entityId,
    unit: "unit",
    supplier_id: null,
    supplier_name_snapshot: null,
    current_cost: 21.5,
    average_cost: 21.5,
    qty_on_hand: 12,
    inventory_value: 258,
    stock_status: "In Stock",
    barcode: null,
    supplier_item_code: null,
    customer_item_code: null,
    aliases: [],
    is_active: true,
    default_warehouse: null,
  };
}

function seed() {
  return {
    vyron_cost_products: [
      product(P_PIE, CO, OLD),
      product(P_TART, CO, "Lemon Tart"),
      product(P_ROLL, CO, "Sausage Roll Large"),
      // Same id in another company: must never be read or written for CO.
      product(P_PIE, CO_B, OLD),
    ],
    vyron_cost_stock_items: [
      stockItem(SI_PIE, CO, P_PIE, OLD),
      stockItem(SI_ROLL, CO, P_ROLL, "Sausage Roll"),
      stockItem(SI_OTHER, CO_B, P_PIE, OLD),
    ],
    vyron_cost_ingredients: [],
    vyron_cost_suppliers: [],
    vyron_customer_invoice_lines: [
      { id: "line-issued", company_id: CO, invoice_id: "inv-issued", product_id: P_PIE, product_name: OLD, quantity: 3, selling_price: 45, cost_per_unit: 21.5 },
      { id: "line-draft", company_id: CO, invoice_id: "inv-draft", product_id: P_PIE, product_name: OLD, quantity: 1, selling_price: 45, cost_per_unit: 21.5 },
    ],
  };
}

const lookup = (db, q) => searchItemLookupPage(db, CO, { q, type: "finished_goods", status: "active", limit: 200 });

section("Before the rename");
{
  const db = createFakeSupabase(seed());
  const { items } = await lookup(db, "Chicken");
  const pie = items.filter((i) => i.entityId === P_PIE);
  check("the product is offered once, under its current name", pie.length === 1 && pie[0].productName === OLD, JSON.stringify(pie.map((i) => i.productName)));
}

section("Rename in Finished Goods");
const db = createFakeSupabase(seed());
const before = structuredClone(db.tables);
const saved = await updateProduct(db, CO, P_PIE, { product_name: `  ${NEW}  ` });
const pieRow = db.tables.vyron_cost_products.find((p) => p.id === P_PIE && p.company_id === CO);
const pieBefore = before.vyron_cost_products.find((p) => p.id === P_PIE && p.company_id === CO);
check("the product record holds the new name (trimmed)", pieRow.product_name === NEW, pieRow.product_name);
check("the saved product returned to the screen carries the new name", saved.product_name === NEW);
check("the product id is unchanged", saved.id === P_PIE && db.tables.vyron_cost_products.filter((p) => p.company_id === CO).length === 3);
for (const field of ["selling_price", "total_cost", "target_gp", "financial_sales_account_id", "financial_cost_of_sales_account_id", "financial_vat_tax_type"]) {
  check(`product ${field} is untouched`, pieRow[field] === pieBefore[field], `${pieBefore[field]} -> ${pieRow[field]}`);
}

section("Stock item follows the name, nothing else");
const si = db.tables.vyron_cost_stock_items.find((s) => s.id === SI_PIE);
const siBefore = before.vyron_cost_stock_items.find((s) => s.id === SI_PIE);
check("the product's stock item carries the new name", si.description === NEW, si.description);
for (const field of ["qty_on_hand", "current_cost", "average_cost", "inventory_value", "item_code", "entity_id", "entity_type", "stock_status"]) {
  check(`stock item ${field} is untouched`, si[field] === siBefore[field], `${siBefore[field]} -> ${si[field]}`);
}
check("the other company's stock item is untouched", db.tables.vyron_cost_stock_items.find((s) => s.id === SI_OTHER).description === OLD);
check("the other company's product is untouched", db.tables.vyron_cost_products.find((p) => p.company_id === CO_B).product_name === OLD);
check("an unrelated stock item is untouched", db.tables.vyron_cost_stock_items.find((s) => s.id === SI_ROLL).description === "Sausage Roll");

section("New invoice line lookup");
{
  const { items } = await lookup(db, "Mushroom");
  const pie = items.filter((i) => i.entityId === P_PIE);
  check("searching the new name finds the product", pie.length === 1, JSON.stringify(items.map((i) => i.productName)));
  check("it is offered under the new name", pie[0]?.productName === NEW, pie[0]?.productName);
  check("selecting it carries the same product id onto the line", pie[0]?.entityId === P_PIE);
}
{
  const { items } = await lookup(db, "Chicken Pie");
  check("the old name is no longer offered", !items.some((i) => i.productName === OLD), JSON.stringify(items.map((i) => i.productName)));
}
{
  const { items } = await lookup(db, undefined);
  const pie = items.filter((i) => i.entityId === P_PIE);
  check("browsing without a search shows the new name, once", pie.length === 1 && pie[0].productName === NEW, JSON.stringify(pie.map((i) => i.productName)));
  check("a product with no stock item yet is still offered by name", items.some((i) => i.entityId === P_TART && i.productName === "Lemon Tart"));
}

section("Stock items named before this fix");
{
  const { items } = await lookup(db, "Sausage Roll Large");
  const roll = items.filter((i) => i.entityId === P_ROLL);
  check("a stale stock item name is shown as the master name", roll.length === 1 && roll[0].productName === "Sausage Roll Large", JSON.stringify(roll.map((i) => i.productName)));
  const { items: browse } = await lookup(db, undefined);
  const rollBrowse = browse.filter((i) => i.entityId === P_ROLL);
  check("browsing shows it under the master name too", rollBrowse.length === 1 && rollBrowse[0].productName === "Sausage Roll Large", JSON.stringify(rollBrowse.map((i) => i.productName)));
  const { items: byOld } = await lookup(db, "Sausage Roll");
  check("its stale name is not what is offered", !byOld.some((i) => i.productName === "Sausage Roll"), JSON.stringify(byOld.map((i) => i.productName)));
}

section("Raw materials renamed after their stock item was created (PO, BOM, recipe pickers)");
{
  const ING = "f0000000-0000-4000-8000-000000000001";
  const BOX = "f0000000-0000-4000-8000-000000000002";
  const s = seed();
  s.vyron_cost_ingredients.push({ id: ING, company_id: CO, ingredient_name: "Cake Flour", category: "Dry", purchase_unit: "kg", purchase_cost: 18, supplier_id: null });
  s.vyron_cost_stock_items.push({ ...stockItem("d0000000-0000-4000-8000-0000000000f1", CO, ING, "Flour"), entity_type: "ingredient", item_code: "ING-FLOUR", unit: "kg", supplier_id: "sup-1", supplier_name_snapshot: "Mill Co", current_cost: 17.25, qty_on_hand: 40 });
  // The reported case: renamed in Raw Materials, its stock item still says "Packaging Box - Pie".
  s.vyron_cost_ingredients.push({ id: BOX, company_id: CO, ingredient_name: "Suitcase Box", category: "Packaging", purchase_unit: "each", purchase_cost: 4.1, supplier_id: null });
  s.vyron_cost_stock_items.push({ ...stockItem("d0000000-0000-4000-8000-0000000000f2", CO, BOX, "Packaging Box - Pie"), entity_type: "packaging", item_code: "ING-BOX", category: "Packaging", unit: "each", qty_on_hand: 0 });
  const db3 = createFakeSupabase(s);
  const before = structuredClone(db3.tables);

  const { items: box } = await searchItemLookupPage(db3, CO, { q: "Suitcase", type: "packaging", status: "active", limit: 200 });
  check("Suitcase Box is found by its Raw Materials name", box.some((i) => i.entityId === BOX && i.productName === "Suitcase Box"), JSON.stringify(box.map((i) => i.productName)));
  const { items: boxOld } = await searchItemLookupPage(db3, CO, { q: "Packaging Box", type: "all", status: "active", limit: 200 });
  check("it is not offered under its old stock-item name", !boxOld.some((i) => i.productName === "Packaging Box - Pie"), JSON.stringify(boxOld.map((i) => i.productName)));

  const { items } = await searchItemLookupPage(db3, CO, { q: "Flour", type: "all", status: "active", limit: 200 });
  const flour = items.filter((i) => i.entityId === ING);
  check("a raw material is offered once, under its Raw Materials name", flour.length === 1 && flour[0].productName === "Cake Flour", JSON.stringify(flour.map((i) => i.productName)));
  check("its stock item still supplies unit, supplier, cost and quantity", flour[0]?.unit === "kg" && flour[0]?.supplierName === "Mill Co" && flour[0]?.currentCost === 17.25 && flour[0]?.qtyOnHand === 40, JSON.stringify(flour[0]));
  check("searching writes nothing", JSON.stringify(db3.tables) === JSON.stringify(before));
}

section("Release scope: item codes and tenants");
{
  const db3 = createFakeSupabase(seed());
  const { items: byCode } = await searchItemLookupPage(db3, CO, { q: "B0000000", type: "finished_goods", status: "active", limit: 200 });
  check("a finished good with no stock item is still found by part of its item code", byCode.some((i) => i.entityId === P_TART), JSON.stringify(byCode.map((i) => i.itemCode)));
  const { items: other } = await searchItemLookupPage(db3, CO_B, { q: "Chicken", type: "finished_goods", status: "active", limit: 200 });
  check("another company's search never sees this company's rows", other.every((i) => i.stockItemId === SI_OTHER || i.entityId === P_PIE) && !other.some((i) => i.stockItemId === SI_PIE), JSON.stringify(other.map((i) => i.stockItemId)));
}

section("Saved invoices keep their names");
check("an issued invoice line keeps its original name", db.tables.vyron_customer_invoice_lines.find((l) => l.id === "line-issued").product_name === OLD);
check("a draft invoice line is not silently rewritten", db.tables.vyron_customer_invoice_lines.find((l) => l.id === "line-draft").product_name === OLD);

section("A save that does not change the name");
{
  const db2 = createFakeSupabase(seed());
  await updateProduct(db2, CO, P_PIE, { selling_price: 47 });
  check("the stock item name is not touched", db2.tables.vyron_cost_stock_items.find((s) => s.id === SI_PIE).description === OLD);
  check("the stock item quantity is not touched", db2.tables.vyron_cost_stock_items.find((s) => s.id === SI_PIE).qty_on_hand === 12);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
