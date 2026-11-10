#!/usr/bin/env node
/** Selling price below cost warning (warn-only).  npm run test:below-cost */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { checkBelowCost } = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-below-cost.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const a = checkBelowCost(18, 19.95);
check("R18 against R19.95 cost is below cost by R1.95", a.below && a.shortfallPerUnit === 1.95, JSON.stringify(a));
check("price above cost is not flagged", !checkBelowCost(25, 19.95).below);
check("price equal to cost is not flagged", !checkBelowCost(19.95, 19.95).below);
const d = checkBelowCost(20, 19, 10);
check("10% discount takes R20 to R18 net, below R19 cost", d.below && d.netPrice === 18 && d.shortfallPerUnit === 1, JSON.stringify(d));
const u = checkBelowCost(5, 0);
check("unknown cost (0) is never flagged", !u.below && !u.costKnown);
check("missing cost is never flagged", !checkBelowCost(5, undefined).below && !checkBelowCost(5, null).below);
check("non-numeric price treated as 0 net and flagged against a known cost", checkBelowCost("abc", 3).below);
check("discount clamped to 0..100", checkBelowCost(10, 5, 150).netPrice === 0 && checkBelowCost(10, 5, -20).netPrice === 10);

const ui = readFileSync(path.join(ROOT, "src/components/vyron-cost/customers/CustomerSalesOrdersClient.tsx"), "utf8");
check("sales order lines render the warning", ui.includes("checkBelowCost(line.selling_price, line.cost_per_unit, line.discount_pct)") && ui.includes('data-testid="below-cost-warning"'));
check("warning does not modify the price", !/checkBelowCost[\s\S]{0,400}setLine\(/.test(ui));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
