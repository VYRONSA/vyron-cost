#!/usr/bin/env node
/**
 * BOM Completeness — precise reasons and manual overrides.
 *   npm run test:bom-completeness-overrides
 *
 * Expected values are written out by hand from the fixture.
 * Family A: no network, no database, no credentials, no writes.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { buildBomCompletenessReport, applyBomCompletenessOverrides } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/vyron-bom-completeness.ts")).href
);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};

const P = (id, name, extra = {}) => ({
  id, product_name: name, category: "Pies", sku: `SKU-${id}`, selling_price: 20, total_cost: 8,
  updated_at: "2026-11-01", status: "Active", product_status: "Active", linked_bom_id: null, ...extra,
});
const B = (id, name, productId, extra = {}) => ({
  id, bom_name: name, product_id: productId, finished_product_id: null, total_cost: 0, cost_per_unit: 0,
  yield_qty: 1, status: "Approved", bom_purpose: "Finished Good", updated_at: "2026-11-01", ...extra,
});
const L = (id, bomId, ingredientId, qty, unitCost, name, extra = {}) => ({
  id, bom_id: bomId, ingredient_id: ingredientId, child_bom_id: null, line_name: name,
  quantity: qty, unit_cost: unitCost, line_cost: qty * unitCost, unit: "kg", line_type: "Ingredient", ...extra,
});
const ingredients = [
  { id: "flour", ingredient_name: "Flour", purchase_cost: 20, true_unit_cost: 20, recipe_unit: "kg" },
  { id: "water", ingredient_name: "Water", purchase_cost: 0, true_unit_cost: 0, recipe_unit: "l" },
];
const products = [
  P("p-ok", "Complete Pie"),
  P("p-del", "Deleted Pie"),
  P("p-empty", "Empty Pie"),
  P("p-zero", "Zero Pie"),
  P("p-none", "Lonely Pie"),
  P("p-wrong", "Curry Vegetable Pie", { linked_bom_id: "b-beef" }),
  P("p-beef", "Beef Curry Pie"),
  P("p-draft", "Draft Pie"),
  P("p-text", "Text Pie"),
];
const boms = [
  B("b-ok", "Complete Pie", "p-ok"),
  B("b-del", "Deleted Pie", "p-del"),
  B("b-empty", "Empty Pie", "p-empty", { total_cost: 5 }),
  B("b-zero", "Zero Pie", "p-zero"),
  B("b-beef", "Beef Curry Pie", "p-beef"),
  B("b-draft", "Draft Pie", "p-draft", { status: "Draft" }),
  B("b-text", "Text Pie", "p-text"),
];
const bomLines = [
  L("l-ok1", "b-ok", "flour", 0.5, 20, "Flour"),
  L("l-ok2", "b-ok", "water", 0.2, 0, "Water", { unit: "l" }),
  L("l-del1", "b-del", "flour", 0.5, 20, "Flour"),
  L("l-del2", "b-del", "gone-ingredient", 0.25, 40, "Old Beef Mince"),
  L("l-zero", "b-zero", "flour", 0, 20, "Flour"),
  L("l-beef", "b-beef", "flour", 1, 20, "Flour"),
  L("l-draft", "b-draft", "flour", 1, 20, "Flour"),
  L("l-text1", "b-text", "flour", 1, 20, "Flour"),
  L("l-text2", "b-text", null, 2, 3, "Salt (typed)"),
];
const sales = [
  { productId: "p-empty", quantity: 10, revenue: 200, cost: 80 },
  { productId: "p-none", quantity: 5, revenue: 100, cost: 40 },
];
const report = buildBomCompletenessReport({ products, boms, bomLines, ingredients, sales });
const row = (id) => report.rows.find((r) => r.productId === id);

console.log("Precise reasons");
{
  const r = row("p-ok");
  check("complete BOM: VERIFIED_COMPLETE", r.classification === "VERIFIED_COMPLETE", r.classification);
  check("complete BOM reason names the BOM and line count", /2 component line/.test(r.classificationReason) && r.classificationReason.includes("b-ok"), r.classificationReason);
  check("water line flagged zero cost but BOM still complete", r.lines.find((l) => l.lineId === "l-ok2").costState === "zero" && r.bomStatus === "COMPLETE");
}
{
  const r = row("p-del");
  check("deleted ingredient: MISSING COMPONENT", r.bomStatus === "MISSING COMPONENT", r.bomStatus);
  const line = r.lines.find((l) => l.lineId === "l-del2");
  check("deleted line: ingredientState deleted", line.ingredientState === "deleted", line.ingredientState);
  check("deleted line keeps reference, qty and unit", line.ingredientId === "gone-ingredient" && line.quantity === 0.25 && line.unit === "kg");
  const ex = r.exceptions.find((e) => e.code === "DELETED_INGREDIENT");
  check("exception names the exact component + reference", ex && ex.message.includes("Old Beef Mince") && ex.message.includes("gone-ingredient"), ex?.message);
  check("exception lists the affected line id", ex && ex.lineIds.includes("l-del2") && !ex.lineIds.includes("l-del1"));
  check("exception explains the correction", ex && /relink/i.test(ex.correction));
  check("reason starts with the status and names the line", r.classificationReason.startsWith("MISSING COMPONENT:") && r.classificationReason.includes("Old Beef Mince"), r.classificationReason);
}
{
  const r = row("p-empty");
  check("empty BOM flagged with stated cost", r.exceptions.some((e) => e.code === "EMPTY_BOM" && e.message.includes("5.00")));
  check("empty BOM sold: SOLD_WITHOUT_USABLE_BOM exception", r.exceptions.some((e) => e.code === "SOLD_WITHOUT_USABLE_BOM"));
}
{
  const r = row("p-zero");
  const ex = r.exceptions.find((e) => e.code === "ZERO_QUANTITY");
  check("zero quantity line named", r.bomStatus === "INCOMPLETE" && ex && ex.message.includes("Flour") && ex.drivesClassification);
}
{
  const r = row("p-none");
  check("no BOM: NO_BOM exception drives classification", r.exceptions.some((e) => e.code === "NO_BOM" && e.drivesClassification));
  check("no BOM: no lines", r.lines.length === 0);
}
{
  const r = row("p-wrong");
  check("BOM of another finished good: LINKED_TO_OTHER_PRODUCT", r.exceptions.some((e) => e.code === "LINKED_TO_OTHER_PRODUCT" && /wrong finished good/i.test(e.correction)));
  check("wrong link is not accepted as its BOM", r.bomId === null);
}
{
  const r = row("p-draft");
  check("draft BOM flagged (not a classification driver)", r.bomIsDraft && r.exceptions.some((e) => e.code === "DRAFT_BOM" && !e.drivesClassification));
}
{
  const r = row("p-text");
  check("text-only line reported unlinked", r.lines.find((l) => l.lineId === "l-text2").ingredientState === "unlinked");
  check("unlinked line exception is informational", r.exceptions.some((e) => e.code === "UNLINKED_TEXT_LINE" && !e.drivesClassification));
}
check("three classification counts add up", report.summary.systemVerifiedComplete + report.summary.systemIdentifiedIncomplete === report.summary.totalFinishedGoods);

console.log("Overrides");
const ov = (productId, status, bomId, extra = {}) => ({
  id: `ov-${productId}`, productId, bomId, originalStatus: status, originalSeverity: "Medium", originalReason: "x",
  reason: "Checked by production manager, valid for ops", createdBy: "Thandi M", createdAt: "2026-11-24T10:00:00Z", ...extra,
});
const rarBefore = report.summary.totalRevenueAtRisk;
const applied = applyBomCompletenessOverrides(report, [
  ov("p-empty", "EMPTY BOM", "b-empty"),
  ov("p-zero", "MISSING COMPONENT", "b-zero"), // stale: status changed since
  ov("p-del", "MISSING COMPONENT", "b-other"), // stale: BOM changed since
  ov("p-ok", "EMPTY BOM", "b-ok"), // stale: BOM now complete
]);
const ar = (id) => applied.rows.find((r) => r.productId === id);
check("matching override applied: OVERRIDDEN", ar("p-empty").classification === "OVERRIDDEN");
check("override keeps system status, severity and exceptions", ar("p-empty").bomStatus === "EMPTY BOM" && ar("p-empty").severity === row("p-empty").severity && ar("p-empty").exceptions.length === row("p-empty").exceptions.length);
check("override never marks the BOM usable", ar("p-empty").usableBom === false && ar("p-empty").soldWithoutUsableBom === true);
check("revenue at risk NOT reduced by an override", applied.summary.totalRevenueAtRisk === rarBefore, `${applied.summary.totalRevenueAtRisk} vs ${rarBefore}`);
check("overridden revenue disclosed separately (200.00)", applied.summary.overriddenRevenueAtRisk === 200, applied.summary.overriddenRevenueAtRisk);
check("status changed since override: stale, not applied", ar("p-zero").classification === "INCOMPLETE" && /now finds INCOMPLETE/.test(ar("p-zero").staleOverride?.staleReason || ""));
check("BOM changed since override: stale, not applied", ar("p-del").classification === "INCOMPLETE" && ar("p-del").staleOverride !== null);
check("complete BOM: override not applied", ar("p-ok").classification === "VERIFIED_COMPLETE" && ar("p-ok").staleOverride !== null);
check("summary: 1 manually overridden, 3 stale", applied.summary.manuallyOverridden === 1 && applied.summary.staleOverrides === 3);
check(
  "summary: verified + incomplete + overridden = total",
  applied.summary.systemVerifiedComplete + applied.summary.systemIdentifiedIncomplete + applied.summary.manuallyOverridden === applied.summary.totalFinishedGoods
);
check("the original report object is not mutated", row("p-empty").classification === "INCOMPLETE");
const latest = applyBomCompletenessOverrides(report, [
  ov("p-empty", "EMPTY BOM", "b-empty", { id: "old", createdAt: "2026-11-01T00:00:00Z" }),
  ov("p-empty", "EMPTY BOM", "b-empty", { id: "new", createdAt: "2026-11-20T00:00:00Z" }),
]);
check("latest active override wins", latest.rows.find((r) => r.productId === "p-empty").override.id === "new");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
