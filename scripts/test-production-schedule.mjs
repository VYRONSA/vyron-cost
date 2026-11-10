#!/usr/bin/env node
/**
 * Production planning completion (pure): status transitions and the required date derived from
 * the store orders behind a run.
 *   npm run test:production-schedule
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-store-production-planning.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("status tracking");
check("Draft → Planned or Cancelled", eq(m.nextStoreProductionStatuses("Draft"), ["Planned", "Cancelled"]));
check("Planned → Released, back to Draft, or Cancelled", eq(m.nextStoreProductionStatuses("Planned"), ["Released", "Draft", "Cancelled"]));
check("Released cannot be set Completed by status (only the complete action posts stock)", !m.nextStoreProductionStatuses("Released").includes("Completed"));
check("Completed and Cancelled are final", m.nextStoreProductionStatuses("Completed").length === 0 && m.nextStoreProductionStatuses("Cancelled").length === 0);
check("unknown status has no moves", m.nextStoreProductionStatuses("Whatever").length === 0);

console.log("required date");
const lines = [
  { store_contributions: [{ required_date: "2026-11-20" }, { required_date: null }] },
  { store_contributions: [{ required_date: "2026-11-18T00:00:00" }] },
  { store_contributions: [] },
];
check("earliest required date across contributions", m.storeProductionRunRequiredDate(lines) === "2026-11-18");
check("no stated dates → null, not a guess", m.storeProductionRunRequiredDate([{ store_contributions: [{ quantity: 1 }] }]) === null);
check("runs created before this change (no dates) → null", m.storeProductionRunRequiredDate([]) === null);

console.log("BOM requirements (existing builder)");
const bom = new Map([["p1", { bom: { yield_qty: 10 }, lines: [{ line_type: "Ingredient", ingredient_id: "i1", line_name: "Flour", quantity: 2, unit: "kg", wastage_percent: 0 }] }]]);
const req = m.buildIngredientRequirements([{ product_id: "p1", planned_qty: 25 }, { product_id: "no-bom", planned_qty: 5 }], bom);
check("raw materials scale from the BOM: 25 / yield 10 x 2 kg = 5 kg", req.length === 1 && req[0].required_qty === 5 && req[0].unit === "kg", JSON.stringify(req));
check("product without a BOM adds no invented materials", req.every((r) => r.ingredient_id === "i1"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
