#!/usr/bin/env node
/**
 * VYRON — customer Gross Profit report margin regression (Phase diagnosis).
 *
 * Reproduces, with SYNTHETIC fixtures only (no Kingdom Foods data), the
 * production symptom "Cost of Sales == Revenue, GP == 0" and proves where it
 * comes from. The report engine (getCustomerGpReport) is driven directly
 * against an in-memory database.
 *
 * It asserts:
 *   1. A line with a genuine margin (selling 100, cost 60, qty 10) reports
 *      revenue 1000, COGS 600, GP 400, GP% 40 — i.e. the engine is CORRECT.
 *   2. A line whose persisted cost_per_unit equals its selling_price reports
 *      COGS == revenue and GP 0 — i.e. the zero comes ENTIRELY from the source
 *      data (the invoice-line cost), not from a report calculation error.
 *
 * So the report is not the defect; the invoice-line cost data is. This test
 * fails if the engine ever computes COGS from the selling price for a
 * correctly-costed line (regressing GP to zero).
 *
 *   node scripts/test-customer-gp-report-margin.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-gp";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0, checks = 0;
const check = (name, cond, detail = "") => { checks++; if (!cond) { failures++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); } else console.log(`  ok   ${name}`); };

const CO = "co-1";
const seed = {
  vyron_customer_invoices: [
    { id: "inv-margin", company_id: CO, customer_id: "cust-1", customer_name: "Synthetic Co", invoice_number: "T-MARGIN", invoice_date: "2026-09-15", status: "Sent", stock_posted: true, sales_value: 1000, cost_value: 600, gross_profit: 400 },
    { id: "inv-zero", company_id: CO, customer_id: "cust-1", customer_name: "Synthetic Co", invoice_number: "T-ZERO", invoice_date: "2026-09-15", status: "Sent", stock_posted: true, sales_value: 1000, cost_value: 1000, gross_profit: 0 },
  ],
  vyron_customer_invoice_lines: [
    // genuine margin: selling 100, cost 60
    { invoice_id: "inv-margin", product_id: "p1", product_name: "Genuine Margin Product", quantity: 10, selling_price: 100, cost_per_unit: 60 },
    // the bug shape: cost_per_unit == selling_price
    { invoice_id: "inv-zero", product_id: "p2", product_name: "Cost Equals Price Product", quantity: 10, selling_price: 100, cost_per_unit: 100 },
  ],
  vyron_customers: [{ id: "cust-1", company_id: CO, customer_name: "Synthetic Co", category: "Standard" }],
  vyron_cost_products: [
    { id: "p1", company_id: CO, product_name: "Genuine Margin Product", category: "Test" },
    { id: "p2", company_id: CO, product_name: "Cost Equals Price Product", category: "Test" },
  ],
  vyron_customer_sales_order_invoice_links: [],
  vyron_customer_price_list_assignments: [],
  vyron_customer_sales_orders: [],
};

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const db = createFakeSupabase(seed);
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");

const report = await getCustomerGpReport(db, CO, {});
const byNum = new Map(report.byInvoice.map((r) => [r.invoiceNumber, r]));
const margin = byNum.get("T-MARGIN");
const zero = byNum.get("T-ZERO");

check("1. genuine-margin invoice: revenue 1000", margin && margin.revenue === 1000, JSON.stringify(margin));
check("1. genuine-margin invoice: COGS 600 (from cost_per_unit, NOT selling price)", margin && margin.cost === 600, JSON.stringify(margin));
check("1. genuine-margin invoice: GP 400", margin && margin.gp === 400, JSON.stringify(margin));
check("1. genuine-margin invoice: GP% 40", margin && Math.round(margin.gpPct) === 40, JSON.stringify(margin));
check("1. COGS != revenue when a real margin exists (the engine is correct)", margin && margin.cost !== margin.revenue);

check("2. cost==price line reproduces the production symptom: COGS == revenue", zero && zero.cost === zero.revenue, JSON.stringify(zero));
check("2. cost==price line: GP 0 (comes from the source data, not the report math)", zero && zero.gp === 0, JSON.stringify(zero));

// Aggregate metrics reflect both invoices.
check("aggregate revenue = 2000", report.metrics.revenue === 2000, String(report.metrics.revenue));
check("aggregate COGS = 1600 (600 + 1000)", report.metrics.costOfSales === 1600, String(report.metrics.costOfSales));
check("aggregate GP = 400", report.metrics.grossProfit === 400, String(report.metrics.grossProfit));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
