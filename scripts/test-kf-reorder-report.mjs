#!/usr/bin/env node
/**
 * VYRON — Low stock & minimum order level report (Kingdom Foods query, 2026-11).
 *
 * Proves the report picks the right items, deducts stock already on order,
 * calculates the quantity to order, and gives the reason. Real report code
 * against an in-memory database; no network.
 *
 *   npm run test:kf-reorder-report
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-reorder";
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
const item = (id, code, desc, entityType, entityId, qty, company = CO) => ({ id, company_id: company, item_code: code, description: desc, entity_type: entityType, entity_id: entityId, unit: "kg", qty_on_hand: qty });
const level = (id, stockItemId, minimum, warning = null, critical = null, company = CO) => ({ id, company_id: company, stock_item_id: stockItemId, location: "", minimum_qty: minimum, warning_qty: warning, critical_qty: critical, block_production: false });

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { buildReorderReport } = await importFromRoot("src/lib/vyron-reorder-report.ts");
const { reorderReportCsv } = await importFromRoot("src/lib/vyron-reorder-report-csv.ts");

const db = createFakeSupabase({
  vyron_cost_stock_items: [
    { ...item("si-flour", "FLR", "Flour", "ingredient", "ing-flour", 20) },        // min 50, warn 80, PO 10 → order 50
    item("si-butter", "BTR", "Butter", "ingredient", "ing-butter", 5),      // min 30, crit 5 → critical, order 25
    item("si-salt", "SLT", "Salt", "ingredient", "ing-salt", 4),            // min 10, PO 8 → covered, order 0
    item("si-sugar", "SGR", "Sugar", "ingredient", "ing-sugar", 60),        // min 40 → fine
    item("si-pie", "PIE", "Steak Pie", "finished_goods", "p-pie", 2),       // min 12, product PO 4 → order 6
    item("si-yeast", "YST", "Yeast", "ingredient", "ing-yeast", 0),         // no minimum → never reported
    item("si-other", "OTH", "Other company flour", "ingredient", "ing-x", 0, OTHER),
  ],
  vyron_cost_suppliers: [
    { id: "sup-mill", company_id: CO, supplier_name: "QA Mill" },
    { id: "sup-dairy", company_id: CO, supplier_name: "QA Dairy" },
    { id: "sup-salt", company_id: CO, supplier_name: "QA Salt Co" },
    { id: "sup-x", company_id: OTHER, supplier_name: "Other company supplier" },
  ],
  vyron_cost_ingredients: [
    { id: "ing-flour", company_id: CO, ingredient_name: "Flour", supplier_id: "sup-mill" },
    { id: "ing-butter", company_id: CO, ingredient_name: "Butter", supplier_id: null },
    { id: "ing-salt", company_id: CO, ingredient_name: "Salt", supplier_id: null },
    { id: "ing-sugar", company_id: CO, ingredient_name: "Sugar", supplier_id: "sup-x" },
  ],
  vyron_stock_minimum_levels: [
    level("l1", "si-flour", 50, 80),
    level("l2", "si-butter", 30, null, 5),
    level("l3", "si-salt", 10),
    level("l4", "si-sugar", 40),
    level("l5", "si-pie", 12),
    level("l6", "si-other", 100, null, null, OTHER),
  ],
  vyron_cost_purchase_orders: [
    { id: "po-1", company_id: CO, po_number: "PO-001", status: "Sent", supplier_id: "sup-mill", order_date: "2026-10-20" },
    { id: "po-2", company_id: CO, po_number: "PO-002", status: "Partially Received", supplier_id: "sup-salt", order_date: "2026-10-25" },
    { id: "po-draft", company_id: CO, po_number: "PO-DRAFT", status: "Draft", supplier_id: "sup-mill", order_date: "2026-10-01" },
    { id: "po-closed", company_id: CO, po_number: "PO-CLOSED", status: "Fully Received", supplier_id: "sup-dairy", order_date: "2026-10-15" },
  ],
  vyron_cost_purchase_order_lines: [
    { id: "pl1", company_id: CO, purchase_order_id: "po-1", item_type: "ingredient", item_id: "ing-flour", outstanding_qty: 10 },
    { id: "pl2", company_id: CO, purchase_order_id: "po-2", item_type: "ingredient", item_id: "ing-salt", outstanding_qty: 8 },
    { id: "pl3", company_id: CO, purchase_order_id: "po-2", item_type: "product", item_id: "p-pie", outstanding_qty: 4 },
    { id: "pl4", company_id: CO, purchase_order_id: "po-draft", item_type: "ingredient", item_id: "ing-butter", outstanding_qty: 100 },
    { id: "pl5", company_id: CO, purchase_order_id: "po-closed", item_type: "ingredient", item_id: "ing-butter", outstanding_qty: 0 },
  ],
});

const report = await buildReorderReport(db, CO);
const row = (code) => report.rows.find((r) => r.itemCode === code);

console.log("\n1. Which products need ordering");
check("only items with a minimum, of this company, are reported (yeast and the other company's item are not)", report.rows.length === 5 && !row("YST") && !row("OTH"), report.rows.map((r) => r.itemCode).join(","));
check("Flour, Butter and Steak Pie need ordering; Salt (covered by a PO) and Sugar do not", row("FLR").needsOrdering && row("BTR").needsOrdering && row("PIE").needsOrdering && !row("SLT").needsOrdering && !row("SGR").needsOrdering);
check("the summary counts them: 3 to order, 1 critical, 1 covered by open orders", report.summary.needOrdering === 3 && report.summary.critical === 1 && report.summary.coveredByOpenOrders === 1, JSON.stringify(report.summary));
check("critical items come first", report.rows[0].itemCode === "BTR", report.rows.map((r) => r.itemCode).join(","));

console.log("\n2. Quantities");
check("Flour: on hand 20 + on order 10 → order 50 to reach the warning level 80", row("FLR").onHand === 20 && row("FLR").onOrder === 10 && row("FLR").reorderQty === 50 && row("FLR").orderUpTo === 80, JSON.stringify(row("FLR")));
check("Butter: 5 on hand, minimum 30, draft and fully received POs NOT counted → order 25", row("BTR").onOrder === 0 && row("BTR").reorderQty === 25, JSON.stringify(row("BTR")));
check("Steak Pie: a PO line for the PRODUCT counts against its finished-goods stock → 2 + 4 on order, order 6", row("PIE").onOrder === 4 && row("PIE").reorderQty === 6);
check("Salt: below minimum but 8 on order covers it → order 0", row("SLT").onOrder === 8 && row("SLT").reorderQty === 0);

console.log("\n3. Reasons");
check("Butter's reason says it is critical and how much to order", /Critical: on hand 5 is at or below the critical level 5\./.test(row("BTR").reason) && /Order 25 to bring stock to 30 \(the minimum\)/.test(row("BTR").reason), row("BTR").reason);
check("Flour's reason names the shortfall, the open PO and the target", /30 below the minimum of 50/.test(row("FLR").reason) && /10 already on order \(PO-001\)/.test(row("FLR").reason) && /Order 50 to bring stock to 80 \(the warning level\)/.test(row("FLR").reason), row("FLR").reason);
check("Salt's reason says open purchase orders cover it", /Open purchase orders cover the shortfall/.test(row("SLT").reason) && /PO-002/.test(row("SLT").reason), row("SLT").reason);
check("Sugar's reason says it is at or above the minimum", /At or above the minimum/.test(row("SGR").reason));

console.log("\n4. Supplier");
check("Flour: the supplier on the ingredient master (QA Mill)", row("FLR").supplier === "QA Mill" && row("FLR").supplierSource === "ingredient");
check("Butter: no supplier on the master, so the supplier of its most recent purchase order (QA Dairy)", row("BTR").supplier === "QA Dairy" && row("BTR").supplierSource === "last purchase order", JSON.stringify(row("BTR")));
check("Steak Pie: made in-house from its BOM", row("PIE").supplier === "Made in-house (BOM)");
check("Sugar: a supplier id belonging to ANOTHER company is never shown", row("SGR").supplier === null, JSON.stringify(row("SGR")));
const csv = reorderReportCsv(report.rows);
const [head, ...csvRows] = csv.split("\n");
check("the CSV has the Supplier column", head.split(",")[3] === '"Supplier"', head);
check("…with each row's supplier, quantities and reason", csvRows.some((r) => r.startsWith('"FLR","Flour","kg","QA Mill","20","10","50"') && r.includes('"Yes","50"')), csvRows.join(" | "));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
