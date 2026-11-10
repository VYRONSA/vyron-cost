#!/usr/bin/env node
/**
 * Period performance (Sales / Purchases / GP by day-week-month, MTD, Top 10 fastest movers).
 * Pure functions only: grouping, exclusions, ranking and MTD windows.
 *   npm run test:period-performance
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-period-performance.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("periods");
check("week of Wed 12 Nov 2026 runs Mon 9 – Sun 15", eq([m.periodOf("2026-11-12", "week").from, m.periodOf("2026-11-12", "week").to], ["2026-11-09", "2026-11-15"]));
check("Sunday belongs to the week that started Monday", m.periodOf("2026-11-15", "week").key === "2026-11-09");
check("month period covers 1–30 Nov", eq([m.periodOf("2026-11-20", "month").from, m.periodOf("2026-11-20", "month").to], ["2026-11-01", "2026-11-30"]));
check("February leap month ends on the 29th", m.periodOf("2028-02-10", "month").to === "2028-02-29");
check("isIsoDate rejects 2026-02-30", !m.isIsoDate("2026-02-30") && m.isIsoDate("2026-02-28"));

console.log("grouping");
const sales = [
  { invoiceId: "s1", invoiceNumber: "SI-1", invoiceDate: "2026-11-02", customerName: "A", revenue: 100, cost: 60, gp: 40, qtySold: 10 },
  { invoiceId: "s2", invoiceNumber: "SI-2", invoiceDate: "2026-11-02", customerName: "B", revenue: 50.005, cost: 20, gp: 30.005, qtySold: 5 },
  { invoiceId: "s3", invoiceNumber: "SI-3", invoiceDate: "2026-11-10", customerName: "A", revenue: 200, cost: 150, gp: 50, qtySold: 20 },
  { invoiceId: "s4", invoiceNumber: "SI-4", invoiceDate: "2026-10-31", customerName: "A", revenue: 999, cost: 0, gp: 999, qtySold: 1 },
];
const purchases = [
  { id: "p1", invoiceNumber: "P-1", supplierName: "X", invoiceDate: "2026-11-02", status: "Approved", subtotal: 70, href: "/supplier-invoices/p1" },
  { id: "p2", invoiceNumber: "P-2", supplierName: "X", invoiceDate: "2026-11-03", status: "Draft", subtotal: 500, href: "/x" },
  { id: "p3", invoiceNumber: "P-3", supplierName: "X", invoiceDate: "2026-11-04", status: "Cancelled", subtotal: 500, href: "/x" },
  { id: "p4", invoiceNumber: "P-4", supplierName: "X", invoiceDate: "2026-11-10", status: "Paid", subtotal: 30, href: "/x" },
  { id: "p5", invoiceNumber: "P-5", supplierName: "X", invoiceDate: null, status: "Approved", subtotal: 30, href: "/x" },
];
const range = { from: "2026-11-01", to: "2026-11-30" };
const daily = m.buildPeriodBuckets(sales, purchases, "day", range);
check("daily: two days with activity, newest first", eq(daily.map((b) => b.key), ["2026-11-10", "2026-11-02"]), JSON.stringify(daily.map((b) => b.key)));
const d2 = daily.find((b) => b.key === "2026-11-02");
check("2 Nov sales summed and rounded", d2.sales === 150.01, d2.sales);
check("2 Nov GP is the engine's GP summed, not recomputed", d2.grossProfit === 70.01, d2.grossProfit);
check("2 Nov purchases exclude nothing valid", d2.purchases === 70 && d2.purchaseInvoices === 1);
check("Draft and Cancelled purchases excluded", !daily.some((b) => b.purchases >= 500));
check("out-of-range sale (31 Oct) excluded", !daily.some((b) => b.key === "2026-10-31"));
check("undated purchase not placed in any period", m.totalsOf(daily).purchaseInvoices === 2);
const weekly = m.buildPeriodBuckets(sales, purchases, "week", range);
check("weekly: weeks of 2 Nov and 9 Nov", eq(weekly.map((b) => b.key), ["2026-11-09", "2026-10-27".replace("10-27", "11-02")].sort().reverse()), JSON.stringify(weekly.map((b) => b.key)));
const monthly = m.buildPeriodBuckets(sales, purchases, "month", range);
const t = m.totalsOf(monthly);
check("monthly total equals daily total", eq(t, m.totalsOf(daily)));
check("totals: sales 350.01, purchases 100", t.sales === 350.01 && t.purchases === 100, JSON.stringify(t));
check("GP % from totals", t.gpPct === Math.round((120.01 / 350.01) * 10000) / 100, t.gpPct);

console.log("month-to-date");
const w = m.mtdWindows("2026-11-10");
check("MTD 1–10 Nov vs 1–10 Oct", eq(w, { current: { from: "2026-11-01", to: "2026-11-10" }, previous: { from: "2026-10-01", to: "2026-10-10" } }), JSON.stringify(w));
const w31 = m.mtdWindows("2026-03-31");
check("31 Mar compares with all of February (clipped)", eq(w31.previous, { from: "2026-02-01", to: "2026-02-28" }), JSON.stringify(w31.previous));
check("todaySast uses Johannesburg time", m.todaySast(new Date("2026-11-10T22:30:00Z")) === "2026-11-11");

console.log("fastest movers");
const products = [
  { productId: "a", productName: "Apple", qty: 5, revenue: 100 },
  { productId: "b", productName: "Bread", qty: 50, revenue: 10 },
  { productId: "c", productName: "Cake", qty: 50, revenue: 90 },
  { productId: null, productName: "Unlinked line", qty: 7, revenue: 7 },
  { productId: "z", productName: "Returned", qty: 0, revenue: 0 },
  ...Array.from({ length: 12 }, (_, i) => ({ productId: `p${i}`, productName: `P${i}`, qty: 1, revenue: i })),
];
const top = m.rankFastMovers(products, new Map([["c", "FG-CAKE"], ["b", "FG-BREAD"]]));
check("exactly 10 ranked", top.length === 10);
check("ranked by units; tie broken by sales value", eq(top.slice(0, 3).map((r) => r.description), ["Cake", "Bread", "Unlinked line"]), JSON.stringify(top.slice(0, 3)));
check("ranks are 1..10", eq(top.map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
check("item code from the product master, dash when unknown", top[0].itemCode === "FG-CAKE" && top[2].itemCode === "—");
check("zero-quantity products never ranked", !top.some((r) => r.description === "Returned"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
