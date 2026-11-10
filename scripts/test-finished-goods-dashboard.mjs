#!/usr/bin/env node
/**
 * Finished Goods dashboard aggregation (pure): opening/closing from ledger
 * balance_after, category split, date range, items without ledger history.
 *   npm run test:finished-goods-dashboard
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-finished-goods-dashboard.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const item = (id, extra = {}) => ({ id, itemCode: id.toUpperCase(), description: `Item ${id}`, category: "FG", unit: "each", qtyOnHand: 0, averageCost: 10, inventoryValue: null, minLevel: 0, stockStatus: "In Stock", isActive: true, lastMovementAt: null, ...extra });
let n = 0;
const led = (stockItemId, movementDate, movementType, qin, qout, bal, referenceType = null) => ({ id: `l${++n}`, stockItemId, movementDate, movementType, quantityIn: qin, quantityOut: qout, balanceAfter: bal, unitCost: 10, value: (qin - qout) * 10, referenceType, referenceId: null, referenceLabel: null, actor: null, createdAt: `${movementDate}T08:00:${String(n).padStart(2, "0")}Z` });

console.log("categories");
check("Manufacturing Output is production", m.movementCategory("Manufacturing Output") === "production");
check("Customer Sale is sales", m.movementCategory("Customer Sale") === "sales");
check("store order dispatch reference is sales", m.movementCategory("Issue", "store_order_dispatch") === "sales");
check("Stock Count Variance is adjustment", m.movementCategory("Stock Count Variance") === "adjustment");
check("Opening Balance is opening", m.movementCategory("Opening Balance") === "opening");
check("GRN Receipt is other", m.movementCategory("GRN Receipt") === "other");

console.log("balances");
const d = m.buildFinishedGoodsDashboard({
  from: "2026-11-01",
  to: "2026-11-30",
  items: [item("a", { qtyOnHand: 35, minLevel: 50 }), item("b", { qtyOnHand: 5 }), item("c", { qtyOnHand: -2, inventoryValue: 0 })],
  ledger: [
    led("a", "2026-10-15", "Opening Balance", 20, 0, 20),
    led("a", "2026-11-03", "Manufacturing Output", 30, 0, 50, "production_run"),
    led("a", "2026-11-10", "Customer Sale", 0, 12, 38, "customer_invoice"),
    led("a", "2026-11-12", "Stock Count Variance", 0, 3, 35, "stock_count"),
    led("a", "2026-12-02", "Customer Sale", 0, 10, 25),
    led("c", "2026-11-05", "Customer Sale", 0, 2, -2),
  ],
  runs: [
    { id: "r1", runNumber: "PR-1", productId: "p", productName: "A", status: "Completed", plannedQty: 30, actualQty: 30, date: "2026-11-03" },
    { id: "r2", runNumber: "PR-2", productId: "p", productName: "A", status: "Planned", plannedQty: 40, actualQty: 0, date: "2026-11-20" },
  ],
});
const a = d.rows.find((r) => r.id === "a");
check("opening = balance before range", a.openingQty === 20, String(a.openingQty));
check("closing = last balance in range (Dec row ignored)", a.closingQty === 35, String(a.closingQty));
check("produced 30, sold 12, adjustment out 3", a.producedQty === 30 && a.soldQty === 12 && a.adjustmentOutQty === 3);
check("movements in range = 3", a.movementCount === 3, String(a.movementCount));
check("below minimum flagged", a.belowMinimum === true);
const b = d.rows.find((r) => r.id === "b");
check("item with no ledger: opening/closing null, not guessed", b.openingQty === null && b.closingQty === null);
const c = d.rows.find((r) => r.id === "c");
check("item first moved in range opens at 0", c.openingQty === 0 && c.closingQty === -2);
check("stored inventory value preferred (0 kept)", c.stockValue === 0);
check("value falls back to qty x avg cost", a.stockValue === 350);
check("totals: negative 1, belowMin 1, without ledger 1", d.totals.negative === 1 && d.totals.belowMinimum === 1 && d.totals.itemsWithoutLedger === 1);
check("production: 2 runs, 1 completed, actual 30 (planned 70)", d.production.runs === 2 && d.production.completedRuns === 1 && d.production.actualQty === 30 && d.production.plannedQty === 70);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
