#!/usr/bin/env node
/**
 * VYRON — a raw material's new description reaches every record still in use
 * (Kingdom Foods query, 2026-11).
 *
 * Renaming an ingredient used to change only the ingredient master: BOM lines,
 * calculator lines, stock items, purchase orders, production runs, supplier
 * mappings and invoice reviews kept the old name. Real updateIngredient against
 * an in-memory database; no network.
 *
 *   npm run test:kf-ingredient-rename
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-rename";
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

const CO = "aaaa0000-0000-4000-8000-000000000001";
const OTHER = "bbbb0000-0000-4000-8000-000000000001";
const ING = "1111aaaa-0000-4000-8000-000000000001";
const ING_OTHER = "1111bbbb-0000-4000-8000-000000000001";
const OLD = "Cake Flour";
const NEW = "Cake Flour (Premium, 12.5kg)";

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { updateIngredient } = await importFromRoot("src/lib/vyron-cost-master-data.ts");

const db = createFakeSupabase({
  vyron_cost_ingredients: [
    { id: ING, company_id: CO, ingredient_name: OLD, purchase_unit: "kg", purchase_cost: 14, yield_percent: 100 },
    { id: ING_OTHER, company_id: OTHER, ingredient_name: OLD, purchase_unit: "kg", purchase_cost: 14, yield_percent: 100 },
  ],
  vyron_cost_bom_lines: [
    { id: "bl1", company_id: CO, bom_id: "b1", ingredient_id: ING, line_name: OLD },
    { id: "bl-other", company_id: OTHER, bom_id: "b9", ingredient_id: ING_OTHER, line_name: OLD },
  ],
  vyron_cost_recipe_items: [{ id: "ri1", company_id: CO, ingredient_id: ING, ingredient_name_snapshot: OLD }],
  vyron_cost_stock_items: [
    { id: "si1", company_id: CO, entity_type: "ingredient", entity_id: ING, description: OLD },
    { id: "si-other", company_id: OTHER, entity_type: "ingredient", entity_id: ING_OTHER, description: OLD },
  ],
  vyron_supplier_line_item_mappings: [{ id: "map1", tenant_id: CO, entity_type: "ingredient", entity_id: ING, entity_name: OLD, source_description: "CAKE FLR 12.5", supplier_name: "QA Mill" }],
  vyron_cost_purchase_orders: [
    { id: "po-open", company_id: CO, status: "Sent" },
    { id: "po-closed", company_id: CO, status: "Fully Received" },
  ],
  vyron_cost_purchase_order_lines: [
    { id: "pl-open", company_id: CO, purchase_order_id: "po-open", item_type: "ingredient", item_id: ING, item_name: OLD },
    { id: "pl-closed", company_id: CO, purchase_order_id: "po-closed", item_type: "ingredient", item_id: ING, item_name: OLD },
  ],
  vyron_cost_production_runs: [
    { id: "run-open", company_id: CO, status: "In Progress" },
    { id: "run-done", company_id: CO, status: "Completed" },
  ],
  vyron_cost_production_run_lines: [
    { id: "rl-open", company_id: CO, production_run_id: "run-open", ingredient_id: ING, line_name: OLD },
    { id: "rl-done", company_id: CO, production_run_id: "run-done", ingredient_id: ING, line_name: OLD },
  ],
  vyron_documents: [
    { id: "doc-review", tenant_id: CO, status: "reviewed" },
    { id: "doc-approved", tenant_id: CO, status: "archived" },
  ],
  vyron_document_line_items: [
    { id: "dl-review", document_id: "doc-review", description: "CAKE FLR 12.5", matched_entity_id: ING, matched_entity_name: OLD },
    { id: "dl-approved", document_id: "doc-approved", description: "CAKE FLR 12.5", matched_entity_id: ING, matched_entity_name: OLD },
  ],
  vyron_cost_supplier_invoice_lines: [{ id: "sil1", invoice_id: "si-inv", item_name: "CAKE FLR 12.5" }],
});
const t = (table, id) => db.tables[table].find((r) => r.id === id);

const saved = await updateIngredient(db, CO, ING, { ingredient_name: `  ${NEW} ` });
check("the ingredient saves the new description (trimmed)", saved.ingredient_name === NEW && t("vyron_cost_ingredients", ING).ingredient_name === NEW);

console.log("\nCarried through to every record still in use");
check("BOM / recipe lines (costing)", t("vyron_cost_bom_lines", "bl1").line_name === NEW);
check("cost calculator lines", t("vyron_cost_recipe_items", "ri1").ingredient_name_snapshot === NEW);
check("stock items (stock, stock take, reorder report)", t("vyron_cost_stock_items", "si1").description === NEW);
check("supplier line mappings (invoice matching)", t("vyron_supplier_line_item_mappings", "map1").entity_name === NEW);
check("open purchase orders", t("vyron_cost_purchase_order_lines", "pl-open").item_name === NEW);
check("production runs in progress", t("vyron_cost_production_run_lines", "rl-open").line_name === NEW);
check("invoices still under review", t("vyron_document_line_items", "dl-review").matched_entity_name === NEW);

console.log("\nHistory and other companies are untouched");
check("a received purchase order keeps the name it was ordered under", t("vyron_cost_purchase_order_lines", "pl-closed").item_name === OLD);
check("a completed production run keeps its recorded name", t("vyron_cost_production_run_lines", "rl-done").line_name === OLD);
check("an approved invoice keeps its recorded match", t("vyron_document_line_items", "dl-approved").matched_entity_name === OLD);
check("the supplier's own invoice wording is never changed", t("vyron_cost_supplier_invoice_lines", "sil1").item_name === "CAKE FLR 12.5");
check("another company's ingredient with the same name, and its BOM and stock, are unchanged", t("vyron_cost_ingredients", ING_OTHER).ingredient_name === OLD && t("vyron_cost_bom_lines", "bl-other").line_name === OLD && t("vyron_cost_stock_items", "si-other").description === OLD);

const before = JSON.stringify(db.tables.vyron_cost_bom_lines);
await updateIngredient(db, CO, ING, { purchase_cost: 15 });
check("a change that is not a rename does not touch the copies", JSON.stringify(db.tables.vyron_cost_bom_lines) === before);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
