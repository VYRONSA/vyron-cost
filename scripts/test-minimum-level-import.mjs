#!/usr/bin/env node
/**
 * Minimum stock level spreadsheet import (pure validation): FG / Raw Material separation, unknown
 * and ambiguous codes, duplicates, invalid quantities, skipped blanks, existing warning/critical.
 *   npm run test:minimum-level-import
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-minimum-level-import.ts")).href);
const csv = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-csv-download.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const items = [
  { id: "fg1", itemCode: "FG-001", description: "Beef Pie", unit: "each", entityType: "finished_goods", isActive: true, existing: null },
  { id: "fg2", itemCode: "FG-002", description: "Chicken Pie", unit: "each", entityType: "finished_goods", isActive: true, existing: { minimum: 10, warning: 20, critical: 2, block: true } },
  { id: "fg3", itemCode: "FG-003", description: "Veg Pie", unit: "each", entityType: "finished_goods", isActive: false, existing: { minimum: 5, warning: null, critical: null, block: false } },
  { id: "dupA", itemCode: "FG-DUP", description: "A", unit: "each", entityType: "finished_goods", isActive: true, existing: null },
  { id: "dupB", itemCode: "fg-dup ", description: "B", unit: "each", entityType: "finished_goods", isActive: true, existing: null },
  { id: "rm1", itemCode: "RM-001", description: "Flour", unit: "kg", entityType: "ingredient", isActive: true, existing: null },
  { id: "pk1", itemCode: "PK-001", description: "Box", unit: "each", entityType: "packaging", isActive: true, existing: null },
];
const H = ["Item Code", "Product Description", "Unit of Measure", "Minimum Stock Level"];
const rec = (row, code, desc, unit, min) => ({ row, values: { "Item Code": code, "Product Description": desc, "Unit of Measure": unit, "Minimum Stock Level": min } });
const run = (kind, records, header = H, malformedRows = [], isCsv = false) => m.validateMinimumUpload({ kind, table: { header, records, malformedRows }, isCsv, items });
const byRow = (p, row) => p.rows.find((r) => r.row === row);

console.log("finished goods section");
const p = run("finished_goods", [
  rec(2, "FG-001", "Beef Pie", "each", "12"),
  rec(3, "fg-002", "Chicken Pie", "each", "15"),
  rec(4, "FG-003", "Veg Pie", "each", "5"),
  rec(5, "FG-404", "Mystery", "each", "3"),
  rec(6, "RM-001", "Flour", "kg", "3"),
  rec(7, "FG-DUP", "A", "each", "3"),
  rec(8, "FG-001", "Beef Pie", "each", "abc"),
  rec(9, "", "No code", "each", "4"),
]);
check("repeated item flags row 2 as duplicate", byRow(p, 2).status === "ERROR" && byRow(p, 2).errors.some((e) => e.startsWith("Duplicate")), JSON.stringify(byRow(p, 2)));
check("duplicate item flags both rows (2 and 8)", byRow(p, 8).errors.some((e) => e.startsWith("Duplicate")));
check("invalid quantity reported", byRow(p, 8).errors.some((e) => /not a number/.test(e)));
check("case-insensitive code matches → CHANGE", byRow(p, 3).status === "CHANGE", JSON.stringify(byRow(p, 3)));
check("same value → UNCHANGED, inactive warned", byRow(p, 4).status === "UNCHANGED" && byRow(p, 4).warnings.some((w) => /inactive/.test(w)));
check("unknown Item Code rejected", byRow(p, 5).status === "ERROR" && /Unknown Item Code/.test(byRow(p, 5).errors[0]));
check("raw material code in FG section rejected with direction", /Raw Materials section/.test(byRow(p, 6).errors[0]), byRow(p, 6).errors[0]);
check("code shared by two items → ambiguous", /ambiguous/.test(byRow(p, 7).errors[0]));
check("missing Item Code rejected", /Item Code is required/.test(byRow(p, 9).errors[0]));
check("file with errors cannot be applied", p.canApply === false && p.summary.ERROR === 6, JSON.stringify(p.summary));

console.log("raw materials section");
const r = run("raw_materials", [rec(2, "RM-001", "Flour", "g", "25,5"), rec(3, "PK-001", "Box", "each", ""), rec(4, "FG-001", "Beef Pie", "each", "1"), rec(5, "RM-001x", "", "", "-1")]);
check("ingredient accepted, decimal comma read", byRow(r, 2).status === "NEW" && byRow(r, 2).minimum === 25.5);
check("unit difference is a warning, not silent", byRow(r, 2).warnings.some((w) => /Unit "g"/.test(w)));
check("blank minimum → SKIPPED (left unchanged, not zero)", byRow(r, 3).status === "SKIPPED" && byRow(r, 3).minimum === null);
check("finished good in RM section rejected", /Finished Goods section/.test(byRow(r, 4).errors[0]), byRow(r, 4).errors[0]);
check("unknown code + negative both reported", byRow(r, 5).errors.length === 2);

console.log("clean file");
const ok = run("finished_goods", [rec(2, "FG-001", "Beef pie", "each", "12"), rec(3, "FG-002", "Chicken Pie", "each", "12")]);
check("clean file can be applied", ok.canApply === true && ok.summary.NEW === 1 && ok.summary.CHANGE === 1, JSON.stringify(ok.summary));
check("description case difference is not a warning", byRow(ok, 2).warnings.length === 0);
const conflict = run("finished_goods", [rec(2, "FG-002", "Chicken Pie", "each", "25")]);
check("new minimum above existing warning (20) rejected", /warning level 20/.test(conflict.rows[0].errors[0]));
const conflict2 = run("finished_goods", [rec(2, "FG-002", "Chicken Pie", "each", "1")]);
check("new minimum below existing critical (2) rejected", /critical level 2/.test(conflict2.rows[0].errors[0]));
const nothing = run("finished_goods", [rec(2, "FG-003", "Veg Pie", "each", "5")]);
check("only unchanged rows → nothing to apply", nothing.canApply === false && nothing.summary.ERROR === 0);
const csvBad = run("finished_goods", [rec(2, "FG-001", "Beef Pie", "each", "1")], H, [2], true);
check("CSV row with wrong cell count rejected", csvBad.rows[0].status === "ERROR");

console.log("headings");
let threw = "";
try { run("finished_goods", [rec(2, "FG-001", "", "", "1")], ["Code", "Qty"]); } catch (e) { threw = e.message; }
check("missing Minimum Stock Level column refused", /Minimum Stock Level/.test(threw), threw);

console.log("error report csv");
check("formula injection neutralised", csv.csvCell("=HYPERLINK(1)") === "'=HYPERLINK(1)" && csv.csvCell("-5") === "-5");
check("quotes and commas quoted", csv.csvCell('a,"b"') === '"a,""b"""');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
