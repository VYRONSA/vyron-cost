#!/usr/bin/env node
/**
 * VYRON — sales-order cost-capture regression (Phase 27).
 *
 * A sales order's cost_per_unit becomes the invoice-line cost snapshot when the
 * order is converted (convertSalesOrderToInvoice passes trustSuppliedCost: true,
 * and the Gross Profit report reads that as Cost of Sales). The browser has no
 * genuine cost source, so it must not decide that snapshot on the order either.
 * This drives the real saveCustomerSalesOrder and convertSalesOrderToInvoice
 * against an in-memory database and proves the order captures the authoritative
 * product cost, ignoring any browser-supplied cost, never using "cost == price"
 * as a heuristic — closing the path that fed defects like SI-65638071.
 *
 *   node scripts/test-sales-order-cost-capture.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-so";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0, checks = 0;
const check = (name, cond, detail = "") => { checks++; if (!cond) { failures++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); } else console.log(`  ok   ${name}`); };

const CO = "co-a", CO_B = "co-b";
const baseSeed = () => ({
  vyron_customers: [{ id: "cust-1", company_id: CO, customer_name: "Synthetic Co" }],
  vyron_cost_products: [
    { id: "p60", company_id: CO, product_name: "Margin 60", selling_price: 100, total_cost: 60 },
    // The exact SI-65638071 shape: real product costs, selling price 10.90.
    { id: "cmp", company_id: CO, product_name: "Chicken & Mushroom Pie 150g", selling_price: 10.9, total_cost: 5.11 },
    { id: "psp", company_id: CO, product_name: "Pepper Steak Pie 150g", selling_price: 10.9, total_cost: 5.19 },
    { id: "skp", company_id: CO, product_name: "Steak & Kidney Pie 150g", selling_price: 10.9, total_cost: 4.45 },
    { id: "plp", company_id: CO, product_name: "Plain Steak Pie 150g", selling_price: 10.9, total_cost: 5.31 },
    { id: "pb", company_id: CO_B, product_name: "Foreign Product", selling_price: 100, total_cost: 55 },
  ],
  vyron_customer_price_list_assignments: [],
  vyron_customer_price_list_items: [],
  vyron_customer_price_lists: [],
  vyron_customer_price_list_versions: [],
  vyron_customer_branches: [],
  vyron_customer_sales_orders: [],
  vyron_customer_sales_order_lines: [],
  vyron_customer_invoices: [],
  vyron_customer_invoice_lines: [],
  vyron_workspaces: [{ id: "ws-a", company_id: CO, company_name: "Synthetic Co", default_vat_rate: 15 }],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { saveCustomerSalesOrder, convertSalesOrderToInvoice } = await importFromRoot("src/lib/vyron-customer-sales-orders.ts");

async function makeOrder(params) {
  const db = createFakeSupabase(baseSeed());
  let order = null, error = null;
  try { order = await saveCustomerSalesOrder(db, CO, { customerName: "Synthetic Co", customerId: "cust-1", ...params }); } catch (e) { error = e; }
  const soLines = db.tables.vyron_customer_sales_order_lines || [];
  return { db, order, error, soLines };
}
const soCost = (r, i = 0) => (r.soLines[i] ? Number(r.soLines[i].cost_per_unit) : NaN);

// Case 1 — browser sends cost = selling price (the SI-65638071 bug): server ignores it, uses 60.
{
  const r = await makeOrder({ lines: [{ productId: "p60", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
  check("1. SO browser cost=100 (bug) -> stored 60 (product master), never 100", !r.error && soCost(r) === 60, r.error?.message || `cost=${soCost(r)}`);
}
// Case 2 — cost omitted: server resolves product cost (60).
{
  const r = await makeOrder({ lines: [{ productId: "p60", quantity: 1, sellingPrice: 100 }] });
  check("2. SO cost omitted -> stored product cost 60 (not the selling price)", !r.error && soCost(r) === 60, r.error?.message || `cost=${soCost(r)}`);
}
// Case 3 — browser supplies an arbitrary cost: still overwritten by the product cost.
{
  const r = await makeOrder({ lines: [{ productId: "p60", quantity: 1, sellingPrice: 100, costPerUnit: 12.34 }] });
  check("3. SO arbitrary browser cost -> overwritten by product cost 60", !r.error && soCost(r) === 60, r.error?.message || `cost=${soCost(r)}`);
}
// Case 4 — browser supplies zero cost: product cost is still used.
{
  const r = await makeOrder({ lines: [{ productId: "p60", quantity: 1, sellingPrice: 100, costPerUnit: 0 }] });
  check("4. SO zero browser cost -> product cost 60", !r.error && soCost(r) === 60, r.error?.message || `cost=${soCost(r)}`);
}
// Case 5 — foreign-company product: rejected, no order written.
{
  const r = await makeOrder({ lines: [{ productId: "pb", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
  check("5. SO foreign-company product -> rejected, nothing written", Boolean(r.error) && /not found for the active company/i.test(r.error.message) && r.soLines.length === 0, r.error?.message || "no error");
}
// Case 6 — a trusted server caller keeps its explicit cost even when it equals the price.
{
  const r = await makeOrder({ trustSuppliedCost: true, lines: [{ productId: "p60", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
  check("6. trusted caller's explicit cost (==price) is kept, equality never used to reject", !r.error && soCost(r) === 100, r.error?.message || `cost=${soCost(r)}`);
}
// Case 7 — the exact SI-65638071 shape: four pie lines, browser cost = selling 10.90.
{
  const r = await makeOrder({ lines: [
    { productId: "cmp", quantity: 96, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "psp", quantity: 480, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "skp", quantity: 480, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "plp", quantity: 24, sellingPrice: 10.9, costPerUnit: 10.9 },
  ] });
  const costs = (r.soLines || []).map((l) => Number(l.cost_per_unit)).sort((a, b) => a - b);
  check("7. SI-65638071 shape -> each line stores its real product cost, none equals 10.90",
    !r.error && r.soLines.length === 4 && r.soLines.every((l) => Number(l.cost_per_unit) !== 10.9) && costs.join(",") === "4.45,5.11,5.19,5.31",
    r.error?.message || `costs=${costs.join(",")}`);
  check("7b. SI-65638071 shape -> selling price (revenue) is unchanged at 10.90", !r.error && r.soLines.every((l) => Number(l.selling_price) === 10.9));
}

/* Conversion carries the server-resolved snapshot into the invoice. */
{
  const db = createFakeSupabase({
    ...baseSeed(),
    vyron_customer_sales_orders: [{ id: "so1", company_id: CO, order_number: "SO-1", customer_id: "cust-1", customer_name: "Synthetic Co", status: "Dispatched" }],
    // The order line already holds the server-resolved cost (what the fix stores).
    vyron_customer_sales_order_lines: [{ id: "sol1", company_id: CO, sales_order_id: "so1", product_id: "p60", description: "Margin 60", quantity: 2, selling_price: 100, cost_per_unit: 60, invoiced_qty: 0, sort_order: 0 }],
  });
  let error = null, invLine = null;
  try {
    await convertSalesOrderToInvoice(db, CO, "so1", "tester");
    invLine = (db.tables.vyron_customer_invoice_lines || [])[0] || null;
  } catch (e) { error = e; }
  check("8. conversion carries the authorised SO cost snapshot (60) onto the invoice line", !error && invLine && Number(invLine.cost_per_unit) === 60, error?.message || `cost=${invLine ? invLine.cost_per_unit : "none"}`);
  check("8b. conversion leaves selling price (revenue) unchanged at 100", !error && invLine && Number(invLine.selling_price) === 100);
  check("8c. converted invoice line cost is NOT the selling price", !error && invLine && Number(invLine.cost_per_unit) !== Number(invLine.selling_price));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
