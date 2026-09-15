#!/usr/bin/env node
/**
 * VYRON — Kingdom Foods historical Gross Profit correction (Family P).
 *
 * Sets the persisted cost_per_unit of 283 posted Kingdom Foods invoice lines to
 * the current product standard cost (a documented RECONSTRUCTION — never the
 * original historical cost) and recomputes the affected invoice headers with the
 * application's own computeCostTotals. Selling prices, quantities, VAT and
 * revenue are never touched, and no line, product or company outside the frozen
 * plan is touched.
 *
 * Modes:
 *   node scripts/kf-gp-correction.mjs --company <uuid> --expect-database <ref>
 *       DRY RUN. Read-only. Rebuilds the plan from the live tenant, verifies the
 *       hash, writes the approval artifact to .migration-reports/ (gitignored).
 *       Never inserts, updates or deletes anything.
 *
 *   node scripts/kf-gp-correction.mjs --company <uuid> --expect-database <ref> \
 *       --verify-deterministic
 *       DRY RUN that also builds the plan twice and requires identical hashes.
 *
 *   node scripts/kf-gp-correction.mjs --execute --company <uuid> \
 *       --expect-database <ref> --approve-plan-hash <hash> --approver "<name>" \
 *       --acknowledge "RUN KF-GP-CORRECTION AGAINST PRODUCTION WITH NO-EXTERNAL"
 *       with VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 in the environment.
 *       WRITES to the tenant; every gate below is checked first.
 *
 * Family P: only --execute writes; every other mode is company-scoped SELECTs.
 * The plan is rebuilt against the tenant's CURRENT state and must hash to the
 * approved value, so an approval can never be applied to a state that changed.
 */
import { register } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./support/migration-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);

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

const ASSET_ID = "kf-gp-correction";
const EXPECTED_ACK = acknowledgementToken(findAsset(ASSET_ID), "production"); // RUN KF-GP-CORRECTION AGAINST PRODUCTION WITH NO-EXTERNAL

const companyId = flag("--company");
const expectDatabase = flag("--expect-database");
const execute = has("--execute");
const approvedHash = flag("--approve-plan-hash");
const approver = flag("--approver");
const acknowledgement = flag("--acknowledge");

const refuse = (message) => {
  console.error(`REFUSED: ${message}`);
  process.exit(3);
};
const usage = () => {
  console.error(
    'Usage: node scripts/kf-gp-correction.mjs --company <uuid> --expect-database <ref> [--verify-deterministic]\n' +
      '       node scripts/kf-gp-correction.mjs --execute --company <uuid> --expect-database <ref> --approve-plan-hash <hash> --approver "<name>" --acknowledge "' +
      EXPECTED_ACK +
      '"'
  );
  process.exit(2);
};

if (!companyId) usage();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) refuse("--company must be a UUID.");

/** The Supabase project .env.local points at — the only database this script can reach. */
function configuredDatabaseRef() {
  let text = "";
  try {
    text = readFileSync(path.join(ROOT, ".env.local"), "utf8");
  } catch {
    return null;
  }
  const line = text.split(/\r?\n/).find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="));
  const url = line ? line.slice(line.indexOf("=") + 1).replace(/^"|"$/g, "") : "";
  const match = /^https:\/\/([a-z0-9]{20})\.supabase\.co(\/|$)/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

/*
 * DATABASE IDENTITY GATE — any mode reads the tenant, so every mode names the
 * project it expects and refuses if .env.local points elsewhere. This operation
 * concerns ONLY the verified production project, so the expected ref is pinned.
 */
{
  const actual = configuredDatabaseRef();
  if (!expectDatabase) refuse("Database access needs --expect-database <project-ref> (the ref proven for production).");
  if (expectDatabase.toLowerCase() !== KF_PRODUCTION_DB_REF) refuse(`--expect-database must be the verified production project ${KF_PRODUCTION_DB_REF}.`);
  if (!actual) refuse(".env.local has no parseable NEXT_PUBLIC_SUPABASE_URL.");
  if (actual !== expectDatabase.toLowerCase()) refuse(`.env.local points at "${actual}", not the expected "${expectDatabase}". Nothing was read or written.`);
}

/*
 * EXECUTE GATES — all checked before ANY database access.
 */
if (execute) {
  if (companyId !== KF_COMPANY_ID) refuse(`--execute is bound to the Kingdom Foods tenant ${KF_COMPANY_ID}.`);
  if (!approvedHash) refuse("--execute needs --approve-plan-hash <hash> from the approved dry run.");
  if (approvedHash !== APPROVED_PLAN_HASH) refuse(`--approve-plan-hash must be the approved ${APPROVED_PLAN_HASH}.`);
  if (!approver?.trim()) refuse("--execute needs --approver <name>: the person who approved this plan hash.");
  if (acknowledgement !== EXPECTED_ACK) refuse(`--acknowledge must be exactly "${EXPECTED_ACK}".`);
  if (process.env.VYRON_ACKNOWLEDGE_PRODUCTION_WRITE !== "1") {
    refuse("This writes to production. Set VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 to confirm.");
  }
  // The Repository Safety Programme decides whether this asset may write here.
  // A prohibited verdict is final; this script adds no override.
  const { evaluateExecution } = await import("./safety/environment.mjs");
  const decision = evaluateExecution(ASSET_ID);
  if (decision.verdict === "prohibited" || decision.verdict === "unregistered") {
    refuse(`Repository Safety Programme verdict for ${ASSET_ID} is ${decision.verdict.toUpperCase()}:\n  - ${decision.reasons.join("\n  - ")}`);
  }
}

/* ─────────────────────────── read the live tenant (SELECT only) ─────────── */

let client = null;
async function serviceClient() {
  if (client) return client;
  const { createRequire } = await import("node:module");
  const { createClient } = createRequire(path.join(ROOT, "package.json"))("@supabase/supabase-js");
  const env = Object.fromEntries(
    readFileSync(path.join(ROOT, ".env.local"), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      })
  );
  client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return client;
}

async function readTenant(sb, id) {
  const invRes = await sb
    .from("vyron_customer_invoices")
    .select("id, invoice_number, invoice_date, company_id, sales_value, cost_value, gross_profit, gp_percentage, status, stock_posted")
    .eq("company_id", id);
  if (invRes.error) throw new Error(`reading invoices: ${invRes.error.message}`);
  const invoices = (invRes.data || []).map((r) => ({
    invoice_id: r.id,
    invoice_number: r.invoice_number,
    invoice_date: String(r.invoice_date).slice(0, 10),
    company_id: r.company_id,
    sales_value: Number(r.sales_value),
    cost_value: Number(r.cost_value),
    gross_profit: Number(r.gross_profit),
    gp_percentage: Number(r.gp_percentage),
    status: r.status,
    stock_posted: Boolean(r.stock_posted),
  }));

  const invoiceIds = invoices.map((i) => i.invoice_id);
  const lines = [];
  for (let i = 0; i < invoiceIds.length; i += 100) {
    const chunk = invoiceIds.slice(i, i + 100);
    const res = await sb
      .from("vyron_customer_invoice_lines")
      .select("id, invoice_id, product_id, quantity, selling_price, cost_per_unit")
      .in("invoice_id", chunk);
    if (res.error) throw new Error(`reading lines: ${res.error.message}`);
    for (const r of res.data || []) {
      lines.push({
        line_id: r.id,
        invoice_id: r.invoice_id,
        product_id: r.product_id,
        quantity: Number(r.quantity),
        selling_price: Number(r.selling_price),
        cost_per_unit: Number(r.cost_per_unit),
      });
    }
  }

  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  const products = [];
  for (let i = 0; i < productIds.length; i += 100) {
    const chunk = productIds.slice(i, i + 100);
    const res = await sb.from("vyron_cost_products").select("id, product_name, sku, total_cost, company_id").in("id", chunk);
    if (res.error) throw new Error(`reading products: ${res.error.message}`);
    for (const r of res.data || []) products.push({ id: r.id, product_name: r.product_name, sku: r.sku, total_cost: r.total_cost == null ? null : Number(r.total_cost), company_id: r.company_id });
  }
  return { invoices, lines, products };
}

/** The exception lines: cost==price but the product has no cost (total_cost = 0). Reported, never corrected. */
function computeExceptions(input, plan) {
  const affected = new Set(plan.invoiceHeaders.map((h) => h.invoice_id));
  const productsById = new Map(input.products.map((p) => [p.id, p]));
  const byProduct = new Map();
  for (const l of input.lines) {
    if (!affected.has(l.invoice_id)) continue;
    const p = l.product_id ? productsById.get(l.product_id) : null;
    const cost = Number(p?.total_cost || 0);
    const isRepairable = Math.round(l.cost_per_unit * 10000) === Math.round(l.selling_price * 10000) && l.selling_price > 0 && cost > 0;
    if (isRepairable) continue;
    // Uncosted product on a cost==price or zero-cost line inside an affected invoice.
    const zeroCost = cost === 0;
    if (!zeroCost) continue;
    const key = l.product_id || "(no product)";
    const e = byProduct.get(key) || { product_id: key, product_name: p?.product_name || "(unknown)", sku: p?.sku || "—", lines: 0, invoices: new Set() };
    e.lines += 1;
    e.invoices.add(l.invoice_id);
    byProduct.set(key, e);
  }
  return [...byProduct.values()].map((e) => ({ ...e, invoices: e.invoices.size }));
}

const money = (n) => "R" + Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ─────────────────────────── build the plan ─────────────────────────────── */

const sb = await serviceClient();
console.log(execute ? `VYRON — KF GP correction — EXECUTE; rebuilding plan from the live tenant first` : "VYRON — KF GP correction — DRY RUN (nothing is written)");
const input = await readTenant(sb, companyId);
const plan = buildKfGpCorrectionPlan(input, { companyId });

if (has("--verify-deterministic")) {
  const again = buildKfGpCorrectionPlan(await readTenant(sb, companyId), { companyId });
  if (again.plan_hash !== plan.plan_hash) {
    console.error(`NOT DETERMINISTIC: ${plan.plan_hash} vs ${again.plan_hash}`);
    process.exit(1);
  }
  console.log(`Deterministic: two builds produced plan hash ${plan.plan_hash}`);
}

const recon = reconcilePlan(plan);
const exceptions = computeExceptions(input, plan);

/* ─────────────────────────── approval artifact (gitignored) ─────────────── */

const outDir = path.join(ROOT, ".migration-reports", "kf-gp-correction", plan.plan_hash.slice(0, 12));
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 1));

const L = [];
L.push("# Kingdom Foods — Historical Gross Profit Correction (APPROVAL / OPERATOR REPORT)", "");
L.push("**COST BASIS: CURRENT STANDARD COST RECONSTRUCTION. NOT the original invoice-time historical cost.**", "");
L.push(`- Production database: ${KF_PRODUCTION_DB_REF}.supabase.co`);
L.push(`- Company: ${plan.company_name} (${plan.company_id})`);
L.push(`- Generated: ${plan.generated_at}`);
L.push(`- Plan hash (SHA-256): \`${plan.plan_hash}\``);
L.push(`- Approved hash: \`${APPROVED_PLAN_HASH}\`  → ${plan.plan_hash === APPROVED_PLAN_HASH ? "MATCH" : "**MISMATCH — execution would refuse**"}`);
L.push(`- Repairable lines: **${plan.counts.repairable_lines}** across **${plan.counts.affected_invoices}** invoices, **${plan.counts.products}** products`);
L.push(`- Exception lines (uncosted products, NOT corrected): **${exceptions.reduce((s, e) => s + e.lines, 0)} lines · ${exceptions.length} products**`);
L.push(`- Integrity problems: ${plan.problems.length ? plan.problems.join("; ") : "NONE"}`, "");

L.push("## Proposed impact (revenue unchanged)", "");
L.push("| Period | Revenue | Current COGS | Proposed COGS | Current GP | Proposed GP | Current GP% | Proposed GP% |");
L.push("|---|--:|--:|--:|--:|--:|--:|--:|");
for (const [m, b] of Object.entries(recon.byMonth).sort()) {
  L.push(`| ${m} | ${money(b.revenue)} | ${money(b.oldCogs)} | ${money(b.newCogs)} | ${money(b.oldGp)} | ${money(b.newGp)} | ${b.oldGpPct}% | ${b.newGpPct}% |`);
}
const c = recon.combined;
L.push(`| **Combined** | ${money(c.revenue)} | ${money(c.oldCogs)} | ${money(c.newCogs)} | ${money(c.oldGp)} | ${money(c.newGp)} | ${c.oldGpPct}% | ${c.newGpPct}% |`);
L.push("", `**Total GP increase: ${money(recon.gpIncrease)}.** Only cost_per_unit, cost_value, gross_profit and gp_percentage change.`, "");

L.push("## Exceptions — client action required (NOT corrected)", "");
L.push("| Product | SKU | Lines | Invoices | Required client action |");
L.push("|---|---|--:|--:|---|");
for (const e of exceptions.sort((a, b) => b.lines - a.lines)) L.push(`| ${e.product_name} | ${e.sku} | ${e.lines} | ${e.invoices} | Enter a valid unit cost / complete the BOM so total cost > R0 |`);
L.push("");

L.push("## Safety gates required to execute", "");
L.push("1. `--execute --company " + KF_COMPANY_ID + "`", "2. `--expect-database " + KF_PRODUCTION_DB_REF + "` matching .env.local", `3. \`--approve-plan-hash ${APPROVED_PLAN_HASH}\``, "4. `--approver \"<named approver>\"`", `5. \`--acknowledge \"${EXPECTED_ACK}\"\``, "6. `VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1`", "7. Repository Safety Programme verdict for kf-gp-correction is not prohibited (verified production, Family P)", "8. Live rebuild hashes to the approved value", "");

L.push("## Reversibility, audit & idempotency", "");
L.push("- **Audit:** one `vyron_cost_audit_logs` row per corrected line (old/new cost_per_unit, cost_basis, plan_hash, run_id, approver); one `vyron_import_runs` record with the full reversibility payload.");
L.push("- **Reversibility:** every changed line's old cost_per_unit and every changed header's old cost_value/gross_profit/gp_percentage are recorded, so an authorised (Family-P) rollback can restore the pre-operation state exactly.");
L.push("- **Idempotency:** each line is read first; a line already at the new cost is recognised, not rewritten; a re-run reuses the single run record for this plan hash and never duplicates audit rows.");
L.push("- **Partial failure:** a line at neither the old nor new cost is a conflict — recorded, never written; the run status becomes \"Completed with issues\" and the operation is safely restartable.");
writeFileSync(path.join(outDir, "APPROVAL-REPORT.md"), L.join("\n"));

const cols = ["line_id", "invoice_number", "invoice_date", "product_name", "sku", "quantity", "selling_price", "old_cost_per_unit", "new_cost_per_unit", "cost_basis"];
const csv = [cols.join(",")].concat(plan.plan.map((r) => cols.map((k) => JSON.stringify(r[k] ?? "")).join(","))).join("\n");
writeFileSync(path.join(outDir, "plan-lines.csv"), csv);

console.log("\nStage summary:");
console.log(`  repairable lines : ${plan.counts.repairable_lines}`);
console.log(`  affected invoices: ${plan.counts.affected_invoices}`);
console.log(`  products         : ${plan.counts.products}`);
console.log(`  exception lines  : ${exceptions.reduce((s, e) => s + e.lines, 0)} across ${exceptions.length} products`);
console.log(`  problems         : ${plan.problems.length ? plan.problems.join("; ") : "NONE"}`);
console.log(`  plan hash        : ${plan.plan_hash}`);
console.log(`  approved hash    : ${APPROVED_PLAN_HASH} → ${plan.plan_hash === APPROVED_PLAN_HASH ? "MATCH" : "MISMATCH"}`);
console.log(`  combined GP       : ${money(c.oldGp)} → ${money(c.newGp)}  (+${money(recon.gpIncrease)})`);
console.log(`  report           : ${path.relative(ROOT, outDir)}${path.sep}APPROVAL-REPORT.md (gitignored)`);

if (!execute) {
  console.log("\nDRY RUN complete. Nothing was written. Provide the execute gates to apply this plan.");
  process.exit(plan.plan_hash === APPROVED_PLAN_HASH && plan.problems.length === 0 ? 0 : 1);
}

/* ─────────────────────────── execute (gated above) ──────────────────────── */

if (plan.plan_hash !== approvedHash) {
  console.error(`\nREFUSED: the plan built against the tenant's current state hashes to ${plan.plan_hash}, not the approved ${approvedHash}. No write performed.`);
  process.exit(3);
}
if (plan.problems.length) {
  console.error(`\nREFUSED: the plan reports integrity problems; not writing:\n  - ${plan.problems.join("\n  - ")}`);
  process.exit(3);
}

console.log(`\nEXECUTING approved plan ${approvedHash.slice(0, 12)} against ${companyId} (basis ${COST_BASIS})`);
const report = await executeKfGpCorrectionPlan(sb, plan, { companyId, approvedPlanHash: approvedHash, approval: { approver, acknowledgement } });
writeFileSync(path.join(outDir, `execution-${report.runId}.json`), JSON.stringify(report, null, 1));

console.log("\nResult:");
console.log(`  status           : ${report.status}`);
console.log(`  lines corrected  : ${report.counts.corrected}`);
console.log(`  already applied  : ${report.counts.alreadyApplied}`);
console.log(`  conflicts        : ${report.counts.conflicts}`);
console.log(`  not found        : ${report.counts.notFound}`);
console.log(`  headers updated  : ${report.counts.headersUpdated}`);
console.log(`  run id           : ${report.runId}`);
console.log(`  execution record : ${path.relative(ROOT, outDir)}${path.sep}execution-${report.runId}.json (gitignored)`);
process.exit(report.status === "Completed" ? 0 : 1);
