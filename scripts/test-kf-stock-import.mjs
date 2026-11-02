#!/usr/bin/env node
/**
 * VYRON — stock imports (Kingdom Foods query, 2026-11).
 *
 *   - Decimal commas: "0,125" is 0.125 (it was read as 125); "R18,45" is 18.45.
 *   - An ambiguous cell ("12,345") is refused, never guessed.
 *   - Opening stock is matched by a real identifier (SKU / item code), never by
 *     name or an invented code.
 *   - A missing or unreadable cost is refused, never loaded as zero.
 *   - Importing the same opening stock twice does not double it.
 *
 * Real parser and import code against an in-memory database. No network.
 *
 *   npm run test:kf-stock-import
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-stock-import";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

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

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { parseAmount } = await importFromRoot("src/lib/vyron-upload-table.ts");
const { importOpeningStockRows } = await importFromRoot("src/lib/vyron-opening-stock-import.ts");
const { persistImportRows } = await importFromRoot("src/lib/vyron-import-persist.ts");

console.log("\n1. Reading numbers");
{
  const cases = [
    ["0,125", 0.125], ["R18,45", 18.45], ["R 1 234,50", 1234.5], ["1,234.50", 1234.5], ["1.234,50", 1234.5],
    ["2,5", 2.5], ["1,5", 1.5], ["ZAR 99", 99], ["1,234,567", 1234567], ["(500.00)", -500], ["1.5", 1.5], ["12", 12],
  ];
  const wrong = cases.filter(([raw, want]) => parseAmount(raw) !== want).map(([raw, want]) => `${raw} → ${parseAmount(raw)} (want ${want})`);
  check("decimal commas, currency, thousands and negatives read correctly", wrong.length === 0, wrong.join("; "));
  check("'0,125' is 0.125, not 125 (the reported defect)", parseAmount("0,125") === 0.125);
  check("ambiguous or unreadable cells give null, never a guess: '12,345', '1,23,4', 'abc', 'R18,4x'", ["12,345", "1,23,4", "abc", "R18,4x"].every((raw) => parseAmount(raw) === null));
}

const CO = "aaaa0000-0000-4000-8000-000000000001";
function seed() {
  return {
    vyron_cost_products: [
      { id: "p-pie", company_id: CO, product_name: "Steak Pie", sku: "PIE-01", total_cost: 10 },
      { id: "p-a", company_id: CO, product_name: "Twin A", sku: "DUP-1", total_cost: 5 },
      { id: "p-b", company_id: CO, product_name: "Twin B", sku: "DUP-1", total_cost: 5 },
      { id: "p-name", company_id: CO, product_name: "Name Only Pie", sku: null, total_cost: 5 },
    ],
    vyron_cost_stock_items: [
      { id: "si-flour", company_id: CO, entity_type: "ingredient", entity_id: "ing-flour", item_code: "FLR-01", description: "Flour", unit: "kg", qty_on_hand: 0, average_cost: 0, current_cost: 0, barcode: null, supplier_item_code: null, customer_item_code: null, aliases: [] },
      // The pie's stock item exists with no stock (the in-memory database has no column defaults).
      { id: "si-pie", company_id: CO, entity_type: "finished_goods", entity_id: "p-pie", item_code: "FG-PIE", description: "Steak Pie", unit: "unit", qty_on_hand: 0, average_cost: 0, current_cost: 0, barcode: null, supplier_item_code: null, customer_item_code: null, aliases: [] },
    ],
    vyron_cost_stock_ledger: [],
    vyron_stock_movements: [],
    vyron_opening_stock_import_runs: [],
    vyron_cost_inventory_audit: [],
    vyron_inventory_audit_log: [],
  };
}

console.log("\n2. Opening stock screen import");
{
  const db = createFakeSupabase(seed());
  const rows = [
    { productCode: "PIE-01", productName: "Steak Pie", warehouse: "Main", qty: "0,125", cost: "R18,45" },
    { productCode: "", productName: "Name Only Pie", warehouse: "Main", qty: "5", cost: "10" },
    { productCode: "NOPE-9", productName: "Ghost", warehouse: "Main", qty: "5", cost: "10" },
    { productCode: "DUP-1", productName: "Twin", warehouse: "Main", qty: "5", cost: "10" },
    { productCode: "PIE-01", productName: "Steak Pie", warehouse: "Cold room", qty: "2", cost: "R18,4x" },
  ];
  const saved = console.warn; console.warn = () => {};
  const first = await importOpeningStockRows(db, CO, { fileName: "opening.csv", rows, actor: "QA" });
  console.warn = saved;
  const item = db.tables.vyron_cost_stock_items.find((s) => s.entity_id === "p-pie");
  const errorText = first.errors.map((e) => `${e.row}: ${e.error}`).join(" | ");
  check("'0,125' at 'R18,45' loads 0.125 units at R18.45", item && Number(item.qty_on_hand) === 0.125 && Number(item.current_cost) === 18.45, JSON.stringify(item));
  check("a row with no product code is refused (never matched by name)", /Product code \(SKU\) is required for "Name Only Pie"/.test(errorText), errorText);
  check("an unknown code is refused", /Product code not found \(NOPE-9\)/.test(errorText));
  check("a code two products share is refused, not guessed", /belongs to 2 products/.test(errorText));
  check("an unreadable cost is refused, not loaded at zero", /Cost "R18,4x" is missing or not a readable amount/.test(errorText));
  check("exactly one row imported, four refused", first.imported === 1 && first.errors.length === 4, JSON.stringify({ imported: first.imported, errors: first.errors.length }));

  console.warn = () => {};
  const again = await importOpeningStockRows(db, CO, { fileName: "opening.csv", rows: [rows[0]], actor: "QA" });
  console.warn = saved;
  const after = db.tables.vyron_cost_stock_items.find((s) => s.entity_id === "p-pie");
  check("importing the same opening stock again is refused, and stock is NOT doubled", again.imported === 0 && /already loaded/.test(again.errors.map((e) => e.error).join(" ")) && Number(after.qty_on_hand) === 0.125, JSON.stringify({ again, qty: after.qty_on_hand }));
}

console.log("\n3. Import Centre opening balances");
{
  const db = createFakeSupabase(seed());
  const saved = console.warn; console.warn = () => {};
  const result = await persistImportRows(db, CO, "opening-stock", [
    { item_code: "FLR-01", item_name: "Flour", qty_on_hand: "12,5", unit_cost: "R14,20", entity_type: "ingredient" },
    { item_code: "", item_name: "Flour Special Long Name A", qty_on_hand: "1", unit_cost: "1" },
    { item_code: "FLR-01", item_name: "Flour", qty_on_hand: "abc", unit_cost: "1" },
  ]);
  console.warn = saved;
  const flour = db.tables.vyron_cost_stock_items.filter((s) => s.item_code === "FLR-01");
  check("matched to the EXISTING stock item by its code (no invented 'OB-' duplicate)", flour.length === 1 && !db.tables.vyron_cost_stock_items.some((s) => String(s.item_code).startsWith("OB-")) && Number(flour[0].qty_on_hand) === 12.5 && Number(flour[0].current_cost) === 14.2, JSON.stringify(db.tables.vyron_cost_stock_items));
  check("a row with no code, and an unreadable quantity, are refused", result.imported === 1 && result.errors.some((e) => /item code \(or barcode \/ SKU\) is required/.test(e)) && result.errors.some((e) => /quantity "abc"/.test(e)), result.errors.join(" | "));
  console.warn = () => {};
  const again = await persistImportRows(db, CO, "opening-stock", [{ item_code: "FLR-01", item_name: "Flour", qty_on_hand: "12,5", unit_cost: "R14,20" }]);
  console.warn = saved;
  check("loading the same opening balance again is refused and stock stays 12.5", again.imported === 0 && Number(db.tables.vyron_cost_stock_items.find((s) => s.item_code === "FLR-01").qty_on_hand) === 12.5, JSON.stringify(again));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
