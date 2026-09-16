#!/usr/bin/env node
/**
 * VYRON — Food Sock cost-precision correction: PostgreSQL integration tests.
 *
 * Applies the two repository migrations (20260917090000 precision,
 * 20260917100000 correction) to an ISOLATED, disposable PostgreSQL — never
 * production — and drives apply_food_sock_cost_precision_correction() both
 * directly and through the TypeScript tool (plan, gates, RPC call). Proves
 * what an in-memory stand-in cannot: exact numeric precision, single-
 * transaction rollback, row locking under concurrency, grants, and that the
 * transaction touches nothing outside its approved rows.
 *
 * Requires a throwaway Postgres and the `pg` driver:
 *   docker run -d --rm --name vyron-fscc-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=vyrontest -p 55461:5432 postgres:17-alpine
 *   PGURL=postgres://postgres:test@127.0.0.1:55461/vyrontest \
 *     node scripts/test-food-sock-cost-correction-pg.mjs
 *
 * Refuses any PGURL that is not on localhost. Family B.
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

register("./support/migration-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PGURL = process.env.PGURL || "postgres://postgres:test@127.0.0.1:55461/vyrontest";
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(PGURL).hostname)) {
  console.error(`REFUSED: PGURL must be a disposable local database, not ${new URL(PGURL).hostname}.`);
  process.exit(3);
}
const PRECISION = readFileSync(path.join(ROOT, "supabase/migrations/20260917090000_vyron_ingredient_cost_precision.sql"), "utf8");
const CORRECTION = readFileSync(path.join(ROOT, "supabase/migrations/20260917100000_food_sock_cost_precision_correction.sql"), "utf8");
const tool = await import("../src/lib/data-migration/food-sock-cost-correction.ts");
const { stableHash } = await import("../src/lib/data-migration/core.ts");

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks += 1;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const CO = tool.FOOD_SOCK_COMPANY_ID;
const CO_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const STICKER = tool.INGREDIENT_TARGETS[0].id;
const SLEEVE = tool.INGREDIENT_TARGETS[1].id;
const RICE = "cccccccc-0000-4000-8000-0000000000c1";
const B_STICKER = "cccccccc-0000-4000-8000-0000000000b1";
const STICKER_STOCK = "df6ebd6d-22e0-4c6b-9349-013de9ab035b";
const SLEEVE_STOCK = "098c2a19-45f6-4197-bbc3-fbddffbcae7c";
const RICE_STOCK = "dddddddd-0000-4000-8000-0000000000d1";
const B_STOCK = "dddddddd-0000-4000-8000-0000000000b1";
const MIGRATION_RUN = "e6fcb6fa-36ed-4c63-bfef-370ef2116c04";
const HASH = "a".repeat(64);
const ACK = tool.correctionAcknowledgement(HASH);

/* ------------------------------------------------------------ database */

const SCHEMA = `
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create table public.vyron_cost_companies (id uuid primary key, name text not null);
create table public.vyron_cost_ingredients (
  id uuid primary key, company_id uuid not null references public.vyron_cost_companies(id) on delete cascade,
  supplier_id uuid, ingredient_name text not null, category text, purchase_unit text, recipe_unit text,
  purchase_cost numeric(12,2) not null default 0, yield_type text, yield_percent numeric(8,2),
  true_unit_cost numeric(12,2) not null default 0, current_alert text, created_at timestamptz default now(),
  previous_cost numeric(12,2) default 0, raw_weight numeric(14,4), updated_at timestamptz default now());
create table public.vyron_cost_products (id uuid primary key, company_id uuid not null, product_name text, sku text,
  selling_price numeric(12,2), total_cost numeric(12,2), updated_at timestamptz default now());
create table public.vyron_cost_boms (id uuid primary key, company_id uuid not null, product_id uuid, bom_name text,
  total_cost numeric(14,2), cost_per_unit numeric(14,4), ingredient_cost numeric(18,8), updated_at timestamptz default now());
create table public.vyron_cost_bom_lines (id uuid primary key, company_id uuid not null, bom_id uuid not null, ingredient_id uuid,
  line_name text, quantity numeric(18,6), unit_cost numeric(18,8), line_cost numeric(18,8));
create table public.vyron_cost_stock_items (id uuid primary key, company_id uuid not null, item_code text not null,
  description text, entity_type text, entity_id uuid, current_cost numeric(18,8), average_cost numeric(18,8),
  qty_on_hand numeric(18,6), inventory_value numeric(14,2), updated_at timestamptz default now());
create table public.vyron_cost_stock_ledger (id uuid primary key default gen_random_uuid(), company_id uuid not null,
  stock_item_id uuid not null, movement_type text not null, quantity_in numeric(18,6), quantity_out numeric(18,6),
  balance_after numeric(18,6), unit_cost numeric(18,8), value numeric(14,2), created_at timestamptz default now());
create table public.vyron_import_runs (id uuid primary key, company_id uuid not null, status text, error_report jsonb);
create table public.vyron_import_source_links (id uuid primary key default gen_random_uuid(), company_id uuid not null,
  source_system text not null, source_entity text not null, source_key text not null, entity_type text not null, entity_id uuid not null);
`;

async function seed(db) {
  await db.query(SCHEMA);
  const q = (sql, params) => db.query(sql, params);
  await q("insert into vyron_cost_companies values ($1,'Food Sock QA'),($2,'Other tenant')", [CO, CO_B]);
  const ing = "insert into vyron_cost_ingredients (id, company_id, ingredient_name, purchase_cost, true_unit_cost, previous_cost, yield_percent) values ($1,$2,$3,$4,$4,null,100)";
  await q(ing, [STICKER, CO, "Date Sticker", "0.05"]);
  await q(ing, [SLEEVE, CO, "Insert Sleeve", "0.32"]);
  await q(ing, [RICE, CO, "Rice", "18.50"]);
  await q(ing, [B_STICKER, CO_B, "Date Sticker", "0.05"]);
  const stock = "insert into vyron_cost_stock_items (id, company_id, item_code, description, entity_type, entity_id, current_cost, average_cost, qty_on_hand, inventory_value) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)";
  await q(stock, [STICKER_STOCK, CO, "ING-03097405", "Date Sticker", "ingredient", STICKER, "0.05064", "0.0506", "56215", "2844.48"]);
  await q(stock, [SLEEVE_STOCK, CO, "ING-8A83683D", "Insert Sleeve", "packaging", SLEEVE, "0.3164", "0.3164", "24058.75", "7612.19"]);
  await q(stock, [RICE_STOCK, CO, "ING-RICE", "Rice", "ingredient", RICE, "18.5", "18.5", "100", "1850.00"]);
  await q(stock, [B_STOCK, CO_B, "ING-B", "Date Sticker", "ingredient", B_STICKER, "0.05064", "0.0506", "56215", "2844.48"]);
  const ledger = "insert into vyron_cost_stock_ledger (company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value) values ($1,$2,'Opening Balance',$3,0,$3,$4,$5)";
  await q(ledger, [CO, STICKER_STOCK, "56215", "0.05064", "2846.73"]);
  await q(ledger, [CO, SLEEVE_STOCK, "24058.75", "0.3164", "7612.19"]);
  await q(ledger, [CO, RICE_STOCK, "100", "18.5", "1850.00"]);
  await q(ledger, [CO_B, B_STOCK, "56215", "0.05064", "2846.73"]);
  const product = randomUUID();
  const bom = randomUUID();
  const bBom = randomUUID();
  await q("insert into vyron_cost_products (id, company_id, product_name, sku, selling_price, total_cost) values ($1,$2,'Chicken Pasta Food Sock','SKU-1',27,11.08)", [product, CO]);
  await q("insert into vyron_cost_boms (id, company_id, product_id, bom_name, total_cost, cost_per_unit, ingredient_cost) values ($1,$2,$3,'Chicken Pasta Food Sock',11.08,11.08,9.05),($4,$5,null,'B bom',1,1,1)", [bom, CO, product, bBom, CO_B]);
  const line = "insert into vyron_cost_bom_lines (id, company_id, bom_id, ingredient_id, line_name, quantity, unit_cost, line_cost) values ($1,$2,$3,$4,$5,$6,$7,$8)";
  await q(line, [randomUUID(), CO, bom, STICKER, "Date Sticker", "1", "0.05064", "0.05064"]);
  await q(line, [randomUUID(), CO, bom, SLEEVE, "Insert Sleeve", "0.25", "0.3164", "0.0791"]);
  await q(line, [randomUUID(), CO, bom, RICE, "Rice", "0.17", "18.5", "3.145"]);
  await q(line, [randomUUID(), CO_B, bBom, B_STICKER, "Date Sticker", "1", "0.05064", "0.05064"]);
  await q("insert into vyron_import_runs values ($1,$2,'Completed with issues','[{\"kind\":\"execution_approval\"}]')", [MIGRATION_RUN, CO]);
  const link = "insert into vyron_import_source_links (company_id, source_system, source_entity, source_key, entity_type, entity_id) values ($1,'inflow','product',$2,'ingredient',$3)";
  await q(link, [CO, "product:name:date sticker", STICKER]);
  await q(link, [CO, "product:name:insert sleeve", SLEEVE]);
  await q(link, [CO, "product:name:rice", RICE]);
  await q(link, [CO_B, "product:name:date sticker", B_STICKER]);
}

const TABLES = ["vyron_cost_companies", "vyron_cost_ingredients", "vyron_cost_products", "vyron_cost_boms", "vyron_cost_bom_lines", "vyron_cost_stock_items", "vyron_cost_stock_ledger", "vyron_import_runs", "vyron_import_source_links"];
async function fingerprint(db, where = "true") {
  const out = {};
  for (const table of TABLES) {
    const { rows } = await db.query(`select to_jsonb(t) - 'updated_at' as row from public.${table} t where ${where} order by t.id`);
    out[table] = stableHash(rows);
  }
  return out;
}
const tenantRows = (db) => fingerprint(db, `to_jsonb(t)->>'company_id' = '${CO_B}' or to_jsonb(t)->>'id' = '${CO_B}'`);
const others = (db) =>
  fingerprint(db, `t.id not in ('${STICKER}','${SLEEVE}','${STICKER_STOCK}')`);

async function values(db) {
  const { rows: ing } = await db.query("select id::text, purchase_cost::text, true_unit_cost::text from vyron_cost_ingredients where id in ($1,$2) order by ingredient_name", [STICKER, SLEEVE]);
  const { rows: st } = await db.query("select id::text, average_cost::text, inventory_value::text, qty_on_hand::text, current_cost::text from vyron_cost_stock_items where id in ($1,$2) order by description", [STICKER_STOCK, SLEEVE_STOCK]);
  const { rows: audit } = await db.query("select count(*)::int as n from vyron_data_corrections");
  return { sticker: ing[0], sleeve: ing[1], stickerStock: st[0], sleeveStock: st[1], audits: audit[0].n };
}

const apply = (db, over = {}) => {
  const p = { company: CO, stock: STICKER_STOCK, hash: HASH, approver: "QA Approver", ack: ACK, reason: "QA precision correction", ...over };
  return db.query("select public.apply_food_sock_cost_precision_correction($1,$2,$3,$4,$5,$6) as r", [p.company, p.stock, p.hash, p.approver, p.ack, p.reason]).then((res) => res.rows[0].r);
};
async function refusal(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error.message;
  }
}
async function fresh(db, { precision = true, correction = true } = {}) {
  await seed(db);
  if (precision) await db.query(PRECISION);
  if (correction) await db.query(CORRECTION);
}

/** A Supabase-shaped client whose only capability is rpc(), backed by pg — so the tool's own call is tested. */
const rpcClient = (db) => ({
  rpc: async (name, params) => {
    try {
      const { rows } = await db.query(`select public.${name}($1,$2,$3,$4,$5,$6) as r`, [params.p_company_id, params.p_stock_item_id, params.p_plan_hash, params.p_approver, params.p_acknowledgement, params.p_reason]);
      return { data: rows[0].r, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  },
});
/** The tool's CorrectionState, read from pg with the same filters readCorrectionState uses. */
async function stateFrom(db) {
  const ids = [STICKER, SLEEVE];
  const rows = async (sql, params) => (await db.query(sql, params)).rows;
  const corrections = await db.query("select to_regclass('public.vyron_data_corrections') is not null as present");
  const present = corrections.rows[0].present;
  return {
    companyId: CO,
    ingredients: await rows("select id::text, company_id::text, ingredient_name, purchase_cost, true_unit_cost from vyron_cost_ingredients where id = any($1)", [ids]),
    sameNamedIngredients: await rows("select id::text from vyron_cost_ingredients where company_id = $1 and ingredient_name in ('Date Sticker','Insert Sleeve')", [CO]),
    sourceLinks: await rows("select source_key, entity_id::text from vyron_import_source_links where company_id = $1 and source_system = 'inflow' and source_entity = 'product' and source_key in ('product:name:date sticker','product:name:insert sleeve')", [CO]),
    stockItems: await rows("select id::text, company_id::text, entity_id::text, qty_on_hand, current_cost, average_cost, inventory_value from vyron_cost_stock_items where entity_id = any($1)", [ids]),
    ledger: await rows("select l.id::text, l.company_id::text, l.stock_item_id::text, l.movement_type, l.quantity_in, l.quantity_out, l.balance_after, l.unit_cost, l.value from vyron_cost_stock_ledger l join vyron_cost_stock_items s on s.id = l.stock_item_id where s.entity_id = any($1)", [ids]),
    correctionTable: present ? "present" : "missing",
    existingCorrection: present ? (await rows("select id::text, plan_hash from vyron_data_corrections where correction_key = $1", [tool.CORRECTION_KEY]))[0] ?? null : null,
  };
}
const SOURCE = { file: "inFlow_ProductDetails (1).csv", sha256: "f".repeat(64), costs: [{ name: "Date Sticker", row: 54, raw: "0.05064" }, { name: "Insert Sleeve", row: 53, raw: "0.31640" }] };

/* ================================================================ run */

const db = new pg.Client({ connectionString: PGURL });
await db.connect();
// As in Supabase: service_role bypasses RLS, anon and authenticated do not.
for (const role of ["anon", "authenticated", "service_role"]) {
  await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
  await db.query(`alter role ${role} ${role === "service_role" ? "bypassrls" : "nobypassrls"}`);
}

section("16/17. Precision migration — safe to apply, safe to re-apply");
{
  await seed(db);
  const before = await fingerprint(db);
  await db.query(PRECISION);
  const { rows: types } = await db.query("select column_name, numeric_precision, numeric_scale from information_schema.columns where table_name = 'vyron_cost_ingredients' and column_name in ('purchase_cost','true_unit_cost','previous_cost') order by column_name");
  check("purchase_cost and true_unit_cost become numeric(18,8)", types.filter((t) => t.column_name !== "previous_cost").every((t) => t.numeric_precision === 18 && t.numeric_scale === 8), JSON.stringify(types));
  check("previous_cost is untouched (numeric(12,2))", types.find((t) => t.column_name === "previous_cost")?.numeric_scale === 2);
  const after = await fingerprint(db);
  const numericallyEqual = (await db.query("select bool_and(purchase_cost = case ingredient_name when 'Rice' then 18.50 else case when ingredient_name = 'Date Sticker' then 0.05 else 0.32 end end) as ok from vyron_cost_ingredients")).rows[0].ok;
  check("every existing value keeps its numeric value", numericallyEqual === true);
  check("no other table changes", TABLES.filter((t) => t !== "vyron_cost_ingredients").every((t) => before[t] === after[t]));
  const { rows: defaults } = await db.query("select column_name, column_default, is_nullable from information_schema.columns where table_name = 'vyron_cost_ingredients' and column_name in ('purchase_cost','true_unit_cost')");
  check("defaults and NOT NULL are kept", defaults.every((d) => d.column_default === "0" && d.is_nullable === "NO"), JSON.stringify(defaults));
  await db.query("update vyron_cost_ingredients set purchase_cost = 0.05064 where id = $1", [RICE]);
  check("a sub-cent cost is now stored exactly", (await db.query("select purchase_cost::text as v from vyron_cost_ingredients where id = $1", [RICE])).rows[0].v === "0.05064000");
  await db.query("update vyron_cost_ingredients set purchase_cost = 18.50 where id = $1", [RICE]);
  const beforeRerun = await fingerprint(db);
  const rerun = await refusal(db.query(PRECISION));
  check("re-applying the precision migration succeeds", rerun === null, rerun);
  check("…and changes nothing", JSON.stringify(await fingerprint(db)) === JSON.stringify(beforeRerun));
}

section("Correction refuses while the columns still hold two decimals");
{
  await fresh(db, { precision: false });
  const before = await fingerprint(db);
  const msg = await refusal(apply(db));
  check("refused: apply the precision migration first", /apply migration 20260917090000 first/.test(msg || ""), msg);
  check("nothing changed", JSON.stringify(await fingerprint(db)) === JSON.stringify(before));
}

section("1/2/3/14/15. The approved correction, exactly");
await fresh(db);
{
  const otherRowsBefore = await others(db);
  const tenantBBefore = await tenantRows(db);
  const result = await apply(db);
  const v = await values(db);
  check("status applied", result.status === "applied", JSON.stringify(result));
  check("Date Sticker costs are 0.05064 exactly", v.sticker.purchase_cost === "0.05064000" && v.sticker.true_unit_cost === "0.05064000", JSON.stringify(v.sticker));
  check("Insert Sleeve costs are 0.3164 exactly", v.sleeve.purchase_cost === "0.31640000" && v.sleeve.true_unit_cost === "0.31640000", JSON.stringify(v.sleeve));
  check("Date Sticker stock: average 0.05064, value 2846.73", v.stickerStock.average_cost === "0.05064000" && v.stickerStock.inventory_value === "2846.73", JSON.stringify(v.stickerStock));
  const ledger = (await db.query("select value::text from vyron_cost_stock_ledger where stock_item_id = $1", [STICKER_STOCK])).rows[0].value;
  check("Date Sticker stock value now equals its opening ledger value (R2.25 closed)", v.stickerStock.inventory_value === ledger && ledger === "2846.73");
  check("Date Sticker quantity and current cost unchanged", v.stickerStock.qty_on_hand === "56215.000000" && v.stickerStock.current_cost === "0.05064000");
  check("Insert Sleeve stock item unchanged (24058.75 × 0.3164 = 7612.19)", v.sleeveStock.average_cost === "0.31640000" && v.sleeveStock.inventory_value === "7612.19" && v.sleeveStock.qty_on_hand === "24058.750000");
  const otherRowsAfter = await others(db);
  check("8. BOM lines unchanged", otherRowsBefore.vyron_cost_bom_lines === otherRowsAfter.vyron_cost_bom_lines);
  check("   BOMs and products unchanged", otherRowsBefore.vyron_cost_boms === otherRowsAfter.vyron_cost_boms && otherRowsBefore.vyron_cost_products === otherRowsAfter.vyron_cost_products);
  check("9. every other stock item and ingredient unchanged", otherRowsBefore.vyron_cost_stock_items === otherRowsAfter.vyron_cost_stock_items && otherRowsBefore.vyron_cost_ingredients === otherRowsAfter.vyron_cost_ingredients);
  check("   ledger, import runs and source links unchanged", ["vyron_cost_stock_ledger", "vyron_import_runs", "vyron_import_source_links"].every((t) => otherRowsBefore[t] === otherRowsAfter[t]));
  check("10. the other tenant is unchanged (including its own Date Sticker)", JSON.stringify(tenantBBefore) === JSON.stringify(await tenantRows(db)));
  const run = (await db.query("select status, error_report from vyron_import_runs where id = $1", [MIGRATION_RUN])).rows[0];
  check("20. the original migration run is untouched", run.status === "Completed with issues" && JSON.stringify(run.error_report) === JSON.stringify([{ kind: "execution_approval" }]));

  const audit = (await db.query("select * from vyron_data_corrections")).rows;
  check("14. exactly one correction record", audit.length === 1);
  const a = audit[0];
  check("    id, key, company, plan hash", a.id === result.correction_id && a.correction_key === tool.CORRECTION_KEY && a.company_id === CO && a.plan_hash === HASH);
  check("    approver, acknowledgement, reason, time, actor", a.approver === "QA Approver" && a.acknowledgement === ACK && a.reason === "QA precision correction" && a.applied_at instanceof Date && a.applied_by === "postgres");
  check("    affected ingredient ids and stock item id", JSON.stringify(a.affected.ingredient_ids) === JSON.stringify([STICKER, SLEEVE]) && a.affected.stock_item_id === STICKER_STOCK);
  check("    previous values", a.previous_values.ingredients[STICKER].purchase_cost === 0.05 && a.previous_values.ingredients[SLEEVE].true_unit_cost === 0.32 && a.previous_values.stock_item.average_cost === 0.0506 && a.previous_values.stock_item.inventory_value === 2844.48);
  check("    new values", a.new_values.ingredients[STICKER].purchase_cost === 0.05064 && a.new_values.ingredients[SLEEVE].true_unit_cost === 0.3164 && a.new_values.stock_item.average_cost === 0.05064 && a.new_values.stock_item.inventory_value === 2846.73);
  check("    records the verified-unchanged Insert Sleeve stock item", a.affected.unchanged_verified.insert_sleeve_stock_item_id === SLEEVE_STOCK);

  section("13. A second execution is idempotent");
  const before = await fingerprint(db);
  const again = await apply(db);
  check("returns already_applied with the same correction", again.status === "already_applied" && again.correction_id === result.correction_id, JSON.stringify(again));
  check("changes nothing, records nothing", JSON.stringify(await fingerprint(db)) === JSON.stringify(before) && (await values(db)).audits === 1);
  const rerun = await refusal(db.query(PRECISION + CORRECTION));
  check("17. re-applying both migrations after the correction succeeds", rerun === null, rerun);
  check("    …and the corrected values and record survive", (await values(db)).sticker.purchase_cost === "0.05064000" && (await values(db)).audits === 1 && (await apply(db)).status === "already_applied");

  section("Audit record is append-only");
  check("update refused", /append-only/.test((await refusal(db.query("update vyron_data_corrections set reason = 'x'"))) || ""));
  check("direct delete refused", /append-only/.test((await refusal(db.query("delete from vyron_data_corrections"))) || ""));
  const drift = await refusal(db.query("update vyron_cost_ingredients set purchase_cost = 0.07 where id = $1", [STICKER]).then(() => apply(db)));
  check("values changed after the correction: refused, not re-applied", /values have changed since/.test(drift || ""), drift);
}

section("4–7. Refusals — each leaves every row as it was");
const none = async () => {};
const sql = (text, params) => async () => { await db.query(text, params); };
const refusals = [
  ["4. wrong company", none, () => apply(db, { company: CO_B }), /bound to company/],
  ["5. Date Sticker cost is not the expected 0.05", sql("update vyron_cost_ingredients set purchase_cost = 0.06 where id = $1", [STICKER]), () => apply(db), /Date Sticker costs are/],
  ["5. Insert Sleeve true cost is not the expected 0.32", sql("update vyron_cost_ingredients set true_unit_cost = 0.33 where id = $1", [SLEEVE]), () => apply(db), /Insert Sleeve costs are/],
  ["5. Date Sticker stock average is not 0.0506", sql("update vyron_cost_stock_items set average_cost = 0.0507 where id = $1", [STICKER_STOCK]), () => apply(db), /stock item is qty/],
  ["5. Date Sticker stock value is not 2844.48", sql("update vyron_cost_stock_items set inventory_value = 2844.49 where id = $1", [STICKER_STOCK]), () => apply(db), /stock item is qty/],
  ["6. a target ingredient is missing", sql("delete from vyron_cost_ingredients where id = $1", [SLEEVE]), () => apply(db), /\(Insert Sleeve\) does not exist/],
  ["6. a target ingredient belongs to another company", sql("update vyron_cost_ingredients set company_id = $2 where id = $1", [STICKER, CO_B]), () => apply(db), /does not belong to company/],
  ["7. a second 'Date Sticker' in the company", sql("insert into vyron_cost_ingredients (id, company_id, ingredient_name, purchase_cost, true_unit_cost) values (gen_random_uuid(), $1, 'Date Sticker', 0.05, 0.05)", [CO]), () => apply(db), /exactly 2 are required/],
  ["7. a second stock item for Date Sticker", sql("insert into vyron_cost_stock_items (id, company_id, item_code, entity_type, entity_id, current_cost, average_cost, qty_on_hand, inventory_value) values (gen_random_uuid(), $1, 'ING-DUP', 'ingredient', $2, 0.05064, 0.0506, 1, 0.05)", [CO, STICKER]), () => apply(db), /exactly one stock item for Date Sticker, found 2/],
  ["7. the Date Sticker stock item is in another company", sql("update vyron_cost_stock_items set company_id = $2 where id = $1", [STICKER_STOCK, CO_B]), () => apply(db), /Date Sticker stock item does not belong/],
  ["the caller resolved a different stock item", none, () => apply(db, { stock: RICE_STOCK }), /not the resolved/],
  ["the target is not the ingredient the import linked", sql("delete from vyron_import_source_links where entity_id = $1", [STICKER]), () => apply(db), /linked to its source rows/],
  ["Date Sticker has a movement after its opening balance", sql("insert into vyron_cost_stock_ledger (company_id, stock_item_id, movement_type, quantity_in, quantity_out, balance_after, unit_cost, value) values ($1,$2,'Consumption',0,1,56214,0.0506,0.05)", [CO, STICKER_STOCK]), () => apply(db), /has 2 ledger rows/],
  ["Insert Sleeve valuation is not consistent", sql("update vyron_cost_stock_items set inventory_value = 7612.20 where id = $1", [SLEEVE_STOCK]), () => apply(db), /Insert Sleeve valuation is not/],
  ["no approver", none, () => apply(db, { approver: "  " }), /named approver/],
  ["no reason", none, () => apply(db, { reason: "" }), /reason is required/],
  ["malformed plan hash", none, () => apply(db, { hash: "ABC", ack: tool.correctionAcknowledgement("ABC") }), /plan hash is required/],
  ["acknowledgement for another plan", none, () => apply(db, { ack: tool.correctionAcknowledgement("b".repeat(64)) }), /acknowledgement must be exactly/],
];
for (const [name, setup, call, pattern] of refusals) {
  await fresh(db);
  await setup();
  const before = await fingerprint(db);
  const msg = await refusal(call());
  check(`refused: ${name}`, pattern.test(msg || ""), msg);
  check("   …and not a single row changed, no record", JSON.stringify(await fingerprint(db)) === JSON.stringify(before) && (await values(db)).audits === 0);
}

section("11. Atomic rollback on an injected failure");
{
  await fresh(db);
  const before = await fingerprint(db);
  await db.query("create function qa_fail() returns trigger language plpgsql as $$ begin raise exception 'QA injected failure after the updates'; end $$; create trigger qa_fail before insert on vyron_data_corrections for each row execute function qa_fail();");
  const msg = await refusal(apply(db));
  check("the failure surfaces", /QA injected failure/.test(msg || ""), msg);
  check("every update is rolled back", JSON.stringify(await fingerprint(db)) === JSON.stringify(before));
  const v = await values(db);
  check("…values are the originals, no record", v.sticker.purchase_cost === "0.05000000" && v.stickerStock.average_cost === "0.05060000" && v.audits === 0);
  await db.query("drop trigger qa_fail on vyron_data_corrections");
  check("after the fault is removed the correction applies once", (await apply(db)).status === "applied");
}

section("12/13. A cascade into BOM lines or another stock item is refused and rolled back");
for (const [name, body, pattern] of [
  ["BOM line", "update vyron_cost_bom_lines set unit_cost = new.purchase_cost where ingredient_id = new.id;", /outside its approved scope/],
  ["other stock item", `update vyron_cost_stock_items set average_cost = average_cost where id = '${RICE_STOCK}';`, /stock item rows changed/],
  ["other ingredient", `update vyron_cost_ingredients set yield_percent = yield_percent where id = '${RICE}' and new.id <> '${RICE}';`, /ingredient rows changed/],
]) {
  await fresh(db);
  const before = await fingerprint(db);
  await db.query(`create function qa_cascade() returns trigger language plpgsql as $$ begin ${body} return new; end $$; create trigger qa_cascade after update on vyron_cost_ingredients for each row when (pg_trigger_depth() < 1) execute function qa_cascade();`);
  const msg = await refusal(apply(db));
  check(`cascade into ${name}: refused`, pattern.test(msg || ""), msg);
  check(`cascade into ${name}: nothing committed`, JSON.stringify(await fingerprint(db)) === JSON.stringify(before) && (await values(db)).audits === 0);
}

section("12. Concurrency — exactly one correction applies");
{
  await fresh(db);
  const a = new pg.Client({ connectionString: PGURL });
  const b = new pg.Client({ connectionString: PGURL });
  await a.connect();
  await b.connect();
  await a.query("begin");
  const first = await apply(a);
  let secondSettled = false;
  const second = apply(b).then((r) => { secondSettled = true; return r; });
  await new Promise((r) => setTimeout(r, 400));
  check("the second call waits on the first one's row locks", secondSettled === false);
  await a.query("commit");
  const secondResult = await second;
  check("first applies, second returns already_applied", first.status === "applied" && secondResult.status === "already_applied" && secondResult.correction_id === first.correction_id, JSON.stringify([first.status, secondResult]));
  const results = await Promise.all([1, 2, 3, 4].map(async () => {
    const c = new pg.Client({ connectionString: PGURL });
    await c.connect();
    try { return (await apply(c)).status; } finally { await c.end(); }
  }));
  check("four more simultaneous calls all return already_applied", results.every((s) => s === "already_applied"), results.join());
  await fresh(db);
  const racers = await Promise.all([1, 2, 3, 4, 5].map(async () => {
    const c = new pg.Client({ connectionString: PGURL });
    await c.connect();
    try { return (await apply(c)).status; } catch (error) { return `error: ${error.message}`; } finally { await c.end(); }
  }));
  check("five simultaneous first calls: exactly one applied, four already_applied", racers.filter((s) => s === "applied").length === 1 && racers.filter((s) => s === "already_applied").length === 4, racers.join(" | "));
  check("exactly one record and the corrected values", (await values(db)).audits === 1 && (await values(db)).sticker.purchase_cost === "0.05064000");
  await a.end();
  await b.end();
}

section("Grants — only service_role may run the correction");
{
  await fresh(db);
  for (const role of ["anon", "authenticated"]) {
    await db.query("begin");
    await db.query(`set local role ${role}`);
    const msg = await refusal(apply(db));
    await db.query("rollback");
    check(`${role} cannot execute it`, /permission denied/.test(msg || ""), msg);
    await db.query("begin");
    await db.query(`set local role ${role}`);
    const read = await refusal(db.query("select * from vyron_data_corrections"));
    await db.query("rollback");
    check(`${role} cannot read correction records`, /permission denied/.test(read || ""), read);
  }
  await db.query("begin");
  await db.query("set local role service_role");
  const ok = await refusal(apply(db));
  await db.query("rollback");
  check("service_role can execute it", ok === null, ok);
  const { rows } = await db.query("select relrowsecurity from pg_class where oid = 'public.vyron_data_corrections'::regclass");
  check("RLS is enabled on the correction records", rows[0].relrowsecurity === true);
  await apply(db);
  const cascade = await refusal(db.query("delete from vyron_cost_companies where id = $1", [CO]));
  const left = (await db.query("select count(*)::int as n from vyron_data_corrections")).rows[0].n;
  check("removing the company removes its correction record (cascade allowed)", cascade === null && left === 0, cascade);
}

section("The TypeScript tool — plan, gates and its own RPC call");
{
  await fresh(db);
  const plan = tool.buildCorrectionPlan(await stateFrom(db), SOURCE);
  check("plan is ready, with no blockers", plan.status === "ready" && plan.blockers.length === 0, plan.blockers.join(" | "));
  check("plan resolves the Date Sticker stock item from the data", plan.stockItemId === STICKER_STOCK && plan.unchangedStockItemId === SLEEVE_STOCK);
  check("plan lists exactly six field changes on three rows", plan.changes.length === 6 && new Set(plan.changes.map((c) => c.id)).size === 3);
  check("plan hash is deterministic", tool.buildCorrectionPlan(await stateFrom(db), SOURCE).planHash === plan.planHash);
  check("plan hash is bound to the source file", tool.buildCorrectionPlan(await stateFrom(db), { ...SOURCE, sha256: "e".repeat(64) }).planHash !== plan.planHash);
  const wrongSource = tool.buildCorrectionPlan(await stateFrom(db), { ...SOURCE, costs: [{ name: "Date Sticker", row: 54, raw: "0.05" }, SOURCE.costs[1]] });
  check("a source file with a different cost blocks the plan", wrongSource.status === "blocked" && /source file does not give Date Sticker/.test(wrongSource.blockers.join()));
  check("a plan for another company is blocked", tool.buildCorrectionPlan({ ...(await stateFrom(db)), companyId: CO_B }, SOURCE).status === "blocked");

  const approval = (over = {}) => ({ approvedPlanHash: plan.planHash, pinnedPlanHash: plan.planHash, approver: "QA Approver", acknowledgement: tool.correctionAcknowledgement(plan.planHash), reason: "QA", productionWriteAcknowledged: true, ...over });
  const gate = async (over) => refusal(tool.applyCorrection(rpcClient(db), plan, approval(over)));
  check("gate: nothing pinned → refused", /No plan hash has been approved/.test((await gate({ pinnedPlanHash: null })) || ""));
  check("gate: approved hash differs from pinned → refused", /must be the pinned/.test((await gate({ approvedPlanHash: "c".repeat(64) })) || ""));
  check("gate: rebuilt plan differs from pinned → refused", /hashes to/.test((await gate({ pinnedPlanHash: "d".repeat(64), approvedPlanHash: "d".repeat(64) })) || ""));
  check("gate: no approver → refused", /named approver/.test((await gate({ approver: " " })) || ""));
  check("gate: no reason → refused", /reason is required/.test((await gate({ reason: "" })) || ""));
  check("gate: wrong acknowledgement → refused", /acknowledgement must be exactly/.test((await gate({ acknowledgement: "yes" })) || ""));
  check("gate: no production-write acknowledgement → refused", /VYRON_ACKNOWLEDGE_PRODUCTION_WRITE/.test((await gate({ productionWriteAcknowledged: false })) || ""));
  check("the gates wrote nothing", (await values(db)).audits === 0 && (await values(db)).sticker.purchase_cost === "0.05000000");

  const result = await tool.applyCorrection(rpcClient(db), plan, approval());
  check("the tool's RPC call applies the correction", result.status === "applied" && result.plan_hash === plan.planHash);
  const record = (await db.query("select plan_hash, approver, acknowledgement from vyron_data_corrections")).rows[0];
  check("the record carries the tool's plan hash and acknowledgement", record.plan_hash === plan.planHash && record.acknowledgement === tool.correctionAcknowledgement(plan.planHash));
  const after = tool.buildCorrectionPlan(await stateFrom(db), SOURCE);
  check("re-planning afterwards reports already_applied", after.status === "already_applied" && after.blockers.length === 0, after.blockers.join(" | "));
  check("…with a different hash, so the old approval cannot be replayed as new", after.planHash !== plan.planHash);

  await fresh(db);
  const blocked = tool.buildCorrectionPlan({ ...(await stateFrom(db)), stockItems: (await stateFrom(db)).stockItems.map((s) => (s.id === STICKER_STOCK ? { ...s, average_cost: "0.0507" } : s)) }, SOURCE);
  check("a plan built on an unexpected value is blocked", blocked.status === "blocked");
  const blockedGate = await refusal(tool.applyCorrection(rpcClient(db), blocked, { ...approval(), approvedPlanHash: blocked.planHash, pinnedPlanHash: blocked.planHash, acknowledgement: tool.correctionAcknowledgement(blocked.planHash) }));
  check("…and the tool refuses it before calling the database", /plan is blocked/.test(blockedGate || "") && (await values(db)).audits === 0);
  await seed(db);
  await db.query(PRECISION);
  const noTable = tool.buildCorrectionPlan(await stateFrom(db), SOURCE);
  check("without the correction migration the plan is blocked", noTable.status === "blocked" && /apply migrations/.test(noTable.blockers.join()));
}

await db.end();
console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}.`);
console.log("Disposable local PostgreSQL only: this proves the correction's behaviour, not a production correction.");
process.exit(failures ? 1 : 0);
