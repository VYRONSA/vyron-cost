#!/usr/bin/env node
/**
 * VYRON — Food Sock Meals migration: dry run, reports, gated execution.
 *
 * Reads the client's supplied files, plans every Phase 1 stage, classifies
 * demo-ready products, and writes the plan and a summary to
 * .migration-reports/ (gitignored — it contains client data).
 *
 * Without --execute this script never inserts, updates or deletes anything.
 *
 *   node scripts/food-sock-migration.mjs --sources <dir>
 *       Plans against a NEW tenant (empty target). No database access at all.
 *
 *   node scripts/food-sock-migration.mjs --sources <dir> --company <uuid>
 *       Also reads that one tenant's existing master data — SELECT only, every
 *       query filtered by company_id — so the plan shows matches, not
 *       duplicates. Uses the service-role key in .env.local for that read.
 *
 *   --verify-deterministic   build the plan twice and require identical hashes
 *   --demo-report            dependency / opening-stock / client-question / GTIN
 *                            report for the scope (no database access of its own)
 *   --validate               with --company: read-only post-import check of row
 *                            counts and of what a re-plan would still create
 *   --execute                WRITES to the tenant; gated below
 *
 * Family C: --execute writes client master data. Every other mode is either
 * database-free or company-scoped SELECTs only.
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
const sourcesDir = flag("--sources");
const companyId = flag("--company");
if (!sourcesDir) {
  console.error("Usage: node scripts/food-sock-migration.mjs --sources <dir> [--company <uuid> --expect-database <ref>] [--scope demo|all_planned] [--verify-deterministic] [--demo-report] [--validate] [--execute --approve-plan-hash <hash> --approver <name> --acknowledge \"<text>\"]");
  process.exit(2);
}
if (companyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
  console.error("--company must be a UUID.");
  process.exit(2);
}

/*
 * EXECUTE MODE — every gate is checked here, before any database access.
 *
 *   --execute --company <uuid> --approve-plan-hash <hash> [--scope demo|all_planned]
 *   with VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 in the environment.
 *
 * The plan is rebuilt against the tenant's CURRENT state and must hash to the
 * approved value, so a plan approved yesterday cannot be applied to a tenant
 * that has changed since.
 */
const execute = args.includes("--execute");
const approvedHash = flag("--approve-plan-hash");
const approver = flag("--approver");
const acknowledgement = flag("--acknowledge");
const expectDatabase = flag("--expect-database");
const scope = flag("--scope") || "demo";
const refuse = (message) => {
  console.error(`REFUSED: ${message}`);
  process.exit(3);
};

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
 * DATABASE IDENTITY — any mode that touches a database names the project it
 * expects, and refuses before a client exists if .env.local points elsewhere.
 */
if (companyId || execute || args.includes("--validate")) {
  const actual = configuredDatabaseRef();
  if (!expectDatabase) refuse("Database access needs --expect-database <project-ref>, the ref proven for production (runbook §3).");
  if (!actual) refuse(".env.local has no parseable NEXT_PUBLIC_SUPABASE_URL.");
  if (actual !== expectDatabase.toLowerCase()) refuse(`.env.local points at "${actual}", not the expected "${expectDatabase}". Nothing was read or written.`);
}

if (execute) {
  if (!companyId) refuse("--execute needs --company <uuid> of the approved Food Sock tenant.");
  if (!approvedHash) refuse("--execute needs --approve-plan-hash <hash> from a reviewed dry run against that tenant.");
  // The approval is bound to the scope, so an execution never falls back to a default one.
  if (!flag("--scope")) refuse("--execute needs an explicit --scope demo|all_planned; the approval is bound to it.");
  if (!["demo", "all_planned"].includes(scope)) refuse("--scope must be demo or all_planned.");
  if (!approver?.trim()) refuse("--execute needs --approver <name>: the person who approved this plan hash.");
  const expected = `IMPORT FOOD SOCK PLAN ${approvedHash.slice(0, 12)} SCOPE ${scope} INTO ${companyId}`;
  if (acknowledgement !== expected) refuse(`--acknowledge must be exactly "${expected}".`);
  if (process.env.VYRON_ACKNOWLEDGE_PRODUCTION_WRITE !== "1") {
    refuse("This writes to the database .env.local points at. Set VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 to confirm.");
  }
  // The Repository Safety Programme decides whether this asset may write here.
  // This script adds no override: a prohibited verdict is final.
  const { evaluateExecution } = await import("./safety/environment.mjs");
  const decision = evaluateExecution("food-sock-migration");
  if (decision.verdict === "prohibited" || decision.verdict === "unregistered") {
    refuse(`Repository Safety Programme verdict for food-sock-migration is ${decision.verdict.toUpperCase()}:\n  - ${decision.reasons.join("\n  - ")}`);
  }
}

const { readFoodSockSources } = await import("../src/lib/data-migration/food-sock-sources.ts");
const { buildFoodSockPlan, emptyTarget } = await import("../src/lib/data-migration/food-sock-plan.ts");

const readFile = (name) => new Uint8Array(readFileSync(path.join(sourcesDir, name)));

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

/** Tables an execution may touch, counted for this tenant and globally. */
const AFFECTED_TABLES = [
  "vyron_cost_suppliers",
  "vyron_contacts",
  "vyron_cost_categories",
  "vyron_cost_ingredients",
  "vyron_cost_stock_items",
  "vyron_cost_products",
  "vyron_cost_boms",
  "vyron_cost_bom_lines",
  "vyron_cost_stock_ledger",
  "vyron_inventory_audit_log",
  "vyron_cost_low_stock_alerts",
  "vyron_import_source_links",
  "vyron_import_runs",
];

async function countTables(sb, id) {
  const counts = {};
  for (const table of AFFECTED_TABLES) {
    const tenant = await sb.from(table).select("*", { count: "exact", head: true }).eq("company_id", id);
    const global = await sb.from(table).select("*", { count: "exact", head: true });
    counts[table] = { tenant: tenant.error ? `ERR ${tenant.error.message}` : tenant.count, global: global.error ? `ERR ${global.error.message}` : global.count };
  }
  return counts;
}

async function readTarget(id) {
  const { readFoodSockTarget } = await import("../src/lib/data-migration/food-sock-target.ts");
  return readFoodSockTarget(await serviceClient(), id, (message) => console.log(`  (${message})`));
}

console.log(execute ? `VYRON — Food Sock Meals migration — EXECUTE (scope ${scope}); planning first` : "VYRON — Food Sock Meals migration — DRY RUN (nothing is written)");
const sources = readFoodSockSources(readFile);
const target = companyId ? await readTarget(companyId) : emptyTarget(null);
console.log(companyId ? `Target: existing tenant ${companyId} (read-only)` : "Target: NEW tenant (empty) — no database access");

const plan = buildFoodSockPlan(sources, target);
if (args.includes("--verify-deterministic")) {
  const again = buildFoodSockPlan(readFoodSockSources(readFile), target);
  if (again.planHash !== plan.planHash) {
    console.error(`NOT DETERMINISTIC: ${plan.planHash} vs ${again.planHash}`);
    process.exit(1);
  }
  console.log(`Deterministic: two builds produced plan hash ${plan.planHash}`);
}

const outDir = path.join(ROOT, ".migration-reports", "food-sock", plan.planHash.slice(0, 12));
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 1));

const lines = [];
lines.push(`# Food Sock Meals — Phase 1 dry run`, "", `Plan hash: \`${plan.planHash}\`  `, `Version: ${plan.version}  `, `Target: ${plan.target.mode}${plan.target.companyId ? ` (${plan.target.companyId})` : ""}`, "");
lines.push("## Sources", "", "| File | sha256 | bytes | notes |", "|---|---|---|---|");
for (const f of plan.sources) lines.push(`| ${f.name} | \`${f.sha256.slice(0, 16)}…\` | ${f.bytes} | ${[f.encoding, f.hadByteOrderMark ? "BOM" : "", f.malformedRows ? `${f.malformedRows} malformed rows` : ""].filter(Boolean).join(", ")} |`);
lines.push("", "## Stages", "", "| Stage | total | create | match | update | skip | exception | unresolved | warnings | tables |", "|---|---|---|---|---|---|---|---|---|---|");
for (const [stage, s] of Object.entries(plan.stages)) {
  const c = s.counts;
  lines.push(`| ${stage} | ${c.total} | ${c.create} | ${c.match} | ${c.update} | ${c.skip} | ${c.exception} | ${c.unresolved} | ${c.warnings} | ${s.tables.join("; ")} |`);
}
lines.push("", "## Exceptions (every one, with reason)", "");
for (const [stage, s] of Object.entries(plan.stages)) {
  for (const item of s.items.filter((i) => i.action === "exception")) {
    lines.push(`- **${stage}** \`${item.sourceKey}\` (rows ${item.sources.map((r) => r.row).slice(0, 6).join(",")}${item.sources.length > 6 ? "…" : ""}): ${item.issues.filter((i) => i.severity !== "warning").map((i) => `${i.code} — ${i.message}`).join(" | ")}`);
  }
}
lines.push("", "## Unresolved values", "");
for (const [stage, s] of Object.entries(plan.stages)) {
  for (const item of s.items) for (const i of item.issues.filter((x) => x.severity === "unresolved")) lines.push(`- ${stage} \`${item.sourceKey}\`: ${i.code} — ${i.message}`);
}
lines.push("", "## Demo readiness (finished goods)", "", `Ready: ${plan.demoReadiness.filter((d) => d.ready).length} of ${plan.demoReadiness.length}`, "");
for (const d of plan.demoReadiness) lines.push(`- ${d.ready ? "READY" : "not ready"} — ${d.productName}${d.sku ? ` (${d.sku})` : ""}${d.ready ? "" : `: ${d.reasons.join(" ")}`}`);
writeFileSync(path.join(outDir, "summary.md"), lines.join("\n"));

console.log("\nStage counts:");
for (const [stage, s] of Object.entries(plan.stages)) {
  const c = s.counts;
  console.log(`  ${stage.padEnd(30)} total=${String(c.total).padStart(4)} create=${String(c.create).padStart(4)} match=${String(c.match).padStart(3)} skip=${String(c.skip).padStart(4)} exception=${String(c.exception).padStart(3)} unresolved=${String(c.unresolved).padStart(3)} warnings=${String(c.warnings).padStart(4)}`);
}
console.log(`\nDemo-ready finished goods: ${plan.demoReadiness.filter((d) => d.ready).length} of ${plan.demoReadiness.length}`);
console.log(`Plan hash: ${plan.planHash}`);
console.log(`Report: ${path.relative(ROOT, outDir)}${path.sep}summary.md (gitignored)`);

if (args.includes("--demo-report")) {
  const { buildDemoReport } = await import("../src/lib/data-migration/food-sock-demo.ts");
  // Client business content (featured product, open client questions) lives in
  // a file beside the client's files, never in the repository.
  const demoConfigPath = flag("--demo-config");
  const demoReport = buildDemoReport(plan, scope, demoConfigPath ? JSON.parse(readFileSync(demoConfigPath, "utf8")) : {});
  if (!demoConfigPath) console.log("\n(no --demo-config: the report has no featured product and no client questions)");
  writeFileSync(path.join(outDir, `demo-report-${scope}.json`), JSON.stringify(demoReport, null, 1));
  const primary = demoReport.primaryDemoProduct;
  console.log(`\nDemo report (${scope}): ${demoReport.products.length} products, ${demoReport.openingStock.included} opening balances (${demoReport.openingStock.roundingFlagged} with rounding), ${demoReport.clientQuestions.length} client questions, ${demoReport.barcodes.filter((b) => b.status === "unresolved").length} unresolved GTINs.`);
  if (primary) console.log(`Primary: ${primary.product} (${primary.sku}) — BOM ${primary.bom?.computedCost} vs inFlow ${primary.bom?.inflowCost}; opening stock supports ${primary.maxUnitsFromOpeningStock} units (limited by ${primary.limitingComponent}).`);
  console.log(`Expected import rows: ${JSON.stringify(demoReport.expectedImportRows)}`);
  console.log(`Written: ${path.relative(ROOT, outDir)}${path.sep}demo-report-${scope}.json`);
}

/*
 * VALIDATE — read-only, after an import: the tenant must hold exactly what the
 * import was expected to create, and every record in the scope must be matched
 * to an existing row by the executor's identity rules (none missing, none
 * sharing a row).
 */
if (args.includes("--validate")) {
  if (!companyId) {
    console.error("--validate needs --company <uuid>.");
    process.exit(2);
  }
  const { expectedImportRows } = await import("../src/lib/data-migration/food-sock-demo.ts");
  const { reconcileImportedScope } = await import("../src/lib/data-migration/food-sock-validate.ts");
  const expectedPlan = buildFoodSockPlan(sources, emptyTarget(companyId));
  const expected = expectedImportRows(expectedPlan, scope);
  const sb = await serviceClient();
  let problems = 0;
  console.log(`\nVALIDATE tenant ${companyId} (read-only, scope ${scope}):`);
  for (const [table, want] of Object.entries(expected)) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("company_id", companyId);
    const ok = !error && count === want;
    if (!ok) problems += 1;
    console.log(`  ${ok ? "ok  " : "DIFF"} ${table.padEnd(30)} expected ${want}, found ${error ? `ERR ${error.message}` : count}`);
  }
  const reconciliation = reconcileImportedScope(expectedPlan, plan, scope);
  console.log("\n  Record reconciliation (scope record → existing row):");
  for (const [stage, r] of Object.entries(reconciliation.stages)) {
    const clean = !r.missing.length && !r.collisions.length;
    if (!clean) problems += 1;
    console.log(`  ${clean ? "ok  " : "DIFF"} ${stage.padEnd(30)} ${r.present} of ${r.expected} present, ${r.missing.length} missing, ${r.collisions.length} shared rows`);
    for (const m of r.missing) console.log(`         missing ${m.sourceKey} (${m.action}): ${m.detail}`);
    for (const c of r.collisions) console.log(`         shared row ${c.targetId}: ${c.sourceKeys.join(", ")}`);
  }
  console.log(problems ? `\nVALIDATION FOUND ${problems} DIFFERENCE(S). Note: demo purchasing/production after the import legitimately adds ledger and audit rows.` : "\nVALIDATION PASSED.");
  process.exit(problems ? 1 : 0);
}

if (execute) {
  if (plan.planHash !== approvedHash) {
    console.error(`\nREFUSED: the plan built against the tenant's current state hashes to ${plan.planHash}, not the approved ${approvedHash}.`);
    process.exit(3);
  }
  const { executeFoodSockPlan } = await import("../src/lib/data-migration/food-sock-execute.ts");
  const sb = await serviceClient();
  console.log(`\nEXECUTING approved plan ${approvedHash.slice(0, 12)} against tenant ${companyId} (scope: ${scope})`);
  const before = await countTables(sb, companyId);
  const report = await executeFoodSockPlan(sb, plan, { companyId, approvedPlanHash: approvedHash, scope, approval: { approver, acknowledgement } });
  const after = await countTables(sb, companyId);
  const deltas = {};
  const leaks = [];
  for (const table of AFFECTED_TABLES) {
    const dTenant = Number(after[table].tenant) - Number(before[table].tenant);
    const dGlobal = Number(after[table].global) - Number(before[table].global);
    deltas[table] = { before: before[table], after: after[table], tenantDelta: dTenant, globalDelta: dGlobal };
    if (dGlobal !== dTenant) leaks.push(table);
  }
  writeFileSync(path.join(outDir, `execution-${report.runId}.json`), JSON.stringify({ report, deltas, leaks }, null, 1));
  console.log("\nPer-stage results:");
  for (const [stage, c] of Object.entries(report.counts)) console.log(`  ${stage.padEnd(20)} ${JSON.stringify(c)}`);
  console.log("\nBEFORE → AFTER (tenant / global):");
  for (const [table, d] of Object.entries(deltas)) console.log(`  ${table.padEnd(30)} ${d.before.tenant}→${d.after.tenant} (Δ${d.tenantDelta})   global ${d.before.global}→${d.after.global} (Δ${d.globalDelta})`);
  const failed = report.results.filter((r) => r.status === "failed");
  if (failed.length) console.log(`\nFAILED records (${failed.length}):\n${failed.map((r) => `  ${r.stage} ${r.sourceKey}: ${r.detail}`).join("\n")}`);
  if (report.reconciliation.length) console.log(`\nRECONCILIATION differences (${report.reconciliation.length}):\n${report.reconciliation.map((f) => `  ${f.stage} ${f.sourceKey} ${f.field}: expected ${f.expected}, got ${f.actual}`).join("\n")}`);
  if (leaks.length) console.log(`\nWARNING: rows changed outside this tenant in: ${leaks.join(", ")} (another writer was active, or scoping failed) — investigate before continuing.`);
  process.exit(failed.length || report.reconciliation.length || leaks.length ? 1 : 0);
}
