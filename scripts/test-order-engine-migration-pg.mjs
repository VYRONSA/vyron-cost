#!/usr/bin/env node
/**
 * VYRON Order Engine — migration test against a real, DISPOSABLE Postgres.
 *
 * Applies supabase/migrations/20260922120000_vyron_order_intake.sql (twice, to
 * prove it is re-runnable) to a throwaway database it creates and drops, and
 * proves the database itself enforces what the code relies on: source-identity
 * idempotency, line identity, status/source/match checks, the CONFIRMED ⇒
 * sales order rule, one intake per sales order, the append-only audit trail,
 * RLS on every table and no anon/authenticated privileges.
 *
 * Refuses any PGURL that is not localhost. Never touches a shared database.
 *
 *   PGURL=postgres://postgres:<pw>@127.0.0.1:<port>/postgres node scripts/test-order-engine-migration-pg.mjs
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIGRATION = readFileSync(path.join(ROOT, "supabase/migrations/20260922120000_vyron_order_intake.sql"), "utf8");

const PGURL = process.env.PGURL || "";
if (!PGURL) {
  console.log("PGURL is not set — this test needs a disposable local Postgres. Skipped.");
  process.exit(2);
}
const host = new URL(PGURL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to run against non-local host "${host}".`);
  process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const dbName = `vyron_oe_test_${randomBytes(4).toString("hex")}`;
const admin = new pg.Client({ connectionString: PGURL });
await admin.connect();
await admin.query(`create database ${dbName}`);
const url = new URL(PGURL);
url.pathname = `/${dbName}`;
const db = new pg.Client({ connectionString: url.toString() });

async function sqlState(query, params) {
  try {
    await db.query(query, params);
    return null;
  } catch (error) {
    return error.code || "error";
  }
}

try {
  await db.connect();
  for (const role of ["anon", "authenticated", "service_role"]) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role}; end if; end $$;`);
  }
  await db.query(MIGRATION);
  check("migration applies", true);
  await db.query(MIGRATION);
  check("migration re-applies cleanly (idempotent)", true);

  const tables = ["vyron_order_source_messages", "vyron_order_intakes", "vyron_order_intake_lines", "vyron_order_intake_events"];
  const rls = await db.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [tables]);
  check("all four tables exist", rls.rows.length === 4);
  check("RLS enabled on every table", rls.rows.every((r) => r.relrowsecurity === true));
  const policies = await db.query(`select count(*)::int as n from pg_policies where tablename = any($1)`, [tables]);
  check("no policies (service role only)", policies.rows[0].n === 0);
  for (const role of ["anon", "authenticated"]) {
    const priv = await db.query(
      `select bool_or(has_table_privilege($1, 'public.' || t, 'select') or has_table_privilege($1, 'public.' || t, 'insert') or has_table_privilege($1, 'public.' || t, 'update') or has_table_privilege($1, 'public.' || t, 'delete')) as any from unnest($2::text[]) t`,
      [role, tables]
    );
    check(`${role} has no table privileges`, priv.rows[0].any === false);
  }

  const CO = "11111111-1111-4111-8111-111111111111";
  const CO_B = "22222222-2222-4222-8222-222222222222";
  const intake = (overrides = {}) => {
    const row = { company_id: CO, intake_number: `ORD-${randomBytes(3).toString("hex")}`, source: "csv", source_key: `k-${randomBytes(3).toString("hex")}`, content_hash: "h", created_by: "u", ...overrides };
    const cols = Object.keys(row);
    return [`insert into vyron_order_intakes (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(row)];
  };
  const insertIntake = async (overrides) => (await db.query(...intake(overrides))).rows[0].id;

  const first = await insertIntake({ source_key: "shared-key" });
  check("duplicate (company, source, source_key) rejected", (await sqlState(...intake({ source_key: "shared-key" }))) === "23505");
  check("same key in another company allowed", (await sqlState(...intake({ source_key: "shared-key", company_id: CO_B }))) === null);
  check("same key from another source allowed", (await sqlState(...intake({ source_key: "shared-key", source: "email" }))) === null);
  check("manual orders without a key may repeat", (await sqlState(...intake({ source: "manual", source_key: null }))) === null && (await sqlState(...intake({ source: "manual", source_key: null }))) === null);
  check("blank source key rejected", (await sqlState(...intake({ source_key: "  " }))) === "23514");
  check("duplicate intake number in a company rejected", (await sqlState(...intake({ intake_number: "ORD-X" }))) === null && (await sqlState(...intake({ intake_number: "ORD-X" }))) === "23505");
  check("unknown source rejected", (await sqlState(...intake({ source: "fax" }))) === "23514");
  check("unknown status rejected", (await sqlState(...intake({ status: "SHIPPED" }))) === "23514");
  check("CONFIRMED without a sales order rejected", (await sqlState(...intake({ status: "CONFIRMED" }))) === "23514");
  const so = "33333333-3333-4333-8333-333333333333";
  check("CONFIRMED with a sales order allowed", (await sqlState(...intake({ status: "CONFIRMED", sales_order_id: so }))) === null);
  check("one intake per sales order", (await sqlState(...intake({ status: "CONFIRMED", sales_order_id: so }))) === "23505");

  const line = (values) => {
    const row = { company_id: CO, intake_id: first, line_no: 1, quantity: 1, ...values };
    const cols = Object.keys(row);
    return [`insert into vyron_order_intake_lines (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(row)];
  };
  check("line inserted", (await sqlState(...line({ line_no: 1, source_line_reference: "L1" }))) === null);
  check("duplicate line number rejected", (await sqlState(...line({ line_no: 1 }))) === "23505");
  check("duplicate source line reference rejected", (await sqlState(...line({ line_no: 2, source_line_reference: "L1" }))) === "23505");
  check("lines without a reference may repeat", (await sqlState(...line({ line_no: 3 }))) === null && (await sqlState(...line({ line_no: 4 }))) === null);
  check("MATCHED without a product rejected", (await sqlState(...line({ line_no: 5, match_status: "MATCHED" }))) === "23514");
  check("unknown match status rejected", (await sqlState(...line({ line_no: 6, match_status: "FUZZY" }))) === "23514");
  check("fuzzy match rule cannot be stored", (await sqlState(...line({ line_no: 7, match_rule: "fuzzy" }))) === "23514");

  await db.query(`insert into vyron_order_intake_events (company_id, intake_id, event_type, actor) values ($1, $2, 'RECEIVED', 'u')`, [CO, first]);
  check("audit event cannot be updated", (await sqlState(`update vyron_order_intake_events set detail = 'x'`)) === "P0001");
  check("audit event cannot be deleted directly", (await sqlState(`delete from vyron_order_intake_events`)) === "P0001");
  check("blank actor rejected", (await sqlState(`insert into vyron_order_intake_events (company_id, intake_id, event_type, actor) values ($1, $2, 'X', ' ')`, [CO, first])) === "23514");
  check("deleting an intake cascades its lines and events", (await sqlState(`delete from vyron_order_intakes where id = $1`, [first])) === null);
  const left = await db.query(`select (select count(*) from vyron_order_intake_events where intake_id = $1)::int + (select count(*) from vyron_order_intake_lines where intake_id = $1)::int as n`, [first]);
  check("no orphaned lines or events", left.rows[0].n === 0);

  const msg = (id) => [`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at) values ($1, 'email', 'test', $2, now())`, [CO, id]];
  check("message stored", (await sqlState(...msg("<m1>"))) === null);
  check("same message id rejected", (await sqlState(...msg("<m1>"))) === "23505");
  check("unknown channel rejected", (await sqlState(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at) values ($1, 'fax', 't', 'x', now())`, [CO])) === "23514");
} finally {
  await db.end().catch(() => undefined);
  await admin.query(`drop database if exists ${dbName}`).catch(() => undefined);
  await admin.end();
}

console.log(`\n${checks - failures}/${checks} checks passed (database ${dbName} created and dropped)`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
