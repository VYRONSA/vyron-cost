#!/usr/bin/env node
/**
 * VYRON — Manufacture Run reversal: PostgreSQL integration tests (Phase 32).
 *
 * Runs the real reverse_production_run() RPC (from the repo migration) against
 * an ISOLATED, disposable PostgreSQL — never production. Proves the properties
 * the in-memory harness cannot: true single-transaction atomicity (ZERO rows
 * committed on a forced mid-transaction failure) and real concurrency (two
 * simultaneous reversals, exactly one succeeds).
 *
 * Requires a throwaway Postgres and the `pg` driver:
 *   docker run -d --rm --name vyron-mr-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=vyrontest -p 55432:5432 postgres:16-alpine
 *   npm install pg --no-save
 *   PGURL=postgres://postgres:test@127.0.0.1:55432/vyrontest node scripts/test-manufacture-reversal-pg.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PGURL = process.env.PGURL || "postgres://postgres:test@127.0.0.1:55432/vyrontest";
const MIGRATION = path.join(ROOT, "src/supabase/migrations/20260915120000_manufacture_reversal_transactional.sql");

let failures = 0, checks = 0;
const check = (name, cond, detail = "") => { checks++; if (cond) { console.log(`  ok   ${name}`); } else { failures++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); } };

const CO = "11111111-1111-4111-8111-111111111111";
const CO_B = "22222222-2222-4222-8222-222222222222";
const RUN = "33333333-3333-4333-8333-333333333333";
const PRODUCT = "44444444-4444-4444-8444-444444444444";
const FG_ITEM = "55555555-5555-4555-8555-555555555555";
const N = 13;                 // components
const FG_QTY = 10;            // produced
const FG_COST = 42.5;
const PREV_PRODUCT_COST = 8.25;   // product.total_cost before the run
const POST_PRODUCT_COST = 9.10;   // product.total_cost the run set on completion
const comp = (i) => ({ ing: `aaaa0000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, si: `bbbb0000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, onHand: 100 + i, consumed: 2 + i, cost: 5 + i });

const SCHEMA = `
drop table if exists vyron_cost_production_audit_log, vyron_cost_stock_ledger, vyron_cost_inventory_transactions, vyron_cost_stock_items, vyron_cost_production_runs, vyron_cost_products cascade;
create table vyron_cost_products (id uuid primary key, company_id uuid, total_cost numeric default 0, updated_at timestamptz default now());
create table vyron_cost_production_runs (id uuid primary key, company_id uuid not null, run_number text not null, status text not null default 'Planned', product_id uuid, actual_qty numeric not null default 0, cost_per_unit numeric not null default 0, actual_cost numeric not null default 0, updated_at timestamptz not null default now());
create table vyron_cost_stock_items (id uuid primary key, company_id uuid not null, item_code text not null default 'X', description text not null default 'X', entity_type text not null, entity_id uuid, qty_on_hand numeric not null default 0, average_cost numeric not null default 0, current_cost numeric not null default 0, inventory_value numeric not null default 0, last_movement_at timestamptz, updated_at timestamptz not null default now());
create table vyron_cost_inventory_transactions (id uuid primary key default gen_random_uuid(), company_id uuid not null, transaction_number text not null, transaction_type text not null, entity_type text not null, entity_id uuid, stock_item_id uuid, quantity numeric not null default 0, unit_cost numeric not null default 0, total_cost numeric not null default 0, reference_type text, reference_id uuid, notes text, created_by text, created_at timestamptz not null default now());
create table vyron_cost_stock_ledger (id uuid primary key default gen_random_uuid(), company_id uuid not null, stock_item_id uuid not null, movement_date timestamptz not null default now(), movement_type text not null, quantity_in numeric not null default 0, quantity_out numeric not null default 0, balance_after numeric not null default 0, unit_cost numeric not null default 0, value numeric not null default 0, reference_type text, reference_id uuid, reference_label text, actor text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table vyron_cost_production_audit_log (id uuid primary key default gen_random_uuid(), company_id uuid not null, production_run_id uuid, event_type text not null, actor text, field_name text, old_value text, new_value text, detail text, created_at timestamptz not null default now());
`;

async function seed(db, { fgOnHand = FG_QTY, downstream = 0, downstreamType = "Consumption", brokenComponentIndex = null } = {}) {
  await db.query("truncate vyron_cost_production_audit_log, vyron_cost_stock_ledger, vyron_cost_inventory_transactions, vyron_cost_stock_items, vyron_cost_production_runs, vyron_cost_products");
  await db.query("insert into vyron_cost_products(id,company_id,total_cost) values ($1,$2,$3)", [PRODUCT, CO, POST_PRODUCT_COST]);
  await db.query("insert into vyron_cost_production_runs(id,company_id,run_number,status,product_id,actual_qty,cost_per_unit,actual_cost,previous_product_total_cost) values ($1,$2,'MR-000123','Completed',$3,$4,$5,425,$6)",
    [RUN, CO, PRODUCT, FG_QTY, FG_COST, PREV_PRODUCT_COST]);
  await db.query("insert into vyron_cost_stock_items(id,company_id,entity_type,entity_id,qty_on_hand,average_cost,current_cost) values ($1,$2,'finished_goods',$3,$4,$5,$5)", [FG_ITEM, CO, PRODUCT, fgOnHand, FG_COST]);
  for (let i = 0; i < N; i++) {
    const c = comp(i);
    await db.query("insert into vyron_cost_stock_items(id,company_id,entity_type,entity_id,qty_on_hand,average_cost,current_cost) values ($1,$2,'ingredient',$3,$4,$5,$5)", [c.si, CO, c.ing, c.onHand, c.cost]);
    const siRef = brokenComponentIndex === i ? "cccc0000-0000-4000-8000-000000000099" : c.si;
    await db.query("insert into vyron_cost_inventory_transactions(company_id,transaction_number,transaction_type,entity_type,entity_id,stock_item_id,quantity,unit_cost,total_cost,reference_type,reference_id,created_by) values ($1,$2,'Consumption','ingredient',$3,$4,$5,$6,$7,'production_run',$8,'user')",
      [CO, `IT-C${i}`, c.ing, siRef, c.consumed, c.cost, c.consumed * c.cost, RUN]);
  }
  await db.query("insert into vyron_cost_inventory_transactions(company_id,transaction_number,transaction_type,entity_type,entity_id,stock_item_id,quantity,unit_cost,total_cost,reference_type,reference_id,created_by) values ($1,'IT-R0','Receipt','finished_goods',$2,$3,$4,$5,$6,'production_run',$7,'user')",
    [CO, PRODUCT, FG_ITEM, FG_QTY, FG_COST, FG_QTY * FG_COST, RUN]);
  for (let d = 0; d < downstream; d++) {
    await db.query("insert into vyron_cost_inventory_transactions(company_id,transaction_number,transaction_type,entity_type,entity_id,stock_item_id,quantity,unit_cost,total_cost,reference_type,reference_id,created_by) values ($1,$2,$3,'finished_goods',$4,$5,1,$6,$6,'downstream_doc',$7,'user')",
      [CO, `IT-D${d}`, downstreamType, PRODUCT, FG_ITEM, FG_COST, randomUUID()]);
  }
}

const rpc = (db, { company = CO, run = RUN, reason = "Incorrect quantity — should have been 8, not 10", actor = "supervisor-uuid" } = {}) =>
  db.query("select public.reverse_production_run($1,$2,$3,$4) as r", [company, run, reason, actor]).then((x) => x.rows[0].r);
const qty = async (db, id) => Number((await db.query("select qty_on_hand from vyron_cost_stock_items where id=$1", [id])).rows[0].qty_on_hand);
const cnt = async (db, sql, args = []) => Number((await db.query(sql, args)).rows[0].c);
const productCost = async (db) => Number((await db.query("select total_cost from vyron_cost_products where id=$1", [PRODUCT])).rows[0].total_cost);
const runStatus = async (db) => (await db.query("select status from vyron_cost_production_runs where id=$1", [RUN])).rows[0].status;

const admin = new pg.Client(PGURL);
await admin.connect();
await admin.query(SCHEMA);
await admin.query(readFileSync(MIGRATION, "utf8"));
console.log("schema + migration applied to isolated Postgres\n");

/* ─── happy path ──────────────────────────────────────────────────────────── */
{
  await seed(admin);
  const before = []; for (let i = 0; i < N; i++) before.push(await qty(admin, comp(i).si));
  const res = await rpc(admin);
  check("1. successful reversal returns status reversed", res.status === "reversed", JSON.stringify(res));
  let ok2 = true; for (let i = 0; i < N; i++) if (Math.abs(await qty(admin, comp(i).si) - (before[i] + comp(i).consumed)) > 1e-6) ok2 = false;
  check("2. exact raw-material restoration (all 13 components)", ok2);
  check("3. exact finished-good reversal (10 -> 0)", (await qty(admin, FG_ITEM)) === 0);
  check("4. exact original-transaction mapping (14 reversal txns)", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 14);
  check("9. product.total_cost restored to the pre-manufacture snapshot (8.25)", (await productCost(admin)) === PREV_PRODUCT_COST, String(await productCost(admin)));
  check("23. audit record complete", await cnt(admin, "select count(*) c from vyron_cost_production_audit_log where event_type='Production Reversed'") === 1);
  const audit = (await admin.query("select detail from vyron_cost_production_audit_log where event_type='Production Reversed'")).rows[0].detail;
  const ad = JSON.parse(audit);
  check("23b. audit carries prev/restored cost, reason, txn ids", ad.previousProductCost === PREV_PRODUCT_COST && ad.restoredProductCost === PREV_PRODUCT_COST && ad.reason.length > 5 && ad.originalTransactionIds.length === 14 && ad.reversalTransactionIds.length === 14);
  check("26. original transactions remain unchanged (14)", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run'") === 14);
  check("27. reversal transactions linked to originals (notes)", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal' and notes like '%original_transaction_id%'") === 14);
  check("28. status Completed -> Reversed", (await runStatus(admin)) === "Reversed");
}

/* ─── ATOMICITY: forced mid-transaction failure -> ZERO committed (#7) ──────── */
{
  await seed(admin, { brokenComponentIndex: 6 }); // one consumption points at a missing stock item
  const before = []; for (let i = 0; i < N; i++) before.push(await qty(admin, comp(i).si));
  const fgBefore = await qty(admin, FG_ITEM);
  const costBefore = await productCost(admin);
  let threw = false; try { await rpc(admin); } catch { threw = true; }
  check("6. a forced mid-transaction failure raises", threw);
  check("7. ZERO reversal inventory transactions committed after forced failure", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 0);
  check("7b. ZERO reversal stock-ledger rows committed after forced failure", await cnt(admin, "select count(*) c from vyron_cost_stock_ledger where reference_type='production_run_reversal'") === 0);
  check("8. run remains Completed after forced failure", (await runStatus(admin)) === "Completed");
  let unchanged = Math.abs((await qty(admin, FG_ITEM)) - fgBefore) < 1e-9; for (let i = 0; i < N; i++) if (Math.abs(await qty(admin, comp(i).si) - before[i]) > 1e-9) unchanged = false;
  check("31. ALL stock quantities unchanged after rollback", unchanged);
  check("31b. product cost unchanged after rollback", (await productCost(admin)) === costBefore);
  check("23c. NO audit record for the failed attempt", await cnt(admin, "select count(*) c from vyron_cost_production_audit_log where event_type='Production Reversed'") === 0);
}

/* ─── snapshot correctness & BOM/cost independence ─────────────────────────── */
{
  await seed(admin);
  check("30. completion-time snapshot present and correct (8.25) with current cost 9.10", Number((await admin.query("select previous_product_total_cost p from vyron_cost_production_runs where id=$1", [RUN])).rows[0].p) === PREV_PRODUCT_COST && (await productCost(admin)) === POST_PRODUCT_COST);
  // Change "current BOM" / product cost AFTER the run; reversal must ignore them.
  await admin.query("update vyron_cost_products set total_cost=999 where id=$1", [PRODUCT]);
  await admin.query("update vyron_cost_stock_items set current_cost=999, average_cost=999 where entity_type='ingredient'");
  const before = []; for (let i = 0; i < N; i++) before.push(await qty(admin, comp(i).si));
  const res = await rpc(admin);
  let ok = true; for (let i = 0; i < N; i++) if (Math.abs(await qty(admin, comp(i).si) - (before[i] + comp(i).consumed)) > 1e-6) ok = false;
  check("10/11. changed BOM / current cost does NOT affect the reversal quantities", ok);
  check("11b. reversal restores product cost to the SNAPSHOT (8.25), not the changed 999", (await productCost(admin)) === PREV_PRODUCT_COST);
  const revCosts = (await admin.query("select distinct unit_cost from vyron_cost_inventory_transactions where reference_type='production_run_reversal' and transaction_type='Receipt'")).rows.map((r) => Number(r.unit_cost));
  check("11c. compensating receipts use ORIGINAL snapshot costs, never 999", !revCosts.includes(999));
}

/* ─── downstream + insufficient stock blocks (before any write) ─────────────── */
for (const [label, type] of [["sale/issue", "Issue"], ["transfer", "Transfer"], ["manufacture consumption", "Consumption"], ["adjustment/write-off", "Adjustment"]]) {
  await seed(admin, { fgOnHand: 3, downstream: 7, downstreamType: type });
  const res = await rpc(admin);
  check(`12-15. downstream ${label} blocks with produced/available/shortfall, no writes`, res.status === "blocked" && Number(res.produced) === 10 && Number(res.available) === 3 && Number(res.shortfall) === 7 && Number(res.downstreamIssues) === 7 && await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 0);
}
{
  await seed(admin, { fgOnHand: 4 }); // simple insufficient stock, no explicit downstream rows
  const res = await rpc(admin);
  check("16. insufficient finished stock blocks before any write", res.status === "blocked" && Number(res.shortfall) === 6 && await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 0);
  check("16b. run stays Completed when blocked", (await runStatus(admin)) === "Completed");
}

/* ─── idempotency (sequential) ─────────────────────────────────────────────── */
{
  await seed(admin);
  await rpc(admin);
  const res2 = await rpc(admin);
  check("17. sequential duplicate reversal is a safe no-op (already_reversed)", res2.status === "already_reversed");
  check("19. exactly one successful reversal set (14 txns, one audit)", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 14 && await cnt(admin, "select count(*) c from vyron_cost_production_audit_log where event_type='Production Reversed'") === 1);
}

/* ─── CONCURRENCY: two simultaneous reversals, exactly one wins (#18) ───────── */
{
  await seed(admin);
  const a = new pg.Client(PGURL), b = new pg.Client(PGURL);
  await a.connect(); await b.connect();
  const [ra, rb] = await Promise.all([rpc(a), rpc(b)]); // fired together; FOR UPDATE serialises
  await a.end(); await b.end();
  const statuses = [ra.status, rb.status].sort();
  check("18. concurrent reversals: exactly one 'reversed', one 'already_reversed'", statuses[0] === "already_reversed" && statuses[1] === "reversed", JSON.stringify(statuses));
  check("18b. exactly ONE reversal set committed under concurrency (14 txns, one audit)", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 14 && await cnt(admin, "select count(*) c from vyron_cost_production_audit_log where event_type='Production Reversed'") === 1);
  check("18c. finished good removed exactly once (not twice)", (await qty(admin, FG_ITEM)) === 0);
}

/* ─── tenant isolation / invalid state / reason gates ──────────────────────── */
{
  await seed(admin);
  let notFound; try { notFound = await rpc(admin, { company: CO_B }); } catch (e) { notFound = e.message; }
  check("20/21. cross-company reversal rejected (Company B cannot reverse Company A run)", typeof notFound === "string" && /not found/i.test(notFound));
  check("20b. no cross-company writes", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 0);

  await admin.query("update vyron_cost_production_runs set status='In Production' where id=$1", [RUN]);
  let badState; try { await rpc(admin); } catch (e) { badState = e.message; }
  check("29. non-Completed run rejected", /Cannot reverse from status/i.test(badState || ""));
  await admin.query("update vyron_cost_production_runs set status='Completed' where id=$1", [RUN]);

  let emptyReason; try { await rpc(admin, { reason: "   " }); } catch (e) { emptyReason = e.message; }
  check("24. empty/whitespace reason rejected", /reason is required/i.test(emptyReason || ""));
  let longReason; try { await rpc(admin, { reason: "x".repeat(501) }); } catch (e) { longReason = e.message; }
  check("25. reason over 500 chars rejected", /500 characters/i.test(longReason || ""));
  check("24b. no writes after a rejected reason", await cnt(admin, "select count(*) c from vyron_cost_inventory_transactions where reference_type='production_run_reversal'") === 0 && (await runStatus(admin)) === "Completed");
}

await admin.end();
console.log(`\n${checks - failures}/${checks} PostgreSQL integration checks passed`);
if (failures) { console.log(`${failures} FAILED`); process.exit(1); }
