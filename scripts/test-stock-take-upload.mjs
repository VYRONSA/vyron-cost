#!/usr/bin/env node
/**
 * VOLORA — Stock Take Upload: the Stock Take Date, the template and file validation.
 *
 * Drives the REAL modules (stock take rules, stock-take import + template, upload reader, the
 * existing approve → post workflow) against an in-memory database, for two synthetic companies.
 * Family A: no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:stock-take-upload
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-stock-take-upload";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};
const section = (title) => console.log(`\n${title}`);
async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}
const enc = (text) => new TextEncoder().encode(text);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const rules = await importFromRoot("src/lib/vyron-stock-take-rules.ts");
const stockTake = await importFromRoot("src/lib/vyron-stock-take-import.ts");
const { readUploadedTable } = await importFromRoot("src/lib/vyron-upload-table.ts");
const { approveStockCount, postStockCount } = await importFromRoot("src/lib/vyron-inventory.ts");

const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const CO_B = "bbbbbbbb-0000-4000-8000-000000000001";
const ACTOR = "11111111-0000-4000-8000-000000000001";

function seed() {
  return {
    vyron_cost_stock_items: [
      { id: "si-chk", company_id: CO, item_code: "CHK-BR", description: "Chicken Breast", entity_type: "ingredient", entity_id: "ing-chk", unit: "kg", qty_on_hand: 110, average_cost: 85, current_cost: 85, aliases: ["CHICKEN-BREAST"], is_active: true },
      { id: "si-box", company_id: CO, item_code: "BOX-01", description: "Meal Boxes", entity_type: "packaging", entity_id: "pk-box", unit: "each", qty_on_hand: 120, average_cost: 2, current_cost: 2, barcode: "6001000000017", aliases: ["SHARED"], is_active: true },
      { id: "si-rice", company_id: CO, item_code: "RICE", description: "Basmati Rice", entity_type: "ingredient", entity_id: "ing-rice", unit: "kg", qty_on_hand: 50, average_cost: 30, current_cost: 30, aliases: ["SHARED"], is_active: true },
      { id: "si-curry", company_id: CO, item_code: "FG-TGC", description: "Thai Green Curry", entity_type: "finished_goods", entity_id: "p-tgc", unit: "each", qty_on_hand: 40, average_cost: 13, current_cost: 13, aliases: [], is_active: true },
      { id: "si-old", company_id: CO, item_code: "OLD-1", description: "Discontinued Sauce", entity_type: "ingredient", entity_id: "ing-old", unit: "l", qty_on_hand: 0, average_cost: 10, current_cost: 10, aliases: [], is_active: false },
      { id: "si-b-curry", company_id: CO_B, item_code: "FG-TGC-B", description: "Company B Curry", entity_type: "finished_goods", entity_id: "p-b-tgc", unit: "each", qty_on_hand: 400, average_cost: 13, current_cost: 13, aliases: [], is_active: true },
    ],
    vyron_cost_products: [
      { id: "p-tgc", company_id: CO, product_name: "Thai Green Curry", sku: "745853254322" },
      { id: "p-b-tgc", company_id: CO_B, product_name: "Company B Curry", sku: "745853254999" },
    ],
    // Chicken: 120 on 1 Oct (the Stock Take Date), then 10 sold on 3 Oct → 110 on hand today.
    // A 5 kg receipt during 1 Oct itself is before close of business, so part of the 120.
    vyron_cost_stock_ledger: [
      { id: "l-1", company_id: CO, stock_item_id: "si-chk", movement_date: "2026-10-01T08:00:00.000Z", movement_type: "Purchase", quantity_in: 5, quantity_out: 0 },
      { id: "l-2", company_id: CO, stock_item_id: "si-chk", movement_date: "2026-10-03T09:00:00.000Z", movement_type: "Sale", quantity_in: 0, quantity_out: 10 },
      { id: "l-3", company_id: CO_B, stock_item_id: "si-b-curry", movement_date: "2026-10-03T09:00:00.000Z", movement_type: "Sale", quantity_in: 0, quantity_out: 50 },
    ],
    vyron_inventory_audit_log: [],
    vyron_inventory_settings: [],
    vyron_cost_stock_counts: [],
    vyron_cost_stock_count_lines: [],
    vyron_cost_low_stock_alerts: [],
  };
}
let db = createFakeSupabase(seed(), { honourOrder: true });
const rows = (t) => db.tables[t] || [];

// ---------------------------------------------------------------------------
section("1. Stock Take Date rules");
{
  const today = "2026-10-07";
  check("blank date is refused", /Enter the Stock Take Date/.test(rules.stockTakeDateProblem("", today) || ""));
  check("non-ISO text is refused", /not a date/.test(rules.stockTakeDateProblem("01/10/2026", today) || ""));
  check("an impossible calendar date is refused (30 Feb)", /not a real calendar date/.test(rules.stockTakeDateProblem("2026-02-30", today) || ""));
  check("a future date is refused", /in the future/.test(rules.stockTakeDateProblem("2026-10-08", today) || ""));
  check("today and earlier days are accepted", rules.stockTakeDateProblem("2026-10-07", today) === null && rules.stockTakeDateProblem("2025-12-31", today) === null);
  check("today is South African: 23:30 UTC on 6 Oct is already 7 Oct", rules.todayInSouthAfrica(new Date("2026-10-06T23:30:00Z")) === "2026-10-07");
  check("cutoff = midnight at the end of the date, SA time", rules.stockTakeCutoff("2026-10-01") === "2026-10-01T22:00:00.000Z");
  check("effective movement time = last instant of the date, SA time", rules.stockTakeEffectiveAt("2026-10-01") === "2026-10-01T21:59:59.999Z");
}

// ---------------------------------------------------------------------------
section("2. Template structure");
{
  const { buffer, itemCount } = await stockTake.buildStockTakeTemplate(db, CO);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  check("two sheets, the count sheet first (the upload reads the first sheet)", wb.worksheets.map((w) => w.name).join("|") === "Stock Take|Instructions");
  const sheet = wb.worksheets[0];
  const header = sheet.getRow(1).values.slice(1);
  check("header: Item Code, Description, Unit, Location, Counted Quantity", header.join("|") === "Item Code|Description|Unit|Location|Counted Quantity", header.join("|"));
  const codes = [];
  sheet.eachRow((row, n) => n > 1 && codes.push(row.getCell(1).value));
  check("lists this company's active items by VOLORA item code, sorted", codes.join("|") === "BOX-01|CHK-BR|FG-TGC|RICE" && itemCount === 4, codes.join("|"));
  check("inactive items and other companies' items are left out", !codes.includes("OLD-1") && !codes.includes("FG-TGC-B"));
  check("description and unit are filled in; Location and Counted Quantity are blank (blind count — no system stock)", sheet.getRow(3).getCell(2).value === "Chicken Breast" && sheet.getRow(3).getCell(3).value === "kg" && !sheet.getRow(3).getCell(4).value && !sheet.getRow(3).getCell(5).value);
  const help = wb.worksheets[1];
  const helpText = [];
  help.eachRow((row) => helpText.push(row.values.slice(1).join("|")));
  check("instructions mark Item Code and Counted Quantity as required", helpText.includes(`Item Code|Yes|${rules.STOCK_TAKE_TEMPLATE_COLUMNS[0].help}`) && helpText.some((t) => t.startsWith("Counted Quantity|Yes|")));
  check("instructions carry the example row", helpText.includes("Item Code|Description|Unit|Location|Counted Quantity") && helpText.includes("CHK-BR|Chicken Breast|kg|Main Store|115.5"));
  const bTemplate = await stockTake.buildStockTakeTemplate(db, CO_B);
  check("company B's template lists only company B's items", bTemplate.itemCount === 1);

  // The completed template uploads as is (Excel).
  sheet.getRow(2).getCell(5).value = 118; // BOX-01
  sheet.getRow(3).getCell(5).value = 115; // CHK-BR
  sheet.getRow(5).getCell(5).value = 0; // RICE — none on hand
  sheet.getRow(3).getCell(4).value = "Cold Room";
  const filled = Buffer.from(await wb.xlsx.writeBuffer());
  const table = await readUploadedTable(new Uint8Array(filled), "stock-take-template-2026-10-07.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const preview = await stockTake.previewStockTake(db, CO, table, { stockTakeDate: "2026-10-01" });
  const byCode = (c) => preview.lines.find((l) => l.sku === c);
  check("completed template: 3 counted, the blank row is 'not counted', no errors", preview.summary.itemsCounted === 3 && preview.summary.notCounted === 1 && preview.summary.errors === 0 && byCode("FG-TGC").status === "NOT_COUNTED", JSON.stringify(preview.summary));
  check("zero is a count (Rice 50 → 0 = −50); location is read", byCode("RICE").status === "MATCHED" && byCode("RICE").varianceQty === -50 && byCode("CHK-BR").location === "Cold Room");
  const csv = await readUploadedTable(enc("Item Code,Description,Unit,Location,Counted Quantity\nCHK-BR,Chicken Breast,kg,,115\n"), "count.csv", "text/csv");
  check("the template's columns also upload as CSV", (await stockTake.previewStockTake(db, CO, csv, { stockTakeDate: "2026-10-01" })).summary.itemsCounted === 1);
}

// ---------------------------------------------------------------------------
section("3. Validation before any write");
{
  const read = (text) => readUploadedTable(enc(text), "count.csv", "text/csv");
  check("no quantity column → refused", /no counted quantity column/.test((await rejects(stockTake.previewStockTake(db, CO, await read("Item Code,Description\nCHK-BR,Chicken\n"))))?.message || ""));
  check("no item code column (description only) → refused, never matched by name", /no item code column/.test((await rejects(stockTake.previewStockTake(db, CO, await read("Description,Counted Quantity\nChicken Breast,5\n"))))?.message || ""));
  const table = await read(
    [
      "Item Code,Description,Counted Quantity",
      "CHK-BR,Chicken Breast,115",
      ",Meal Boxes,10",
      "RICE,Basmati Rice,abc",
      "FG-TGC,Thai Green Curry,-3",
      "NOPE-1,Unknown,4",
      "SHARED,Shared alias,2",
      "CHICKEN-BREAST,Chicken again,999",
      "BOX-01,Meal Boxes,",
      "BOX-01,Meal Boxes,1,5",
      "745853254322,Thai Green Curry (product SKU),41",
    ].join("\n")
  );
  const p = await stockTake.previewStockTake(db, CO, table, { stockTakeDate: "2026-10-01" });
  const row = (n) => p.lines.find((l) => l.row === n);
  check("row with a quantity but no item code → missing item code", row(3).status === "MISSING_IDENTIFIER");
  check("non-numeric quantity → invalid quantity", row(4).status === "INVALID_QUANTITY");
  check("negative quantity → invalid quantity", row(5).status === "INVALID_QUANTITY");
  check("unknown item code → unmatched, naming the code", row(6).status === "UNMATCHED" && /NOPE-1/.test(row(6).note));
  check("code shared by two items → ambiguous", row(7).status === "AMBIGUOUS");
  check("the same item again (by alias) → duplicate, naming the first row", row(8).status === "DUPLICATE_IN_FILE" && /row 2/.test(row(8).note));
  check("item code with blank quantity → not counted (not an error)", row(9).status === "NOT_COUNTED");
  check("row whose cells do not line up with the header (unquoted 1,5) → invalid row, never read as 1", row(10).status === "INVALID_ROW" && row(10).countedQty === null);
  check("finished good matched by its product SKU", row(11).status === "MATCHED" && row(11).stockItemId === "si-curry");
  check("summary counts 7 errors, 2 counted, 1 not counted", p.summary.errors === 7 && p.summary.itemsCounted === 2 && p.summary.notCounted === 1, JSON.stringify(p.summary));
  const refused = await rejects(stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "bad.csv", countDate: "2026-10-01" }, ACTOR));
  check("a file with errors is refused and nothing is written", /7 row\(s\) in the file have errors/.test(refused?.message || "") && rows("vyron_cost_stock_counts").length === 0 && rows("vyron_cost_stock_count_lines").length === 0 && rows("vyron_inventory_audit_log").length === 0);
  const blankOnly = await read("Item Code,Counted Quantity\nCHK-BR,\n");
  check("a file with nothing counted is refused", /nothing to count/.test((await rejects(stockTake.createStockTakeFromUpload(db, CO, { table: blankOnly, sha256: blankOnly.sha256, fileName: "blank.csv", countDate: "2026-10-01" }, ACTOR)))?.message || ""));
}

// ---------------------------------------------------------------------------
section("4. Stock Take Date is required and becomes the effective date");
{
  const table = await readUploadedTable(enc("Item Code,Counted Quantity\nCHK-BR,115\nBOX-01,118\nRICE,50\n"), "count-1-oct.csv", "text/csv");
  for (const [label, countDate, pattern] of [
    ["missing", undefined, /Enter the Stock Take Date/],
    ["blank", "", /Enter the Stock Take Date/],
    ["future", "2999-01-01", /in the future/],
    ["not a date", "2026-13-01", /not a real calendar date/],
  ])
    check(`create with a ${label} Stock Take Date is refused; nothing written`, pattern.test((await rejects(stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "count.csv", countDate }, ACTOR)))?.message || "") && rows("vyron_cost_stock_counts").length === 0);

  const p = await stockTake.previewStockTake(db, CO, table, { stockTakeDate: "2026-10-01" });
  const chk = p.lines.find((l) => l.sku === "CHK-BR");
  check("system stock is as at the Stock Take Date: 110 on hand + 10 sold since = 120 (the 1 Oct receipt stays in)", chk.systemQty === 120 && chk.laterMovementQty === -10 && /as at 2026-10-01/.test(chk.note), JSON.stringify(chk));
  check("variance against the date: 115 − 120 = −5 (not 115 − 110 = +5)", chk.varianceQty === -5 && chk.varianceValue === -425);
  const today = await stockTake.previewStockTake(db, CO, table, { stockTakeDate: "2026-10-03" });
  check("a count dated after the sale compares with 110", today.lines.find((l) => l.sku === "CHK-BR").systemQty === 110);

  const before = Date.now();
  const { count } = await stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "count-1-oct.csv", countDate: "2026-10-01" }, ACTOR);
  const header = rows("vyron_cost_stock_counts").find((c) => c.id === count.id);
  check("the count is dated on the Stock Take Date, not the upload date", header.count_date === "2026-10-01" && header.count_type === "upload");
  check("the upload timestamp is kept separately (submitted / created now)", Date.parse(header.submitted_at) >= before && Date.parse(header.created_at) >= before - 5);
  check("source file and SHA-256 retained", header.source_file_name === "count-1-oct.csv" && header.source_sha256 === table.sha256 && /^[0-9a-f]{64}$/.test(header.source_sha256));
  const line = rows("vyron_cost_stock_count_lines").find((l) => l.stock_count_id === count.id && l.stock_item_id === "si-chk");
  check("count line records system 120, counted 115, variance −5", line.system_qty === 120 && line.counted_qty === 115 && line.variance_qty === -5);
  const upAudit = rows("vyron_inventory_audit_log").find((l) => l.event_type === "Stock Take Uploaded");
  check("upload audit keeps the Stock Take Date and the upload timestamp", upAudit.metadata.stockTakeDate === "2026-10-01" && Date.parse(upAudit.metadata.uploadedAt) >= before && upAudit.metadata.sha256 === table.sha256 && /stock take date 2026-10-01/.test(upAudit.detail));
  check("the same file again is refused", /already loaded/.test((await rejects(stockTake.createStockTakeFromUpload(db, CO, { table, sha256: table.sha256, fileName: "count-1-oct.csv", countDate: "2026-10-01" }, ACTOR)))?.message || ""));
  check("posting before supervisor approval is refused", /approved before posting/.test((await rejects(postStockCount(db, CO, count.id, "QA Supervisor")))?.message || ""));

  await approveStockCount(db, CO, count.id, "QA Supervisor");
  const postStart = Date.now();
  await postStockCount(db, CO, count.id, "QA Supervisor");
  const ledger = rows("vyron_cost_stock_ledger").filter((l) => l.reference_id === count.id);
  check("two variance movements posted (Chicken −5, Boxes −2; Rice unchanged)", ledger.length === 2 && ledger.every((l) => l.movement_type === "Stock Count Variance"));
  check("every movement is dated on the Stock Take Date (2026-10-01 23:59:59.999 SAST), not today", ledger.every((l) => l.movement_date === "2026-10-01T21:59:59.999Z"), ledger.map((l) => l.movement_date).join(", "));
  check("movements carry the Stock Take Date in their metadata", ledger.every((l) => l.metadata?.stockTakeDate === "2026-10-01"));
  check("stock now: Chicken 110 − 5 = 105 (the later sale is preserved), Boxes 118", rows("vyron_cost_stock_items").find((i) => i.id === "si-chk").qty_on_hand === 105 && rows("vyron_cost_stock_items").find((i) => i.id === "si-box").qty_on_hand === 118);
  const posted = rows("vyron_cost_stock_counts").find((c) => c.id === count.id);
  check("posted timestamp is the actual posting time; count date unchanged", posted.status === "Posted" && Date.parse(posted.posted_at) >= postStart && posted.count_date === "2026-10-01" && posted.approved_by === "QA Supervisor");
  const postAudit = rows("vyron_inventory_audit_log").find((l) => l.event_type === "Stock Count Posted" && l.reference_id === count.id);
  check("post audit keeps the Stock Take Date, effective date, upload and post timestamps", postAudit.metadata.stockTakeDate === "2026-10-01" && postAudit.metadata.effectiveMovementDate === "2026-10-01T21:59:59.999Z" && Date.parse(postAudit.metadata.postedAt) >= postStart && Boolean(postAudit.metadata.uploadedAt), JSON.stringify(postAudit.metadata));
}

// ---------------------------------------------------------------------------
section("5. Other counts and companies are unaffected");
{
  // A count that was not uploaded keeps posting on the posting day, as before.
  db.tables.vyron_cost_stock_counts.push({ id: "cnt-manual", company_id: CO, count_number: "CNT-MANUAL", count_type: "Full", count_date: "2026-09-01", status: "Approved" });
  db.tables.vyron_cost_stock_count_lines.push({ id: "cl-m", company_id: CO, stock_count_id: "cnt-manual", stock_item_id: "si-rice", system_qty: 50, counted_qty: 49, variance_qty: -1, unit_cost: 30 });
  const start = Date.now();
  await postStockCount(db, CO, "cnt-manual", "QA Supervisor");
  const m = rows("vyron_cost_stock_ledger").find((l) => l.reference_id === "cnt-manual");
  check("a manual count still posts on the posting day (unchanged behaviour)", Date.parse(m.movement_date) >= start && !m.metadata?.stockTakeDate);
  const bTable = await readUploadedTable(enc("Item Code,Counted Quantity\nCHK-BR,1\nFG-TGC-B,350\n"), "b.csv", "text/csv");
  const b = await stockTake.previewStockTake(db, CO_B, bTable, { stockTakeDate: "2026-10-01" });
  check("company B never matches company A's items, and uses only its own ledger (400 + 50 sold since = 450)", b.lines.find((l) => l.sku === "CHK-BR").status === "UNMATCHED" && b.lines.find((l) => l.sku === "FG-TGC-B").systemQty === 450);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
