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
const HARDENING = readFileSync(path.join(ROOT, "supabase/migrations/20260922130000_vyron_order_intake_hardening.sql"), "utf8");
const FOOD_SOCK = readFileSync(path.join(ROOT, "supabase/migrations/20260923120000_vyron_order_engine_food_sock.sql"), "utf8");
const CHANNELS = readFileSync(path.join(ROOT, "supabase/migrations/20260923140000_vyron_order_engine_channels.sql"), "utf8");

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
  await db.query(HARDENING);
  check("hardening migration applies", true);
  await db.query(HARDENING);
  check("hardening migration re-applies cleanly (idempotent)", true);
  await db.query(FOOD_SOCK);
  check("ordering-foundation migration applies", true);
  await db.query(FOOD_SOCK);
  check("ordering-foundation migration re-applies cleanly (idempotent)", true);
  await db.query(CHANNELS);
  check("channels / mailboxes migration applies", true);
  await db.query(CHANNELS);
  check("channels / mailboxes migration re-applies cleanly (idempotent)", true);

  const tables = [
    "vyron_order_source_messages",
    "vyron_order_intakes",
    "vyron_order_intake_lines",
    "vyron_order_intake_events",
    "vyron_order_product_aliases",
    "vyron_order_customer_identities",
    "vyron_customer_order_policies",
    "vyron_order_engine_settings",
    "vyron_order_channel_settings",
    "vyron_order_mailboxes",
    "vyron_order_document_extractions",
  ];
  const rls = await db.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [tables]);
  check("all eleven tables exist", rls.rows.length === 11);
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
  // ---- hardening: tenant consistency ------------------------------------------------
  const owner = await insertIntake({ source_key: "tenant-check" });
  check(
    "a line cannot belong to another company than its order",
    (await sqlState(`insert into vyron_order_intake_lines (company_id, intake_id, line_no, quantity) values ($1, $2, 1, 1)`, [CO_B, owner])) === "23503"
  );
  check(
    "an event cannot belong to another company than its order",
    (await sqlState(`insert into vyron_order_intake_events (company_id, intake_id, event_type, actor) values ($1, $2, 'X', 'u')`, [CO_B, owner])) === "23503"
  );
  const msgA = (await db.query(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at) values ($1, 'email', 't', '<tenant-a>', now()) returning id`, [CO])).rows[0].id;
  check("an order cannot point at another company's message", (await sqlState(...intake({ company_id: CO_B, source_message_id: msgA }))) === "23503");
  check("an order may point at its own company's message", (await sqlState(...intake({ source_message_id: msgA }))) === null);
  check("a referenced message cannot be deleted", (await sqlState(`delete from vyron_order_source_messages where id = $1`, [msgA])) === "23503");
  check(
    "the match rule customer_alias is allowed",
    (await sqlState(`insert into vyron_order_intake_lines (company_id, intake_id, line_no, quantity, match_rule) values ($1, $2, 9, 1, 'customer_alias')`, [CO, owner])) === null
  );

  // ---- hardening: mappings are revoke-only ------------------------------------------
  const cust = "44444444-4444-4444-8444-444444444444";
  const prod = "55555555-5555-4555-8555-555555555555";
  const prod2 = "66666666-6666-4666-8666-666666666666";
  const otherCust = "77777777-7777-4777-8777-777777777777";
  const alias = (customer, key, product = prod) => [
    `insert into vyron_order_product_aliases (company_id, customer_id, source_code, source_code_normalized, product_id, created_by) values ($1, $2, $3, $3, $4, 'u') returning id`,
    [CO, customer, key, product],
  ];
  const aliasId = (await db.query(...alias(cust, "sku:A1"))).rows[0].id;
  check("one live alias per customer and code", (await sqlState(...alias(cust, "sku:A1", prod2))) === "23505");
  check("the same code for another customer is allowed", (await sqlState(...alias(otherCust, "sku:A1"))) === null);
  check("one live company-wide alias per code", (await sqlState(...alias(null, "sku:B1"))) === null && (await sqlState(...alias(null, "sku:B1"))) === "23505");
  check("an alias cannot be re-pointed", (await sqlState(`update vyron_order_product_aliases set product_id = $2 where id = $1`, [aliasId, prod2])) === "P0001");
  check("an alias cannot be deleted", (await sqlState(`delete from vyron_order_product_aliases where id = $1`, [aliasId])) === "P0001");
  check("revoked_at and revoked_by go together", (await sqlState(`update vyron_order_product_aliases set revoked_at = now() where id = $1`, [aliasId])) === "23514");
  check("an alias can be revoked", (await sqlState(`update vyron_order_product_aliases set revoked_at = now(), revoked_by = 'u' where id = $1`, [aliasId])) === null);
  check("a revoked alias cannot be revoked again", (await sqlState(`update vyron_order_product_aliases set revoked_at = now(), revoked_by = 'v' where id = $1`, [aliasId])) === "P0001");
  check("after revocation the code can be mapped afresh", (await sqlState(...alias(cust, "sku:A1", prod2))) === null);
  const identity = (ref, customer) => [
    `insert into vyron_order_customer_identities (company_id, source, external_reference, external_reference_normalized, customer_id, created_by) values ($1, 'woocommerce', $2, $2, $3, 'u') returning id`,
    [CO, ref, customer],
  ];
  const identityId = (await db.query(...identity("woo:store:customer:1", cust))).rows[0].id;
  check("one live customer per source reference", (await sqlState(...identity("woo:store:customer:1", otherCust))) === "23505");
  check("a customer identity cannot be re-pointed", (await sqlState(`update vyron_order_customer_identities set customer_id = $2 where id = $1`, [identityId, otherCust])) === "P0001");

  // ---- hardening: policies -----------------------------------------------------------
  const policyInsert = (customer, column, value) =>
    column
      ? [`insert into vyron_customer_order_policies (company_id, customer_id, updated_by, ${column}) values ($1, $2, 'u', $3)`, [CO, customer, value]]
      : [`insert into vyron_customer_order_policies (company_id, customer_id, updated_by) values ($1, $2, 'u')`, [CO, customer]];
  check("one company default policy", (await sqlState(...policyInsert(null))) === null && (await sqlState(...policyInsert(null))) === "23505");
  check("one policy per customer", (await sqlState(...policyInsert(cust))) === null && (await sqlState(...policyInsert(cust))) === "23505");
  const defaults = (await db.query(`select require_po, require_delivery_date, enforce_case_quantity, min_order_value, min_gp_pct from vyron_customer_order_policies where customer_id = $1`, [cust])).rows[0];
  check("every rule is off by default", defaults.require_po === false && defaults.require_delivery_date === false && defaults.enforce_case_quantity === false && defaults.min_order_value === null && defaults.min_gp_pct === null);
  check("delivery weekdays must be 1-7", (await sqlState(...policyInsert("88888888-8888-4888-8888-888888888888", "delivery_weekdays", [0, 8]))) === "23514");
  check("minimum margin within +/-100%", (await sqlState(...policyInsert("99999999-9999-4999-8999-999999999999", "min_gp_pct", 150))) === "23514");

  // ---- ordering foundation: context, snapshots, match rules, settings ---------------
  check("order context defaults to UNSPECIFIED", (await db.query(`select order_context from vyron_order_intakes where id = $1`, [await insertIntake({})])).rows[0].order_context === "UNSPECIFIED");
  check("unknown order context rejected", (await sqlState(...intake({ order_context: "B2X" }))) === "23514");
  check("B2B and B2C accepted", (await sqlState(...intake({ order_context: "B2B" }))) === null && (await sqlState(...intake({ order_context: "B2C" }))) === null);
  check("unknown extraction confidence rejected", (await sqlState(...intake({ extraction_confidence: "SURE" }))) === "23514");
  check("customer matched by a fuzzy rule cannot be stored", (await sqlState(...intake({ customer_match_rule: "fuzzy" }))) === "23514");
  check("external_id and b2c_account customer rules accepted", (await sqlState(...intake({ customer_match_rule: "external_id" }))) === null && (await sqlState(...intake({ customer_match_rule: "b2c_account" }))) === null);
  const snapIntake = await insertIntake({ source_snapshot: JSON.stringify({ po_number: "PO-1" }) });
  check("working PO may change", (await sqlState(`update vyron_order_intakes set customer_po_number = 'PO-2' where id = $1`, [snapIntake])) === null);
  check("the order's source snapshot cannot be changed", (await sqlState(`update vyron_order_intakes set source_snapshot = '{"po_number":"PO-2"}' where id = $1`, [snapIntake])) === "P0001");
  const snapLine = (await db.query(`insert into vyron_order_intake_lines (company_id, intake_id, line_no, quantity, source_snapshot) values ($1, $2, 1, 5, '{"source_quantity":5}') returning id`, [CO, snapIntake])).rows[0].id;
  check("working quantity may change", (await sqlState(`update vyron_order_intake_lines set quantity = 7 where id = $1`, [snapLine])) === null);
  check("the line's source snapshot cannot be changed", (await sqlState(`update vyron_order_intake_lines set source_snapshot = '{"source_quantity":7}' where id = $1`, [snapLine])) === "P0001");
  check("external_id product match rule accepted", (await sqlState(`insert into vyron_order_intake_lines (company_id, intake_id, line_no, quantity, match_rule) values ($1, $2, 2, 1, 'external_id')`, [CO, snapIntake])) === null);
  check("message may be held as NEEDS_EXTRACTION", (await sqlState(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at, processing_status) values ($1, 'email', 't', '<pdf-1>', now(), 'NEEDS_EXTRACTION')`, [CO])) === null);
  check("unknown message status still rejected", (await sqlState(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at, processing_status) values ($1, 'email', 't', '<pdf-2>', now(), 'GUESSED')`, [CO])) === "23514");
  const setting = (company, column, value) =>
    column
      ? [`insert into vyron_order_engine_settings (company_id, updated_by, ${column}) values ($1, 'u', $2)`, [company, value]]
      : [`insert into vyron_order_engine_settings (company_id, updated_by) values ($1, 'u')`, [company]];
  check("one settings row per company", (await sqlState(...setting(CO))) === null && (await sqlState(...setting(CO))) === "23505");
  const sdef = (await db.query(`select b2c_customer_id, product_name_matching, duplicate_po_action, min_lead_time_days from vyron_order_engine_settings where company_id = $1`, [CO])).rows[0];
  check("settings default conservative (no B2C account, review, warn, no lead time)", sdef.b2c_customer_id === null && sdef.product_name_matching === "review" && sdef.duplicate_po_action === "warn" && sdef.min_lead_time_days === null);
  check("unknown name-matching mode rejected", (await sqlState(...setting("44444444-4444-4444-8444-444444444441", "product_name_matching", "fuzzy"))) === "23514");
  check("unknown repeated-PO action rejected", (await sqlState(...setting("44444444-4444-4444-8444-444444444442", "duplicate_po_action", "merge"))) === "23514");
  check("lead time above 90 days rejected", (await sqlState(...setting("44444444-4444-4444-8444-444444444443", "min_lead_time_days", 120))) === "23514");

  // ---- channels, mailboxes and document extractions ---------------------------------
  const channel = (company, key, extra = "") =>
    [`insert into vyron_order_channel_settings (company_id, channel_key, updated_by${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 'u'${extra ? ", " + extra.split("=")[1] : ""})`, [company, key]];
  check("a channel is stored", (await sqlState(...channel(CO, "woocommerce:main"))) === null);
  check("the same channel key twice in one company is rejected", (await sqlState(...channel(CO, "WooCommerce:Main"))) === "23505");
  check("another company may use the same channel key", (await sqlState(...channel(CO_B, "woocommerce:main"))) === null);
  check("a blank channel key is rejected", (await sqlState(...channel(CO, "   "))) === "23514");
  check("too many eligible statuses rejected", (await sqlState(`insert into vyron_order_channel_settings (company_id, channel_key, updated_by, eligible_statuses) values ($1, 'x', 'u', $2)`, [CO, Array.from({ length: 41 }, (_, i) => `s${i}`)])) === "23514");

  const mailbox = (company, address, extra) =>
    extra
      ? [`insert into vyron_order_mailboxes (company_id, receiving_address, updated_by, ${extra.column}) values ($1, $2, 'u', $3)`, [company, address, extra.value]]
      : [`insert into vyron_order_mailboxes (company_id, receiving_address, updated_by) values ($1, $2, 'u')`, [company, address]];
  check("a mailbox is stored", (await sqlState(...mailbox(CO, "orders@tenant-a.example"))) === null);
  check("the same receiving address cannot be claimed twice, even by another company", (await sqlState(...mailbox(CO_B, "Orders@Tenant-A.example"))) === "23505");
  check("an address without @ is rejected", (await sqlState(...mailbox(CO, "not-an-address"))) === "23514");
  check("an unknown mailbox status is rejected", (await sqlState(...mailbox(CO, "s@t.example", { column: "status", value: "LISTENING" }))) === "23514");
  check("an attachment limit above 50 MB is rejected", (await sqlState(...mailbox(CO, "big@t.example", { column: "max_attachment_bytes", value: 60_000_000 }))) === "23514");
  const mailboxDefaults = (await db.query(`select status, require_verified_sender, allowed_sender_domains from vyron_order_mailboxes where receiving_address = 'orders@tenant-a.example'`)).rows[0];
  check("a new mailbox is disabled with no sender policy until someone sets one", mailboxDefaults.status === "DISABLED" && mailboxDefaults.require_verified_sender === false && mailboxDefaults.allowed_sender_domains === null);

  const msgForDoc = (await db.query(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at, processing_status) values ($1, 'email', 't', '<doc-1>', now(), 'NEEDS_EXTRACTION') returning id`, [CO])).rows[0].id;
  const extraction = (company, message, name, status = "NOT_CONFIGURED") => [
    `insert into vyron_order_document_extractions (company_id, source_message_id, attachment_name, status, created_by) values ($1, $2, $3, $4, 'u')`,
    [company, message, name, status],
  ];
  check("an extraction attempt is recorded", (await sqlState(...extraction(CO, msgForDoc, "po.pdf"))) === null);
  check("one attempt row per attachment of a message", (await sqlState(...extraction(CO, msgForDoc, "po.pdf"))) === "23505");
  check("an unknown extraction status is rejected", (await sqlState(...extraction(CO, msgForDoc, "other.pdf", "GUESSED"))) === "23514");
  check("an attempt cannot point at another company's message", (await sqlState(...extraction(CO_B, msgForDoc, "po.pdf"))) === "23503");
  check("a message may be quarantined", (await sqlState(`insert into vyron_order_source_messages (company_id, channel, provider, message_id, received_at, processing_status) values ($1, 'email', 't', '<q-1>', now(), 'QUARANTINED')`, [CO])) === null);
  check("deleting a message removes its extraction attempts", (await sqlState(`delete from vyron_order_source_messages where id = $1`, [msgForDoc])) === null && (await db.query(`select count(*)::int as n from vyron_order_document_extractions where source_message_id = $1`, [msgForDoc])).rows[0].n === 0);

  const settingsDecision = (column, value) => [`insert into vyron_order_engine_settings (company_id, updated_by, ${column}) values ($1, 'u', $2)`, [`66666666-6666-4666-8666-66666666666${Math.floor(Math.random() * 9)}`, value]];
  check("an unknown web-orders mode is rejected", (await sqlState(...settingsDecision("web_orders_mode", "maybe"))) === "23514");
  check("an unknown shipping treatment is rejected", (await sqlState(...settingsDecision("shipping_treatment", "free"))) === "23514");
  check("an unknown SKU alignment is rejected", (await sqlState(...settingsDecision("sku_alignment", "fuzzy"))) === "23514");
  const undecided = (await db.query(`select web_orders_mode, web_prices_include_tax, shipping_treatment, sku_alignment, creator_can_approve, pdf_extractor from vyron_order_engine_settings where company_id = $1`, [CO])).rows[0];
  check("every business decision starts NULL (not decided)", Object.values(undecided).every((v) => v === null));

  // ---- real concurrency on the compare-and-set and the source identity --------------
  const c1 = new pg.Client({ connectionString: url.toString() });
  const c2 = new pg.Client({ connectionString: url.toString() });
  await c1.connect();
  await c2.connect();
  try {
    const target = await insertIntake({ source_key: "cas-race", status: "AWAITING_APPROVAL" });
    const cas = (client, who) =>
      client.query(
        `update vyron_order_intakes set status = 'APPROVED', decision_by = $2, version = version + 1 where id = $1 and company_id = $3 and status = 'AWAITING_APPROVAL' and version = 1 returning id`,
        [target, who, CO]
      );
    await c1.query("begin");
    await c2.query("begin");
    const first = await cas(c1, "ann");
    const secondPromise = cas(c2, "ben"); // waits on the row lock
    await new Promise((r) => setTimeout(r, 150));
    await c1.query("commit");
    const second = await secondPromise;
    await c2.query("commit");
    check("two simultaneous compare-and-set approvals: exactly one row updated", first.rowCount + second.rowCount === 1, `${first.rowCount}+${second.rowCount}`);
    const decided = (await db.query(`select decision_by, version from vyron_order_intakes where id = $1`, [target])).rows[0];
    check("the winner's decision stands; version advanced once", decided.decision_by === "ann" && decided.version === 2);

    const [a, b] = await Promise.allSettled([c1.query(...intake({ source_key: "same-web-order" })), c2.query(...intake({ source_key: "same-web-order" }))]);
    check(
      "two simultaneous inserts of the same source order: one succeeds, one gets 23505",
      [a, b].filter((r) => r.status === "fulfilled").length === 1 && [a, b].some((r) => r.status === "rejected" && r.reason.code === "23505")
    );
  } finally {
    await c1.end().catch(() => undefined);
    await c2.end().catch(() => undefined);
  }

  // ---- performance: the inbox and lookups use their indexes (50,000 synthetic rows) -
  await db.query(
    `insert into vyron_order_intakes (company_id, intake_number, source, source_key, content_hash, created_by, status, customer_id, customer_po_number)
     select case when g % 10 = 0 then $1::uuid else gen_random_uuid() end, 'ORD-P-' || g, 'csv', 'perf-' || g, 'h', 'u',
       (array['RECEIVED','EXCEPTION','AWAITING_APPROVAL','REJECTED'])[1 + g % 4], gen_random_uuid(), 'PO-' || g
     from generate_series(1, 50000) g`,
    [CO]
  );
  await db.query("analyze vyron_order_intakes");
  const plan = async (sql, params) => (await db.query(`explain ${sql}`, params)).rows.map((r) => r["QUERY PLAN"]).join(" | ");
  const inbox = await plan(`select id from vyron_order_intakes where company_id = $1 and status = any($2) order by created_at desc limit 51`, [CO, ["RECEIVED", "EXCEPTION"]]);
  check("inbox query uses an index, no sequential scan", /Index/.test(inbox) && !/Seq Scan/.test(inbox), inbox);
  const all = await plan(`select id from vyron_order_intakes where company_id = $1 order by created_at desc limit 51`, [CO]);
  check("'All orders' query uses the company/date index", /idx_vyron_order_intakes_company_created/.test(all), all);
  const po = await plan(`select id from vyron_order_intakes where company_id = $1 and customer_id = $2 and customer_po_number = $3`, [CO, cust, "PO-10"]);
  check("duplicate-PO lookup uses its index", /idx_vyron_order_intakes_company_po/.test(po), po);
  const src = await plan(`select id from vyron_order_intakes where company_id = $1 and source = 'csv' and source_key = 'perf-10'`, [CO]);
  check("source-identity lookup uses the unique index", /vyron_order_intakes_source_identity/.test(src), src);
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
