#!/usr/bin/env node
/**
 * Finished Goods import validation (pure): Item Code matching, unknown products, duplicates,
 * ambiguous codes, raw-material codes, duplicate descriptions, prices, status, unit changes.
 *   npm run test:finished-goods-import
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-finished-goods-import.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const index = {
  products: [
    { id: "p1", sku: "FG-001", name: "Beef Pie", category: "Pies", sellingPrice: 30, status: "Active" },
    { id: "p2", sku: "FG-002", name: "Chicken Pie", category: "Pies", sellingPrice: 28, status: "Active" },
    { id: "p3", sku: "FG-DUP", name: "Dup A", category: "Pies", sellingPrice: 1, status: "Active" },
    { id: "p4", sku: "fg-dup", name: "Dup B", category: "Pies", sellingPrice: 1, status: "Active" },
    { id: "p5", sku: "", name: "Uncoded Sausage Roll", category: "Rolls", sellingPrice: 15, status: "Active" },
  ],
  stockItems: [
    { id: "s1", itemCode: "FG-001", entityType: "finished_goods", entityId: "p1", unit: "each" },
    { id: "s2", itemCode: "FG-002", entityType: "finished_goods", entityId: "p2", unit: "each" },
    { id: "s9", itemCode: "RM-001", entityType: "ingredient", entityId: null, unit: "kg" },
  ],
};
const H = ["Item Code", "Product Description", "Category", "Unit of Measure", "Selling Price (excl. VAT)", "Status"];
const rec = (row, code, desc, cat = "", unit = "", price = "", status = "") => ({
  row,
  values: { "Item Code": code, "Product Description": desc, Category: cat, "Unit of Measure": unit, "Selling Price (excl. VAT)": price, Status: status },
});
const run = (records, header = H, malformedRows = [], isCsv = false) => m.validateFinishedGoodsImport({ table: { header, records, malformedRows }, isCsv, index });
const at = (p, row) => p.rows.find((r) => r.row === row);

console.log("matching");
const p = run([
  rec(2, "fg-001", "Beef Pie", "Pies", "each", "32,50", "Active"),
  rec(3, "FG-002", "Chicken Pie", "", "", "", ""),
  rec(4, "FG-NEW", "Lamb Pie", "Pies", "each", "40", "Active"),
  rec(5, "FG-DUP", "Dup A"),
  rec(6, "RM-001", "Flour"),
  rec(7, "FG-NEW2", "uncoded  sausage roll"),
  rec(8, "FG-002", "Beef Pie"),
  rec(9, "FG-001", "Beef Pie", "", "kg"),
]);
check("existing code matched case-insensitively; decimal-comma price change listed", at(p, 2).changes.some((c) => c.field === "Selling price" && c.to === "32.50"), JSON.stringify(at(p, 2)));
check("same Item Code on rows 3 and 8 → both errors", at(p, 3).status === "ERROR" && at(p, 3).errors.some((e) => /Duplicate Item Code/.test(e)));
check("unknown code → NEW, flagged unknown", at(p, 4).status === "NEW" && /Unknown product/.test(at(p, 4).warnings[0]));
check("code on two products → ambiguous", /ambiguous/.test(at(p, 5).errors[0]));
check("raw material code rejected", /raw material/.test(at(p, 6).errors[0]));
check("new code with existing description → duplicate product refused", /duplicate product/.test(at(p, 7).errors[0]), at(p, 7).errors[0]);
check("rename onto another product's description refused", at(p, 8).errors.some((e) => /already belongs to another product/.test(e)));
check("unit change refused", at(p, 9).errors.some((e) => /Units are not changed/.test(e)));
check("repeated Item Code flags every occurrence", at(p, 2).errors.some((e) => /Duplicate Item Code/.test(e)) && at(p, 9).errors.some((e) => /Duplicate Item Code/.test(e)));
check("file with errors cannot be applied", p.canApply === false);

console.log("fields");
const f = run([
  rec(2, "FG-001", "Beef Pie Large", "Pies XL", "each", "31", "Inactive"),
  rec(3, "", "No code"),
  rec(4, "FG-X", ""),
  rec(5, "FG-Y", "Y", "", "", "abc"),
  rec(6, "FG-Z", "Z", "", "", "-1"),
  rec(7, "FG-W", "W", "", "", "", "Maybe"),
  rec(8, "FG-V", "Dup Desc"),
  rec(9, "FG-U", "dup desc"),
]);
const u = at(f, 2);
check("description, category, price, status changes all listed", u.status === "UPDATE" && u.changes.map((c) => c.field).join(",") === "Description,Category,Selling price,Status", JSON.stringify(u.changes));
check("missing Item Code", /Item Code is required/.test(at(f, 3).errors[0]));
check("missing description", /Product Description is required/.test(at(f, 4).errors[0]));
check("unreadable price", /not a number/.test(at(f, 5).errors[0]));
check("negative price", /negative/.test(at(f, 6).errors[0]));
check("unknown status", /Active or Inactive/.test(at(f, 7).errors[0]));
check("duplicate description in file (case/space-insensitive)", at(f, 8).errors.some((e) => /Duplicate description/.test(e)) && at(f, 9).errors.some((e) => /Duplicate description/.test(e)));

console.log("clean file");
const ok = run([rec(2, "FG-001", "Beef Pie", "", "", "35"), rec(3, "FG-NEW", "Lamb Pie"), rec(4, "FG-002", "Chicken Pie")]);
check("clean file applies: 1 update, 1 new, 1 unchanged", ok.canApply && ok.summary.UPDATE === 1 && ok.summary.NEW === 1 && ok.summary.UNCHANGED === 1, JSON.stringify(ok.summary));
check("new product without unit warned it will be 'each'", at(ok, 3).warnings.some((w) => /each/.test(w)));
const csvBad = run([rec(2, "FG-001", "Beef Pie")], H, [2], true);
check("CSV row with wrong cell count rejected", csvBad.rows[0].status === "ERROR");
let threw = "";
try { run([rec(2, "FG-001", "x")], ["Code only"]); } catch (e) { threw = e.message; }
check("missing required headings refused", /Product Description/.test(threw), threw);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
