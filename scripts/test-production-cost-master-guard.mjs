#!/usr/bin/env node
/**
 * VOLORA — a production run may not silently reset a product's cost of sales.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (Kingdom Foods, October 2026)
 * ---------------------------------------------------------------
 * Completing a run wrote the run's cost per unit straight into the product
 * master cost — the value every later sales invoice captures as cost of sales.
 * Every run carried R170 labour + R120 per-run overhead, so a ONE-unit run of
 * Peri-Peri Chicken Pie 180g (PR-77293281, 13 Oct, R4.08 of materials, stock
 * override with no reason) set the master to R294.08. The next two invoices
 * (SI-73067599, SI-44981146) costed 372 pies — all from earlier counted stock —
 * at R294.08: R109,397.76 of cost of sales for pies worth about R1,518.
 * Separately, the override reason was labelled "required" but never enforced.
 *
 * Drives the REAL completeProductionRun, createCustomerInvoice and
 * getCustomerGpReport against an in-memory database (PostgREST response cap on).
 * Family A: no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:production-cost-master-guard
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-production-cost-guard";
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
const round2 = (n) => Math.round(n * 100) / 100;

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { completeProductionRun, decideRunProductCost } = await importFromRoot("src/lib/vyron-manufacturing.ts");
const { createCustomerInvoice } = await importFromRoot("src/lib/vyron-customer-invoices.ts");
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");

const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const CO_B = "bbbbbbbb-0000-4000-8000-000000000001";

/** A run the way the production screen creates it: R170 labour + R120 "Per Run" overhead, whatever the size. */
function run(id, company, productId, qty, materialPerUnit, extra = {}) {
  const ingredient = round2(qty * materialPerUnit);
  return {
    run: {
      id, company_id: company, run_number: `PR-${id}`, bom_id: null, recipe_id: null, product_id: productId,
      bom_name_snapshot: "Synthetic Pie", product_name_snapshot: "Synthetic Pie", status: "Approved",
      batch_multiplier: qty, planned_qty: qty, actual_qty: 0, planned_cost: round2(ingredient + 290), planned_usage_value: ingredient,
      ingredient_cost: ingredient, packaging_cost: 0, labour_cost: 170, overhead_cost: 120, stock_override: false,
      created_at: "2026-10-13T07:41:00Z", ...extra,
    },
    line: { id: `${id}-l1`, company_id: company, production_run_id: id, line_type: "Ingredient", ingredient_id: "ing-filling",
      stock_item_id: company === CO ? "si-filling" : "si-filling-b", line_name: "Pie filling", unit: "kg",
      planned_qty: qty, actual_qty: qty, unit_cost: materialPerUnit, planned_value: ingredient, actual_value: ingredient, sort_order: 0 },
    labour: { id: `${id}-lab`, company_id: company, production_run_id: id, description: "Direct Labour", hours: 2, rate: 85, labour_cost: 170 },
    overhead: { id: `${id}-oh`, company_id: company, production_run_id: id, overhead_type: "Factory Overheads", allocation_method: "Per Run", amount: 120, percent_value: null, allocated_cost: 120 },
  };
}

const RUNS = [
  run("r-one", CO, "p-peri", 1, 4.08), // the PR-77293281 shape
  run("r-short", CO, "p-plain", 10, 5), // a shortage: completes only with an override
  run("r-batch", CO, "p-pepper", 1008, 5), // a normal batch
  run("r-foreign", CO_B, "p-b", 1, 4.08),
];

function seed({ filling = 100000 } = {}) {
  return {
    vyron_workspaces: [
      { id: "ws-a", company_id: CO, company_name: "Synthetic Bakery A", default_vat_rate: 15 },
      { id: "ws-b", company_id: CO_B, company_name: "Synthetic Bakery B", default_vat_rate: 15 },
    ],
    vyron_cost_products: [
      { id: "p-peri", company_id: CO, product_name: "Peri-Peri Pie 180g", selling_price: 10.25, total_cost: 4.08 },
      { id: "p-plain", company_id: CO, product_name: "Plain Pie 150g", selling_price: 10.9, total_cost: 5.3 },
      { id: "p-pepper", company_id: CO, product_name: "Pepper Pie 150g", selling_price: 10.9, total_cost: 5.28 },
      { id: "p-untouched", company_id: CO, product_name: "Untouched Pie", selling_price: 12, total_cost: 6.5 },
      { id: "p-b", company_id: CO_B, product_name: "Tenant B Pie", selling_price: 10, total_cost: 4.08 },
    ],
    vyron_cost_stock_items: [
      { id: "si-filling", company_id: CO, entity_type: "ingredient", entity_id: "ing-filling", description: "Pie filling", unit: "kg", qty_on_hand: filling, average_cost: 4.08, current_cost: 4.08, inventory_value: filling * 4.08 },
      { id: "si-filling-b", company_id: CO_B, entity_type: "ingredient", entity_id: "ing-filling", description: "Pie filling", unit: "kg", qty_on_hand: 100, average_cost: 4.08, current_cost: 4.08, inventory_value: 408 },
      // 408 counted pies at R4.54 — the stock the 372 pies were actually sold from.
      { id: "si-fg-peri", company_id: CO, entity_type: "finished_goods", entity_id: "p-peri", description: "Peri-Peri Pie 180g", unit: "unit", qty_on_hand: 408, average_cost: 4.54, current_cost: 4.54, inventory_value: 1852.32 },
      // Postgres defaults qty_on_hand to 0; the fake has no defaults, so the empty items are explicit.
      ...["p-plain", "p-pepper"].map((p) => ({ id: `si-fg-${p}`, company_id: CO, entity_type: "finished_goods", entity_id: p, description: p, unit: "unit", qty_on_hand: 0, average_cost: 0, current_cost: 0, inventory_value: 0 })),
      { id: "si-fg-b", company_id: CO_B, entity_type: "finished_goods", entity_id: "p-b", description: "Tenant B Pie", unit: "unit", qty_on_hand: 0, average_cost: 0, current_cost: 0, inventory_value: 0 },
    ],
    vyron_cost_stock_ledger: [],
    vyron_cost_inventory_transactions: [],
    vyron_inventory_audit_log: [],
    vyron_stock_minimum_levels: [],
    vyron_cost_production_runs: RUNS.map((r) => r.run),
    vyron_cost_production_run_lines: RUNS.map((r) => r.line),
    vyron_cost_production_labour: RUNS.map((r) => r.labour),
    vyron_cost_production_overhead: RUNS.map((r) => r.overhead),
    vyron_cost_production_wastage: [],
    vyron_cost_production_audit_log: [],
    vyron_customers: [{ id: "c-retail", company_id: CO, customer_name: "Synthetic Retail", category: "Retail" }],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
  };
}

let db = createFakeSupabase(seed(), { honourOrder: true });
const rows = (t) => db.tables[t] || [];
const product = (id) => rows("vyron_cost_products").find((p) => p.id === id);
const audit = (runId, type) => rows("vyron_cost_production_audit_log").filter((a) => a.production_run_id === runId && a.event_type === type);

section("1. The decision rule (pure)");
check("R4.08 → R294.08 (72×) is held", decideRunProductCost(4.08, 294.08).apply === false);
check("the held reason names both costs and the ratio", /294\.0800.*72\.08×.*4\.0800/.test(decideRunProductCost(4.08, 294.08).reason || ""));
check("R5.28 → R9.20 (1.74×, a 72-unit run) is within the band and applies", decideRunProductCost(5.28, 9.2).apply === true);
check("exactly 2× applies; just over 2× is held", decideRunProductCost(5, 10).apply === true && decideRunProductCost(5, 10.01).apply === false);
check("exactly half applies; just under half is held", decideRunProductCost(10, 5).apply === true && decideRunProductCost(10, 4.99).apply === false);
check("a product with no cost yet takes the run's cost", decideRunProductCost(null, 7).apply === true && decideRunProductCost(0, 7).apply === true);
check("a zero or negative run cost never replaces a cost", decideRunProductCost(5, 0).apply === false && decideRunProductCost(null, -1).apply === false);

section("2. One-unit run with full labour and overhead (the PR-77293281 shape)");
const one = await completeProductionRun(db, CO, "r-one", { actual_qty: 1, completed_by: "QA Supervisor" });
check("run completes at its real cost: R4.08 + R170 + R120 = R294.08 a unit", one.status === "Completed" && one.cost_per_unit === 294.08 && one.labour_cost === 170 && one.overhead_cost === 120);
check("the product master cost is NOT replaced (stays R4.08)", product("p-peri").total_cost === 4.08, `got ${product("p-peri").total_cost}`);
const held = audit("r-one", "Product Cost Update Held");
check("a 'Product Cost Update Held' audit event records old R4.08 and new R294.08", held.length === 1 && held[0].old_value === "4.08" && held[0].new_value === "294.08" && held[0].actor === "QA Supervisor");
check("the completion-time snapshot is still captured (reversal restores R4.08)", one.previous_product_total_cost === 4.08);
const receipt = rows("vyron_cost_stock_ledger").find((l) => l.stock_item_id === "si-fg-peri" && l.quantity_in === 1);
check("the one unit is still received into finished goods at the run's cost (R294.08)", Boolean(receipt) && Number(receipt.unit_cost) === 294.08);

section("3. Invoices raised after that run cost the pies at the master, not the one-unit run");
const big = await createCustomerInvoice(db, CO, { customerId: "c-retail", customerName: "Synthetic Retail", invoiceDate: "2026-10-16", lines: [{ productId: "p-peri", productName: "Peri-Peri Pie 180g", quantity: 360, sellingPrice: 10.25 }] });
const small = await createCustomerInvoice(db, CO, { customerId: "c-retail", customerName: "Synthetic Retail", invoiceDate: "2026-10-19", lines: [{ productId: "p-peri", productName: "Peri-Peri Pie 180g", quantity: 12, sellingPrice: 10.25 }, { productId: "p-untouched", productName: "Untouched Pie", quantity: 5, sellingPrice: 12 }] });
const bigLine = rows("vyron_customer_invoice_lines").find((l) => l.invoice_id === big.id);
check("360 pies cost R4.08 each, not R294.08", Number(bigLine.cost_per_unit) === 4.08, `got ${bigLine.cost_per_unit}`);
const untouchedLine = rows("vyron_customer_invoice_lines").find((l) => l.invoice_id === small.id && l.product_id === "p-untouched");
check("an unaffected product keeps its own cost (R6.50)", Number(untouchedLine.cost_per_unit) === 6.5);
// The fake has no generated columns; mirror Postgres' line_total / line_cost / line_gp.
for (const l of rows("vyron_customer_invoice_lines")) {
  l.line_total = round2(l.quantity * l.selling_price);
  l.line_cost = round2(l.quantity * l.cost_per_unit);
  l.line_gp = round2(l.line_total - l.line_cost);
}
for (const i of rows("vyron_customer_invoices")) i.status = "Sent";

section("4. GP report reconciles to every line, past the PostgREST row cap");
const capped = createFakeSupabase(structuredClone(db.tables), { honourOrder: true, maxRows: 1 });
const report = await getCustomerGpReport(capped, CO, { from: "2026-10-01", to: "2026-10-31" });
const lines = rows("vyron_customer_invoice_lines");
const sales = round2(lines.reduce((s, l) => s + l.line_total, 0));
const cost = round2(lines.reduce((s, l) => s + l.line_cost, 0));
check("report revenue = Σ every line, with a 1-row response cap", report.metrics.revenue === sales, `${report.metrics.revenue} vs ${sales}`);
check("report cost of sales = Σ every line = 372 × R4.08 + 5 × R6.50", report.metrics.costOfSales === cost && cost === round2(372 * 4.08 + 5 * 6.5), `${report.metrics.costOfSales} vs ${cost}`);
check("both invoices are in the report", report.byInvoice.length === 2);

section("5. A normal batch still updates the master cost");
const batch = await completeProductionRun(db, CO, "r-batch", { actual_qty: 1008, completed_by: "QA Supervisor" });
const expectBatch = Math.round(((1008 * 5 + 290) / 1008) * 10000) / 10000;
check("1,008-unit run: master moves R5.28 → run cost (R5.2877)", batch.cost_per_unit === expectBatch && product("p-pepper").total_cost === expectBatch, `got ${product("p-pepper").total_cost}`);
check("no held event for a plausible change", audit("r-batch", "Product Cost Update Held").length === 0);

section("6. Stock override needs a reason");
db = createFakeSupabase(seed({ filling: 3 }), { honourOrder: true });
const shortErr = await rejects(completeProductionRun(db, CO, "r-short", { actual_qty: 10, completed_by: "QA" }));
check("a shortage without override is refused (STOCK_SHORTAGE)", shortErr?.message === "STOCK_SHORTAGE");
const noReason = await rejects(completeProductionRun(db, CO, "r-short", { actual_qty: 10, stock_override: true, completed_by: "QA" }));
check("override with no reason is refused", /needs a reason/.test(noReason?.message || ""));
const blank = await rejects(completeProductionRun(db, CO, "r-short", { actual_qty: 10, stock_override: true, stock_override_reason: "   ", completed_by: "QA" }));
check("override with a blank reason is refused", /needs a reason/.test(blank?.message || ""));
check("nothing was posted and the run is still Approved",
  rows("vyron_cost_stock_ledger").length === 0 && rows("vyron_cost_production_runs").find((r) => r.id === "r-short").status === "Approved");
const withReason = await completeProductionRun(db, CO, "r-short", { actual_qty: 10, stock_override: true, stock_override_reason: "  Filling delivered, GRN not yet captured  ", completed_by: "QA Supervisor" });
check("override with a reason completes, storing who and the trimmed reason",
  withReason.status === "Completed" && withReason.stock_override === true && withReason.stock_override_by === "QA Supervisor" && withReason.stock_override_reason === "Filling delivered, GRN not yet captured");
check("the Stock Override audit event carries the reason", audit("r-short", "Stock Override")[0]?.detail === "Filling delivered, GRN not yet captured");

section("7. Duplicate execution and tenant isolation");
const again = await rejects(completeProductionRun(db, CO, "r-short", { actual_qty: 10, stock_override: true, stock_override_reason: "again", completed_by: "QA" }));
check("a completed run cannot be completed twice", /Cannot complete from status Completed/.test(again?.message || ""));
check("…and no second receipt was posted", rows("vyron_cost_stock_ledger").filter((l) => l.stock_item_id === "si-fg-p-plain" && l.quantity_in > 0).length === 1);
const foreign = await rejects(completeProductionRun(db, CO, "r-foreign", { actual_qty: 1, completed_by: "QA" }));
check("company A cannot complete company B's run", /not found/i.test(foreign?.message || ""));
check("company B's product cost is untouched", product("p-b").total_cost === 4.08);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
