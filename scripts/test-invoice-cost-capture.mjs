#!/usr/bin/env node
/**
 * VYRON — customer invoice cost-capture regression (Phase 23 Part A).
 *
 * The Gross Profit report reads Cost of Sales from the invoice line's
 * cost_per_unit (a historical cost snapshot). The browser has no genuine cost
 * source, so it must not decide that snapshot. This drives the real
 * createCustomerInvoice against an in-memory database and proves the server
 * captures the authoritative product cost, ignoring any browser-supplied cost,
 * without ever using "cost == price" as a heuristic.
 *
 *   node scripts/test-invoice-cost-capture.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-ic";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0, checks = 0;
const check = (name, cond, detail = "") => { checks++; if (!cond) { failures++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); } else console.log(`  ok   ${name}`); };

const CO = "co-a", CO_B = "co-b";
const baseSeed = () => ({
  vyron_customers: [{ id: "cust-1", company_id: CO, customer_name: "Synthetic Co" }],
  vyron_cost_products: [
    { id: "p60", company_id: CO, product_name: "Margin 60", selling_price: 100, total_cost: 60, target_gp: 40 },
    { id: "p100", company_id: CO, product_name: "Genuine Cost 100", selling_price: 100, total_cost: 100, target_gp: 0 },
    { id: "p0", company_id: CO, product_name: "No Cost", selling_price: 100, total_cost: 0, target_gp: 40 },
    { id: "pb", company_id: CO_B, product_name: "Foreign Product", selling_price: 100, total_cost: 55, target_gp: 40 },
  // The exact SI-65638071 shape: real product costs, selling price 10.90.
  { id: "cmp", company_id: CO, product_name: "Chicken & Mushroom Pie 150g", selling_price: 10.9, total_cost: 5.11 },
  { id: "psp", company_id: CO, product_name: "Pepper Steak Pie 150g", selling_price: 10.9, total_cost: 5.19 },
  { id: "skp", company_id: CO, product_name: "Steak & Kidney Pie 150g", selling_price: 10.9, total_cost: 4.45 },
  { id: "plp", company_id: CO, product_name: "Plain Steak Pie 150g", selling_price: 10.9, total_cost: 5.31 },
  ],
  vyron_customer_price_list_assignments: [],
  vyron_customer_price_list_items: [],
  vyron_customer_price_lists: [],
  vyron_customer_price_list_versions: [],
  vyron_customer_branches: [],
  vyron_customer_invoices: [],
  vyron_customer_invoice_lines: [],
  vyron_workspaces: [{ id: "ws-a", company_id: CO, company_name: "Synthetic Co", default_vat_rate: 15 }],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { createCustomerInvoice } = await importFromRoot("src/lib/vyron-customer-invoices.ts");

async function makeInvoice(params) {
  const db = createFakeSupabase(baseSeed());
  let result = null, error = null;
  try { result = await createCustomerInvoice(db, CO, params); } catch (e) { error = e; }
  const lines = db.tables.vyron_customer_invoice_lines || [];
  const invoice = (db.tables.vyron_customer_invoices || [])[0] || null;
  return { db, result, error, lines, invoice };
}
const costOf = (r, i = 0) => (r.lines[i] ? Number(r.lines[i].cost_per_unit) : NaN);

// Case 1 — cost omitted: server resolves product cost (60).
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p60", productName: "Margin 60", quantity: 1, sellingPrice: 100 }] });
  check("1. cost omitted -> persisted cost = product cost 60 (not the selling price)", !r.error && costOf(r) === 60, r.error?.message || `cost=${costOf(r)}`);
}
// Case 2 — browser sends cost = selling price (the old bug): server ignores it, uses 60.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p60", productName: "Margin 60", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
  check("2. browser sends cost=100 (bug) -> server persists 60, never 100", !r.error && costOf(r) === 60, r.error?.message || `cost=${costOf(r)}`);
}
// Case 3a — product's genuine cost equals its price (100): permitted, from the product master.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p100", productName: "Genuine Cost 100", quantity: 1, sellingPrice: 100 }] });
  check("3a. genuine product cost == price -> persisted 100 (from product master, not equality-blocked)", !r.error && costOf(r) === 100, r.error?.message || `cost=${costOf(r)}`);
}
// Case 3b — a trusted server caller supplying a genuine cost equal to price keeps it (equality never used to reject).
{
  const db = createFakeSupabase(baseSeed());
  let cost = NaN, err = null;
  try {
    await createCustomerInvoice(db, CO, { customerId: "cust-1", customerName: "Synthetic Co", trustSuppliedCost: true, lines: [{ productId: "p60", productName: "Margin 60", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
    cost = Number((db.tables.vyron_customer_invoice_lines || [])[0]?.cost_per_unit);
  } catch (e) { err = e; }
  check("3b. trusted caller's explicit cost (==price) is kept, not overwritten by equality", !err && cost === 100, err?.message || `cost=${cost}`);
}
// Case 4 — no product cost available: existing missing-cost behaviour (0), nothing invented.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p0", productName: "No Cost", quantity: 1, sellingPrice: 100, costPerUnit: 100 }] });
  check("4. product cost unavailable -> persisted 0 (missing-cost behaviour; no cost invented, not the selling price)", !r.error && costOf(r) === 0, r.error?.message || `cost=${costOf(r)}`);
}
// Case 5 — foreign-company product: rejected, nothing written.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "pb", productName: "Foreign Product", quantity: 1, sellingPrice: 100 }] });
  check("5. foreign-company product -> rejected, no invoice/line written", Boolean(r.error) && /not found for the active company/i.test(r.error.message) && r.lines.length === 0 && !r.invoice, r.error?.message || "no error");
}
// Case 6 — the write company is always the verified companyId argument, regardless of line content.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p60", productName: "Margin 60", quantity: 1, sellingPrice: 100, company_id: CO_B, companyId: CO_B }] });
  check("6. company on the written invoice is the verified company, never a browser-supplied one", !r.error && r.invoice && r.invoice.company_id === CO && r.lines.every((l) => !l.company_id || l.company_id === CO || l.invoice_id === r.invoice.id), r.error?.message || JSON.stringify(r.invoice?.company_id));
}
// Case 7 — createCustomerInvoice takes no actor from the request; any actor-shaped field is inert.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", changedBy: "attacker", actor: "attacker", lines: [{ productId: "p60", productName: "Margin 60", quantity: 1, sellingPrice: 100 }] });
  check("7. a browser-supplied actor field does not change the write (cost still authoritative)", !r.error && costOf(r) === 60, r.error?.message || `cost=${costOf(r)}`);
}
// Revenue preserved throughout.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", lines: [{ productId: "p60", productName: "Margin 60", quantity: 10, sellingPrice: 100 }] });
  check("revenue is unchanged by the cost fix (line selling_price 100, qty 10)", !r.error && Number(r.lines[0].selling_price) === 100 && Number(r.lines[0].quantity) === 10);
}

// Case 8 — the exact SI-65638071 production failure shape: four pie lines, the
// browser sends cost = selling price 10.90 on every line. The server must persist
// each product's real cost, never 10.90, so the invoice reports true GP.
{
  const r = await makeInvoice({ customerId: "cust-1", customerName: "Synthetic Co", notes: "PROMENADE", lines: [
    { productId: "cmp", productName: "Chicken & Mushroom Pie 150g", quantity: 96, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "psp", productName: "Pepper Steak Pie 150g", quantity: 480, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "skp", productName: "Steak & Kidney Pie 150g", quantity: 480, sellingPrice: 10.9, costPerUnit: 10.9 },
    { productId: "plp", productName: "Plain Steak Pie 150g", quantity: 24, sellingPrice: 10.9, costPerUnit: 10.9 },
  ] });
  const costs = (r.lines || []).map((l) => Number(l.cost_per_unit)).sort((a, b) => a - b);
  check("8. SI-65638071 shape -> each line persists its real product cost, none equals 10.90",
    !r.error && r.lines.length === 4 && r.lines.every((l) => Number(l.cost_per_unit) !== 10.9) && costs.join(",") === "4.45,5.11,5.19,5.31",
    r.error?.message || `costs=${costs.join(",")}`);
  check("8b. SI-65638071 shape -> selling prices (revenue) unchanged at 10.90", !r.error && r.lines.every((l) => Number(l.selling_price) === 10.9));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
