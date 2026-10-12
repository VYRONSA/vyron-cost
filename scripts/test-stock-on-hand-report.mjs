#!/usr/bin/env node
/**
 * VOLORA — Stock on Hand as at a date: rebuilt from the stock ledger.
 *
 * The ledger is written by the REAL posting code (postStockMovement, and the stock take upload →
 * approve → post workflow) into an in-memory database; the report is then built by the REAL
 * report module and served by the REAL /api/inventory/stock-on-hand route behind the REAL
 * workspace sign-in, membership and permission code. Two synthetic companies.
 *
 * Family A: no network, no database, no credentials, no real tenant data.
 *
 *   npm run test:stock-on-hand-report
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

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
const enc = (text) => new TextEncoder().encode(text);
const near = (a, b, eps = 1e-6) => a !== null && b !== null && Math.abs(a - b) <= eps;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_INV = uuid("a", 10), U_DENIED = uuid("a", 11), U_B = uuid("b", 10);
const ACTOR = U_INV;
const USERS = [
  { id: U_INV, email: "inventory@qa-a.test", password: "qa-pass-inv" },
  { id: U_DENIED, email: "denied@qa-a.test", password: "qa-pass-denied" },
  { id: U_B, email: "inventory@qa-b.test", password: "qa-pass-b" },
];

const item = (co, id, code, description, category, entityType, unit, cost = 0) => ({
  id, company_id: co, item_code: code, description, category, entity_type: entityType, entity_id: null, unit,
  qty_on_hand: 0, average_cost: cost, current_cost: cost, inventory_value: 0, reorder_level: 0, min_level: 0, max_level: 0, is_active: true, aliases: [],
});
const seed = () => ({
  vyron_workspaces: [
    { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
  ],
  vyron_workspace_memberships: [
    { id: "m1", workspace_id: WS_A, user_id: U_INV, role: "INVENTORY", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS_A, user_id: U_DENIED, role: "VIEW_ONLY", status: "Active", permissions: { "inventory.view": false } },
    { id: "m3", workspace_id: WS_B, user_id: U_B, role: "INVENTORY", status: "Active", permissions: {} },
  ],
  vyron_cost_stock_items: [
    item(CO_A, "si-flour", "FLOUR", "Cake Flour", "Dry Goods", "ingredient", "kg"),
    item(CO_A, "si-milk", "MILK", "Full Cream Milk", "Dairy", "ingredient", "L"),
    item(CO_A, "si-box", "BOX", "Pie Box", "Packaging", "packaging", "each"),
    item(CO_A, "si-yeast", "YEAST", "Dry Yeast", "Dry Goods", "ingredient", "kg", 99),
    item(CO_A, "si-salt", "SALT", "Fine Salt", "Dry Goods", "ingredient", "kg", 5),
    item(CO_A, "si-pie", "PIE-01", "Beef Pie", "Pies", "finished_goods", "each"),
    // Loaded straight into the Stock Master with no ledger movement (as an import or seed can do).
    { ...item(CO_A, "si-legacy", "LEGACY-01", "Legacy Sauce", "Sauces", "finished_goods", "each", 7), qty_on_hand: 30, inventory_value: 210 },
    item(CO_B, "si-b-secret", "B-SECRET", "Tenant B Secret Stock", "Secret", "ingredient", "kg"),
  ],
  vyron_cost_products: [],
  vyron_cost_stock_ledger: [],
  vyron_inventory_audit_log: [],
  vyron_inventory_settings: [],
  vyron_cost_stock_counts: [],
  vyron_cost_stock_count_lines: [],
  vyron_cost_low_stock_alerts: [],
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
const db = createFakeSupabase(seed(), { honourOrder: true });
globalThis.__VYRON_SESSION_TEST__.supabase = db;
globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;

const soh = await importFromRoot("src/lib/vyron-stock-on-hand.ts");
const view = await importFromRoot("src/lib/vyron-stock-on-hand-view.ts");
const rules = await importFromRoot("src/lib/vyron-stock-take-rules.ts");
const { postStockMovement, approveStockCount, postStockCount } = await importFromRoot("src/lib/vyron-inventory.ts");
const stockTake = await importFromRoot("src/lib/vyron-stock-take-import.ts");
const { readUploadedTable } = await importFromRoot("src/lib/vyron-upload-table.ts");
const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const sohRoute = await importFromRoot("src/app/api/inventory/stock-on-hand/route.ts");
const rows = (t) => db.tables[t] || [];

// ---------------------------------------------------------------------------
// The ledger, written by the real posting code. Each movement is then stamped as recorded on its
// own effective date (as it would have been, posted that day), except the stock take — posted today.
const move = async (co, stockItemId, movementType, movementDate, { qtyIn = 0, qtyOut = 0, unitCost = 0, allowNegative = false } = {}) => {
  const before = rows("vyron_cost_stock_ledger").length;
  await postStockMovement(db, { companyId: co, stockItemId, movementType, quantityIn: qtyIn, quantityOut: qtyOut, unitCost, movementDate, allowNegative, actor: "qa" });
  const row = rows("vyron_cost_stock_ledger")[before];
  row.created_at = movementDate;
};
// Times are UTC; SAST = UTC+2. 2026-09-30T21:59:59.999Z is the last instant of 30 Sep in SA.
await move(CO_A, "si-flour", "Purchase", "2026-09-01T08:00:00.000Z", { qtyIn: 100, unitCost: 10 });
await move(CO_A, "si-box", "Purchase", "2026-09-01T09:00:00.000Z", { qtyIn: 200, unitCost: 2 });
await move(CO_A, "si-milk", "Purchase", "2026-08-31T22:30:00.000Z", { qtyIn: 3, unitCost: 1 }); // 00:30 on 1 Sep SAST
await move(CO_A, "si-flour", "GRN Receipt", "2026-09-10T08:00:00.000Z", { qtyIn: 50, unitCost: 16 }); // avg (1000+800)/150 = 12
await move(CO_A, "si-flour", "Production Consumption", "2026-09-15T08:00:00.000Z", { qtyOut: 30 });
await move(CO_A, "si-pie", "Production Completion", "2026-09-15T12:00:00.000Z", { qtyIn: 40, unitCost: 25 });
await move(CO_A, "si-pie", "Customer Sale", "2026-09-16T10:00:00.000Z", { qtyOut: 10 });
await move(CO_A, "si-box", "Customer Sale", "2026-09-20T10:00:00.000Z", { qtyOut: 250, allowNegative: true }); // ledger −50; Stock Master floored at 0
await move(CO_A, "si-yeast", "Production Consumption", "2026-09-20T11:00:00.000Z", { qtyOut: 2, allowNegative: true }); // no receipt, no cost
await move(CO_A, "si-milk", "Purchase", "2026-09-30T21:59:59.999Z", { qtyIn: 7, unitCost: 1 }); // 23:59:59.999 on 30 Sep SAST
await move(CO_A, "si-milk", "Purchase", "2026-09-30T22:00:00.000Z", { qtyIn: 5, unitCost: 1 }); // 00:00 on 1 Oct SAST
await move(CO_A, "si-flour", "Purchase", "2026-10-05T08:00:00.000Z", { qtyIn: 20, unitCost: 20 }); // after 30 Sep
await move(CO_B, "si-b-secret", "Purchase", "2026-09-05T08:00:00.000Z", { qtyIn: 999, unitCost: 3 });

// Stock take for 30 Sep, uploaded and posted today: flour counted 118 against 120 as at 30 Sep.
const countTable = await readUploadedTable(enc("Item Code,Counted Quantity\nFLOUR,118\nBOX,10\n"), "count-30-sep.csv", "text/csv");
const { count } = await stockTake.createStockTakeFromUpload(db, CO_A, { table: countTable, sha256: countTable.sha256, fileName: "count-30-sep.csv", countDate: "2026-09-30" }, ACTOR);
await approveStockCount(db, CO_A, count.id, "QA Supervisor");
await postStockCount(db, CO_A, count.id, "QA Supervisor");
const today = rules.todayInSouthAfrica();
const report = (asAt, co = CO_A) => soh.getStockOnHandReport(db, co, asAt);
const line = (r, id) => r.lines.find((l) => l.stockItemId === id);

// ---------------------------------------------------------------------------
section("1. As-at date and the South African end-of-day cut-off");
{
  check("blank, non-ISO, impossible and future dates are refused", Boolean(soh.asAtDateProblem("", "2026-10-12")) && /not a date/.test(soh.asAtDateProblem("30/09/2026", "2026-10-12")) && /real calendar date/.test(soh.asAtDateProblem("2026-02-30", "2026-10-12")) && /in the future/.test(soh.asAtDateProblem("2026-10-13", "2026-10-12")) && soh.asAtDateProblem("2026-10-12", "2026-10-12") === null);
  const sep30 = await report("2026-09-30");
  const oct1 = await report("2026-10-01");
  check("cut-off is midnight at the end of the date, SA time (22:00 UTC)", sep30.cutoff === "2026-09-30T22:00:00.000Z");
  check("23:59:59.999 SAST on 30 Sep is in 30 Sep; 00:00 SAST on 1 Oct is not (milk 3 + 7 = 10, then 15)", line(sep30, "si-milk").qty === 10 && line(oct1, "si-milk").qty === 15, `${line(sep30, "si-milk").qty} / ${line(oct1, "si-milk").qty}`);
  const aug31 = await report("2026-08-31");
  check("00:30 SAST on 1 Sep (22:30 UTC on 31 Aug) is not in 31 Aug (nothing recorded by then: no balance)", line(aug31, "si-milk").qty === null && !aug31.historyAvailable && (await report("2026-09-01")).lines.find((l) => l.stockItemId === "si-milk").qty === 3);
  check("an invalid date is refused by the report itself", (await report("2026-13-01").catch((e) => e)) instanceof soh.StockOnHandError);
}

// ---------------------------------------------------------------------------
section("2. Receipts and issues before and after the date; production; stock take");
{
  const sep12 = await report("2026-09-12");
  check("12 Sep: flour 100 + 50 received = 150 at the averaged R12", line(sep12, "si-flour").qty === 150 && near(line(sep12, "si-flour").unitCost, 12) && line(sep12, "si-flour").value === 1800);
  check("12 Sep: the pie had not been produced (0, no movements)", line(sep12, "si-pie").qty === 0 && line(sep12, "si-pie").movementsToDate === 0);
  const sep29 = await report("2026-09-29");
  check("29 Sep: production consumption (−30) is in; the 30 Sep stock take is not: flour 120", line(sep29, "si-flour").qty === 120);
  check("29 Sep: production output 40 less 10 sold = 30 pies at R25", line(sep29, "si-pie").qty === 30 && near(line(sep29, "si-pie").unitCost, 25) && line(sep29, "si-pie").value === 750);
  const sep30 = await report("2026-09-30");
  const flour = line(sep30, "si-flour");
  check("30 Sep: the stock take adjustment (−2) applies on its Stock Take Date: flour 118", flour.qty === 118 && near(flour.unitCost, 12) && flour.value === 1416, JSON.stringify(flour));
  check("30 Sep: the receipt on 5 Oct is not included", flour.qty === 118);
  check("the stock take was posted today, after the date: disclosed as recorded later", flour.recordedLater === 1 && sep30.disclosures.some((d) => /recorded after it/.test(d.text)));
  const oct6 = await report("2026-10-06");
  check("6 Oct: the 5 Oct receipt re-averages the cost as it was posted, (120 × 12 + 20 × 20) / 140 = 13.1429; 138 after the count", line(oct6, "si-flour").qty === 138 && near(line(oct6, "si-flour").unitCost, 13.1429), JSON.stringify(line(oct6, "si-flour")));
}

// ---------------------------------------------------------------------------
section("3. Raw materials and finished goods; zero and negative balances; missing cost");
{
  const r = await report("2026-09-30");
  check("ingredients and packaging are raw materials; the pie is a finished good", ["si-flour", "si-milk", "si-box", "si-yeast", "si-salt"].every((id) => line(r, id).group === "raw_materials") && line(r, "si-pie").group === "finished_goods");
  const box = line(r, "si-box");
  check("issue beyond the balance: the ledger's −50 (−40 after the +10 count) is shown, not hidden or floored", box.qty === -40 && box.value === -80 && view.stockOnHandLineNotes(box).some((n) => /Negative ledger balance .* not proof of negative physical stock/.test(n)));
  check("…and the Stock Master's figure is reported beside it (10 counted on a floored 0: difference +50)", box.masterQty === 10 && box.masterDifference === 50 && r.reconciliation.itemsDifferingFromMaster === 3);
  const yeast = line(r, "si-yeast");
  check("an item with no costed movement is not valued — its current cost (R99) is not substituted", yeast.qty === -2 && yeast.unitCost === null && yeast.value === null && view.stockOnHandLineNotes(yeast).some((n) => /not valued/.test(n)));
  const salt = line(r, "si-salt");
  check("an item with no movements shows 0, flagged as nothing recorded, and is not valued at its R5 master cost", salt.qty === 0 && salt.unitCost === null && salt.movementsToDate === 0 && view.stockOnHandLineNotes(salt).includes("No movements recorded for this item by this date"));
  const raw = view.stockOnHandTotals(r.lines.filter((l) => l.group === "raw_materials"));
  const fg = view.stockOnHandTotals(r.lines.filter((l) => l.group === "finished_goods"));
  const all = view.stockOnHandTotals(r.lines);
  check("raw materials: positive R1,426 (flour 1,416 + milk 10), negative −R80, net R1,346; 2 negative, 1 not valued", raw.positiveValue === 1426 && raw.negativeValue === -80 && raw.netValue === 1346 && raw.negative === 2 && raw.unvalued === 1, JSON.stringify(raw));
  check("finished goods R750; combined net R2,096", fg.netValue === 750 && all.netValue === 2096 && all.items === 7);
  check("missing cost and negative balances are disclosed", r.disclosures.some((d) => /not valued/.test(d.text)) && r.disclosures.some((d) => /negative ledger balance.*not proof of negative physical stock/.test(d.text)));
}

// ---------------------------------------------------------------------------
section("4. Reconciliation and history coverage");
{
  const r = await report("2026-09-30");
  const direct = rows("vyron_cost_stock_ledger").filter((l) => l.company_id === CO_A && Date.parse(l.movement_date) < Date.parse("2026-09-30T22:00:00.000Z")).reduce((t, l) => t + Number(l.quantity_in) - Number(l.quantity_out), 0);
  check("item balances total equals the raw ledger movement total to the cut-off", r.reconciliation.reconciled && near(r.reconciliation.reportQtyTotal, direct) && near(r.reconciliation.movementQtyTotal, direct), `${r.reconciliation.reportQtyTotal} vs ${direct}`);
  const now = await report(today);
  const master = (id) => rows("vyron_cost_stock_items").find((i) => i.id === id);
  check("as at today, every item's ledger balance equals the Stock Master except where posting floored it at zero", now.lines.every((l) => (["si-box", "si-yeast", "si-legacy"].includes(l.stockItemId) ? l.masterDifference > 0 : l.qty === Number(master(l.stockItemId).qty_on_hand))));
  check("the floored items are explained by posting's zero floor; the directly loaded item is not explained by any movement", ["si-box", "si-yeast"].every((id) => line(now, id).masterDifferenceCause === "zero_floor") && line(now, "si-legacy").masterDifferenceCause === "unrecorded" && line(now, "si-legacy").qty === 0 && line(now, "si-legacy").masterDifference === 30 && now.lines.filter((l) => !["si-box", "si-yeast", "si-legacy"].includes(l.stockItemId)).every((l) => l.masterDifferenceCause === null));
  check("each cause gets its own disclosure, from the data", now.disclosures.some((d) => /^2 item\(s\) differ from the Stock Master because, when an issue exceeded the balance, posting set the Stock Master to zero/.test(d.text)) && now.disclosures.some((d) => /^1 item\(s\) have a Stock Master quantity that no ledger movement explains/.test(d.text)));
  check("the directly loaded item is not valued at its Stock Master cost and keeps showing under 'hide zero'", line(now, "si-legacy").unitCost === null && line(now, "si-legacy").value === null && view.filterStockOnHandLines(now.lines, { hideZero: true }).some((l) => l.stockItemId === "si-legacy") && view.stockOnHandLineNotes(line(now, "si-legacy")).some((n) => /not explained by any ledger movement/.test(n)));
  check("as at today, the replayed ledger cost equals the Stock Master's average cost for every costed item", now.reconciliation.costChecked && now.reconciliation.itemsCostDiffersFromMaster === 0 && now.lines.filter((l) => l.unitCost !== null).every((l) => near(l.unitCost, Number(master(l.stockItemId).average_cost), 1e-4)));
  const before = await report("2026-08-31");
  check("before the ledger starts: no balance is stated (null, not 0) and a critical warning explains why", !before.historyAvailable && before.lines.every((l) => l.qty === null && l.value === null && l.unitCost === null) && before.disclosures.length === 1 && before.disclosures[0].level === "critical" && before.disclosures.some((d) => /starts on 2026-09-01\. Stock held before then was never recorded/.test(d.text)), before.disclosures.map((d) => d.text).join(" | "));
  check("the first movement date is reported", r.firstMovementDate === "2026-08-31T22:30:00.000Z");
}

// ---------------------------------------------------------------------------
section("4b. Ledger balance versus verified physical count");
{
  const r = await report("2026-09-30");
  const flour = line(r, "si-flour");
  const box = line(r, "si-box");
  check("the 30 Sep count verifies flour on 30 Sep: count 118 = ledger 118", flour.verifiedQty === 118 && flour.qty === 118 && flour.lastCount?.date === "2026-09-30");
  check("the box count (10) is shown beside its ledger balance (−40), never in place of it", box.verifiedQty === 10 && box.qty === -40 && view.stockOnHandLineNotes(box).includes("Physical count on this date found 10"));
  check("uncounted items have no verified quantity", ["si-milk", "si-pie", "si-yeast", "si-salt", "si-legacy"].every((id) => line(r, id).verifiedQty === null));
  check("reconciliation counts 2 verified items, 1 differing from the ledger, and says so", r.reconciliation.itemsVerified === 2 && r.reconciliation.itemsVerifiedDiffering === 1 && r.disclosures.some((d) => /counted on 2026-09-30 have a ledger balance different from the posted count/.test(d.text)));
  check("the basis note says balances are reconstructed, not physical, and how many were verified", r.disclosures.some((d) => d.kind === "basis" && /not what was physically on hand/.test(d.text) && /2 item\(s\) were verified by a posted physical count/.test(d.text)));
  const oct6 = await report("2026-10-06");
  check("on a later date the count is the last count, not a verification of that date", line(oct6, "si-flour").verifiedQty === null && line(oct6, "si-flour").lastCount?.date === "2026-09-30" && oct6.disclosures.some((d) => /No posted physical count is dated 2026-10-06/.test(d.text)));
  const sep29 = await report("2026-09-29");
  check("before the count date the count is not used at all", line(sep29, "si-flour").lastCount === null && line(sep29, "si-flour").verifiedQty === null);
  const summary = view.stockOnHandSummary(r, r.lines);
  check("every export opens with the as-at date and the basis", summary[0].label === "As At" && /End of 2026-09-30 \(South African time\)/.test(summary[0].value) && summary[1].label === "Basis" && /not a physical count/.test(summary[1].value));
  check("the summary carries the combined net, positive and negative values", summary.some((m) => m.label === "Combined Net Ledger Value" && /^R2\D096\D00$/.test(m.value)) && summary.some((m) => m.label === "Positive Balances Value" && /^R2\D176\D00$/.test(m.value)) && summary.some((m) => m.label === "Negative Balances Value" && /^R-80\D00$/.test(m.value)), JSON.stringify(summary));
  const table = view.stockOnHandExportTable(r.lines);
  check("export columns separate the reconstructed ledger balance, the verified count and the last count", table.columns.map((c) => c.label).join("|").includes("Ledger Balance (Reconstructed)|Verified Physical Count (This Date)") && table.rows.find((row) => row[1] === "BOX")[6] === "10" && /2026-09-30: 10/.test(table.rows.find((row) => row[1] === "BOX")[9]));
  const before = await report("2026-08-31");
  const beforeTable = view.stockOnHandExportTable(before.lines);
  check("before the ledger starts the export says 'History unavailable' and 'Not established' — never 0", beforeTable.rows.filter((row) => !/total$/i.test(row[0])).every((row) => row[5] === "History unavailable" && row[8] === "History unavailable") && beforeTable.rows[beforeTable.rows.length - 1][8] === "Not established");
  check("…and its summary says the value is not established", view.stockOnHandSummary(before, before.lines).some((m) => /Not established/.test(m.value)) && view.stockOnHandTotals(before.lines).historyUnavailable === 7);
  check("hiding zero balances never hides an unavailable balance", view.filterStockOnHandLines(before.lines, { hideZero: true }).length === 7);
}

// ---------------------------------------------------------------------------
section("5. Filters and export totals match the report");
{
  const r = await report("2026-09-30");
  const dry = view.filterStockOnHandLines(r.lines, { category: "Dry Goods" });
  check("category filter: Dry Goods only (flour, yeast, salt)", dry.map((l) => l.itemCode).sort().join(",") === "FLOUR,SALT,YEAST");
  check("search matches code or description", view.filterStockOnHandLines(r.lines, { search: "beef" }).map((l) => l.itemCode).join(",") === "PIE-01");
  check("group filter: finished goods only", view.filterStockOnHandLines(r.lines, { group: "finished_goods" }).every((l) => l.group === "finished_goods"));
  check("hiding zero balances drops salt but keeps negatives and floored items", view.filterStockOnHandLines(r.lines, { hideZero: true }).every((l) => l.itemCode !== "SALT") && view.filterStockOnHandLines(r.lines, { hideZero: true }).some((l) => l.itemCode === "BOX"));
  const table = view.stockOnHandExportTable(r.lines);
  const itemRows = table.rows.filter((row) => !/total$/i.test(row[0]));
  const sumValues = itemRows.filter((row) => row[8] !== "Not available").reduce((t, row) => t + Number(row[8]), 0);
  const combined = table.rows[table.rows.length - 1];
  const sectionTotal = (label) => Number(table.rows.find((row) => row[0] === label)[8]);
  check("export subtotals: ingredients R1,426 (flour, milk; yeast unvalued), packaging −R80, raw materials R1,346, finished goods R750", sectionTotal("Raw Materials — Ingredients total") === 1426 && sectionTotal("Raw Materials — Packaging total") === -80 && sectionTotal("Raw Materials total") === 1346 && sectionTotal("Finished Goods total") === 750);
  check("each item row names its section (packaging separate from ingredients)", table.rows.find((row) => row[1] === "BOX")[0] === "Raw Materials — Packaging" && table.rows.find((row) => row[1] === "FLOUR")[0] === "Raw Materials — Ingredients" && table.rows.find((row) => row[1] === "PIE-01")[0] === "Finished Goods");
  check("export: one row per item, each group followed by its total, then the combined total", itemRows.length === r.lines.length && table.rows.filter((row) => /total$/i.test(row[0])).map((row) => row[0]).join("|") === "Raw Materials — Ingredients total|Raw Materials — Packaging total|Raw Materials total|Finished Goods total|Combined total");
  check("export combined total equals the screen's net value and the sum of exported line values", combined[8] === "2096.00" && Math.abs(sumValues - 2096) < 0.005 && table.totals.netValue === view.stockOnHandTotals(r.lines).netValue);
  check("export shows 'Not available' (never a number) for an unvalued item", itemRows.find((row) => row[1] === "YEAST")[8] === "Not available" && itemRows.find((row) => row[1] === "YEAST")[5] === "-2");
  const dryTable = view.stockOnHandExportTable(dry);
  check("a filtered export holds only the filtered rows and their totals", dryTable.rows.filter((row) => !/total$/i.test(row[0])).length === 3 && dryTable.totals.netValue === view.stockOnHandTotals(dry).netValue);
}

// ---------------------------------------------------------------------------
section("6. Tenant isolation and permission (real route, real sign-in)");
{
  const quiet = async (fn) => {
    const saved = { log: console.log, info: console.info, warn: console.warn };
    console.log = console.info = console.warn = () => {};
    try { return await fn(); } finally { Object.assign(console, saved); }
  };
  const login = async (email, password) => {
    globalThis.__VYRON_SESSION_TEST__.cookies = new Map();
    const res = await quiet(() => loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } })));
    return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  };
  const get = async (jar, query) => {
    globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {}));
    const res = await quiet(() => sohRoute.GET(new NextRequest(new URL(`/api/inventory/stock-on-hand${query}`, "http://qa.local"))));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const jarA = await login("inventory@qa-a.test", "qa-pass-inv");
  const jarDenied = await login("denied@qa-a.test", "qa-pass-denied");
  const jarB = await login("inventory@qa-b.test", "qa-pass-b");
  check("synthetic members sign in through the real login route", [jarA, jarDenied, jarB].every((j) => Boolean(j.vyron_workspace_user_session)));
  const anon = await get({}, "?asAt=2026-09-30");
  check("anonymous request is refused (401/403)", anon.status === 401 || anon.status === 403, String(anon.status));
  const denied = await get(jarDenied, "?asAt=2026-09-30");
  check("a member without inventory.view is refused (403)", denied.status === 403, String(denied.status));
  const a = await get(jarA, "?asAt=2026-09-30");
  check("company A sees only its own items", a.status === 200 && a.json.report.lines.length === 7 && !a.json.report.lines.some((l) => l.itemCode === "B-SECRET"));
  const b = await get(jarB, "?asAt=2026-09-30");
  check("company B sees only its own stock (999 at R3)", b.status === 200 && b.json.report.lines.length === 1 && b.json.report.lines[0].qty === 999 && b.json.report.lines[0].value === 2997);
  const spoof = await get(jarA, `?asAt=2026-09-30&companyId=${CO_B}&company_id=${CO_B}`);
  check("a client-supplied company id is ignored: company A still gets only its own stock", spoof.status === 200 && spoof.json.report.lines.length === 7 && !spoof.json.report.lines.some((l) => l.itemCode === "B-SECRET"));
  const { readFileSync } = await import("node:fs");
  const client = readFileSync(path.join(ROOT, "src/components/vyron-cost/inventory/StockOnHandReportClient.tsx"), "utf8");
  const hooks = readFileSync(path.join(ROOT, "src/hooks/useModulePermissions.ts"), "utf8");
  check("exports are offered only with reports.export (the shared report convention)", /getExportPayload=\{canExport && report \? getExportPayload : undefined\}/.test(client) && /const \{ canExport \} = useReportsPermissions\(\)/.test(client) && /canExport: can\("reports\.export"\)/.test(hooks));
  check("the PDF export asks for a landscape page (eleven columns)", /pdfOrientation: "landscape"/.test(client));
  const pdfLib = readFileSync(path.join(ROOT, "src/lib/vyron-report-pdf-export.ts"), "utf8");
  check("the shared PDF exporter keeps every other report's portrait layout (210 mm header, x 110 / 190) unless landscape is asked for", /payload\.pdfOrientation === "landscape" \? doc\.internal\.pageSize\.getWidth\(\) : 210/.test(pdfLib) && /payload\.pdfOrientation === "landscape" \? doc\.internal\.pageSize\.getWidth\(\) - 20 : 190/.test(pdfLib) && /pageWidth - 100, 30/.test(pdfLib));
  check("the screen's data comes only from the permission-checked route", (client.match(/fetch\(/g) || []).length === 1 && client.includes("/api/inventory/stock-on-hand?asAt="));
  check("a bad or future date is a 400 with the reason", (await get(jarA, "?asAt=2026-02-30")).status === 400 && (await get(jarA, "?asAt=2999-01-01")).status === 400);
  // A ledger row that claims company A but points at company B's item is excluded and disclosed.
  db.tables.vyron_cost_stock_ledger.push({ id: "stray", company_id: CO_A, stock_item_id: "si-b-secret", movement_date: "2026-09-05T08:00:00.000Z", created_at: "2026-09-05T08:00:00.000Z", movement_type: "Purchase", quantity_in: 5, quantity_out: 0, unit_cost: 1 });
  const stray = await report("2026-09-30");
  check("a ledger row for another company's item is excluded and disclosed", stray.reconciliation.unknownItemRows === 1 && stray.lines.length === 7 && stray.disclosures.some((d) => /not in this company's Stock Master/.test(d.text)));
  db.tables.vyron_cost_stock_ledger = db.tables.vyron_cost_stock_ledger.filter((l) => l.id !== "stray");
}

// ---------------------------------------------------------------------------
section("7. The report writes nothing");
{
  const snapshot = JSON.stringify(db.tables);
  await report("2026-09-30");
  await report(today);
  check("building reports leaves every table unchanged", JSON.stringify(db.tables) === snapshot);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
