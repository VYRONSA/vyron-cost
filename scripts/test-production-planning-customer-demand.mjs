#!/usr/bin/env node
/**
 * Production planning demand from customer sales orders (as well as store orders).
 *
 * Runs the REAL consolidateStoreOrderDemand against an in-memory Supabase stand-in: a company
 * with no stores plans from its Approved/Picking customer sales orders (remaining quantity,
 * requested delivery date, grouped by customer); other statuses and product-less lines are left
 * out; the date filter applies to the requested delivery date; store-order demand is unchanged
 * and adds to the same product row. Read-only: nothing is written. No network, no database.
 *
 *   npm run test:production-planning-customer-demand
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-store-production-planning.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

function fakeSupabase(tables) {
  const writes = [];
  const from = (table) => {
    const f = [];
    const rows = () => (tables[table] || []).filter((row) => f.every((fn) => fn(row))).map((row) => ({ ...row }));
    const api = {
      select() { return api; },
      eq(c, v) { f.push((r) => r[c] === v); return api; },
      neq(c, v) { f.push((r) => r[c] !== v); return api; },
      in(c, vs) { f.push((r) => vs.includes(r[c])); return api; },
      gte(c, v) { f.push((r) => r[c] != null && String(r[c]) >= v); return api; },
      lte(c, v) { f.push((r) => r[c] != null && String(r[c]) <= v); return api; },
      order() { return api; },
      limit() { return api; },
      insert(x) { writes.push({ table, x }); return api; },
      update(x) { writes.push({ table, x }); return api; },
      maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: rows(), error: null }).then(res, rej); },
    };
    return api;
  };
  return { from, writes };
}

const CO = "co-hfp";
const base = () => ({
  vyron_cost_store_orders: [],
  vyron_cost_store_order_lines: [],
  vyron_customer_sales_orders: [
    { id: "so1", company_id: CO, order_number: "SO-1", customer_id: "c1", customer_name: "Bakers Square", status: "Approved", requested_delivery_date: "2026-11-14" },
    { id: "so2", company_id: CO, order_number: "SO-2", customer_id: "c1", customer_name: "Bakers Square", status: "Picking", requested_delivery_date: "2026-11-12" },
    { id: "so3", company_id: CO, order_number: "SO-3", customer_id: "c2", customer_name: "Wiesenhof", status: "Approved", requested_delivery_date: null },
    { id: "so4", company_id: CO, order_number: "SO-4", customer_id: "c2", customer_name: "Wiesenhof", status: "Invoiced", requested_delivery_date: "2026-11-13" },
    { id: "so5", company_id: CO, order_number: "SO-5", customer_id: "c2", customer_name: "Wiesenhof", status: "Draft", requested_delivery_date: "2026-11-13" },
    { id: "so6", company_id: "other", order_number: "SO-6", customer_id: "c9", customer_name: "Other tenant", status: "Approved", requested_delivery_date: "2026-11-13" },
  ],
  vyron_customer_sales_order_lines: [
    { sales_order_id: "so1", company_id: CO, product_id: "pie", description: "Beef Pie", quantity: 24, invoiced_qty: 0 },
    { sales_order_id: "so2", company_id: CO, product_id: "pie", description: "Beef Pie", quantity: 10, invoiced_qty: 4 },
    { sales_order_id: "so2", company_id: CO, product_id: null, description: "Delivery fee", quantity: 1, invoiced_qty: 0 },
    { sales_order_id: "so3", company_id: CO, product_id: "bob", description: "Bobotie 280g", quantity: 5, invoiced_qty: 0 },
    { sales_order_id: "so3", company_id: CO, product_id: "pie", description: "Beef Pie", quantity: 3, invoiced_qty: 3 },
    { sales_order_id: "so4", company_id: CO, product_id: "pie", description: "Beef Pie", quantity: 99, invoiced_qty: 0 },
    { sales_order_id: "so5", company_id: CO, product_id: "pie", description: "Beef Pie", quantity: 77, invoiced_qty: 0 },
    { sales_order_id: "so6", company_id: "other", product_id: "pie", description: "Beef Pie", quantity: 55, invoiced_qty: 0 },
  ],
  vyron_cost_products: [
    { id: "pie", company_id: CO, product_name: "Beef Pie", cost_per_unit: 12, unit_cost: 12 },
    { id: "bob", company_id: CO, product_name: "Bobotie 280g", cost_per_unit: 20, unit_cost: 20 },
  ],
});

console.log("company with no stores plans from customer sales orders");
{
  const db = fakeSupabase(base());
  const demand = await m.consolidateStoreOrderDemand(db, CO);
  const pie = demand.find((r) => r.product_id === "pie");
  const bob = demand.find((r) => r.product_id === "bob");
  check("demand is not empty without stores", demand.length === 2, JSON.stringify(demand));
  check("Approved + Picking remaining quantity: 24 + (10-4) = 30", pie?.required_qty === 30, String(pie?.required_qty));
  check("planned defaults to required", pie?.planned_qty === 30);
  check("fully invoiced line adds nothing", pie?.store_contributions.every((c) => c.store_name !== "Wiesenhof"), JSON.stringify(pie?.store_contributions));
  check("Invoiced and Draft orders excluded; other tenant excluded", pie?.order_count === 2, String(pie?.order_count));
  check("lines without a product are left out", !demand.some((r) => /Delivery/.test(r.product_name)));
  check("contributions grouped per customer", pie?.store_contributions.length === 1 && pie.store_contributions[0].store_name === "Bakers Square" && pie.store_contributions[0].quantity === 30);
  check("contribution marked as a customer order", pie?.store_contributions[0].source === "customer_order" && pie.store_contributions[0].store_code === "Customer");
  check("required by = earliest requested delivery date", pie?.required_date === "2026-11-12" && pie.store_contributions[0].required_date === "2026-11-12", String(pie?.required_date));
  check("undated order stays undated (not guessed)", bob?.required_qty === 5 && bob.required_date === null, JSON.stringify(bob));
  check("nothing is written while planning", db.writes.length === 0);
}

console.log("date filter uses the requested delivery date");
{
  const demand = await m.consolidateStoreOrderDemand(fakeSupabase(base()), CO, { requiredFrom: "2026-11-13", requiredTo: "2026-11-30" });
  const pie = demand.find((r) => r.product_id === "pie");
  check("only SO-1 (14 Nov) in range: 24", pie?.required_qty === 24 && demand.length === 1, JSON.stringify(demand));
}

console.log("store orders still count, and add to the same product");
{
  const t = base();
  t.vyron_cost_store_orders = [{ id: "st1", company_id: CO, store_id: "s1", status: "Approved", required_date: "2026-11-11", vyron_cost_stores: { store_code: "CW", store_name: "Canal Walk" } }];
  t.vyron_cost_store_order_lines = [{ store_order_id: "st1", company_id: CO, product_id: "pie", product_name_snapshot: "Beef Pie", quantity: 12 }];
  const demand = await m.consolidateStoreOrderDemand(fakeSupabase(t), CO);
  const pie = demand.find((r) => r.product_id === "pie");
  check("store 12 + customers 30 = 42", pie?.required_qty === 42, String(pie?.required_qty));
  check("store and customer contributions both listed", pie?.store_contributions.length === 2 && pie.store_contributions.some((c) => c.source === "store_order" && c.store_name === "Canal Walk"));
  check("earliest date across both sources", pie?.required_date === "2026-11-11");
  check("three orders contribute", pie?.order_count === 3, String(pie?.order_count));
}

console.log("no orders at all");
{
  const t = base();
  t.vyron_customer_sales_orders = [];
  check("empty plan", (await m.consolidateStoreOrderDemand(fakeSupabase(t), CO)).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
