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
const { readStockTakeFile } = await importFromRoot("src/lib/vyron-stock-take-file.ts");
const { approveStockCount, postStockCount, updateStockCountLine } = await importFromRoot("src/lib/vyron-inventory.ts");

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

// ---------------------------------------------------------------------------
section("6. Variance % stays within the production column (numeric(8,4))");
{
  // The fake does not know column types; apply production's limits to count-line writes, as Postgres
  // does: round to the column's scale, then refuse anything too wide with "numeric field overflow".
  const LIMITS = { variance_pct: [4, 4], system_qty: [4, 10], counted_qty: [4, 10], variance_qty: [4, 10], unit_cost: [4, 10], variance_value: [2, 12] };
  const overflows = (row) => Object.entries(LIMITS).some(([c, [scale, digits]]) => row[c] != null && Math.abs(Math.round(Number(row[c]) * 10 ** scale) / 10 ** scale) >= 10 ** digits);
  const enforceColumnLimits = (fake) => {
    const from = fake.from.bind(fake);
    fake.from = (table) => {
      const q = from(table);
      if (table !== "vyron_cost_stock_count_lines") return q;
      for (const op of ["insert", "update"]) {
        const original = q[op].bind(q);
        q[op] = (payload) => {
          if ([].concat(payload).some(overflows)) q.castError = { message: "numeric field overflow" };
          return original(payload);
        };
      }
      return q;
    };
    return fake;
  };
  const CO_C = "cccccccc-0000-4000-8000-000000000001";
  const item = (id, code, qty, cost) => ({ id, company_id: CO_C, item_code: code, description: code, entity_type: "ingredient", entity_id: `ing-${id}`, unit: "each", qty_on_hand: qty, average_cost: cost, current_cost: cost, aliases: [], is_active: true });
  const fresh = (majorVariancePct) =>
    enforceColumnLimits(
      createFakeSupabase(
        {
          vyron_cost_stock_items: [item("si-gpp", "GPP", 0.5, 1.41), item("si-salt", "SALT", 100, 10), item("si-pep", "PEP", 20, 50)],
          vyron_cost_products: [],
          vyron_cost_stock_ledger: [],
          vyron_inventory_audit_log: [],
          vyron_inventory_settings: majorVariancePct ? [{ company_id: CO_C, major_variance_pct: majorVariancePct, minor_variance_pct: 2 }] : [],
          vyron_cost_stock_counts: [],
          vyron_cost_stock_count_lines: [],
          vyron_cost_low_stock_alerts: [],
        },
        { honourOrder: true }
      )
    );

  check("cap helper: within ±9,999.9999, ordinary values untouched", rules.STOCK_COUNT_VARIANCE_PCT_LIMIT === 9999.9999 && rules.storedVariancePct(14900) === 9999.9999 && rules.storedVariancePct(-14900) === -9999.9999 && rules.storedVariancePct(-10) === -10 && rules.storedVariancePct(5) === 5 && rules.storedVariancePct(9999.9999) === 9999.9999 && rules.storedVariancePct(0) === 0);

  let cdb = fresh();
  const { error: rawError } = await cdb.from("vyron_cost_stock_count_lines").insert({ company_id: CO_C, variance_pct: 14900 });
  const { error: rawNegative } = await cdb.from("vyron_cost_stock_count_lines").insert({ company_id: CO_C, variance_pct: -10000 });
  check("harness: an uncapped 14,900% or −10,000% is refused like production (numeric field overflow)", rawError?.message === "numeric field overflow" && rawNegative?.message === "numeric field overflow" && cdb.tables.vyron_cost_stock_count_lines.length === 0);

  // Grease Proof Paper: 0.5 on hand, 75 counted → 14,900%.
  const table = await readUploadedTable(enc("Item Code,Counted Quantity\nGPP,75\nSALT,90\nPEP,21\n"), "tiny-system.csv", "text/csv");
  const { count } = await stockTake.createStockTakeFromUpload(cdb, CO_C, { table, sha256: table.sha256, fileName: "tiny-system.csv", countDate: "2026-09-30" }, ACTOR);
  const line = (id) => cdb.tables.vyron_cost_stock_count_lines.find((l) => l.stock_count_id === count.id && l.stock_item_id === id);
  check("upload with a 14,900% line is recorded (no overflow): all 3 lines written", cdb.tables.vyron_cost_stock_count_lines.length === 3 && cdb.tables.vyron_cost_stock_counts.length === 1);
  check("the over-limit line stores 9,999.9999%; quantities and value are exact", line("si-gpp").variance_pct === 9999.9999 && line("si-gpp").system_qty === 0.5 && line("si-gpp").counted_qty === 75 && line("si-gpp").variance_qty === 74.5 && line("si-gpp").variance_value === 105.04, JSON.stringify(line("si-gpp")));
  check("ordinary percentages are unchanged (−10% → 10, +5% → 5) and classified as before", line("si-salt").variance_pct === 10 && line("si-salt").variance_class === "major" && line("si-pep").variance_pct === 5 && line("si-pep").variance_class === "minor");
  check("the item's system stock is not touched by the upload", cdb.tables.vyron_cost_stock_items.find((i) => i.id === "si-gpp").qty_on_hand === 0.5);
  check("the capped count still needs approval before posting", count.status === "Submitted" && /approved before posting/.test((await rejects(postStockCount(cdb, CO_C, count.id, "QA Supervisor")))?.message || ""));
  check("the same file again is still refused", /already loaded/.test((await rejects(stockTake.createStockTakeFromUpload(cdb, CO_C, { table, sha256: table.sha256, fileName: "tiny-system.csv", countDate: "2026-09-30" }, ACTOR)))?.message || ""));
  check("upload audit still written", cdb.tables.vyron_inventory_audit_log.some((a) => a.event_type === "Stock Take Uploaded" && a.reference_id === count.id));

  // Classification uses the uncapped figure: with a 12,000% major threshold, the capped 9,999.9999 would
  // read as minor; the real 14,900% is major.
  cdb = fresh(12000);
  const t2 = await readUploadedTable(enc("Item Code,Counted Quantity\nGPP,75\nPEP,21\n"), "threshold.csv", "text/csv");
  const { count: c2 } = await stockTake.createStockTakeFromUpload(cdb, CO_C, { table: t2, sha256: t2.sha256, fileName: "threshold.csv", countDate: "2026-09-30" }, ACTOR);
  const gpp2 = cdb.tables.vyron_cost_stock_count_lines.find((l) => l.stock_count_id === c2.id && l.stock_item_id === "si-gpp");
  check("upload: classified major on the uncapped 14,900% (threshold 12,000%) while storing 9,999.9999", gpp2.variance_class === "major" && gpp2.variance_pct === 9999.9999);

  // Manual count entry: the same protection on updateStockCountLine.
  cdb.tables.vyron_cost_stock_count_lines.push({ id: "cl-manual", company_id: CO_C, stock_count_id: "cnt-man", stock_item_id: "si-gpp", system_qty: 0.5, counted_qty: 0, variance_qty: -0.5, variance_pct: -100, unit_cost: 1.41 });
  await updateStockCountLine(cdb, CO_C, "cl-manual", 75);
  const manual = cdb.tables.vyron_cost_stock_count_lines.find((l) => l.id === "cl-manual");
  check("manual entry of 75 on 0.5 is saved (no overflow), stored as 9,999.9999%", manual.counted_qty === 75 && manual.variance_qty === 74.5 && manual.variance_pct === 9999.9999, JSON.stringify(manual));
  check("manual entry: classified major on the uncapped 14,900% (threshold 12,000%)", manual.variance_class === "major");
  cdb.tables.vyron_cost_stock_count_lines.push({ id: "cl-manual-2", company_id: CO_C, stock_count_id: "cnt-man", stock_item_id: "si-salt", system_qty: 100, counted_qty: 0, variance_qty: -100, variance_pct: -100, unit_cost: 10 });
  await updateStockCountLine(cdb, CO_C, "cl-manual-2", 90);
  const manual2 = cdb.tables.vyron_cost_stock_count_lines.find((l) => l.id === "cl-manual-2");
  check("manual entry: an ordinary −10% is stored unchanged (signed) and classified as before", manual2.variance_pct === -10 && manual2.variance_class === "minor");

  // ---------------------------------------------------------------------------
  section("7. Count review screen and CSV export show the true % from quantities, not the stored cap");
  // The Variance % cell exportCsv writes (InventoryCountReviewClient), from a count line as loaded.
  const EXPORT_PCT_EXPR = "String(Math.round(countLineVariancePct(num(line.system_qty), num(line.draft_counted_qty ?? line.counted_qty)) * 10000) / 10000)";
  const num = (v) => (Number.isFinite(Number(v || 0)) ? Number(v || 0) : 0);
  const exportPct = (line) => String(Math.round(rules.countLineVariancePct(num(line.system_qty), num(line.draft_counted_qty ?? line.counted_qty)) * 10000) / 10000);
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(path.join(ROOT, "src/components/InventoryCountReviewClient.tsx"), "utf8");
  const exportBody = source.slice(source.indexOf("function exportCsv()"), source.indexOf("const csv =", source.indexOf("function exportCsv()")));
  check("the CSV export computes Variance % from system and counted quantities (no longer the stored variance_pct)", exportBody.includes(EXPORT_PCT_EXPR) && !exportBody.includes("line.variance_pct"));
  check("the review table uses the same calculation", source.includes("const variancePct = countLineVariancePct(system, counted);"));
  check("Grease Proof Paper (upload): stored 9,999.9999 but exports 14900, quantities and value as stored", gpp2.variance_pct === 9999.9999 && exportPct(gpp2) === "14900" && gpp2.system_qty === 0.5 && gpp2.counted_qty === 75 && gpp2.variance_qty === 74.5 && gpp2.variance_value === 105.04, exportPct(gpp2));
  check("Grease Proof Paper (manual entry): stored 9,999.9999 but exports 14900", manual.variance_pct === 9999.9999 && exportPct(manual) === "14900");
  check("an unsaved draft count is exported as shown on screen (0.5 → 30 = 5900)", exportPct({ system_qty: 0.5, counted_qty: 75, draft_counted_qty: 30 }) === "5900");
  check("ordinary and negative variances export unchanged: −10, +5, −50, −100", exportPct(manual2) === "-10" && exportPct({ system_qty: 20, counted_qty: 21 }) === "5" && exportPct({ system_qty: 100, counted_qty: 50 }) === "-50" && exportPct({ system_qty: 120, counted_qty: 0 }) === "-100");
  check("no system stock: counted > 0 → 100, nothing either way → 0 (as before)", exportPct({ system_qty: 0, counted_qty: 4 }) === "100" && exportPct({ system_qty: 0, counted_qty: 0 }) === "0");
  const legacy = (system, counted) => (system > 0 ? ((counted - system) / system) * 100 : counted > 0 ? 100 : 0);
  check("the shared calculation equals the screen's previous inline formula", [[0.5, 75], [100, 90], [20, 21], [3, 1], [0, 4], [0, 0], [952.99152, 20000]].every(([s, c]) => rules.countLineVariancePct(s, c) === legacy(s, c)));
}

// ---------------------------------------------------------------------------
section("8. Real-world layouts: headerless workbook, header workbook, CSV variants, refusals");
{
  const db7 = createFakeSupabase(seed(), { honourOrder: true });
  const rows7 = (t) => db7.tables[t] || [];
  const xlsx = async (build) => {
    const wb = new ExcelJS.Workbook();
    build(wb);
    return new Uint8Array(await wb.xlsx.writeBuffer());
  };
  // File A shape: sheet named after the file, NO header, five columns, a note in column 6 on one
  // row, an Instructions sheet second, a blank quantity.
  const fileA = await xlsx((wb) => {
    const ws = wb.addWorksheet("15 October 2");
    ws.addRow(["CHK-BR", "Chicken Breast", "kg", "COLD ROOM", 112]);
    ws.addRow(["BOX-01", "Meal Boxes", "each", "PACKAGING", 0, "SHEETS (R7,78 PER SHEET)"]);
    ws.addRow(["RICE", "Basmati Rice", "kg", "DRYSTORE", 48.5]);
    ws.addRow(["FG-TGC", "Thai Green Curry", "each", "DELETED"]);
    const help = wb.addWorksheet("Instructions");
    help.addRow(["Column", "Required", "What to enter"]);
    help.addRow(["Item Code", "Yes", "VOLORA stock item code"]);
    help.addRow(["Counted Quantity", "Yes", "999"]);
  });
  const a = await readStockTakeFile(fileA, "15 October 2.csv.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  check("A: '.csv.xlsx' is read as an Excel workbook (content, not name)", a.file.format === "xlsx" && a.file.sheetName === "15 October 2");
  check("A: the Instructions sheet is never read as count data", a.file.ignoredSheets.join("|") === "Instructions" && !a.records.some((r) => /Column|Item Code/.test(r.values["Item Code"])));
  check("A: headerless layout recognised; the first row is stock data (CHK-BR on Excel row 1)", a.file.layout === "headerless" && a.records.length === 4 && a.records[0].row === 1 && a.records[0].values["Item Code"] === "CHK-BR");
  check("A: column 5 is the counted quantity; the column-6 note is ignored, not an invalid row", a.records[1].values["Counted Quantity"] === "0" && a.malformedRows.length === 0);
  const pa = await stockTake.previewStockTake(db7, CO, a, { stockTakeDate: "2026-10-03" });
  const ra = (code) => pa.lines.find((l) => l.sku === code);
  check("A: 3 matched, zero kept as a count (Boxes 120 → 0), blank quantity = not counted, no errors", pa.summary.itemsCounted === 3 && pa.summary.zeroCounted === 1 && ra("BOX-01").varianceQty === -120 && ra("FG-TGC").status === "NOT_COUNTED" && pa.summary.errors === 0, JSON.stringify(pa.summary));
  check("A: summary splits increasing / decreasing / no variance", pa.summary.positiveAdjustments === 1 && pa.summary.negativeAdjustments === 2 && pa.summary.noVariance === 0 && ra("CHK-BR").varianceQty === 2 && ra("RICE").varianceQty === -1.5);

  // File B shape: header row (capitalisation / spacing differ, columns reordered), trailing blank
  // formatted rows and columns, a note in an unheaded column.
  const fileB = await xlsx((wb) => {
    const ws = wb.addWorksheet("15 OCT 2026");
    ws.addRow([" ITEM CODE ", "description", "Unit", "counted quantity", "Location"]);
    ws.addRow(["CHK-BR", "Chicken Breast", "kg", 110, "COLD ROOM"]);
    ws.addRow(["RICE", "Basmati Rice", "kg", 50, "DRYSTORE", "", "14c per sheet"]);
    ws.getCell("A10").numFmt = "@";
    ws.getCell("H2").numFmt = "0.00";
  });
  const b = await readStockTakeFile(fileB, "Stock Take 15 Oct 2026.xlsx", "");
  check("B: header recognised despite case, spacing and column order; data starts on Excel row 2", b.file.layout === "header" && b.records.length === 2 && b.records[0].row === 2);
  const pb = await stockTake.previewStockTake(db7, CO, b, { stockTakeDate: "2026-10-03" });
  check("B: quantities come from the named column, not position (Chicken 110, Rice 50); trailing blanks ignored", pb.lines.length === 2 && pb.lines.every((l) => l.status === "MATCHED") && pb.lines.find((l) => l.sku === "CHK-BR").countedQty === 110 && pb.summary.noVariance === 2, JSON.stringify(pb.summary));

  // Validation on a headerless workbook — every problem reported with its Excel row number.
  const bad = await readStockTakeFile(
    await xlsx((wb) => {
      const ws = wb.addWorksheet("Count");
      ws.addRow(["CHK-BR", "Chicken", "kg", "", 100]);
      ws.addRow(["NOPE-9", "Unknown", "kg", "", 1]);
      ws.addRow(["RICE", "Rice", "kg", "", "lots"]);
      ws.addRow(["RICE", "Rice", "kg", "", -3]);
      ws.addRow(["", "Echt Hot Sauce", "unit", "KITCHEN", 24]);
      ws.addRow([]);
      ws.addRow(["CHK-BR", "Chicken again", "kg", "", 101]);
    }),
    "count.xlsx",
    ""
  );
  const pbad = await stockTake.previewStockTake(db7, CO, bad, { stockTakeDate: "2026-10-03" });
  const at = (n) => pbad.lines.find((l) => l.row === n);
  check("validation: unmatched (row 2), invalid quantity (rows 3, 4), missing item code (row 5), duplicate (row 7, naming row 1)", at(2)?.status === "UNMATCHED" && at(3)?.status === "INVALID_QUANTITY" && at(4)?.status === "INVALID_QUANTITY" && at(5)?.status === "MISSING_IDENTIFIER" && at(7)?.status === "DUPLICATE_IN_FILE" && /row 1/.test(at(7)?.note || ""), JSON.stringify(pbad.lines.map((l) => [l.row, l.status])));
  check("validation: blank row 6 is skipped but numbering stays true to Excel", !at(6) && pbad.summary.errors === 5);
  const blocked = await rejects(stockTake.createStockTakeFromUpload(db7, CO, { table: bad, sha256: bad.sha256, fileName: "count.xlsx", countDate: "2026-10-03" }, ACTOR));
  check("validation: a file with any error is refused whole — nothing written", /5 row\(s\)/.test(blocked?.message || "") && rows7("vyron_cost_stock_counts").length === 0 && rows7("vyron_cost_stock_count_lines").length === 0);

  // CSV variants.
  const csvQuoted = await readStockTakeFile(enc('﻿Item Code,Description,Unit,Location,Counted Quantity,,\r\nCHK-BR,"Chicken, breast ""A""",kg,,115,,\r\n,,,,,,\r\n\r\n'), "count.csv", "text/csv");
  check("CSV: BOM, quoted comma/quote description, empty trailing columns and rows", csvQuoted.file.format === "csv" && csvQuoted.records.length === 1 && csvQuoted.records[0].values.Description === 'Chicken, breast "A"' && csvQuoted.records[0].values["Counted Quantity"] === "115" && csvQuoted.malformedRows.length === 0);
  const cp1252 = new Uint8Array([...enc("CHK-BR,Cr"), 0xe8, ...enc("me fra"), 0xee, ...enc("che,l,,7\n")]);
  const csvAnsi = await readStockTakeFile(cp1252, "excel-export.csv", "");
  check("CSV: Excel 'CSV' (Windows-1252) headerless file reads, first row kept", csvAnsi.encoding === "windows-1252" && csvAnsi.file.layout === "headerless" && csvAnsi.records[0].values.Description === "Crème fraîche" && csvAnsi.records[0].values["Counted Quantity"] === "7");
  const spilled = await readStockTakeFile(enc("Item Code,Counted Quantity\nCHK-BR,1,5\n"), "count.csv", "text/csv");
  check("CSV: an unquoted 1,5 is still an invalid row, never read as 1", (await stockTake.previewStockTake(db7, CO, spilled, { stockTakeDate: "2026-10-03" })).lines[0].status === "INVALID_ROW");
  check("xlsx bytes uploaded with a .csv name are still read as Excel", (await readStockTakeFile(fileA, "renamed.csv", "text/csv")).file.format === "xlsx");

  // Refusals.
  const msg = async (bytes, name) => (await rejects(readStockTakeFile(bytes, name, "")))?.message || "";
  check("invalid extension (.pdf / .docx) is refused", /\.xlsx\) or a CSV/.test(await msg(enc("%PDF-1.4 ..."), "count.pdf")) && /\.xlsx\) or a CSV/.test(await msg(enc("hello"), "count.docx")));
  check("corrupt Excel (not a workbook) is refused clearly", /not a valid workbook/.test(await msg(enc("this is not excel"), "count.xlsx")));
  check("damaged Excel (truncated zip) is refused clearly", /could not be read/.test(await msg(fileA.slice(0, 400), "count.xlsx")));
  check("legacy .xls is refused with Save As guidance", /older Excel \(\.xls\)/.test(await msg(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), "count.xls")));
  check("an unrecognised header row is refused rather than read as data", /not the stock take header/.test(await msg(enc("Artikel,Name,Einheit,Ort,Menge\nCHK-BR,x,kg,,1\n"), "count.csv")));
  check("an Instructions-only workbook is refused", /no stock count sheet/.test(await msg(await xlsx((wb) => wb.addWorksheet("Instructions").addRow(["Column"])), "help.xlsx")));
  check("an empty file is refused", /empty/.test(await msg(new Uint8Array(), "count.csv")));

  // Company isolation: company B sees none of company A's codes.
  const pB = await stockTake.previewStockTake(db7, CO_B, a, { stockTakeDate: "2026-10-03" });
  check("company isolation: company A's file previewed for company B matches nothing", pB.summary.itemsCounted === 0 && pB.summary.unmatched === 3);

  // Preview writes nothing; confirm records a count but posts nothing; approve → post adjusts.
  const ledgerBefore = rows7("vyron_cost_stock_ledger").length;
  const qtys = () => JSON.stringify(rows7("vyron_cost_stock_items").map((i) => [i.id, i.qty_on_hand]));
  const qtyBefore = qtys();
  check("preview writes nothing (no count, no ledger, stock unchanged)", rows7("vyron_cost_stock_counts").length === 0 && rows7("vyron_cost_stock_ledger").length === ledgerBefore && rows7("vyron_inventory_audit_log").length === 0);
  const { count } = await stockTake.createStockTakeFromUpload(db7, CO, { table: a, sha256: a.sha256, fileName: "15 October 2.csv.xlsx", countDate: "2026-10-03" }, ACTOR);
  check("confirm creates a Submitted count only — no movement, stock unchanged before approval", count.status === "Submitted" && rows7("vyron_cost_stock_ledger").length === ledgerBefore && qtys() === qtyBefore);
  check("duplicate upload of the same workbook is refused", /already loaded/.test((await rejects(stockTake.createStockTakeFromUpload(db7, CO, { table: a, sha256: a.sha256, fileName: "copy.xlsx", countDate: "2026-10-03" }, ACTOR)))?.message || ""));
  check("posting before supervisor approval is refused", /approved before posting/.test((await rejects(postStockCount(db7, CO, count.id, "QA Supervisor")))?.message || ""));
  await approveStockCount(db7, CO, count.id, "QA Supervisor");
  await postStockCount(db7, CO, count.id, "QA Supervisor");
  const moved = rows7("vyron_cost_stock_ledger").filter((l) => l.reference_id === count.id);
  const qtyOf = (id) => rows7("vyron_cost_stock_items").find((i) => i.id === id).qty_on_hand;
  check("after approval: 3 variance movements through the existing engine, dated 23:59:59.999 SAST", moved.length === 3 && moved.every((l) => l.movement_type === "Stock Count Variance" && l.movement_date === "2026-10-03T21:59:59.999Z"), JSON.stringify(moved.map((l) => [l.stock_item_id, l.movement_date])));
  check("after approval: Chicken 112, Boxes 0, Rice 48.5; Thai Green Curry (not counted) untouched; company B untouched", qtyOf("si-chk") === 112 && qtyOf("si-box") === 0 && qtyOf("si-rice") === 48.5 && qtyOf("si-curry") === 40 && qtyOf("si-b-curry") === 400);
}

// ---------------------------------------------------------------------------
section("9. The route and screen use the new reader and the visible drop zone");
{
  const fs = await import("node:fs");
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/inventory/stock-take/route.ts"), "utf8");
  const client = fs.readFileSync(path.join(ROOT, "src/components/vyron-cost/inventory/StockTakeUploadClient.tsx"), "utf8");
  const zone = fs.readFileSync(path.join(ROOT, "src/components/vyron-cost/inventory/StockTakeDropZone.tsx"), "utf8");
  check("the stock take route reads files with readStockTakeFile", route.includes("readStockTakeFile(") && !route.includes("readUploadedTable("));
  check("the screen uses the stock take drop zone (enabled before a date is chosen)", client.includes("<StockTakeDropZone") && !client.includes("FileDropZone"));
  check("the drop zone says drag and drop, OR, Browse Files, the formats and the instruction", ["Drag and drop your stock-take file here", ">or<", "Browse Files", "Supported formats: .xlsx, .xls, .csv", "You can drag and drop your completed stock-take file here."].every((t) => zone.includes(t)));
  check("the drop zone handles drop and a real file input, and offers Replace / Remove", zone.includes("onDrop=") && zone.includes('type="file"') && zone.includes("Replace") && zone.includes("Remove"));
}

// ---------------------------------------------------------------------------
section("10. Item codes with harmless spacing; duplicates report both counts");
{
  const seed10 = seed();
  seed10.vyron_cost_stock_items.push(
    { id: "si-echt", company_id: CO, item_code: "FG-ECD3E1BD", description: "Echt Sweet & Sour Sauce", entity_type: "finished_goods", entity_id: "p-echt", unit: "each", qty_on_hand: 12, average_cost: 30, current_cost: 30, aliases: [], is_active: true },
    // Two codes that differ only by spacing: the loose form is shared, so it can never pick one.
    { id: "si-twin-1", company_id: CO, item_code: "AB-1", description: "Twin one", entity_type: "ingredient", entity_id: "ing-t1", unit: "each", qty_on_hand: 1, average_cost: 1, current_cost: 1, aliases: [], is_active: true },
    { id: "si-twin-2", company_id: CO, item_code: "AB - 1", description: "Twin two", entity_type: "ingredient", entity_id: "ing-t2", unit: "each", qty_on_hand: 1, average_cost: 1, current_cost: 1, aliases: [], is_active: true },
    { id: "si-b-echt", company_id: CO_B, item_code: "FG-B0B0B0B0", description: "Company B sauce", entity_type: "finished_goods", entity_id: "p-b-echt", unit: "each", qty_on_hand: 5, average_cost: 1, current_cost: 1, aliases: [], is_active: true }
  );
  const db10 = createFakeSupabase(seed10, { honourOrder: true });
  const before = JSON.stringify(db10.tables.vyron_cost_stock_items);
  const t = await readStockTakeFile(
    enc(
      [
        "Item Code,Description,Counted Quantity",
        "FG - ECD3E1BD,Echt Sweet/Sour,10", // row 2: spaces around the hyphen
        "  chk-br  ,Chicken,100", // row 3: case + outer spaces (exact match, not 'normalised')
        "FG-ECD3E1B,Typo — one character short,1", // row 4: a different code, never matched
        "AB-1,Twin exact,1", // row 5: exact code wins outright
        "AB -1,Twin loose,1", // row 6: loose form fits both twins → ambiguous
        "FG  -  B0B0B0B0,Other company's code,1", // row 7: company B's code — unmatched for A
        "Echt Sweet & Sour Sauce,description in the code column,1", // row 8: never matched by name
        "RICE,Rice,40", // row 9
        "RICE,Rice again,41", // row 10: duplicate, different quantity
        "BOX-01,Boxes,7", // row 11
        "BOX-01,Boxes again,7", // row 12: duplicate, same quantity — still an error
      ].join("\n")
    ),
    "codes.csv",
    "text/csv"
  );
  const p = await stockTake.previewStockTake(db10, CO, t, { stockTakeDate: "2026-10-03" });
  const at = (n) => p.lines.find((l) => l.row === n);
  check("'FG - ECD3E1BD' matches the one stock item FG-ECD3E1BD; the uploaded and matched codes are both shown", at(2).status === "MATCHED" && at(2).stockItemId === "si-echt" && at(2).sku === "FG - ECD3E1BD" && at(2).matchedCode === "FG-ECD3E1BD" && at(2).codeNormalised === true && /Uploaded code "FG - ECD3E1BD" matched stock code FG-ECD3E1BD/.test(at(2).note), JSON.stringify(at(2)));
  check("trimmed, case-insensitive exact codes match as before (not marked as normalised)", at(3).status === "MATCHED" && at(3).stockItemId === "si-chk" && at(3).codeNormalised === false && at(3).matchedCode === "CHK-BR");
  check("letters and digits are never changed: FG-ECD3E1B stays unmatched", at(4).status === "UNMATCHED");
  check("an exact code is used outright even when a spacing twin exists", at(5).status === "MATCHED" && at(5).stockItemId === "si-twin-1");
  check("a loose code fitting two stock items is ambiguous; none is chosen", at(6).status === "AMBIGUOUS" && at(6).stockItemId === null && /none is chosen/.test(at(6).note));
  check("company isolation holds for normalised codes (company B's code is unmatched for A)", at(7).status === "UNMATCHED");
  check("a description in the code column is never matched by name", at(8).status === "UNMATCHED");
  check("duplicate with a different quantity: both rows and both counts named, nothing chosen", at(10).status === "DUPLICATE_IN_FILE" && /row 9 counted 40, this row 41 \(different quantity\)/.test(at(10).note), at(10).note);
  check("duplicate with the same quantity is still an error (no silent drop)", at(12).status === "DUPLICATE_IN_FILE" && /\(same quantity\)/.test(at(12).note));
  check("preview never changes a stock item's code, description or quantity", JSON.stringify(db10.tables.vyron_cost_stock_items) === before);
  check("looseStockCode only removes spacing around separators and collapses spaces", stockTake.looseStockCode(" fg - ecd3e1bd ") === "FG-ECD3E1BD" && stockTake.looseStockCode("A  B") === "A B" && stockTake.looseStockCode("ING_ 01 / 2") === "ING_01/2");
}

// ---------------------------------------------------------------------------
section("11. Opening-stock imports keep exact matching (the shared index is unchanged)");
{
  const db11 = createFakeSupabase(seed(), { honourOrder: true });
  const index = await stockTake.loadStockIndex(db11, CO);
  check("exact index is keyed as before; loose index is separate", index.byIdentifier.has("CHK-BR") && !index.byIdentifier.has("CHK - BR") && index.byLooseIdentifier instanceof Map);
  const persist = (await import("node:fs")).readFileSync(path.join(ROOT, "src/lib/vyron-import-persist.ts"), "utf8");
  check("opening-stock import uses only the exact index", persist.includes("index.byIdentifier.get(") && !persist.includes("byLooseIdentifier"));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
