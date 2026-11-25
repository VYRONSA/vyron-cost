#!/usr/bin/env node
/**
 * Document numbering — Postgres concurrency and integrity, LOCAL QA database only.
 *   npm run test:document-numbering-pg
 * Needs the local QA Supabase stack (volora-qa, DB on 127.0.0.1:59322) with migration
 * 20261124130000 applied, and the `pg` package (`npm i pg --no-save` in a scratch dir).
 * Uses fresh random company ids; touches no existing row; refuses any non-local host.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";

const URL = "postgresql://postgres:postgres@127.0.0.1:59322/postgres";
if (!/127\.0\.0\.1:59322/.test(URL)) throw new Error("local QA only");
const pool = new pg.Pool({ connectionString: URL, max: 40 });
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`); };

const A = randomUUID(), B = randomUUID(), C = randomUUID();
const draft = async (company, ref = `DRAFT-${randomUUID().slice(0, 10).toUpperCase()}`) => {
  const { rows } = await pool.query(
    "insert into vyron_customer_invoices (company_id, customer_name, invoice_number, status) values ($1,'QA Customer',$2,'Draft') returning id",
    [company, ref]
  );
  return rows[0].id;
};
const issue = (company, id, actor = "qa") =>
  pool.query("select * from vyron_issue_customer_invoice_number($1,$2,$3)", [company, id, actor]).then((r) => r.rows[0]);

try {
  // 1. 30 drafts issued concurrently -> 30 distinct, gap-free numbers
  const ids = await Promise.all(Array.from({ length: 30 }, () => draft(A)));
  const results = await Promise.all(ids.map((id) => issue(A, id)));
  const nums = results.map((r) => r.invoice_number).sort();
  const expected = Array.from({ length: 30 }, (_, i) => `INV-${String(i + 1).padStart(6, "0")}`);
  check("30 concurrent issues get 30 distinct numbers", new Set(nums).size === 30, nums.join(","));
  check("numbers are INV-000001..INV-000030 with no gap", JSON.stringify(nums) === JSON.stringify(expected), nums.join(","));
  check("every result newly issued", results.every((r) => r.newly_issued === true));

  // 2. same invoice issued 10x concurrently -> one number, one register row
  const one = await draft(A);
  const same = await Promise.all(Array.from({ length: 10 }, () => issue(A, one)));
  check("10 concurrent issues of ONE invoice return one number", new Set(same.map((r) => r.invoice_number)).size === 1, same.map((r) => r.invoice_number).join(","));
  check("exactly one of them newly issued", same.filter((r) => r.newly_issued).length === 1);
  const reg = await pool.query("select count(*)::int c from vyron_document_number_register where company_id=$1 and document_id=$2", [A, one]);
  check("one register row for that invoice", reg.rows[0].c === 1, String(reg.rows[0].c));
  check("it took INV-000031", same[0].invoice_number === "INV-000031", same[0].invoice_number);

  // 3. rollback consumes nothing
  const rb = await draft(A);
  const client = await pool.connect();
  await client.query("begin");
  const inTx = (await client.query("select * from vyron_issue_customer_invoice_number($1,$2,'qa')", [A, rb])).rows[0];
  await client.query("rollback");
  client.release();
  check("issue inside a rolled-back transaction saw INV-000032", inTx.invoice_number === "INV-000032", inTx.invoice_number);
  const after = await issue(A, rb);
  check("after rollback the same number is issued again (no gap, no reuse)", after.invoice_number === "INV-000032", after.invoice_number);
  const draftRow = await pool.query("select invoice_number, draft_reference, number_issued_at from vyron_customer_invoices where id=$1", [rb]);
  check("draft reference kept, issued time stamped", /^DRAFT-/.test(draftRow.rows[0].draft_reference) && draftRow.rows[0].number_issued_at !== null);

  // 4. a number already carried by an imported invoice is skipped and recorded
  await pool.query("insert into vyron_customer_invoices (company_id, customer_name, invoice_number, status) values ($1,'Imported','INV-000033','Sent')", [A]);
  const skip = await issue(A, await draft(A));
  check("number in use (imported INV-000033) is skipped -> INV-000034", skip.invoice_number === "INV-000034", skip.invoice_number);
  const skipped = await pool.query("select disposition from vyron_document_number_register where company_id=$1 and document_number='INV-000033'", [A]);
  check("skip recorded as SKIPPED_IN_USE", skipped.rows[0]?.disposition === "SKIPPED_IN_USE");

  // 5. per-company series and uniqueness
  const b1 = await issue(B, await draft(B));
  check("company B starts its own series at INV-000001", b1.invoice_number === "INV-000001", b1.invoice_number);
  let dup = null;
  try {
    await pool.query("insert into vyron_customer_invoices (company_id, customer_name, invoice_number, status) values ($1,'x','INV-000001','Draft')", [B]);
  } catch (e) { dup = e.code; }
  check("duplicate number within a company is refused (23505)", dup === "23505", String(dup));

  // 6. legacy numbers never renumbered; non-draft DRAFT- refused
  const legacy = await draft(A, `SI-${Date.now().toString().slice(-8)}`);
  const lg = await issue(A, legacy);
  check("legacy SI- draft keeps its number, nothing issued", /^SI-/.test(lg.invoice_number) && lg.newly_issued === false);
  const sent = await draft(A);
  await pool.query("update vyron_customer_invoices set status='Sent' where id=$1", [sent]);
  let notDraft = null;
  try { await issue(A, sent); } catch (e) { notDraft = e.message; }
  check("a non-draft DRAFT- invoice cannot take a number", /INVOICE_NOT_DRAFT/.test(String(notDraft)), String(notDraft));

  // 7. cancellation keeps the number; re-issue returns it
  await pool.query("update vyron_customer_invoices set status='Cancelled' where id=$1", [ids[0]]);
  const again = await issue(A, ids[0]);
  check("cancelled invoice keeps its number; nothing new consumed", again.newly_issued === false && /^INV-0000/.test(again.invoice_number));

  // 8. series configuration
  let used = null;
  try { await pool.query("select vyron_configure_document_series($1,'customer_invoice','INV-',6,1,'qa')", [A]); } catch (e) { used = e.message; }
  check("series cannot be reconfigured after issue", /SERIES_ALREADY_USED/.test(String(used)), String(used));
  await pool.query("select vyron_configure_document_series($1,'customer_invoice','INV-',6,3658,'qa')", [C]);
  const c1 = await issue(C, await draft(C));
  check("fresh company configured to start at 3658 -> INV-003658", c1.invoice_number === "INV-003658", c1.invoice_number);

  // 9. generic counter (job cards) under concurrency
  const jc = await Promise.all(
    Array.from({ length: 20 }, () =>
      pool.query("select vyron_next_document_number($1,'job_card','JC-',6,'job_card',$2,'qa') n", [A, randomUUID()]).then((r) => r.rows[0].n)
    )
  );
  check("20 concurrent job card numbers distinct", new Set(jc).size === 20);
  check("job card numbers JC-000001..JC-000020", jc.sort()[0] === "JC-000001" && jc.sort()[19] === "JC-000020", jc.sort().join(","));

  // 10. BOM override: one active per product
  const P = randomUUID();
  await pool.query("insert into vyron_bom_completeness_overrides (company_id, product_id, original_status, original_severity, reason, created_by, created_by_user_id) values ($1,$2,'EMPTY BOM','Medium','Checked, valid for ops','qa','u1')", [A, P]);
  let dupOverride = null;
  try {
    await pool.query("insert into vyron_bom_completeness_overrides (company_id, product_id, original_status, original_severity, reason, created_by, created_by_user_id) values ($1,$2,'EMPTY BOM','Medium','Second override attempt','qa','u2')", [A, P]);
  } catch (e) { dupOverride = e.code; }
  check("second ACTIVE override for one product refused (23505)", dupOverride === "23505", String(dupOverride));
  let shortReason = null;
  try {
    await pool.query("insert into vyron_bom_completeness_overrides (company_id, product_id, original_status, original_severity, reason, created_by, created_by_user_id) values ($1,$2,'EMPTY BOM','Medium','short','qa','u2')", [A, randomUUID()]);
  } catch (e) { shortReason = e.code; }
  check("override reason under 10 characters refused (23514)", shortReason === "23514", String(shortReason));
} finally {
  // Clean up only what this test created.
  for (const co of [A, B, C]) {
    await pool.query("delete from vyron_document_number_register where company_id=$1", [co]);
    await pool.query("delete from vyron_document_sequences where company_id=$1", [co]);
    await pool.query("delete from vyron_customer_invoices where company_id=$1", [co]);
    await pool.query("delete from vyron_bom_completeness_overrides where company_id=$1", [co]);
  }
  await pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
