#!/usr/bin/env node
/**
 * VYRON — GP and supplier costing (Kingdom Foods queries, 2026-11).
 *
 *   1. kg → g (and l → ml) conversion: an ingredient costed per kg used on a gram
 *      line was 1000× too expensive; units that cannot convert are refused.
 *   2. Yield: an approved invoice price sets the usable cost (price ÷ yield).
 *   3. Actual supplier invoice costs drive costing: approving an invoice
 *      recalculates the BOMs using the ingredient and the product cost.
 *   4. A purchase-order receipt is valued at the invoiced cost, not the PO price.
 *   5. A product sold with no measured cost is not shown as 100% GP.
 *
 * Real code (approve route, BOM recalculation, costing lines, receipt costing,
 * GP report) against an in-memory database. No network, no real data.
 *
 *   npm run test:kf-costing
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
const near = (a, b, eps = 1e-6) => Math.abs(Number(a) - Number(b)) <= eps;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO = uuid("a", 1), WS = uuid("a", 2), U_OWNER = uuid("a", 10);
const DOC = uuid("d", 1), BOM = uuid("b", 1), PIE = uuid("7", 1), FLOUR = uuid("1", 1), OIL = uuid("1", 2);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const units = await importFromRoot("src/lib/vyron-actual-cost.ts");
const { recalculateBomsUsingIngredient } = await importFromRoot("src/lib/vyron-cost-ingredient-intelligence.ts");
const { buildCostingLine } = await importFromRoot("src/lib/vyron-costing-lines-server.ts");
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");

console.log("\n1. Units");
{
  check("R14 per kg is R0.014 per g; R30 per l is R0.03 per ml", near(units.convertCostPerUnit(14, "kg", "g"), 0.014) && near(units.convertCostPerUnit(30, "litre", "ml"), 0.03));
  check("aliases: KGS / grams / Ltr / ea", near(units.convertCostPerUnit(14, "KGS", "grams"), 0.014) && near(units.convertCostPerUnit(30, "Ltr", "ml"), 0.03) && units.convertCostPerUnit(5, "ea", "each") === 5);
  check("units that cannot convert (kg ↔ each, kg ↔ ml) give null, never a number", units.convertCostPerUnit(14, "kg", "each") === null && units.convertCostPerUnit(14, "kg", "ml") === null);
  check("quantities convert the other way: 500 g is 0.5 kg", near(units.convertQuantity(500, "g", "kg"), 0.5));
}

console.log("\n2. Yield");
{
  check("R14 at 80% yield is R17.50 usable; 100% or missing yield leaves it", near(units.trueUnitCostFromYield(14, 80), 17.5) && units.trueUnitCostFromYield(14, 100) === 14 && units.trueUnitCostFromYield(14, null) === 14);
}

function costingSeed() {
  return {
    vyron_workspaces: [{ id: WS, company_id: CO, company_name: "QA Foods", package_name: "Enterprise", status: "Setup" }],
    vyron_workspace_memberships: [{ id: "m1", workspace_id: WS, user_id: U_OWNER, role: "OWNER", status: "Active", permissions: {} }],
    vyron_cost_suppliers: [{ id: uuid("5", 1), company_id: CO, supplier_name: "QA Mill" }],
    vyron_cost_ingredients: [
      { id: FLOUR, company_id: CO, ingredient_name: "Flour", purchase_unit: "kg", recipe_unit: "g", purchase_cost: 12, true_unit_cost: 15, yield_percent: 80 },
      { id: OIL, company_id: CO, ingredient_name: "Oil", purchase_unit: "l", recipe_unit: "each", purchase_cost: 30, true_unit_cost: 30, yield_percent: 100 },
    ],
    vyron_cost_boms: [{ id: BOM, company_id: CO, bom_name: "Pie BOM", recipe_name: "Pie BOM", product_id: PIE, yield_qty: 1, selling_price: 40, target_gp: 0, status: "Active" }],
    vyron_cost_bom_lines: [
      { id: "bl-g", company_id: CO, bom_id: BOM, line_type: "Ingredient", ingredient_id: FLOUR, line_name: "Flour", quantity: 500, unit: "g", unit_cost: 0.015, wastage_percent: 0, sort_order: 0 },
      { id: "bl-each", company_id: CO, bom_id: BOM, line_type: "Ingredient", ingredient_id: FLOUR, line_name: "Flour (bag)", quantity: 1, unit: "each", unit_cost: 2, wastage_percent: 0, sort_order: 1 },
    ],
    vyron_cost_products: [{ id: PIE, company_id: CO, product_name: "QA Pie", linked_bom_id: BOM, total_cost: 9.5, selling_price: 40, status: "Active" }],
    vyron_cost_recipes: [{ id: uuid("c", 1), company_id: CO, recipe_name: "Calc recipe" }],
    vyron_documents: [{
      id: DOC, tenant_id: CO, status: "reviewed", supplier_name: "QA Mill", invoice_number: "MILL-1", invoice_date: "2026-10-20",
      purchase_order_id: null, purchase_order_number: null, subtotal: 140, vat: 21, total: 161, currency: "ZAR", field_confidence: { supplier: 95, invoiceNo: 95, invoiceDate: 95, total: 95 },
    }],
    vyron_document_line_items: [
      { id: "l1", document_id: DOC, description: "Flour 10kg", quantity: 10, unit: "kg", unit_price: 14, vat: 21, line_total: 161, ignored: false, matched_entity_type: "ingredient", matched_entity_id: FLOUR, matched_entity_name: "Flour" },
    ],
    vyron_document_extraction_logs: [],
    vyron_po_approval_rules: [{ id: "po-r", company_id: CO, require_po_before_invoice_approval: false }],
    vyron_document_approval_rules: [],
    vyron_cost_supplier_invoices: [],
    vyron_cost_stock_items: [],
    vyron_document_approval_override_audit: [], vyron_document_po_link_override_audit: [], vyron_document_approval_audit: [],
    vyron_document_cost_audit: [], vyron_supplier_price_history: [], vyron_procurement_risk_alerts: [],
  };
}

console.log("\n3. Supplier invoice cost → ingredient (yield) → BOM lines (units) → product");
{
  const db = createFakeSupabase(costingSeed());
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: [{ id: U_OWNER, email: "owner@qa.test", password: "qa-pass-owner" }], cookies: new Map(), headers: {} };
  const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
  const approveRoute = await importFromRoot("src/app/api/documents/[id]/review/approve/route.ts");
  const loginRes = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: "owner@qa.test", password: "qa-pass-owner" }), headers: { "content-type": "application/json" } }));
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(loginRes.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  const saved = { log: console.log, warn: console.warn, info: console.info, error: console.error };
  console.log = console.warn = console.info = console.error = () => {};
  let res;
  try {
    res = await approveRoute.POST(
      new NextRequest(new URL(`/api/documents/${DOC}/review/approve`, "http://qa.local"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: false, forceTotalsMismatch: false, reconciliationNote: null, supervisorOverride: { reason: "QA costing check", overriddenBy: "owner" } }) }),
      { params: Promise.resolve({ id: DOC }) }
    );
  } finally {
    Object.assign(console, saved);
  }
  const json = await res.json();
  const flour = db.tables.vyron_cost_ingredients.find((i) => i.id === FLOUR);
  const lineG = db.tables.vyron_cost_bom_lines.find((l) => l.id === "bl-g");
  const lineEach = db.tables.vyron_cost_bom_lines.find((l) => l.id === "bl-each");
  const bom = db.tables.vyron_cost_boms.find((b) => b.id === BOM);
  const pie = db.tables.vyron_cost_products.find((p) => p.id === PIE);
  check("the invoice is approved and Flour's purchase cost is the invoiced R14/kg", res.status === 200 && Number(flour.purchase_cost) === 14, `${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  check("yield applies: usable cost is R17.50/kg (14 ÷ 80%), not R14", near(flour.true_unit_cost, 17.5), String(flour.true_unit_cost));
  check("the gram BOM line is re-costed per GRAM: R0.0175/g, not R17.50/g", near(lineG.unit_cost, 0.0175), String(lineG.unit_cost));
  check("…so 500 g costs R8.75 (it would have been R8,750 copied per kg)", near(Number(lineG.quantity) * Number(lineG.unit_cost), 8.75));
  check("a line in a unit that cannot convert ('each' vs kg) is left unchanged and reported", Number(lineEach.unit_cost) === 2 && (json.bomRecalculation?.skippedLines || []).some((s) => s.lineId === "bl-each"), JSON.stringify(json.bomRecalculation));
  check("the BOM and its product are recalculated from the invoiced cost (8.75 + 2 = 10.75)", near(bom.total_cost, 10.75) && json.bomRecalculation?.bomCount === 1, `bom ${bom.total_cost} product ${pie.total_cost} ${JSON.stringify(json.bomRecalculation)}`);
  check("the product's cost follows the BOM", near(pie.total_cost, 10.75), String(pie.total_cost));
}

console.log("\n3b. Pack-unit lines are held, never inflated (production shape: per-jar cost on a 'box' line)");
{
  const JARS = uuid("1", 9);
  const db = createFakeSupabase({
    vyron_cost_ingredients: [{ id: JARS, company_id: CO, ingredient_name: "Consol 260ml jars", purchase_unit: "box", purchase_cost: 230.02, true_unit_cost: 230.02, yield_percent: 100 }],
    vyron_cost_boms: [{ id: BOM, company_id: CO, bom_name: "Echt Relish", product_id: null, yield_qty: 1, status: "Active" }],
    vyron_cost_bom_lines: [
      { id: "bl-jar", company_id: CO, bom_id: BOM, line_type: "Ingredient", ingredient_id: JARS, line_name: "Consol 260ml jars", quantity: 1, unit: "box", unit_cost: 9.59, wastage_percent: 0, sort_order: 0 },
    ],
    vyron_cost_products: [],
    vyron_cost_audit_log: [],
  });
  const result = await recalculateBomsUsingIngredient(db, CO, JARS);
  const jarLine = db.tables.vyron_cost_bom_lines.find((l) => l.id === "bl-jar");
  check("a per-jar R9.59 on a 'box' line is NOT replaced by the R230.02 box price", Number(jarLine.unit_cost) === 9.59, String(jarLine.unit_cost));
  check("…it is reported as held, and audited for a person to check", (result.heldLines || []).some((h) => h.lineId === "bl-jar" && near(h.verifiedCost, 230.02)) && db.tables.vyron_cost_audit_log.some((a) => a.event_type === "BOM Cost Update Held" && /more than 2x different/.test(a.event_detail)), JSON.stringify(result));

  const db2 = createFakeSupabase({
    vyron_cost_ingredients: [{ id: FLOUR, company_id: CO, ingredient_name: "Flour", purchase_unit: "kg", purchase_cost: 14, true_unit_cost: 17.5, yield_percent: 80 }],
    vyron_cost_boms: [{ id: BOM, company_id: CO, bom_name: "Sponge", product_id: null, yield_qty: 1, status: "Active" }],
    vyron_cost_bom_lines: [{ id: "bl-perkg", company_id: CO, bom_id: BOM, line_type: "Ingredient", ingredient_id: FLOUR, line_name: "Flour", quantity: 500, unit: "g", unit_cost: 15, wastage_percent: 0, sort_order: 0 }],
    vyron_cost_products: [],
    vyron_cost_audit_log: [],
  });
  await recalculateBomsUsingIngredient(db2, CO, FLOUR);
  check("…but a per-kg cost sitting on a gram line (the 1000x error) is still corrected to R0.0175/g", near(db2.tables.vyron_cost_bom_lines[0].unit_cost, 0.0175), String(db2.tables.vyron_cost_bom_lines[0].unit_cost));
  check("unit-level guard: within 0.5x-2x replace, further apart hold, the kg-on-g error replace", units.decideLineCostReplacement(9.59, 230.02, 230.02) === "hold" && units.decideLineCostReplacement(12, 17.5, 17.5) === "replace" && units.decideLineCostReplacement(15, 0.0175, 17.5) === "replace" && units.decideLineCostReplacement(749.5, 14.99, 14.99) === "hold");
}

console.log("\n4. Cost calculator line and PO receipt");
{
  const db = createFakeSupabase(costingSeed());
  const built = await buildCostingLine(db, CO, { recipe_id: uuid("c", 1), ingredient_id: FLOUR, quantity: 250 });
  check("a costing line for Flour is in grams at R0.015/g (R15/kg usable), not R15/g", built.line.unit === "g" && near(built.line.true_unit_cost, 0.015), JSON.stringify(built.line));
  let refused = null;
  try { await buildCostingLine(db, CO, { recipe_id: uuid("c", 1), ingredient_id: OIL, quantity: 1 }); } catch (e) { refused = e; }
  check("an ingredient bought per litre but used 'each' is refused with a clear message", refused && /cannot be converted/.test(refused.message), String(refused));

  const fromInvoice = await units.receiptUnitCost(db, CO, { entityType: "ingredient", entityId: FLOUR, unit: "kg", poPrice: 20 });
  check("a PO receipt of Flour is valued at the invoiced R12/kg, not the PO's R20", fromInvoice.unitCost === 12 && fromInvoice.basis === "invoice", JSON.stringify(fromInvoice));
  const perGram = await units.receiptUnitCost(db, CO, { entityType: "ingredient", entityId: FLOUR, unit: "g", poPrice: 0.02 });
  check("…in the receipt's own unit (R0.012/g)", near(perGram.unitCost, 0.012) && perGram.basis === "invoice");
  db.tables.vyron_cost_ingredients.find((i) => i.id === OIL).purchase_cost = 0;
  const noActual = await units.receiptUnitCost(db, CO, { entityType: "ingredient", entityId: OIL, unit: "l", poPrice: 31 });
  check("with no invoiced cost the PO price is used, marked as an estimate", noActual.unitCost === 31 && noActual.basis === "po_estimate");
}

console.log("\n5. Zero-cost products are not 100% GP");
{
  const db = createFakeSupabase({
    vyron_customer_invoices: [{ id: "inv-1", company_id: CO, customer_id: "cust-1", customer_name: "QA Customer", invoice_number: "T-1", invoice_date: "2026-10-15", status: "Sent", stock_posted: true, sales_value: 2000, cost_value: 600 }],
    vyron_customer_invoice_lines: [
      { invoice_id: "inv-1", product_id: "p1", product_name: "Costed Pie", quantity: 10, selling_price: 100, cost_per_unit: 60 },
      { invoice_id: "inv-1", product_id: "p2", product_name: "Mixed Variety Pack", quantity: 10, selling_price: 100, cost_per_unit: 0 },
    ],
    vyron_customers: [{ id: "cust-1", company_id: CO, customer_name: "QA Customer", category: "Standard" }],
    vyron_cost_products: [
      { id: "p1", company_id: CO, product_name: "Costed Pie", category: "Test" },
      { id: "p2", company_id: CO, product_name: "Mixed Variety Pack", category: "Test" },
    ],
    vyron_customer_sales_order_invoice_links: [], vyron_customer_price_list_assignments: [], vyron_customer_sales_orders: [],
  });
  const report = await getCustomerGpReport(db, CO, {});
  const zero = report.byProduct.find((p) => p.productName === "Mixed Variety Pack");
  const costed = report.byProduct.find((p) => p.productName === "Costed Pie");
  check("the zero-cost product is flagged 'cost missing' (the screen shows 'Cost not measured', not 100%)", zero?.costMissing === true && zero.missingCostLines === 1 && costed?.costMissing === false);
  check("the report warns how much revenue carries no cost, and names the product", report.costWarnings.linesWithoutCost === 1 && report.costWarnings.revenueWithoutCost === 1000 && report.costWarnings.products.includes("Mixed Variety Pack"));
  check("a zero-cost product is never a 'top performer'", !report.topPerformingProducts.some((p) => p.productName === "Mixed Variety Pack") && report.topPerformingProducts.some((p) => p.productName === "Costed Pie"));
  check("the GP arithmetic itself is unchanged (revenue 2000, cost 600)", report.metrics.revenue === 2000 && report.metrics.costOfSales === 600);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
