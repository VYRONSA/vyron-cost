#!/usr/bin/env node
/**
 * Manual sales order adjustments (pure parts): change planning, validation, VAT/total recalculation,
 * and the processed/locked status rule.
 *   npm run test:sales-order-adjustment
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-customer-sales-orders.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };
const throwsMsg = (fn) => { try { fn(); return ""; } catch (e) { return e.message; } };

const line = (id, extra = {}) => ({ id, company_id: "c", sales_order_id: "o", product_id: `p-${id}`, description: `Pie ${id}`, quantity: 10, unit: "each", selling_price: 20, discount_pct: 0, tax_rate: 15, line_total: 230, cost_per_unit: 12, invoiced_qty: 0, sort_order: 0, ...extra });
const lines = [line("a"), line("b"), line("c", { selling_price: 18.5, discount_pct: 5 })];

console.log("planning");
const plan = m.planSalesOrderAdjustment(lines, [{ id: "a", quantity: 8 }, { id: "b", remove: true }, { id: "c", discountPct: 5 }, { productId: "p-new", quantity: 3 }]);
check("quantity change recorded with from/to", plan.changes.some((c) => c.field === "quantity" && c.from === "10" && c.to === "8"));
check("removed line recorded", plan.removed.length === 1 && plan.changes.some((c) => c.field === "removed" && c.lineId === "b"));
check("unchanged discount is not a change", !plan.changes.some((c) => c.lineId === "c"));
check("only really changed lines are written", plan.changed.length === 1 && plan.changed[0].id === "a");
check("existing line keeps its agreed price", plan.kept.find((l) => l.id === "c").sellingPrice === 18.5);
check("added product queued for price-list pricing", plan.added.length === 1 && plan.added[0].productId === "p-new");
check("zero quantity refused", /more than zero/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ id: "a", quantity: 0 }]))));
check("negative quantity refused", /more than zero/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ id: "a", quantity: -2 }]))));
check("NaN quantity refused", /more than zero/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ id: "a", quantity: Number("abc") }]))));
check("discount over 100% refused", /between 0 and 100/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ id: "a", discountPct: 120 }]))));
check("line from another order refused", /does not belong/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ id: "zzz", quantity: 1 }]))));
check("added line without product refused", /must name a product/.test(throwsMsg(() => m.planSalesOrderAdjustment(lines, [{ quantity: 1 }]))));

console.log("totals and VAT (existing calculateSalesOrderTotals)");
const before = m.calculateSalesOrderTotals(lines.map((l) => ({ quantity: l.quantity, sellingPrice: l.selling_price, discountPct: l.discount_pct, taxRate: l.tax_rate, costPerUnit: l.cost_per_unit, description: l.description })));
const after = m.calculateSalesOrderTotals(plan.kept);
check("before: 200 + 200 + 175.75 = 575.75 excl.", before.subtotal === 575.75, String(before.subtotal));
check("after: 160 + 175.75 = 335.75 excl.", after.subtotal === 335.75, String(after.subtotal));
check("VAT recalculated at 15%", after.vatAmount === 50.36 && after.total === 386.11, JSON.stringify(after));
check("GP recalculated from cost", after.costValue === 216 && after.grossProfit === 119.75, JSON.stringify(after));

console.log("locked statuses");
check("Draft / Awaiting Approval / Approved adjustable", ["Draft", "Awaiting Approval", "Approved"].every((s) => m.ADJUSTABLE_SALES_ORDER_STATUSES.includes(s)));
check("Picking onwards and Cancelled locked", ["Picking", "Packed", "Dispatched", "Partially Invoiced", "Invoiced", "Cancelled"].every((s) => !m.ADJUSTABLE_SALES_ORDER_STATUSES.includes(s)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
