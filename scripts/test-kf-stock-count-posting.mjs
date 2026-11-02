#!/usr/bin/env node
/**
 * VYRON — stock-take posting recalculates the variance at posting time and
 * posts once (Kingdom Foods, 2026-11).
 *
 * The variance used to be the figure stored when the file was uploaded. A
 * delivery, issue or production run between upload and posting was then either
 * adjusted away or doubled, and a second click could post the count twice.
 *
 * Real postStockCount / postStockMovement against an in-memory database.
 *
 *   npm run test:kf-stock-count-posting
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-stock-count";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const CO = "aaaa0000-0000-4000-8000-000000000001";
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { postStockCount, postStockMovement } = await importFromRoot("src/lib/vyron-inventory.ts");
const { stockTakeEffectiveAt } = await importFromRoot("src/lib/vyron-stock-take-rules.ts");

const stockItem = (id, qty) => ({ id, company_id: CO, entity_type: "ingredient", entity_id: `ing-${id}`, item_code: id.toUpperCase(), description: id, unit: "kg", qty_on_hand: qty, average_cost: 10, current_cost: 10, reorder_level: 0, min_level: 0, max_level: 0 });
/** A stock take uploaded on 31 Oct: counted 100 when the system said 90 (variance +10 stored). */
function seed(extra = {}) {
  return {
    vyron_cost_stock_items: [stockItem("si-flour", 90)],
    vyron_cost_stock_ledger: [],
    vyron_cost_stock_counts: [{ id: "count-1", company_id: CO, count_number: "ST-001", count_date: "2026-10-31", count_type: "upload", status: "Approved", created_at: "2026-10-31T15:00:00Z" }],
    vyron_cost_stock_count_lines: [{ id: "line-1", stock_count_id: "count-1", company_id: CO, stock_item_id: "si-flour", item_name: "Flour", counted_qty: 100, system_qty: 90, variance_qty: 10, unit_cost: 10 }],
    vyron_inventory_settings: [],
    vyron_cost_inventory_audit: [],
    vyron_inventory_audit_log: [],
    ...extra,
  };
}
const quiet = async (fn) => {
  const saved = { warn: console.warn, log: console.log };
  console.warn = console.log = () => {};
  try { return await fn(); } finally { Object.assign(console, saved); }
};
const item = (db) => db.tables.vyron_cost_stock_items.find((s) => s.id === "si-flour");
const countMoves = (db) => db.tables.vyron_cost_stock_ledger.filter((m) => m.reference_type === "stock_count");
const effective = stockTakeEffectiveAt("2026-10-31");

console.log("\n1. A delivery AFTER the stock take date, posted between upload and posting");
{
  const db = createFakeSupabase(seed());
  await quiet(() => postStockMovement(db, { companyId: CO, stockItemId: "si-flour", movementType: "GRN Receipt", quantityIn: 50, unitCost: 10, referenceType: "goods_receipt", movementDate: "2026-11-01T08:00:00.000Z", actor: "QA" }));
  check("before posting: 140 on hand (90 + delivery 50)", Number(item(db).qty_on_hand) === 140);
  await quiet(() => postStockCount(db, CO, "count-1", "QA supervisor"));
  check("posting keeps the delivery: 100 counted + 50 delivered since = 150 (the stored +10 would also give 150 here)", Number(item(db).qty_on_hand) === 150, String(item(db).qty_on_hand));
  check("the line records what was posted: system 90 at the count, variance +10", Number(db.tables.vyron_cost_stock_count_lines[0].system_qty) === 90 && Number(db.tables.vyron_cost_stock_count_lines[0].variance_qty) === 10);
}

console.log("\n2. A backdated issue (dated BEFORE the stock take date) entered after the upload");
{
  const db = createFakeSupabase(seed());
  // 5 kg issued on 30 Oct but only captured on 1 Nov: the count of 100 already reflects it.
  await quiet(() => postStockMovement(db, { companyId: CO, stockItemId: "si-flour", movementType: "Issue", quantityOut: 5, unitCost: 10, referenceType: "manual", movementDate: "2026-10-30T12:00:00.000Z", actor: "QA" }));
  check("before posting: 85 on hand", Number(item(db).qty_on_hand) === 85);
  await quiet(() => postStockCount(db, CO, "count-1", "QA supervisor"));
  const move = countMoves(db)[0];
  check("the variance is recalculated to +15 (stored upload figure was +10)", move && Number(move.quantity_in) === 15, JSON.stringify(move));
  check("stock ends at the counted 100 — the stored variance would have left 95", Number(item(db).qty_on_hand) === 100, String(item(db).qty_on_hand));
  check("the movement is dated on the stock take date and records both variances", move.movement_date === effective && move.metadata?.uploadedVariance === 10 && move.metadata?.systemQtyAtCount === 85, JSON.stringify(move));
  const audit = [...(db.tables.vyron_inventory_audit_log || []), ...(db.tables.vyron_cost_inventory_audit || [])].find((a) => a.event_type === "Stock Count Posted");
  check("the audit says a line was recalculated because stock moved", audit && /1 line\(s\) recalculated/.test(audit.detail || "") && audit.metadata?.recalculatedLines?.length === 1, JSON.stringify(audit));
}

console.log("\n3. Posted once");
{
  const db = createFakeSupabase(seed());
  await quiet(() => postStockCount(db, CO, "count-1", "QA supervisor"));
  let second = null;
  try { await postStockCount(db, CO, "count-1", "QA supervisor"); } catch (e) { second = e; }
  check("posting a posted count again is refused", second && /already been posted/.test(second.message), String(second));
  check("…and there is exactly one adjustment, stock at 100", countMoves(db).length === 1 && Number(item(db).qty_on_hand) === 100);

  const db2 = createFakeSupabase(seed());
  const results = await quiet(() => Promise.allSettled([postStockCount(db2, CO, "count-1", "A"), postStockCount(db2, CO, "count-1", "B")]));
  check("two simultaneous posts: one succeeds, one is refused", results.filter((r) => r.status === "fulfilled").length === 1 && results.filter((r) => r.status === "rejected").length === 1, JSON.stringify(results.map((r) => r.status)));
  check("…one adjustment only, stock at 100", countMoves(db2).length === 1 && Number(item(db2).qty_on_hand) === 100, `${countMoves(db2).length} ${item(db2).qty_on_hand}`);
}

console.log("\n4. A retry after a failure part-way through");
{
  const db = createFakeSupabase(seed({
    vyron_cost_stock_items: [stockItem("si-flour", 100), stockItem("si-sugar", 40)],
    vyron_cost_stock_count_lines: [
      { id: "line-1", stock_count_id: "count-1", company_id: CO, stock_item_id: "si-flour", item_name: "Flour", counted_qty: 100, system_qty: 90, variance_qty: 10, unit_cost: 10 },
      { id: "line-2", stock_count_id: "count-1", company_id: CO, stock_item_id: "si-sugar", item_name: "Sugar", counted_qty: 30, system_qty: 40, variance_qty: -10, unit_cost: 5 },
    ],
    // Flour's adjustment was already posted before the failure.
    vyron_cost_stock_ledger: [{ id: "led-1", company_id: CO, stock_item_id: "si-flour", movement_type: "Stock Count Variance", quantity_in: 10, quantity_out: 0, reference_type: "stock_count", reference_id: "count-1", movement_date: effective }],
  }));
  await quiet(() => postStockCount(db, CO, "count-1", "QA supervisor"));
  const flourMoves = countMoves(db).filter((m) => m.stock_item_id === "si-flour");
  const sugar = db.tables.vyron_cost_stock_items.find((s) => s.id === "si-sugar");
  check("the already-posted line is not posted again", flourMoves.length === 1 && Number(item(db).qty_on_hand) === 100);
  check("the remaining line is posted (Sugar 40 → 30)", Number(sugar.qty_on_hand) === 30);
  check("the count ends Posted", db.tables.vyron_cost_stock_counts[0].status === "Posted");
}

console.log("\n5. Only an approved count of this company posts");
{
  const db = createFakeSupabase(seed());
  db.tables.vyron_cost_stock_counts[0].status = "Submitted";
  let e1 = null;
  try { await postStockCount(db, CO, "count-1"); } catch (e) { e1 = e; }
  let e2 = null;
  const db2 = createFakeSupabase(seed());
  try { await postStockCount(db2, "bbbb0000-0000-4000-8000-000000000001", "count-1"); } catch (e) { e2 = e; }
  check("an unapproved count is refused, nothing moves", e1 && /must be approved/.test(e1.message) && countMoves(db).length === 0);
  check("another company cannot post it", e2 && countMoves(db2).length === 0 && db2.tables.vyron_cost_stock_counts[0].status === "Approved", String(e2));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
