#!/usr/bin/env node
/**
 * VYRON — Food Sock Meals DRESS REHEARSAL (in memory only).
 *
 * Runs the whole Tuesday demo against the real planned Food Sock data inside
 * an in-memory database that exists only for the life of this process:
 *
 *   1. demo-scope import through the real executor; counts vs the forecast;
 *      a second run must create nothing
 *   2. purchase order for the limiting component, at the client's own last
 *      real order (supplier, quantity, price, cited by source row) → approval
 *      → goods receipt, through VYRON's procurement engine
 *   3. production of N × the featured product (default N = 10) through
 *      VYRON's manufacturing engine
 *
 * Every consumed quantity and balance is also computed with exact decimal
 * arithmetic and compared with what the engine produced. The result is the
 * expected-outcome record for the real demo.
 *
 * No database, no network, nothing committed: the client files are read
 * locally, and the output goes to .migration-reports/ (gitignored). Family A.
 *
 *   node scripts/food-sock-rehearsal.mjs --sources <dir> (--demo-config <file> | --product <plan product key>) [--quantity 10]
 *
 * The featured product is client business content, so it is not built in: it
 * comes from --product or from the demo configuration kept beside the files.
 */
import { register } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./support/migration-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : null);
const sourcesDir = flag("--sources");
if (!sourcesDir) {
  console.error("Usage: node scripts/food-sock-rehearsal.mjs --sources <dir> (--demo-config <file> | --product <key>) [--quantity 10]");
  process.exit(2);
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { readFoodSockSources } = await import("../src/lib/data-migration/food-sock-sources.ts");
const { buildFoodSockPlan, emptyTarget } = await import("../src/lib/data-migration/food-sock-plan.ts");
const { executeFoodSockPlan, executionAcknowledgement } = await import("../src/lib/data-migration/food-sock-execute.ts");
const { buildDemoDependencies, expectedImportRows } = await import("../src/lib/data-migration/food-sock-demo.ts");
const core = await import("../src/lib/data-migration/core.ts");
const procurement = await import("../src/lib/vyron-procurement.ts");
const manufacturing = await import("../src/lib/vyron-manufacturing.ts");

const demoConfigPath = flag("--demo-config");
const productKey = flag("--product") || (demoConfigPath ? JSON.parse(readFileSync(demoConfigPath, "utf8")).primaryProductKey : null);
if (!productKey) {
  console.error("Name the product to produce: --product <plan product key>, or --demo-config <file> with primaryProductKey.");
  process.exit(2);
}
const quantity = flag("--quantity") || "10";
const TENANT = "5e5e5e5e-0000-4000-8000-00000000f00d";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
};

const sources = readFoodSockSources((name) => new Uint8Array(readFileSync(path.join(sourcesDir, name))));
const db = createFakeSupabase({
  vyron_cost_companies: [{ id: TENANT, name: "REHEARSAL (in-memory only)" }],
  vyron_workspaces: [{ id: "ws-rehearsal", company_id: TENANT }],
  vyron_import_source_links: [],
});
const rows = (table) => (db.tables[table] || []).filter((r) => r.company_id === TENANT);
const link = (entity, key) => rows("vyron_import_source_links").find((l) => l.source_entity === entity && l.source_key === key)?.entity_id || null;

/* ------------------------------------------------------------ 1. import */
console.log("\n1. Demo-scope import (in memory)");
const plan = buildFoodSockPlan(sources, emptyTarget(TENANT));
const expected = expectedImportRows(plan, "demo");
const gates = { companyId: TENANT, approvedPlanHash: plan.planHash, scope: "demo", approval: { approver: "Rehearsal (in-memory)", acknowledgement: executionAcknowledgement(plan.planHash, TENANT, "demo") } };
const imported = await executeFoodSockPlan(db, plan, gates);
check("no record failed", imported.results.every((r) => r.status !== "failed"), JSON.stringify(imported.results.filter((r) => r.status === "failed").slice(0, 5)));
check("reconciliation clean", imported.reconciliation.length === 0, JSON.stringify(imported.reconciliation.slice(0, 5)));
const actualRows = Object.fromEntries(Object.keys(expected).map((t) => [t, rows(t).length]));
for (const [table, want] of Object.entries(expected)) check(`${table}: ${want} expected`, actualRows[table] === want, `found ${actualRows[table]}`);
const before2 = JSON.stringify(Object.fromEntries(Object.keys(expected).filter((t) => t !== "vyron_import_runs").map((t) => [t, rows(t).length])));
const rerun = await executeFoodSockPlan(db, plan, gates);
check("second run creates nothing", rerun.results.every((r) => r.status !== "created" && r.status !== "failed"));
check("second run changes no table except the run log", before2 === JSON.stringify(Object.fromEntries(Object.keys(expected).filter((t) => t !== "vyron_import_runs").map((t) => [t, rows(t).length]))));

/* ----------------------------------------------------- dependency facts */
const dependency = buildDemoDependencies(plan, "demo").find((d) => d.key === productKey);
if (!dependency) {
  console.error(`Product ${productKey} is not in the demo scope.`);
  process.exit(1);
}
const stockOf = (componentKey) => {
  const entity = link("product", componentKey);
  return rows("vyron_cost_stock_items").find((s) => s.entity_id === entity) || null;
};
const limiting = dependency.components.find((c) => c.component === dependency.limitingComponent);
const limitingEvidence = plan.stages.J_supplier_costs.items.find((i) => i.sourceKey === limiting.key.replace(/^product:/, "cost:"))?.proposed;
const lastOrder = sources.purchaseOrderLines.find((l) => l.ref.row === limitingEvidence?.latestPurchase?.row);

/* -------------------------------------------------------- 2. purchasing */
console.log(`\n2. Purchase and receive ${limiting.component}`);
const supplierId = link("vendor", `vendor:${core.normalizeName(lastOrder.vendor)}`);
const receiptQuantity = lastOrder.quantity.raw.replace(/0+$/, "").replace(/\.$/, "");
const receiptPrice = lastOrder.unitPrice.raw;
await procurement.savePurchaseOrder(db, TENANT, {
  po_number: "REHEARSAL-PO-1",
  supplier_id: supplierId,
  supplier_name_snapshot: lastOrder.vendor,
  status: "Draft",
  lines: [{ item_type: limiting.class === "raw_material" ? "ingredient" : "packaging", item_id: link("product", limiting.key), item_name: limiting.component, quantity: Number(receiptQuantity), unit: limiting.unit, unit_price: Number(receiptPrice) }],
}, "rehearsal");
const po = rows("vyron_cost_purchase_orders").find((r) => r.po_number === "REHEARSAL-PO-1");
await procurement.transitionPurchaseOrder(db, po.id, "Submitted", TENANT, { actor: "rehearsal" });
if (rows("vyron_cost_purchase_orders").find((r) => r.id === po.id).status !== "Approved") {
  await procurement.transitionPurchaseOrder(db, po.id, "Approved", TENANT, { approvedBy: "rehearsal", actor: "rehearsal" });
}
const poLine = rows("vyron_cost_purchase_order_lines").find((l) => l.purchase_order_id === po.id);
await procurement.createGoodsReceipt(db, TENANT, {
  purchase_order_id: po.id,
  receipt_type: "full",
  received_by: "rehearsal",
  lines: [{ purchase_order_line_id: poLine.id, item_name: limiting.component, ordered_qty: Number(receiptQuantity), received_qty: Number(receiptQuantity), unit: limiting.unit }],
}, "rehearsal");
const afterReceipt = stockOf(limiting.key);
const expectedAfterReceipt = core.addDecimal(limiting.opening.quantity, receiptQuantity);
check(`${limiting.component}: ${limiting.opening.quantity} + ${receiptQuantity} = ${expectedAfterReceipt} ${limiting.unit}`, Math.abs(afterReceipt.qty_on_hand - Number(expectedAfterReceipt)) < 1e-9, String(afterReceipt.qty_on_hand));
check(`${limiting.component}: average cost stays ${limiting.unitCost} at the same price`, afterReceipt.average_cost === limiting.unitCost, String(afterReceipt.average_cost));
check("PO fully received", /Fully Received|Closed/.test(rows("vyron_cost_purchase_orders").find((r) => r.id === po.id).status));

/* -------------------------------------------------------- 3. production */
console.log(`\n3. Produce ${quantity} × ${dependency.product}`);
const bomId = link("bom", dependency.bom.key);
const productId = link("product", dependency.key);
// qty_on_hand is "numeric(14,4) default 0" (vyron-cost-demo-schema-catchup.sql:882);
// the in-memory stand-in does not apply column defaults, so model it here.
const fgStock = () => {
  const row = rows("vyron_cost_stock_items").find((s) => s.entity_type === "finished_goods" && s.entity_id === productId);
  return row && { ...row, qty_on_hand: Number(row.qty_on_hand ?? 0) };
};
const balanceBefore = Object.fromEntries(dependency.components.map((c) => [c.key, stockOf(c.key).qty_on_hand]));
const fgBefore = fgStock().qty_on_hand;
const ledgerBefore = rows("vyron_cost_stock_ledger").length;
const run = await manufacturing.createProductionRun(db, TENANT, { bom_id: bomId, planned_qty: Number(quantity), created_by: "rehearsal" });
await manufacturing.transitionProductionRun(db, TENANT, run.id, "start", "rehearsal");
await manufacturing.completeProductionRun(db, TENANT, run.id, { actual_qty: Number(quantity), completed_by: "rehearsal" });
const runRow = rows("vyron_cost_production_runs").find((r) => r.id === run.id);

const components = dependency.components.map((c) => {
  const exactBefore = c.key === limiting.key ? expectedAfterReceipt : c.opening.quantity;
  const consumed = core.multiplyDecimal(c.quantityPerUnit, quantity);
  const exactAfter = core.subtractDecimal(exactBefore, consumed);
  const engineAfter = stockOf(c.key).qty_on_hand;
  const ok = Math.abs(engineAfter - Number(exactAfter)) < 1e-9 && Math.abs(balanceBefore[c.key] - Number(exactBefore)) < 1e-9;
  check(`${c.component}: ${exactBefore} − ${quantity} × ${c.quantityPerUnit} = ${exactAfter} ${c.unit}`, ok, `engine before ${balanceBefore[c.key]}, after ${engineAfter}`);
  return {
    component: c.component, key: c.key, unit: c.unit, sourceRows: { product: c.productRow, bom: c.bomRow, opening: c.opening?.stockRow },
    quantityPerUnit: c.quantityPerUnit, consumed, before: exactBefore, after: exactAfter,
    storedAfter: core.roundDecimal(exactAfter, 4), unitCost: c.unitCost, costEvidence: c.costEvidence, costSource: c.costSource,
  };
});
const fgAfter = fgStock().qty_on_hand;
check(`finished goods: ${fgBefore} + ${quantity} = ${Number(fgBefore) + Number(quantity)}`, fgAfter === Number(fgBefore) + Number(quantity), String(fgAfter));

const transactions = rows("vyron_cost_inventory_transactions").filter((t) => t.reference_type === "production_run" && t.reference_id === run.id);
const consumption = transactions.filter((t) => t.transaction_type === "Consumption");
const receipt = transactions.filter((t) => t.transaction_type === "Receipt");
check(`one Consumption transaction per component (${dependency.components.length}), linked to the run`, consumption.length === dependency.components.length, String(consumption.length));
check("one finished-goods Receipt transaction, linked to the run", receipt.length === 1 && Number(receipt[0].quantity) === Number(quantity));
const newLedger = rows("vyron_cost_stock_ledger").slice(ledgerBefore);
check("every run ledger row points at its inventory transaction and carries the run number", newLedger.every((l) => transactions.some((t) => t.id === l.reference_id) && l.reference_label === runRow.run_number));
const fgLedger = newLedger.find((l) => l.stock_item_id === fgStock().id);
const bomCostPerUnit = dependency.bom.computedCost;

const outDir = path.join(ROOT, ".migration-reports", "food-sock", plan.planHash.slice(0, 12));
mkdirSync(outDir, { recursive: true });
const record = {
  kind: "food-sock-demo-expected-result",
  generatedAt: new Date().toISOString(),
  planHash: plan.planHash,
  sources: plan.sources.map((f) => ({ file: f.name, sha256: f.sha256 })),
  note: "Computed in an in-memory rehearsal. Quantities are exact decimals; stored* values are what a numeric(14,4) column holds. Compare the real run against these.",
  import: { expected, actual: actualRows, secondRunCreated: rerun.results.filter((r) => r.status === "created").length },
  purchase: {
    component: limiting.component,
    supplier: lastOrder.vendor,
    basedOn: { orderNumber: lastOrder.orderNumber, orderDate: lastOrder.orderDate, sourceRow: lastOrder.ref.row, file: lastOrder.ref.file },
    quantity: receiptQuantity, unit: limiting.unit, unitPrice: receiptPrice,
    before: limiting.opening.quantity, after: expectedAfterReceipt, averageCostAfter: afterReceipt.average_cost,
  },
  production: {
    product: dependency.product, sku: dependency.sku, quantity, unit: dependency.unit,
    bomCostPerUnit, runCostPerUnit: runRow.cost_per_unit, runTotalCost: runRow.total_production_cost ?? runRow.planned_cost,
    finishedGoods: { before: fgBefore, after: fgAfter, receiptUnitCost: fgLedger?.unit_cost ?? null, ledgerMovementType: fgLedger?.movement_type ?? null },
    components,
    linkage: {
      run: "vyron_cost_production_runs (status Completed)",
      consumptionTransactions: `${consumption.length} × vyron_cost_inventory_transactions type Consumption, reference_type production_run, reference_id = run id`,
      finishedGoodsTransaction: "1 × vyron_cost_inventory_transactions type Receipt, reference_type production_run, reference_id = run id",
      ledger: "each vyron_cost_stock_ledger row: reference_id = its inventory transaction id (not the run id), reference_label = run number",
      costRounding: "The run rounds each line value and the total to cents, then cost per unit to 4 decimals (vyron-manufacturing.ts:898, 984-985); the BOM keeps 6.",
      knownLabel: "The finished-goods ledger row is recorded as movement_type 'Purchase' (vyron-inventory-transactions.ts:92); see the proposed patch.",
    },
  },
  checks,
};
writeFileSync(path.join(outDir, `rehearsal-${core.normalizeSku(dependency.sku || "product")}-x${quantity}.json`), JSON.stringify(record, null, 1));

const failed = checks.filter((c) => !c.ok).length;
console.log(`\nBOM cost per unit ${bomCostPerUnit}; run cost per unit ${runRow.cost_per_unit}; finished-goods ledger movement "${fgLedger?.movement_type}".`);
console.log(`${checks.length - failed}/${checks.length} rehearsal checks passed.`);
console.log(`Expected-result record: ${path.relative(ROOT, outDir)}${path.sep}rehearsal-${core.normalizeSku(dependency.sku || "product")}-x${quantity}.json (gitignored)`);
process.exit(failed ? 1 : 0);
