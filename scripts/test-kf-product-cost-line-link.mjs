#!/usr/bin/env node
/**
 * VYRON — product cost lines follow their ingredient's name (Kingdom Foods, 2026-11).
 *
 * Product cost lines stored the ingredient as free text only, so a renamed raw
 * material kept its old name on every product cost breakdown. Lines are now
 * linked to the ingredient (migration 20261102120000 adds ingredient_id; the
 * migration itself is exercised separately on a disposable PostgreSQL) and the
 * rename reaches them. Before the migration is applied the code writes without
 * the link instead of failing.
 *
 *   npm run test:kf-product-cost-line-link
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-cost-lines";
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
const FLOUR = "1111aaaa-0000-4000-8000-000000000001";
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { createProductCostLine, updateProductCostLine } = await importFromRoot("src/lib/vyron-cost-product-cost-lines.ts");
const { updateIngredient } = await importFromRoot("src/lib/vyron-cost-master-data.ts");

function seed() {
  return {
    vyron_cost_products: [{ id: "p-pie", company_id: CO, product_name: "Steak Pie", selling_price: 40, target_gp: 30 }],
    vyron_cost_ingredients: [
      { id: FLOUR, company_id: CO, ingredient_name: "Cake Flour", purchase_unit: "kg" },
      { id: "ing-b1", company_id: CO, ingredient_name: "Butter", purchase_unit: "kg" },
      { id: "ing-b2", company_id: CO, ingredient_name: "butter", purchase_unit: "kg" },
      { id: "ing-other", company_id: OTHER, ingredient_name: "Pie Spice", purchase_unit: "kg" },
    ],
    vyron_cost_product_cost_lines: [],
    vyron_cost_bom_lines: [], vyron_cost_recipe_items: [], vyron_cost_stock_items: [], vyron_supplier_line_item_mappings: [],
    vyron_cost_purchase_order_lines: [], vyron_cost_production_run_lines: [], vyron_document_line_items: [],
  };
}

console.log("\n1. Linking");
const db = createFakeSupabase(seed());
const flourLine = await createProductCostLine(db, CO, "p-pie", { line_type: "Ingredient", line_name: "  cake flour ", quantity: 0.5, unit: "kg", unit_cost: 14 });
check("a line named like exactly one ingredient is linked to it, and carries its name", flourLine.ingredient_id === FLOUR && flourLine.line_name === "Cake Flour", JSON.stringify(flourLine));
const ambiguous = await createProductCostLine(db, CO, "p-pie", { line_type: "Ingredient", line_name: "Butter", quantity: 1, unit: "kg", unit_cost: 90 });
check("a name two ingredients share is not guessed (left unlinked)", !ambiguous.ingredient_id);
const labour = await createProductCostLine(db, CO, "p-pie", { line_type: "Labour", line_name: "Cake Flour", quantity: 1, unit: "hour", unit_cost: 50 });
check("a labour line is never linked to an ingredient", !labour.ingredient_id);
let foreign = null;
try { await createProductCostLine(db, CO, "p-pie", { line_type: "Ingredient", line_name: "Spice", ingredient_id: "ing-other", quantity: 1, unit_cost: 1 }); } catch (e) { foreign = e; }
check("another company's ingredient cannot be linked (404)", foreign && foreign.status === 404, String(foreign));

console.log("\n2. Renaming the ingredient renames its cost lines");
await updateIngredient(db, CO, FLOUR, { ingredient_name: "Cake Flour (Premium)" });
const after = db.tables.vyron_cost_product_cost_lines.find((l) => l.id === flourLine.id);
check("the linked product cost line now shows the new name", after.line_name === "Cake Flour (Premium)", JSON.stringify(after));
check("the labour line with the old text is untouched", db.tables.vyron_cost_product_cost_lines.find((l) => l.id === labour.id).line_name === "Cake Flour");

console.log("\n3. Editing a line re-decides its link");
const renamed = await updateProductCostLine(db, CO, "p-pie", flourLine.id, { line_name: "Mystery Spice" });
check("renaming the line to something that is not an ingredient unlinks it", renamed.ingredient_id === null && renamed.line_name === "Mystery Spice", JSON.stringify(renamed));

console.log("\n4. Before the migration is applied (no ingredient_id column)");
{
  const legacy = createFakeSupabase(seed());
  const realFrom = legacy.from.bind(legacy);
  // Simulate PostgREST refusing the unknown column, exactly as production would before the migration.
  legacy.from = (table) => {
    const q = realFrom(table);
    if (table !== "vyron_cost_product_cost_lines") return q;
    const refuse = (payload, run) => (payload && Object.prototype.hasOwnProperty.call(payload, "ingredient_id")
      ? { select: () => ({ single: async () => ({ data: null, error: { message: "Could not find the 'ingredient_id' column of 'vyron_cost_product_cost_lines' in the schema cache" } }) }) }
      : run());
    return new Proxy(q, {
      get(target, prop) {
        if (prop === "insert") return (payload) => refuse(payload, () => target.insert(payload));
        if (prop === "update") return (payload) => (payload && Object.prototype.hasOwnProperty.call(payload, "ingredient_id")
          ? { eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Could not find the 'ingredient_id' column of 'vyron_cost_product_cost_lines' in the schema cache" } }) }) }) }) }
          : target.update(payload));
        const v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
  };
  const line = await createProductCostLine(legacy, CO, "p-pie", { line_type: "Ingredient", line_name: "Cake Flour", quantity: 1, unit: "kg", unit_cost: 14 });
  check("a cost line is still saved (without the link) and the product cost is recalculated", line && line.line_name === "Cake Flour" && !("ingredient_id" in line), JSON.stringify(line));
  const edited = await updateProductCostLine(legacy, CO, "p-pie", line.id, { line_name: "Cake Flour", unit_cost: 15 });
  check("an edit is still saved", Number(edited.unit_cost) === 15);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
