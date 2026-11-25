#!/usr/bin/env node
/**
 * Finished Goods — BOM Completeness.  npm run test:bom-completeness
 *
 * Every expected figure below is written out by hand from the fixture, not
 * derived from the engine. Covers the scenarios the report must distinguish and
 * a regression for each defect found in the 2026-11-24 production audit:
 *
 *   D1 archived products were counted as finished goods (and their sales at risk)
 *   D2 a BOM line whose ingredient record was deleted made a costed BOM
 *      "unusable" — Critical, and its revenue counted at risk
 *   D3 invoice lines were read without pagination; PostgREST's 1,000-row cap
 *      silently dropped lines (86 for Handcrafted), understating sales
 *   D4 archived BOMs and Sub-BOMs could stand as a product's current BOM
 *   D5 a product linked to ANOTHER product's BOM was costed from it
 *   D6 a sold EMPTY BOM was High while a sold NO BOM was Critical
 *   D7 revenue ignored discounts (qty x price instead of taxable_amount)
 *
 * Family A: no network, no database, no credentials, no writes.
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { buildBomCompletenessReport, getBomCompletenessReport, invoiceLineRevenue, isSaleInvoice } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/vyron-bom-completeness.ts")).href
);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};
const near = (a, b) => Math.abs(a - b) < 0.005;

/* ------------------------------------------------------------------ fixture */
const P = (id, name, extra = {}) => ({
  id, product_name: name, category: "Pies", sku: null, selling_price: 20, total_cost: 8,
  updated_at: "2026-11-01", status: "Active", product_status: "Active", linked_bom_id: null, ...extra,
});
const B = (id, name, productId, extra = {}) => ({
  id, bom_name: name, product_id: productId, finished_product_id: null, total_cost: 0, cost_per_unit: 0,
  yield_qty: 1, status: "Approved", bom_purpose: "Finished Good", updated_at: "2026-11-01", ...extra,
});
const L = (id, bomId, ingredientId, qty, unitCost, name = "Line") => ({
  id, bom_id: bomId, ingredient_id: ingredientId, child_bom_id: null, line_name: name,
  quantity: qty, unit_cost: unitCost, line_cost: qty * unitCost,
});
const ingredients = [
  { id: "flour", ingredient_name: "Flour", purchase_cost: 20, true_unit_cost: 20 },
  { id: "beef", ingredient_name: "Beef", purchase_cost: 100, true_unit_cost: 100 },
  { id: "water", ingredient_name: "Water", purchase_cost: 0, true_unit_cost: 0 },
];
const products = [
  P("p-complete", "Complete Pie"),
  P("p-missing", "Missing Pie"),                     // deleted ingredient, line still costed
  P("p-missing-uncosted", "Ghost Pie"),             // deleted ingredient, no cost on line
  P("p-water", "Water Pie"),                          // zero-cost component (water)
  P("p-nobom", "Lonely Pie"),                         // no BOM, unsold
  P("p-nobom-sold", "Sold Lonely Pie"),               // no BOM, sold
  P("p-empty-sold", "Empty Pie"),                     // empty BOM, sold
  P("p-zeroqty", "Trace Pie"),                        // zero quantity
  P("p-nocost", "Free Pie", { total_cost: 0 }),       // BOM complete, product has no cost
  P("p-archived", "Old Pie", { status: "Archived", product_status: "Archived" }),
  P("p-only-archived-bom", "Retired Recipe Pie"),
  P("p-wronglink", "Veg Pie", { linked_bom_id: "b-complete" }),   // linked to Complete Pie's BOM
  P("p-draft-vs-approved", "Two Bom Pie"),
  P("p-subbom", "Sub Pie"),
];
const boms = [
  B("b-complete", "Complete Pie", "p-complete"),
  B("b-missing", "Missing Pie", "p-missing"),
  B("b-missing-uncosted", "Ghost Pie", "p-missing-uncosted"),
  B("b-water", "Water Pie", "p-water"),
  B("b-empty", "Empty Pie", "p-empty-sold", { status: "Draft" }),
  B("b-zeroqty", "Trace Pie", "p-zeroqty"),
  B("b-nocost", "Free Pie", "p-nocost"),
  B("b-archived-product", "Old Pie", "p-archived"),
  B("b-retired", "Retired Recipe Pie", "p-only-archived-bom", { status: "Archived" }),
  B("b-two-draft", "Two Bom Pie", "p-draft-vs-approved", { status: "Draft", updated_at: "2026-11-20" }),
  B("b-two-approved", "Two Bom Pie", "p-draft-vs-approved", { status: "Approved", updated_at: "2026-10-01" }),
  B("b-sub", "Sub Pie", "p-subbom", { bom_purpose: "Sub-BOM" }),
];
const bomLines = [
  L("l1", "b-complete", "flour", 0.2, 20), L("l2", "b-complete", "beef", 0.05, 100),   // 4 + 5 = 9
  L("l3", "b-missing", "flour", 0.2, 20), L("l4", "b-missing", "deleted-onion", 0.1, 30, "Onions"), // 4 + 3 = 7
  L("l5", "b-missing-uncosted", "flour", 0.2, 20), L("l6", "b-missing-uncosted", "deleted-x", 0.1, 0, "Ghost"),
  L("l7", "b-water", "flour", 0.2, 20), L("l8", "b-water", "water", 0.5, 0, "Water"),
  L("l9", "b-zeroqty", "flour", 0.2, 20), L("l10", "b-zeroqty", "beef", 0, 100, "Herbs"),
  L("l11", "b-nocost", "flour", 0.2, 20),
  L("l12", "b-archived-product", "flour", 0.2, 20),
  L("l13", "b-retired", "flour", 0.2, 20),
  L("l14", "b-two-approved", "flour", 0.1, 20),
  L("l15", "b-sub", "flour", 0.1, 20),
];
const S = (productId, quantity, revenue) => ({ productId, quantity, revenue, cost: quantity * 8 });
const sales = [
  S("p-complete", 10, 200),
  S("p-missing", 5, 100),
  S("p-missing-uncosted", 2, 40),
  S("p-nobom-sold", 3, 60),
  S("p-empty-sold", 4, 80),
  S("p-archived", 50, 1000),
  S("p-wronglink", 1, 20),
  { productId: null, quantity: 1, revenue: 15, cost: 0 },
];

const report = buildBomCompletenessReport({ products, boms, bomLines, ingredients, sales });
const row = (id) => report.rows.find((r) => r.productId === id);
const s = report.summary;

console.log("Scenarios");
let r = row("p-complete");
check("complete BOM is COMPLETE / None, cost 9.00", r.bomStatus === "COMPLETE" && r.severity === "None" && near(r.bomCost, 9), JSON.stringify(r));
check("complete BOM that sold is not at risk", !r.soldWithoutUsableBom && r.usableBom);

r = row("p-missing");
check("D2 deleted ingredient with costed line -> MISSING COMPONENT / High", r.bomStatus === "MISSING COMPONENT" && r.severity === "High", `${r.bomStatus}/${r.severity}`);
check("D2 ... still usable, BOM cost 7.00 from the line's own cost", r.usableBom && near(r.bomCost, 7), JSON.stringify([r.usableBom, r.bomCost]));
check("D2 ... sold, but NOT sold-without-usable-BOM and not at risk", !r.soldWithoutUsableBom);
check("D2 ... names the missing component", r.issues.some((i) => i.includes("Onions")));

r = row("p-missing-uncosted");
check("deleted ingredient with no cost, sold -> MISSING COMPONENT / Critical", r.bomStatus === "MISSING COMPONENT" && r.severity === "Critical" && !r.usableBom && r.soldWithoutUsableBom, `${r.bomStatus}/${r.severity}`);

r = row("p-water");
check("zero-cost component (water) is COMPLETE, counted as zero-cost", r.bomStatus === "COMPLETE" && r.zeroCostComponents === 1 && near(r.bomCost, 4), JSON.stringify(r));

r = row("p-nobom");
check("no BOM, unsold -> NO BOM / Medium", r.bomStatus === "NO BOM" && r.severity === "Medium");
r = row("p-nobom-sold");
check("no BOM, sold -> NO BOM / Critical, at risk", r.bomStatus === "NO BOM" && r.severity === "Critical" && r.soldWithoutUsableBom);

r = row("p-empty-sold");
check("D6 empty BOM, sold -> EMPTY BOM / Critical (same as NO BOM)", r.bomStatus === "EMPTY BOM" && r.severity === "Critical" && r.soldWithoutUsableBom, `${r.bomStatus}/${r.severity}`);

r = row("p-zeroqty");
check("zero-quantity component -> INCOMPLETE / Low, still usable", r.bomStatus === "INCOMPLETE" && r.severity === "Low" && r.usableBom && r.invalidComponents === 1);

r = row("p-nocost");
check("resolving BOM but product has no cost -> NO COST / Medium", r.bomStatus === "NO COST" && r.severity === "Medium" && r.gp === null);

check("D1 archived product is not a row", !row("p-archived"));
check("D1 archived product counted in archivedExcluded, its sales disclosed not at risk", s.archivedExcluded === 1 && near(s.archivedRevenue, 1000));

r = row("p-only-archived-bom");
check("D4 product whose only BOM is archived -> NO BOM, says so", r.bomStatus === "NO BOM" && r.issues.some((i) => i.includes("archived")), JSON.stringify(r.issues));
r = row("p-subbom");
check("D4 a Sub-BOM is never a finished good's BOM", r.bomStatus === "NO BOM");
r = row("p-draft-vs-approved");
check("D4 Approved BOM preferred over a newer Draft", r.bomId === "b-two-approved", r.bomId);

r = row("p-wronglink");
check("D5 product linked to another product's BOM -> NO BOM, link rejected", r.bomStatus === "NO BOM" && r.bomId === null && r.issues.some((i) => i.includes("another finished good")), JSON.stringify(r));
check("D5 ... sold, so Critical", r.severity === "Critical");

console.log("Summary (hand-computed)");
// Active rows: 13 (14 products, 1 archived)
check("total finished goods = 13 active", s.totalFinishedGoods === 13, s.totalFinishedGoods);
// COMPLETE: complete, water, two-bom = 3
check("complete = 3", s.completeBoms === 3, s.completeBoms);
// NO BOM: nobom, nobom-sold, only-archived-bom, subbom, wronglink = 5
check("no BOM = 5", s.noBom === 5, s.noBom);
// EMPTY + INCOMPLETE: empty-sold, zeroqty = 2
check("incomplete = 2", s.incompleteBoms === 2, s.incompleteBoms);
check("missing component = 2", s.missingComponents === 2, s.missingComponents);
check("products with no cost = 1", s.productsWithNoCost === 1, s.productsWithNoCost);
// sold w/o usable: missing-uncosted 40, nobom-sold 60, empty-sold 80, wronglink 20 = 4 / 200
check("sold without usable BOM = 4", s.soldWithoutUsableBom === 4, s.soldWithoutUsableBom);
check("revenue at risk = 200.00", near(s.totalRevenueAtRisk, 200), s.totalRevenueAtRisk);
check("critical = 4", s.criticalCount === 4, s.criticalCount);
check("unattributed sales disclosed (1 line, 15.00)", s.unattributedLines === 1 && near(s.unattributedRevenue, 15));
check("every active product appears exactly once", new Set(report.rows.map((x) => x.productId)).size === report.rows.length);

console.log("Revenue basis");
check("D7 taxable_amount (net of discount, excl VAT) is used when present", invoiceLineRevenue({ quantity: 10, selling_price: 10, taxable_amount: 90 }) === 90);
check("D7 fallback is qty x price less discount", invoiceLineRevenue({ quantity: 10, selling_price: 10, discount_amount: 5, taxable_amount: null }) === 95);
check("taxable_amount of 0 is respected, not replaced", invoiceLineRevenue({ quantity: 10, selling_price: 10, taxable_amount: 0 }) === 0);
check("Draft / Cancelled / Void invoices are not sales", !isSaleInvoice("Draft") && !isSaleInvoice("cancelled") && !isSaleInvoice("Void") && isSaleInvoice("Sent") && isSaleInvoice("Paid"));

/* -------------------------------------------------- D3 pagination regression */
console.log("Pagination (PostgREST 1,000-row cap)");
const CAP = 1000;
const COMPANY = "co-1";
const tables = {
  vyron_cost_products: [P("p-complete", "Complete Pie", { company_id: COMPANY })],
  vyron_cost_boms: [{ ...B("b-complete", "Complete Pie", "p-complete"), company_id: COMPANY }],
  vyron_cost_bom_lines: bomLines.filter((l) => l.bom_id === "b-complete").map((l) => ({ ...l, company_id: COMPANY })),
  vyron_cost_ingredients: ingredients.map((i) => ({ ...i, company_id: COMPANY })),
  vyron_customer_item_mappings: [],
  vyron_customer_invoices: [
    { id: "inv-1", company_id: COMPANY, invoice_date: "2026-11-01", status: "Sent" },
    { id: "inv-2", company_id: COMPANY, invoice_date: "2026-11-02", status: "Draft" },
    { id: "inv-3", company_id: "other-co", invoice_date: "2026-11-02", status: "Sent" },
  ],
  vyron_customer_invoice_lines: [
    // 1,500 lines on ONE invoice: an unpaginated read returns only 1,000.
    ...Array.from({ length: 1500 }, (_, i) => ({
      id: `line-${String(i).padStart(5, "0")}`, invoice_id: "inv-1", product_id: "p-complete",
      quantity: 1, selling_price: 2, cost_per_unit: 1, taxable_amount: 2, discount_amount: 0,
    })),
    { id: "draft-line", invoice_id: "inv-2", product_id: "p-complete", quantity: 999, selling_price: 2, cost_per_unit: 1, taxable_amount: 1998 },
    { id: "foreign-line", invoice_id: "inv-3", product_id: "p-complete", quantity: 999, selling_price: 2, cost_per_unit: 1, taxable_amount: 1998 },
  ],
};
function fakeSupabase() {
  return {
    from(table) {
      const filters = [];
      let order = null;
      let range = [0, CAP - 1];
      const q = {
        select() { return q; },
        eq(c, v) { filters.push((r) => r[c] === v); return q; },
        gte(c, v) { filters.push((r) => r[c] >= v); return q; },
        lte(c, v) { filters.push((r) => r[c] <= v); return q; },
        in(c, vs) { filters.push((r) => vs.includes(r[c])); return q; },
        order(c) { order = c; return q; },
        range(a, b) { range = [a, b]; return q; },
        is(c, v) { filters.push((r) => (r[c] ?? null) === v); return q; },
        limit(n) { range = [0, n - 1]; return q; },
        then(resolve) {
          let rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)));
          if (order) rows = [...rows].sort((x, y) => String(x[order]).localeCompare(String(y[order])));
          const [a, b] = range;
          rows = rows.slice(a, Math.min(b + 1, a + CAP)); // the server cap
          resolve({ data: rows, error: null });
        },
      };
      return q;
    },
  };
}
const paged = await getBomCompletenessReport(fakeSupabase(), COMPANY, {});
const pr = paged.rows.find((x) => x.productId === "p-complete");
check("D3 all 1,500 lines read past the 1,000-row cap", pr.unitsSold === 1500, pr.unitsSold);
check("D3 revenue = 3,000.00 (not 2,000.00)", near(pr.revenue, 3000), pr.revenue);
check("draft invoice and other tenant's invoice excluded", pr.unitsSold === 1500);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
