#!/usr/bin/env node
/**
 * Regression tests for the Kingdom Foods GP correction (Family P).
 *
 * Two layers, both deterministic and offline:
 *   1. the plan builder + executor library, driven against the in-memory
 *      fake-supabase with a synthetic two-tenant fixture — scope, cost basis,
 *      unchanged fields, header arithmetic, idempotency, restart, audit and
 *      rollback data;
 *   2. the CLI gates, by spawning scripts/kf-gp-correction.mjs and asserting it
 *      REFUSES (exit 3) on a wrong/missing database, company, hash, approver or
 *      acknowledgement, and without the production-write env flag.
 *
 * No network, no client data, no real database.
 */
import { register } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./support/migration-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const {
  KF_COMPANY_ID,
  KF_PRODUCTION_DB_REF,
  APPROVED_PLAN_HASH,
  COST_BASIS,
  buildKfGpCorrectionPlan,
  reconcilePlan,
  executeKfGpCorrectionPlan,
} = await import("../src/lib/data-migration/kf-gp-correction.ts");
const { acknowledgementToken } = await import("./safety/acknowledge.mjs");
const { findAsset } = await import("./safety/manifest.mjs");

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const FOREIGN = "00000000-0000-0000-0000-000000000999";

/** A synthetic KF tenant with repairable, exception, non-posted and foreign rows. */
function fixture() {
  const products = [
    { id: "P1", product_name: "Repairable A", sku: "RA", total_cost: 6, company_id: KF_COMPANY_ID },
    { id: "P3", product_name: "Repairable B", sku: "RB", total_cost: 4, company_id: KF_COMPANY_ID },
    { id: "P2", product_name: "Uncosted", sku: "UC", total_cost: 0, company_id: KF_COMPANY_ID },
    { id: "PF", product_name: "Foreign", sku: "FG", total_cost: 7, company_id: FOREIGN },
  ];
  const invoices = [
    { invoice_id: "INV1", invoice_number: "KF-1", invoice_date: "2026-08-10", company_id: KF_COMPANY_ID, sales_value: 49, cost_value: 49, gross_profit: 0, gp_percentage: 0, status: "Posted", stock_posted: true },
    { invoice_id: "INV2", invoice_number: "KF-2", invoice_date: "2026-09-05", company_id: KF_COMPANY_ID, sales_value: 10, cost_value: 10, gross_profit: 0, gp_percentage: 0, status: "Sent", stock_posted: false },
    { invoice_id: "INV3", invoice_number: "KF-3", invoice_date: "2026-09-06", company_id: KF_COMPANY_ID, sales_value: 10, cost_value: 10, gross_profit: 0, gp_percentage: 0, status: "Draft", stock_posted: false },
    { invoice_id: "INVF", invoice_number: "F-1", invoice_date: "2026-09-06", company_id: FOREIGN, sales_value: 10, cost_value: 10, gross_profit: 0, gp_percentage: 0, status: "Posted", stock_posted: true },
  ];
  const lines = [
    { line_id: "L1", invoice_id: "INV1", product_id: "P1", quantity: 2, selling_price: 10, cost_per_unit: 10 }, // repairable → 6
    { line_id: "L2", invoice_id: "INV1", product_id: "P3", quantity: 3, selling_price: 8, cost_per_unit: 8 }, // repairable → 4
    { line_id: "L3", invoice_id: "INV1", product_id: "P2", quantity: 1, selling_price: 5, cost_per_unit: 5 }, // exception (uncosted) — kept
    { line_id: "L4", invoice_id: "INV2", product_id: "P1", quantity: 1, selling_price: 10, cost_per_unit: 10 }, // repairable → 6
    { line_id: "L5", invoice_id: "INV3", product_id: "P1", quantity: 1, selling_price: 10, cost_per_unit: 10 }, // Draft → excluded
    { line_id: "LF", invoice_id: "INVF", product_id: "PF", quantity: 1, selling_price: 10, cost_per_unit: 10 }, // foreign → excluded
  ];
  return { products, invoices, lines };
}

/** The DB shape the executor reads/writes, seeded from the fixture. */
function seedTables(fx) {
  return {
    vyron_customer_invoices: fx.invoices.map((i) => ({ id: i.invoice_id, company_id: i.company_id, invoice_number: i.invoice_number, sales_value: i.sales_value, cost_value: i.cost_value, gross_profit: i.gross_profit, gp_percentage: i.gp_percentage, status: i.status, stock_posted: i.stock_posted })),
    vyron_customer_invoice_lines: fx.lines.map((l) => ({ id: l.line_id, invoice_id: l.invoice_id, product_id: l.product_id, quantity: l.quantity, selling_price: l.selling_price, cost_per_unit: l.cost_per_unit, tax_rate: 15, discount_percent: 0 })),
    vyron_cost_audit_logs: [],
    vyron_import_runs: [],
  };
}

/* ───────────────────────────── 1. plan builder ──────────────────────────── */

const fx = fixture();
const plan = buildKfGpCorrectionPlan(fx, { companyId: KF_COMPANY_ID, generatedAt: "2026-09-15T00:00:00.000Z" });

check("exactly the repairable lines are selected", plan.counts.repairable_lines === 3, String(plan.counts.repairable_lines));
check("exactly the affected invoices are counted", plan.counts.affected_invoices === 2, String(plan.counts.affected_invoices));
check("exactly the distinct products are counted", plan.counts.products === 2, String(plan.counts.products));
check("no integrity problems on a clean fixture", plan.problems.length === 0, plan.problems.join("; "));
const ids = new Set(plan.plan.map((r) => r.line_id));
check("zero-cost / uncosted product line is excluded", !ids.has("L3"));
check("non-posted (Draft) invoice line is excluded", !ids.has("L5"));
check("foreign-company line is excluded", !ids.has("LF"));
check("only repairable line ids remain", [...ids].sort().join(",") === "L1,L2,L4");
check("no plan line belongs to a foreign company invoice", plan.plan.every((r) => r.invoice_id !== "INVF"));
check("every plan line carries cost_basis CURRENT_STANDARD_COST", plan.plan.every((r) => r.cost_basis === COST_BASIS));
check("every plan line is flagged as a reconstruction", plan.plan.every((r) => r.reconstruction === "RECONSTRUCTED / NOT HISTORICAL"));
check("new cost equals the product standard cost, not price/zero", plan.plan.find((r) => r.line_id === "L1").new_cost_per_unit === 6 && plan.plan.find((r) => r.line_id === "L2").new_cost_per_unit === 4);

const h1 = plan.invoiceHeaders.find((h) => h.invoice_id === "INV1");
check("header cost_value via computeCostTotals (invoice-level rounding)", h1.proposed_cost_value === 29, String(h1.proposed_cost_value));
check("header gross_profit = sales - cost", h1.proposed_gross_profit === 20, String(h1.proposed_gross_profit));
check("header gp_percentage = round2(gp/sales*100)", h1.proposed_gp_percentage === 40.82, String(h1.proposed_gp_percentage));
check("header sales_value is unchanged input", h1.sales_value === 49);

const planAgain = buildKfGpCorrectionPlan(fixture(), { companyId: KF_COMPANY_ID, generatedAt: "2026-09-15T00:00:00.000Z" });
check("plan hash is deterministic", plan.plan_hash === planAgain.plan_hash, `${plan.plan_hash} vs ${planAgain.plan_hash}`);
check("plan hash ignores insertion order / timestamp", buildKfGpCorrectionPlan({ ...fx, lines: [...fx.lines].reverse() }, { companyId: KF_COMPANY_ID }).plan_hash === plan.plan_hash);

const recon = reconcilePlan(plan);
check("reconciliation revenue unchanged (sum of affected)", recon.combined.revenue === 59, String(recon.combined.revenue));
check("reconciliation new COGS", recon.combined.newCogs === 35, String(recon.combined.newCogs));
check("reconciliation GP increase", recon.gpIncrease === 24, String(recon.gpIncrease));

// Scope strictly follows the company id: asking for the foreign tenant returns
// only its own row and never any Kingdom Foods line.
const otherCompanyPlan = buildKfGpCorrectionPlan(fx, { companyId: FOREIGN });
check("scope follows the company id (foreign tenant sees only its own line)", otherCompanyPlan.counts.repairable_lines === 1 && otherCompanyPlan.plan[0].line_id === "LF");
check("no Kingdom Foods line leaks into a foreign-tenant scope", otherCompanyPlan.plan.every((r) => r.invoice_id === "INVF"));

/* ───────────────────────────── 2. executor (happy path) ─────────────────── */

{
  const fx2 = fixture();
  const sb = createFakeSupabase(seedTables(fx2));
  const p = buildKfGpCorrectionPlan(fx2, { companyId: KF_COMPANY_ID });
  const report = await executeKfGpCorrectionPlan(sb, p, { companyId: KF_COMPANY_ID, approvedPlanHash: p.plan_hash, approval: { approver: "Gerhard", acknowledgement: acknowledgementToken(findAsset("kf-gp-correction"), "production") } });

  const line = (id) => sb.tables.vyron_customer_invoice_lines.find((l) => l.id === id);
  const inv = (id) => sb.tables.vyron_customer_invoices.find((i) => i.id === id);

  check("status Completed on a clean run", report.status === "Completed", report.status);
  check("exactly 3 lines corrected", report.counts.corrected === 3, String(report.counts.corrected));
  check("L1 cost_per_unit updated to standard cost", line("L1").cost_per_unit === 6);
  check("L2 cost_per_unit updated to standard cost", line("L2").cost_per_unit === 4);
  check("L4 cost_per_unit updated to standard cost", line("L4").cost_per_unit === 6);
  check("exception line L3 cost_per_unit UNCHANGED", line("L3").cost_per_unit === 5);
  check("Draft invoice line L5 UNCHANGED", line("L5").cost_per_unit === 10);
  check("foreign line LF UNCHANGED", line("LF").cost_per_unit === 10);
  check("selling prices unchanged", line("L1").selling_price === 10 && line("L2").selling_price === 8);
  check("quantities unchanged", line("L1").quantity === 2 && line("L2").quantity === 3);
  check("VAT (tax_rate) unchanged", line("L1").tax_rate === 15);
  check("INV1 header cost_value updated", inv("INV1").cost_value === 29);
  check("INV1 header gross_profit updated", inv("INV1").gross_profit === 20);
  check("INV1 header gp_percentage updated", inv("INV1").gp_percentage === 40.82);
  check("INV1 revenue (sales_value) unchanged", inv("INV1").sales_value === 49);
  check("INV2 header updated", inv("INV2").cost_value === 6 && inv("INV2").gross_profit === 4);
  check("foreign invoice header UNCHANGED", inv("INVF").cost_value === 10);

  const audits = sb.tables.vyron_cost_audit_logs;
  check("one audit row per corrected line", audits.length === 3, String(audits.length));
  check("audit rows carry old AND new cost", audits.every((a) => typeof a.old_value.cost_per_unit === "number" && typeof a.new_value.cost_per_unit === "number"));
  check("audit rows carry cost_basis, plan_hash and run_id", audits.every((a) => a.new_value.cost_basis === COST_BASIS && a.new_value.plan_hash === p.plan_hash && a.new_value.run_id === report.runId));
  check("audit rows name the approver", audits.every((a) => a.user_name === "Gerhard"));

  const runs = sb.tables.vyron_import_runs;
  check("exactly one run record", runs.length === 1, String(runs.length));
  check("run record status Completed", runs[0].status === "Completed");
  check("run record valid_rows counts corrections", runs[0].valid_rows === 3, String(runs[0].valid_rows));
  check("run record carries the full reversibility payload", runs[0].error_report.reversibility.lines.length === 3 && runs[0].error_report.reversibility.headers.length === 2);
  check("reversibility lines record the OLD cost for rollback", runs[0].error_report.reversibility.lines.every((l) => typeof l.old_cost_per_unit === "number"));
  check("reversibility headers record the OLD header values for rollback", runs[0].error_report.reversibility.headers.every((hh) => typeof hh.old_cost_value === "number" && typeof hh.old_gross_profit === "number"));
  check("report reversibility is complete (3 lines, 2 headers)", report.reversibility.lines.length === 3 && report.reversibility.headers.length === 2);

  /* Idempotency: a second run over the mutated tables changes nothing. */
  const report2 = await executeKfGpCorrectionPlan(sb, p, { companyId: KF_COMPANY_ID, approvedPlanHash: p.plan_hash, approval: { approver: "Gerhard", acknowledgement: "x" } });
  check("re-run corrects nothing (idempotent)", report2.counts.corrected === 0, String(report2.counts.corrected));
  check("re-run recognises all lines as already-applied", report2.counts.alreadyApplied === 3, String(report2.counts.alreadyApplied));
  check("re-run does NOT duplicate audit rows", sb.tables.vyron_cost_audit_logs.length === 3, String(sb.tables.vyron_cost_audit_logs.length));
  check("re-run does NOT duplicate the run record", sb.tables.vyron_import_runs.length === 1, String(sb.tables.vyron_import_runs.length));
  check("re-run leaves line costs correct", line("L1").cost_per_unit === 6 && line("L4").cost_per_unit === 6);
}

/* ───────────────────────────── 3. executor (partial failure / restart) ──── */

{
  const fx3 = fixture();
  const sb = createFakeSupabase(seedTables(fx3));
  // A line has drifted to a THIRD value (neither the planned old nor new).
  sb.tables.vyron_customer_invoice_lines.find((l) => l.id === "L2").cost_per_unit = 99;
  const p = buildKfGpCorrectionPlan(fx3, { companyId: KF_COMPANY_ID });
  const report = await executeKfGpCorrectionPlan(sb, p, { companyId: KF_COMPANY_ID, approvedPlanHash: p.plan_hash, approval: { approver: "Gerhard", acknowledgement: "x" } });
  const line = (id) => sb.tables.vyron_customer_invoice_lines.find((l) => l.id === id);
  const inv = (id) => sb.tables.vyron_customer_invoices.find((i) => i.id === id);

  check("a conflicting line is NOT written", line("L2").cost_per_unit === 99);
  check("its sibling lines are still corrected", line("L1").cost_per_unit === 6);
  check("status is 'Completed with issues' on a conflict", report.status === "Completed with issues", report.status);
  check("the affected invoice header is NOT written when a line conflicts", inv("INV1").cost_value === 49);
  check("an unaffected invoice header is still updated", inv("INV2").cost_value === 6);
  check("the conflict is recorded", report.lineResults.some((r) => r.line_id === "L2" && r.status === "conflict"));

  // Restart: rerunning is safe — already-applied lines stay, the conflict stays a conflict.
  const restart = await executeKfGpCorrectionPlan(sb, p, { companyId: KF_COMPANY_ID, approvedPlanHash: p.plan_hash, approval: { approver: "Gerhard", acknowledgement: "x" } });
  check("restart re-recognises corrected lines", restart.counts.alreadyApplied >= 2, String(restart.counts.alreadyApplied));
  check("restart still reports the conflict", restart.lineResults.some((r) => r.line_id === "L2" && r.status === "conflict"));
  check("restart does not duplicate the run record", sb.tables.vyron_import_runs.length === 1, String(sb.tables.vyron_import_runs.length));
}

/* ───────────────────────────── 4. executor guards ───────────────────────── */

{
  const fx4 = fixture();
  const sb = createFakeSupabase(seedTables(fx4));
  const p = buildKfGpCorrectionPlan(fx4, { companyId: KF_COMPANY_ID });
  let threw = false;
  try {
    await executeKfGpCorrectionPlan(sb, p, { companyId: FOREIGN, approvedPlanHash: p.plan_hash, approval: { approver: "x", acknowledgement: "x" } });
  } catch {
    threw = true;
  }
  check("executor refuses a non-Kingdom-Foods company", threw);
  threw = false;
  try {
    await executeKfGpCorrectionPlan(sb, p, { companyId: KF_COMPANY_ID, approvedPlanHash: "not-the-hash", approval: { approver: "x", acknowledgement: "x" } });
  } catch {
    threw = true;
  }
  check("executor refuses when the plan hash differs from the approved hash", threw);
  check("no writes happened under a refused execution", sb.tables.vyron_import_runs.length === 0 && sb.tables.vyron_cost_audit_logs.length === 0);
}

/* ───────────────────────────── 5. CLI gates (spawned, offline) ──────────── */

const EXPECTED_ACK = acknowledgementToken(findAsset("kf-gp-correction"), "production");
const KF = KF_COMPANY_ID;
// A run whose environment never carries the production-write flag can never write,
// so even if a case slipped past an earlier gate it stops before any database read.
function runCli(extra, env = {}) {
  const res = spawnSync(process.execPath, [path.join(ROOT, "scripts/kf-gp-correction.mjs"), ...extra], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, VYRON_ACKNOWLEDGE_PRODUCTION_WRITE: "", ...env },
  });
  return { code: res.status, out: `${res.stdout}\n${res.stderr}` };
}
const refused = (r) => r.code === 3 && /REFUSED/.test(r.out);

check("CLI: missing --expect-database is refused", refused(runCli(["--company", KF])));
check("CLI: a non-production --expect-database is refused", refused(runCli(["--company", KF, "--expect-database", "someotherproject00000"])));
check("CLI: --execute with a non-KF company is refused", refused(runCli(["--execute", "--company", FOREIGN, "--expect-database", KF_PRODUCTION_DB_REF, "--approve-plan-hash", APPROVED_PLAN_HASH, "--approver", "G", "--acknowledge", EXPECTED_ACK])));
check("CLI: --execute with the wrong plan hash is refused", refused(runCli(["--execute", "--company", KF, "--expect-database", KF_PRODUCTION_DB_REF, "--approve-plan-hash", "deadbeef", "--approver", "G", "--acknowledge", EXPECTED_ACK])));
check("CLI: --execute without an approver is refused", refused(runCli(["--execute", "--company", KF, "--expect-database", KF_PRODUCTION_DB_REF, "--approve-plan-hash", APPROVED_PLAN_HASH, "--acknowledge", EXPECTED_ACK])));
check("CLI: --execute with the wrong acknowledgement is refused", refused(runCli(["--execute", "--company", KF, "--expect-database", KF_PRODUCTION_DB_REF, "--approve-plan-hash", APPROVED_PLAN_HASH, "--approver", "G", "--acknowledge", "RUN WHATEVER"])));
check("CLI: --execute without the production-write env flag is refused", refused(runCli(["--execute", "--company", KF, "--expect-database", KF_PRODUCTION_DB_REF, "--approve-plan-hash", APPROVED_PLAN_HASH, "--approver", "G", "--acknowledge", EXPECTED_ACK])));
check("CLI: the acknowledgement token is exactly the required production token", EXPECTED_ACK === "RUN KF-GP-CORRECTION AGAINST PRODUCTION WITH NO-EXTERNAL", EXPECTED_ACK);

/* ───────────────────────────── summary ──────────────────────────────────── */

console.log("\n--------------------------------------------------------------");
console.log(`  KF GP CORRECTION TESTS — passed ${passed}, failed ${failed}`);
console.log("--------------------------------------------------------------");
process.exit(failed ? 1 : 0);
