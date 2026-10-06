#!/usr/bin/env node
/**
 * VOLORA — business controls: supplier reconciliation, minimum stock levels, production minimum
 * warnings, the dashboard Attention Required panel, last production, stock-take upload and
 * customer price-list enforcement.
 *
 * Drives the REAL modules (reconciliation, minimum levels, production check + start gate, the
 * attention centre, stock-take import + the existing approve/post workflow, the price resolver +
 * createCustomerInvoice) against an in-memory database, for two synthetic companies. Family A:
 * no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:business-controls
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-business-controls";
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
const enc = (text) => new TextEncoder().encode(text);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const recon = await importFromRoot("src/lib/vyron-supplier-reconciliation.ts");
const { readUploadedTable, parseAmount, parseDateCell } = await importFromRoot("src/lib/vyron-upload-table.ts");
const minimums = await importFromRoot("src/lib/vyron-stock-minimums.ts");
const { checkProductionMinimums } = await importFromRoot("src/lib/vyron-production-minimums.ts");
const { transitionProductionRun } = await importFromRoot("src/lib/vyron-manufacturing.ts");
const { getAttentionCentre, getProductionActivity } = await importFromRoot("src/lib/vyron-attention-centre.ts");
const stockTake = await importFromRoot("src/lib/vyron-stock-take-import.ts");
const { approveStockCount, postStockCount } = await importFromRoot("src/lib/vyron-inventory.ts");
const prices = await importFromRoot("src/lib/vyron-customer-price-lists.ts");
const { createCustomerInvoice, PriceUnavailableError } = await importFromRoot("src/lib/vyron-customer-invoices.ts");

const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const CO_B = "bbbbbbbb-0000-4000-8000-000000000001";
const ACTOR = "11111111-0000-4000-8000-000000000001";
const PL_WHOLESALE = "c0000000-0000-4000-8000-000000000001";
const PL_STANDARD = "c0000000-0000-4000-8000-000000000002";
const PL_B = "c0000000-0000-4000-8000-000000000003";

function seed() {
  return {
    vyron_workspaces: [
      { id: "ws-a", company_id: CO, company_name: "Synthetic Foods A", default_vat_rate: 15 },
      { id: "ws-b", company_id: CO_B, company_name: "Synthetic Foods B", default_vat_rate: 15 },
    ],
    vyron_cost_suppliers: [
      { id: "sup-a", company_id: CO, supplier_name: "N1 Restaurant Suppliers (Pty) Ltd" },
      { id: "sup-b", company_id: CO_B, supplier_name: "N1 Restaurant Suppliers (Pty) Ltd" },
    ],
    // Supplier invoices VOLORA holds (register + one approved Invoice Intelligence document).
    vyron_cost_supplier_invoices: [
      { id: "si-1", company_id: CO, supplier_id: "sup-a", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45821", invoice_date: "2026-09-02", status: "Approved", subtotal: 10826.09, vat: 1623.91, total: 12450, created_at: "2026-09-03T00:00:00Z" },
      { id: "si-2", company_id: CO, supplier_id: "sup-a", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45822", invoice_date: "2026-09-05", status: "Approved", subtotal: 13000, vat: 1950, total: 14950, created_at: "2026-09-06T00:00:00Z" },
      { id: "si-3", company_id: CO, supplier_id: "sup-a", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45824", invoice_date: "2026-09-08", status: "Approved", subtotal: 1000, vat: 150, total: 1150, created_at: "2026-09-09T00:00:00Z" },
      { id: "si-4", company_id: CO, supplier_id: "sup-a", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45830", invoice_date: "2026-09-12", status: "Approved", subtotal: 500, vat: 75, total: 575, created_at: "2026-09-21T00:00:00Z" },
      { id: "si-b", company_id: CO_B, supplier_id: "sup-b", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45823", invoice_date: "2026-09-04", status: "Approved", subtotal: 7321.74, vat: 1098.26, total: 8420, created_at: "2026-09-04T00:00:00Z" },
    ],
    vyron_cost_supplier_invoice_lines: [],
    vyron_documents: [
      { id: "doc-1", tenant_id: CO, status: "archived", approved_at: "2026-09-12T08:00:00Z", supplier_name: "N1 Restaurant Suppliers (Pty) Ltd", invoice_number: "INV-45825", invoice_date: "2026-09-10", subtotal: 2000, vat: 300, total: 2300, created_at: "2026-09-11T00:00:00Z" },
    ],
    vyron_document_line_items: [],
    vyron_supplier_reconciliations: [],
    vyron_supplier_reconciliation_lines: [],
    // Stock.
    vyron_cost_stock_items: [
      { id: "si-box", company_id: CO, item_code: "BOX-01", description: "Meal Boxes", entity_type: "packaging", entity_id: "pk-box", unit: "each", qty_on_hand: 120, average_cost: 2, current_cost: 2, barcode: "6001000000017", aliases: [] },
      { id: "si-chk", company_id: CO, item_code: "CHK-BR", description: "Chicken Breast", entity_type: "ingredient", entity_id: "ing-chk", unit: "kg", qty_on_hand: 120, average_cost: 85, current_cost: 85, aliases: ["CHICKEN-BREAST"] },
      { id: "si-rice", company_id: CO, item_code: "RICE", description: "Basmati Rice", entity_type: "ingredient", entity_id: "ing-rice", unit: "kg", qty_on_hand: 50, average_cost: 30, current_cost: 30, aliases: [] },
      { id: "si-curry", company_id: CO, item_code: "FG-TGC", description: "Thai Green Curry", entity_type: "finished_goods", entity_id: "p-tgc", unit: "each", qty_on_hand: 120, average_cost: 13, current_cost: 13, aliases: [] },
      { id: "si-b-curry", company_id: CO_B, item_code: "FG-TGC", description: "Thai Green Curry", entity_type: "finished_goods", entity_id: "p-b-tgc", unit: "each", qty_on_hand: 400, average_cost: 13, current_cost: 13, aliases: [] },
    ],
    vyron_cost_products: [
      { id: "p-tgc", company_id: CO, product_name: "Thai Green Curry", sku: "745853254322", selling_price: 49.9, total_cost: 13.06 },
      { id: "p-cbs", company_id: CO, product_name: "Chilli Beef Stew", sku: "745853254339", selling_price: 45, total_cost: 10.78 },
      { id: "p-b-tgc", company_id: CO_B, product_name: "Thai Green Curry", sku: "745853254322", selling_price: 55, total_cost: 13.06 },
    ],
    vyron_stock_minimum_levels: [],
    vyron_inventory_audit_log: [],
    vyron_inventory_settings: [],
    vyron_cost_stock_ledger: [],
    vyron_cost_stock_counts: [],
    vyron_cost_stock_count_lines: [],
    vyron_cost_low_stock_alerts: [],
    // Production.
    vyron_cost_production_runs: [
      { id: "run-1", company_id: CO, run_number: "PR-1048", product_id: "p-tgc", status: "Approved", planned_qty: 40, actual_qty: 0, created_at: "2026-10-06T08:00:00Z" },
      { id: "run-old", company_id: CO, run_number: "PR-1040", product_id: "p-tgc", product_name_snapshot: "Thai Green Curry", status: "Completed", planned_qty: 100, actual_qty: 96, completed_by: "Thandi Mokoena", completed_at: "2026-10-05T09:15:00Z", created_at: "2026-10-05T07:00:00Z" },
      { id: "run-last", company_id: CO, run_number: "PR-1047", product_id: "p-tgc", product_name_snapshot: "Thai Green Curry", status: "Completed", planned_qty: 300, actual_qty: 300, completed_by: "John Smith", completed_at: "2026-10-06T12:32:00Z", created_at: "2026-10-06T07:00:00Z" },
      { id: "run-b", company_id: CO_B, run_number: "PB-9", product_id: "p-b-tgc", product_name_snapshot: "Thai Green Curry", status: "Completed", planned_qty: 999, actual_qty: 999, completed_by: "Other Co", completed_at: "2026-10-06T13:00:00Z", created_at: "2026-10-06T07:00:00Z" },
    ],
    vyron_cost_production_run_lines: [
      { id: "rl-1", company_id: CO, production_run_id: "run-1", line_type: "packaging", line_name: "Meal Boxes", stock_item_id: "si-box", planned_qty: 80, unit: "each", unit_cost: 2 },
      { id: "rl-2", company_id: CO, production_run_id: "run-1", line_type: "ingredient", line_name: "Chicken Breast", stock_item_id: "si-chk", planned_qty: 30, unit: "kg", unit_cost: 85 },
    ],
    vyron_cost_production_run_labour: [],
    vyron_cost_production_run_overhead: [],
    vyron_cost_production_run_wastage: [],
    vyron_cost_production_audit_log: [],
    // Customers and price lists.
    vyron_customers: [
      { id: "c-abc", company_id: CO, customer_name: "ABC Retail", status: "Active" },
      { id: "c-walkin", company_id: CO, customer_name: "Walk-in Deli", status: "Active" },
      { id: "c-b", company_id: CO_B, customer_name: "B Customer", status: "Active" },
    ],
    vyron_customer_price_lists: [
      { id: PL_WHOLESALE, company_id: CO, list_name: "Wholesale", list_type: "Standard", status: "Active", effective_from: "2026-01-01", effective_to: null, version: 1, is_company_default: false },
      { id: PL_STANDARD, company_id: CO, list_name: "Standard", list_type: "Standard", status: "Active", effective_from: "2026-01-01", effective_to: null, version: 1, is_company_default: false },
      { id: PL_B, company_id: CO_B, list_name: "B Default", list_type: "Standard", status: "Active", effective_from: "2026-01-01", effective_to: null, version: 1, is_company_default: true },
    ],
    vyron_customer_price_list_items: [
      { id: "pli-1", company_id: CO, price_list_id: PL_WHOLESALE, product_id: "p-tgc", final_price: 42.5, status: "Active", effective_from: "2026-01-01" },
      { id: "pli-2", company_id: CO, price_list_id: PL_STANDARD, product_id: "p-tgc", final_price: 49.9, status: "Active", effective_from: "2026-01-01" },
      { id: "pli-b", company_id: CO_B, price_list_id: PL_B, product_id: "p-b-tgc", final_price: 61, status: "Active", effective_from: "2026-01-01" },
    ],
    vyron_customer_price_list_assignments: [{ id: "as-1", company_id: CO, customer_id: "c-abc", default_price_list_id: PL_WHOLESALE, contract_price_list_id: null, status: "Active" }],
    vyron_customer_price_list_versions: [],
    vyron_customer_price_list_audit_log: [],
    vyron_customer_branches: [],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
  };
}

let db = createFakeSupabase(seed(), { honourOrder: true, unique: { vyron_stock_minimum_levels: [["company_id", "stock_item_id", "location"]] } });
globalThis.__VYRON_SESSION_TEST__ = { supabase: db };
const rows = (t) => db.tables[t] || [];

// ---------------------------------------------------------------------------
section("1. Supplier invoice reconciliation");
{
  check("amounts: R 12 450,00 / 1,234.50 / (500.00) / 500-", parseAmount("R 12 450,00") === 12450 && parseAmount("1,234.50") === 1234.5 && parseAmount("(500.00)") === -500 && parseAmount("500-") === -500);
  check("dates: ISO and South African day-first; invalid → null", parseDateCell("2026-09-02") === "2026-09-02" && parseDateCell("02/09/2026") === "2026-09-02" && parseDateCell("31/02/2026") === null);
  const csv = [
    "Supplier,Invoice Number,Invoice Date,Due Date,Type,Total,VAT,Amount Paid",
    "N1 Restaurant Suppliers (Pty) Ltd,INV-45821,02/09/2026,02/10/2026,Invoice,\"12,450.00\",1623.91,0",
    "N1 Restaurant Suppliers,INV-45822,05/09/2026,05/10/2026,Invoice,15450.00,2015.22,0",
    "N1 Restaurant Suppliers,INV-45823,06/09/2026,06/10/2026,Invoice,8420.00,1098.26,0",
    "N1 Restaurant Suppliers,inv 45824,08/09/2026,,Invoice,1150.00,140.00,1150",
    "N1 Restaurant Suppliers,INV-45825,10/09/2026,,Invoice,2300.00,300.00,0",
    "N1 Restaurant Suppliers,INV-45826,11/09/2026,,Invoice,990.00,129.13,0",
    "N1 Restaurant Suppliers,INV-45826,11/09/2026,,Invoice,990.00,129.13,0",
    "N1 Restaurant Suppliers,CN-0091,15/09/2026,,Credit Note,-575.00,-75.00,0",
    "N1 Restaurant Suppliers,,,,Balance brought forward,40000.00,,",
  ].join("\n");
  const table = await readUploadedTable(enc(csv), "n1-statement.csv", "text/csv");
  const result = await recon.runSupplierReconciliation(db, CO, { table, sha256: table.sha256, fileName: "n1-statement.csv", supplierName: null }, ACTOR);
  const byNo = (n) => result.lines.find((l) => l.invoiceNumber === n);
  check("MATCHED: supplier and VOLORA agree (supplier name with or without (Pty) Ltd)", byNo("INV-45821")?.status === "MATCHED" && byNo("INV-45821")?.difference === 0);
  check("TOTAL DIFFERENCE: R15,450 vs R14,950 → R500.00", byNo("INV-45822")?.status === "TOTAL_DIFFERENCE" && byNo("INV-45822")?.difference === 500 && byNo("INV-45822")?.voloraTotal === 14950);
  check("MISSING IN VOLORA (another company holds that number — not seen here)", byNo("INV-45823")?.status === "MISSING_IN_VOLORA" && byNo("INV-45823")?.voloraTotal === null);
  check("VAT DIFFERENCE with the same total; invoice number matched ignoring case/separators", byNo("inv 45824")?.status === "VAT_DIFFERENCE" && byNo("inv 45824")?.vatDifference === -10);
  check("matched against an invoice approved in Invoice Intelligence", byNo("INV-45825")?.status === "MATCHED" && /Invoice Intelligence/.test(byNo("INV-45825")?.voloraRef || ""));
  check("DUPLICATE: the same number twice on the supplier document", result.lines.filter((l) => l.invoiceNumber === "INV-45826").every((l) => l.status === "DUPLICATE") && result.lines.filter((l) => l.invoiceNumber === "INV-45826").length === 2);
  check("CREDIT NOTE identified (type and negative amount)", byNo("CN-0091")?.status === "CREDIT_NOTE" && byNo("CN-0091")?.documentType === "CREDIT_NOTE" && byNo("CN-0091")?.supplierTotal === -575);
  const notOn = result.lines.filter((l) => l.status === "NOT_ON_SUPPLIER_DOCUMENT");
  check("IN VOLORA BUT NOT ON SUPPLIER DOCUMENT, within the statement's period", notOn.length === 1 && notOn[0].invoiceNumber === "INV-45830");
  check("balance rows without an invoice number are skipped and reported, not reconciled", result.skipped.length === 1);
  const s = result.summary;
  check("summary counts", s.supplierInvoices === 8 && s.matched === 2 && s.missing === 1 && s.totalDifferences === 1 && s.vatDifferences === 1 && s.duplicates === 2 && s.creditNotes === 1 && s.notOnSupplierDocument === 1, JSON.stringify(s));
  check("summary values: supplier, VOLORA, difference", s.supplierValue === 41175 && s.voloraValue === 30850 && s.difference === 10325, `${s.supplierValue} ${s.voloraValue} ${s.difference}`);
  check("the run and every line are kept, for this company only", rows("vyron_supplier_reconciliations").length === 1 && rows("vyron_supplier_reconciliation_lines").length === result.lines.length && rows("vyron_supplier_reconciliation_lines").every((l) => l.company_id === CO));
  check("nothing posted: no supplier invoice created or changed", rows("vyron_cost_supplier_invoices").length === 5);
  const csvOut = recon.reconciliationCsv(rows("vyron_supplier_reconciliation_lines"));
  check("export CSV has a header and one row per line", csvOut.split("\r\n").length === result.lines.length + 1 && csvOut.startsWith("Status,Supplier,Invoice Number"));
  check("another company cannot open this reconciliation", (await recon.getSupplierReconciliation(db, CO_B, rows("vyron_supplier_reconciliations")[0].id)) === null);
  const bResult = await recon.runSupplierReconciliation(db, CO_B, { table, sha256: table.sha256, fileName: "n1-statement.csv", supplierName: null }, ACTOR);
  check("company B's own invoice INV-45823 matches for B; A's invoices are MISSING for B", bResult.lines.find((l) => l.invoiceNumber === "INV-45823")?.status === "MATCHED" && bResult.lines.find((l) => l.invoiceNumber === "INV-45821")?.status === "MISSING_IN_VOLORA");
  const noSupplier = await readUploadedTable(enc("Invoice No,Amount\nINV-45821,12450"), "list.csv");
  check("a file without a supplier column needs the supplier chosen", (await rejects(recon.runSupplierReconciliation(db, CO, { table: noSupplier, sha256: noSupplier.sha256, fileName: "list.csv", supplierName: null }, ACTOR)))?.message.includes("choose the supplier"));
  const chosen = await recon.runSupplierReconciliation(db, CO, { table: noSupplier, sha256: noSupplier.sha256, fileName: "list.csv", supplierName: "N1 Restaurant Suppliers" }, ACTOR);
  check("…and with it chosen, matches", chosen.lines.find((l) => l.invoiceNumber === "INV-45821")?.status === "MATCHED");
  check("never matched on amount alone", recon.reconcileStatement([{ row: 2, supplierName: "N1", invoiceNumber: "X-1", documentType: "INVOICE", invoiceDate: null, dueDate: null, total: 12450, vat: null, amountPaid: null }], [{ id: "v", origin: "register", supplier_name: "N1", invoice_number: "INV-45821", total: 12450, vat: 0, invoice_date: "2026-09-02" }]).lines[0].status === "MISSING_IN_VOLORA");
}

// ---------------------------------------------------------------------------
section("2. Minimum stock levels");
{
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-curry", minimumQty: 100, warningQty: 150 }, ACTOR);
  await minimums.saveMinimumLevel(db, CO_B, { stockItemId: "si-b-curry", minimumQty: 500 }, ACTOR);
  const a = await minimums.listMinimumLevelStatus(db, CO);
  const b = await minimums.listMinimumLevelStatus(db, CO_B);
  check("Thai Green Curry, minimum 100, warning 150, on hand 120 → WARNING", a.length === 1 && a[0].status === "WARNING" && a[0].minimum_qty === 100);
  check("the same product, another company, minimum 500, on hand 400 → BELOW_MINIMUM (shortfall 100)", b.length === 1 && b[0].status === "BELOW_MINIMUM" && b[0].shortfall === 100);
  check("each company sees only its own thresholds", a.every((l) => l.company_id === CO) && b.every((l) => l.company_id === CO_B));
  check("a company cannot set a threshold on another company's stock item", (await rejects(minimums.saveMinimumLevel(db, CO, { stockItemId: "si-b-curry", minimumQty: 1 }, ACTOR)))?.status === 404);
  check("warning must be at or above the minimum; critical between 0 and the minimum", Boolean(await rejects(minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 100, warningQty: 50 }, ACTOR))) && Boolean(await rejects(minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 100, criticalQty: 150 }, ACTOR))));
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-curry", minimumQty: 100, warningQty: 130 }, ACTOR);
  check("changing a threshold updates it (one row per item) and is audited with old and new values", rows("vyron_stock_minimum_levels").filter((l) => l.stock_item_id === "si-curry").length === 1 && rows("vyron_inventory_audit_log").some((l) => l.event_type === "Minimum Level Changed" && /150/.test(l.old_value) && /130/.test(l.new_value) && l.actor === ACTOR));
  check("statuses: critical / below / warning / ok", minimums.minimumStatus(5, { minimum_qty: 100, warning_qty: 150, critical_qty: 10 }) === "CRITICAL" && minimums.minimumStatus(90, { minimum_qty: 100, warning_qty: 150, critical_qty: 10 }) === "BELOW_MINIMUM" && minimums.minimumStatus(140, { minimum_qty: 100, warning_qty: 150, critical_qty: null }) === "WARNING" && minimums.minimumStatus(100, { minimum_qty: 100, warning_qty: null, critical_qty: null }) === "OK");
  check("thresholds are company-wide (stock has no location dimension)", rows("vyron_stock_minimum_levels").every((l) => l.location === ""));
}

// ---------------------------------------------------------------------------
section("3. Production minimum-stock warning");
{
  let check1 = await checkProductionMinimums(db, CO, "run-1");
  check("no minimum on the components → no warning (nothing assumed)", check1.warnings.filter((w) => w.stockItemId !== "si-curry").length === 0);
  check("finished goods rise by the output: Thai Green Curry 120 + 40 = 160, above its minimum", check1.impacts.find((i) => i.stockItemId === "si-curry")?.expectedQty === 160 && check1.impacts.find((i) => i.stockItemId === "si-curry")?.status === "OK");
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 40 }, ACTOR);
  check1 = await checkProductionMinimums(db, CO, "run-1");
  check("Meal Boxes 120 − 80 = 40 = minimum → not below (reaches it exactly)", check1.impacts.find((i) => i.stockItemId === "si-box")?.expectedQty === 40 && check1.impacts.find((i) => i.stockItemId === "si-box")?.status === "OK");
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 100 }, ACTOR);
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-chk", minimumQty: 100, warningQty: 120 }, ACTOR);
  check1 = await checkProductionMinimums(db, CO, "run-1");
  const box = check1.warnings.find((w) => w.stockItemId === "si-box");
  check("Meal Boxes → 40, minimum 100: warning with shortfall 60", box?.status === "BELOW_MINIMUM" && box?.expectedQty === 40 && box?.shortfall === 60);
  check("multiple affected components reported (boxes and chicken 120 − 30 = 90)", check1.warnings.length === 2 && check1.warnings.find((w) => w.stockItemId === "si-chk")?.expectedQty === 90);
  check("a warning is not a block unless configured", check1.blocking.length === 0);
  check("no stock was moved by the check", rows("vyron_cost_stock_items").find((i) => i.id === "si-box").qty_on_hand === 120 && rows("vyron_cost_stock_ledger").length === 0);
  check("another company's run is not visible", (await checkProductionMinimums(db, CO_B, "run-1")).found === false);
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 100, blockProduction: true }, ACTOR);
  check1 = await checkProductionMinimums(db, CO, "run-1");
  check("block-production threshold → blocking", check1.blocking.length === 1 && check1.blocking[0].stockItemId === "si-box");
  const blocked = await rejects(transitionProductionRun(db, CO, "run-1", "start", "QA"));
  check("starting the run is refused, naming the item", /Minimum stock: Meal Boxes would fall to 40 \(minimum 100\)/.test(blocked?.message || ""), blocked?.message);
  check("…and the run is unchanged", rows("vyron_cost_production_runs").find((r) => r.id === "run-1").status === "Approved");
  await minimums.saveMinimumLevel(db, CO, { stockItemId: "si-box", minimumQty: 100, blockProduction: false }, ACTOR);
}

// ---------------------------------------------------------------------------
section("4 & 5. Attention Required and last production");
{
  const now = new Date("2026-10-06T14:40:00Z");
  const a = await getAttentionCentre(db, CO, now);
  const item = (k) => a.items.find((i) => i.key === k);
  check("stock below minimum counted from real thresholds (Meal Boxes 120 < 100? no; Chicken 120 < 100? no)", !item("stock.below_minimum"));
  check("stock approaching minimum: Chicken 120 < warning 120? no — Thai Green Curry 120 < 130 → 1", item("stock.near_minimum")?.count === 1);
  check("supplier invoices missing / differences from the latest reconciliation", item("supplier.missing")?.count >= 1 && item("supplier.differences")?.count >= 1);
  check("production runs that would take stock below minimum (run-1)", item("production.minimum_warnings")?.count === 1 && item("production.minimum_warnings")?.href === "/manufacturing/runs");
  check("customers without a price list counted (company prices by lists, no default list)", item("sales.customers_without_price_list")?.count === 1);
  check("no production-cadence warning while the company has not set an interval", !a.items.some((i) => i.key.startsWith("production.overdue") || i.key === "production.none"));
  check("every item links somewhere and has a real count", a.items.every((i) => i.count > 0 && i.href.startsWith("/")));
  check("critical items first", a.items.every((x, i) => i === 0 || ["critical", "warning", "info"].indexOf(a.items[i - 1].severity) <= ["critical", "warning", "info"].indexOf(x.severity)));
  const p = a.production;
  check("last production: PR-1047, 6 Oct 12:32 UTC, John Smith, 300 units", p.last?.runNumber === "PR-1047" && p.last?.completedAt === "2026-10-06T12:32:00Z" && p.last?.completedBy === "John Smith" && p.last?.quantity === 300);
  check("production today (South African date) = 300 units in 1 run; yesterday's run excluded", p.unitsToday === 300 && p.runsToday === 1, `${p.unitsToday} ${p.runsToday}`);
  check("another company's later run is not this company's last production", p.last?.runNumber !== "PB-9");
  db.tables.vyron_inventory_settings.push({ company_id: CO, expected_production_interval_hours: 24 });
  const late = await getAttentionCentre(db, CO, new Date("2026-10-09T12:32:00Z"));
  const overdue = late.items.find((i) => i.key === "production.overdue");
  check("with a 24 h interval configured: 'Last production processed 3 days ago' (critical, > 2 × interval)", overdue?.label === "Last production processed 3 days ago" && overdue?.severity === "critical", JSON.stringify(overdue));
  const onTime = await getAttentionCentre(db, CO, new Date("2026-10-06T20:00:00Z"));
  check("within the interval → no production warning", !onTime.items.some((i) => i.key === "production.overdue"));
  const b = await getAttentionCentre(db, CO_B, now);
  check("company B sees only its own: one item below minimum, its own last run", b.items.find((i) => i.key === "stock.below_minimum")?.count === 1 && b.production.last?.runNumber === "PB-9" && !b.items.some((i) => i.key === "sales.customers_without_price_list"));
  const empty = createFakeSupabase({ vyron_cost_stock_items: [], vyron_cost_production_runs: [], vyron_customer_price_lists: [], vyron_cost_stock_counts: [], vyron_documents: [], vyron_cost_suppliers: [], vyron_cost_supplier_invoices: [] }, { honourOrder: true });
  const nothing = await getAttentionCentre(empty, CO, now);
  check("a company with nothing configured gets no warnings at all (no false alarms)", nothing.items.length === 0 && nothing.production.last === null);
  check("getProductionActivity alone agrees", (await getProductionActivity(db, CO, now)).last?.runNumber === "PR-1047");
}

// ---------------------------------------------------------------------------
section("6. Stock take upload");
{
  const csv = [
    "SKU,Description,Location,Counted",
    "CHK-BR,Chicken Breast,Main Store,115",
    "6001000000017,Meal Boxes,Main Store,130",
    "RICE,Basmati Rice,Main Store,50",
    "ABC123,Unknown Product,Main Store,4",
    "CHICKEN-BREAST,Chicken Breast,Main Store,999",
    "FG-TGC,Thai Green Curry,Main Store,abc",
  ].join("\n");
  const table = await readUploadedTable(enc(csv), "count-oct.csv", "text/csv");
  const preview = await stockTake.previewStockTake(db, CO, table);
  const row = (n) => preview.lines.find((l) => l.row === n);
  check("negative variance: Chicken 120 → 115 kg = −5 kg, −R425.00", row(2).status === "MATCHED" && row(2).varianceQty === -5 && row(2).varianceValue === -425);
  check("positive variance matched by barcode: Meal Boxes 120 → 130 = +10, +R20.00", row(3).status === "MATCHED" && row(3).varianceQty === 10 && row(3).varianceValue === 20);
  check("zero variance: Basmati Rice 50 = 50", row(4).status === "MATCHED" && row(4).varianceQty === 0);
  check("unmatched SKU reported, not created, never matched by its name", row(5).status === "UNMATCHED" && /ABC123/.test(row(5).note) && rows("vyron_cost_products").length === 3);
  check("the same item counted twice (by alias): only the first count is used", row(6).status === "DUPLICATE_IN_FILE");
  check("an unreadable quantity is reported", row(7).status === "INVALID_QUANTITY");
  const s = preview.summary;
  check("summary: 3 counted, 2 with variance, +1 / −1, net qty +5, value +20 / −425 / −405", s.itemsCounted === 3 && s.itemsWithVariance === 2 && s.positiveAdjustments === 1 && s.negativeAdjustments === 1 && s.netQuantityVariance === 5 && s.positiveValueVariance === 20 && s.negativeValueVariance === -425 && s.netValueVariance === -405, JSON.stringify(s));
  check("preview writes nothing", rows("vyron_cost_stock_counts").length === 0 && rows("vyron_cost_stock_items").find((i) => i.id === "si-chk").qty_on_hand === 120);
  const created = await stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "count-oct.csv" }, ACTOR);
  const count = created.count;
  check("confirming creates a stock count awaiting approval, with only the matched items", count.status === "Submitted" && count.source_file_name === "count-oct.csv" && rows("vyron_cost_stock_count_lines").filter((l) => l.stock_count_id === count.id).length === 3);
  check("…and still no stock moved", rows("vyron_cost_stock_items").find((i) => i.id === "si-chk").qty_on_hand === 120 && rows("vyron_cost_stock_ledger").length === 0);
  check("the same file again is refused (duplicate upload protection)", /already loaded/.test((await rejects(stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "count-oct.csv" }, ACTOR)))?.message || ""));
  check("posting before approval is refused", /approved before posting/.test((await rejects(postStockCount(db, CO, count.id, "QA Supervisor")))?.message || ""));
  await approveStockCount(db, CO, count.id, "QA Supervisor");
  await postStockCount(db, CO, count.id, "QA Supervisor");
  const qty = (id) => rows("vyron_cost_stock_items").find((i) => i.id === id).qty_on_hand;
  check("after approval and posting: Chicken 115, Meal Boxes 130, Rice 50 (unchanged)", qty("si-chk") === 115 && qty("si-box") === 130 && qty("si-rice") === 50);
  const ledger = rows("vyron_cost_stock_ledger").filter((l) => l.reference_id === count.id);
  check("two Stock Count Variance movements with before/after balances, by the approver", ledger.length === 2 && ledger.every((l) => l.movement_type === "Stock Count Variance" && l.actor === "QA Supervisor") && ledger.some((l) => l.quantity_out === 5 && l.balance_after === 115));
  check("audit: the upload (file, who) and the approval are recorded", rows("vyron_inventory_audit_log").some((l) => l.event_type === "Stock Take Uploaded" && l.actor === ACTOR && l.metadata?.sourceFile === "count-oct.csv") && rows("vyron_cost_stock_counts").find((c) => c.id === count.id).approved_by === "QA Supervisor");
  check("the original count is retained", rows("vyron_cost_stock_counts").find((c) => c.id === count.id).status === "Posted");
  const bPreview = await stockTake.previewStockTake(db, CO_B, table);
  check("another company's upload never matches this company's stock", bPreview.lines.filter((l) => l.status === "MATCHED").every((l) => l.stockItemId === "si-b-curry") && !bPreview.lines.some((l) => l.stockItemId === "si-chk"));
}

// ---------------------------------------------------------------------------
section("7. Customer price-list enforcement");
{
  const price = (customerId, productId, company = CO) => prices.resolveCustomerProductPrice(db, company, { customerId, productId, asOfDate: "2026-10-06" });
  // Legacy: the company has not configured a default list yet.
  check("customer with an assigned list → that list (Wholesale R42.50)", (await price("c-abc", "p-tgc")).sellingPrice === 42.5 && (await price("c-abc", "p-tgc")).source === "default");
  check("no default list configured, customer without a list → product master (legacy, labelled)", (await price("c-walkin", "p-tgc")).source === "product_master");
  await prices.setCompanyDefaultPriceList(db, CO, PL_STANDARD, true, ACTOR);
  check("company default set (audited)", rows("vyron_customer_price_lists").find((l) => l.id === PL_STANDARD).is_company_default === true && rows("vyron_customer_price_list_audit_log").some((l) => l.event_type === "Company Default Set"));
  check("customer with an assigned list still gets ITS list, never the default (R42.50, not R49.90)", (await price("c-abc", "p-tgc")).sellingPrice === 42.5);
  check("customer without a list → company default list (Standard R49.90)", (await price("c-walkin", "p-tgc")).sellingPrice === 49.9 && (await price("c-walkin", "p-tgc")).source === "company_default");
  check("product on no applicable list → unavailable (no arbitrary price)", (await price("c-walkin", "p-cbs")).source === "unavailable" && (await price("c-abc", "p-cbs")).source === "unavailable");

  const inv = await createCustomerInvoice(db, CO, { customerId: "c-abc", customerName: "ABC Retail", invoiceDate: "2026-10-06", lines: [{ productId: "p-tgc", productName: "Thai Green Curry", quantity: 10, sellingPrice: 49.9 }] });
  const line = rows("vyron_customer_invoice_lines").find((l) => l.invoice_id === inv.id);
  check("invoice uses the customer's list price even when another price is typed", line.selling_price === 42.5);
  check("the line records its price source and list", line.price_source === "default" && line.price_list_id === PL_WHOLESALE);
  const walk = await createCustomerInvoice(db, CO, { customerId: "c-walkin", customerName: "Walk-in Deli", invoiceDate: "2026-10-06", lines: [{ productId: "p-tgc", productName: "Thai Green Curry", quantity: 2, sellingPrice: 0 }] });
  const walkLine = rows("vyron_customer_invoice_lines").find((l) => l.invoice_id === walk.id);
  check("customer without a list is invoiced from the company default (R49.90, source company_default)", walkLine.selling_price === 49.9 && walkLine.price_source === "company_default");
  const before = rows("vyron_customer_invoices").length;
  const refused = await rejects(createCustomerInvoice(db, CO, { customerId: "c-walkin", customerName: "Walk-in Deli", invoiceDate: "2026-10-06", lines: [{ productId: "p-cbs", productName: "Chilli Beef Stew", quantity: 1, sellingPrice: 99 }] }));
  check("no price available → invoice refused, naming the product; nothing written", refused instanceof PriceUnavailableError && /No selling price available for Chilli Beef Stew/.test(refused.message) && rows("vyron_customer_invoices").length === before);
  check("an inactive price list no longer prices anything", await (async () => {
    db.tables.vyron_customer_price_lists.find((l) => l.id === PL_WHOLESALE).status = "Inactive";
    const r = await price("c-abc", "p-tgc");
    db.tables.vyron_customer_price_lists.find((l) => l.id === PL_WHOLESALE).status = "Active";
    return r.source === "unavailable";
  })());
  check("an expired price list no longer prices anything", await (async () => {
    db.tables.vyron_customer_price_lists.find((l) => l.id === PL_WHOLESALE).effective_to = "2026-09-30";
    const r = await price("c-abc", "p-tgc");
    db.tables.vyron_customer_price_lists.find((l) => l.id === PL_WHOLESALE).effective_to = null;
    return r.source === "unavailable";
  })());
  check("company B is priced from its own default list (R61), never A's", (await price("c-b", "p-b-tgc", CO_B)).sellingPrice === 61 && (await price("c-b", "p-b-tgc", CO_B)).priceListId === PL_B);
  check("a company cannot be priced from another company's list", Boolean(await rejects(prices.setCompanyDefaultPriceList(db, CO_B, PL_STANDARD, true, ACTOR))));
  check("Sales report value = invoice header value for these invoices (pricing flows through)", await (async () => {
    const { getSalesByCustomerItemReport } = await importFromRoot("src/lib/vyron-customer-sales-reports.ts");
    for (const i of rows("vyron_customer_invoices")) i.status = "Posted";
    const r = await getSalesByCustomerItemReport(db, CO, { from: "2026-10-06", to: "2026-10-06" });
    const value = Math.round((r.lines || []).reduce((t, l) => t + Number(l.lineValue || 0), 0) * 100) / 100;
    return value === 524.8; // 10 × 42.50 + 2 × 49.90
  })());
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
