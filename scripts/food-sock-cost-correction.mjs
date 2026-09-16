#!/usr/bin/env node
/**
 * VYRON — Food Sock cost-precision correction (Family P).
 *
 * Corrects two Food Sock ingredient costs the import could not store at full
 * precision, and the Date Sticker stock valuation that followed from the
 * inventory engine's four-decimal average cost. The scope is fixed in
 * src/lib/data-migration/food-sock-cost-correction.ts and in the database
 * function apply_food_sock_cost_precision_correction() (migration
 * 20260917100000); it is not an input.
 *
 * Modes:
 *   node scripts/food-sock-cost-correction.mjs --sources <dir> \
 *       --company <uuid> --expect-database <ref> [--verify-deterministic]
 *       DRY RUN. SELECT only. Rebuilds the plan from the live tenant and the
 *       client's product export, prints every change and every blocker, and
 *       writes the approval artifact to .migration-reports/ (gitignored).
 *
 *   node scripts/food-sock-cost-correction.mjs --execute --sources <dir> \
 *       --company <uuid> --expect-database <ref> --approve-plan-hash <hash> \
 *       --approver "<name>" --reason "<text>" \
 *       --acknowledge "CORRECT FOOD SOCK COST PRECISION <hash12> IN <company>"
 *       with VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1, through
 *       scripts/safety/run.mjs (Family P). WRITES, in one transaction.
 *
 * --execute refuses until the approved plan hash is pinned in the module by a
 * reviewed commit, and the rebuilt plan must hash to it.
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
const refuse = (message) => {
  console.error(`REFUSED: ${message}`);
  process.exit(3);
};

const correction = await import("../src/lib/data-migration/food-sock-cost-correction.ts");
const { FOOD_SOCK_COMPANY_ID, FOOD_SOCK_PRODUCTION_DB_REF, APPROVED_PLAN_HASH, CORRECTION_KEY } = correction;

const sourcesDir = flag("--sources");
const companyId = flag("--company");
const expectDatabase = flag("--expect-database");
const execute = has("--execute");
if (!sourcesDir || !companyId) {
  console.error("Usage: node scripts/food-sock-cost-correction.mjs --sources <dir> --company <uuid> --expect-database <ref> [--verify-deterministic] [--execute --approve-plan-hash <hash> --approver <name> --reason <text> --acknowledge <text>]");
  process.exit(2);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) refuse("--company must be a UUID.");
if (companyId !== FOOD_SOCK_COMPANY_ID) refuse(`This correction is bound to the Food Sock tenant ${FOOD_SOCK_COMPANY_ID}.`);

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

// DATABASE IDENTITY — checked before any client exists.
{
  const actual = configuredDatabaseRef();
  if (!expectDatabase) refuse("Database access needs --expect-database <project-ref>, the verified production ref.");
  if (expectDatabase.toLowerCase() !== FOOD_SOCK_PRODUCTION_DB_REF) refuse(`--expect-database must be the verified production project ${FOOD_SOCK_PRODUCTION_DB_REF}.`);
  if (!actual) refuse(".env.local has no parseable NEXT_PUBLIC_SUPABASE_URL.");
  if (actual !== expectDatabase.toLowerCase()) refuse(`.env.local points at "${actual}", not "${expectDatabase}". Nothing was read or written.`);
}

// EXECUTE GATES that need no database — checked before any database access.
const approval = {
  approvedPlanHash: flag("--approve-plan-hash"),
  pinnedPlanHash: APPROVED_PLAN_HASH,
  approver: flag("--approver"),
  acknowledgement: flag("--acknowledge"),
  reason: flag("--reason"),
  productionWriteAcknowledged: process.env.VYRON_ACKNOWLEDGE_PRODUCTION_WRITE === "1",
};
if (execute) {
  if (!APPROVED_PLAN_HASH) refuse("No plan hash has been approved and pinned in src/lib/data-migration/food-sock-cost-correction.ts; nothing may be applied.");
  if (approval.approvedPlanHash !== APPROVED_PLAN_HASH) refuse(`--approve-plan-hash must be the pinned approved hash ${APPROVED_PLAN_HASH}.`);
  if (!approval.approver?.trim()) refuse("--execute needs --approver <name>: the person who approved this plan hash.");
  if (!approval.reason?.trim()) refuse("--execute needs --reason <text>.");
  if (approval.acknowledgement !== correction.correctionAcknowledgement(APPROVED_PLAN_HASH)) refuse(`--acknowledge must be exactly "${correction.correctionAcknowledgement(APPROVED_PLAN_HASH)}".`);
  if (!approval.productionWriteAcknowledged) refuse("This writes to production. Set VYRON_ACKNOWLEDGE_PRODUCTION_WRITE=1 to confirm.");
  // The Repository Safety Programme decides whether this asset may write here. No override.
  const { evaluateExecution } = await import("./safety/environment.mjs");
  const decision = evaluateExecution("food-sock-cost-correction");
  if (decision.verdict === "prohibited" || decision.verdict === "unregistered") {
    refuse(`Repository Safety Programme verdict for food-sock-cost-correction is ${decision.verdict.toUpperCase()}:\n  - ${decision.reasons.join("\n  - ")}`);
  }
}

async function serviceClient() {
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
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

const { readFoodSockSources } = await import("../src/lib/data-migration/food-sock-sources.ts");
const readSource = () => readFoodSockSources((name) => new Uint8Array(readFileSync(path.join(sourcesDir, name))));
const sb = await serviceClient();

console.log(`VYRON — Food Sock cost-precision correction — ${execute ? "EXECUTE" : "DRY RUN (nothing is written)"}`);
const source = correction.sourceEvidence(readSource());
const state = await correction.readCorrectionState(sb, companyId);
const plan = correction.buildCorrectionPlan(state, source);
if (has("--verify-deterministic")) {
  const again = correction.buildCorrectionPlan(await correction.readCorrectionState(sb, companyId), correction.sourceEvidence(readSource()));
  if (again.planHash !== plan.planHash) {
    console.error(`NOT DETERMINISTIC: ${plan.planHash} vs ${again.planHash}`);
    process.exit(1);
  }
  console.log(`Deterministic: two builds produced plan hash ${plan.planHash}`);
}

console.log(`\nSource: ${source.file} sha256 ${source.sha256}`);
for (const c of source.costs) console.log(`  ${c.name.padEnd(14)} row ${c.row}  Cost ${c.raw}`);
console.log(`\nDate Sticker stock item (resolved): ${plan.stockItemId ?? "(unresolved)"}`);
console.log(`Insert Sleeve stock item (verified, unchanged): ${plan.unchangedStockItemId ?? "(unresolved)"}`);
console.log("\nChanges:");
for (const c of plan.changes) console.log(`  ${c.table}.${c.field.padEnd(16)} ${c.id}  ${c.from} → ${c.to}`);
console.log(`\nCorrection record table: ${state.correctionTable}; existing ${CORRECTION_KEY}: ${state.existingCorrection ? state.existingCorrection.id : "none"}`);
console.log(`Status: ${plan.status.toUpperCase()}`);
for (const b of plan.blockers) console.log(`  BLOCKER: ${b}`);
console.log(`\nPlan hash: ${plan.planHash}`);
console.log(`Acknowledgement for this plan: ${correction.correctionAcknowledgement(plan.planHash)}`);
console.log(`Pinned approved hash: ${APPROVED_PLAN_HASH ?? "(none — execution is refused)"}`);

const outDir = path.join(ROOT, ".migration-reports", "food-sock", "cost-correction", plan.planHash.slice(0, 12));
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "plan.json"), JSON.stringify({ plan, state }, null, 1));
console.log(`Written: ${path.relative(ROOT, outDir)}${path.sep}plan.json (gitignored)`);

if (!execute) process.exit(plan.status === "blocked" ? 1 : 0);

try {
  const result = await correction.applyCorrection(sb, plan, approval);
  const after = correction.buildCorrectionPlan(await correction.readCorrectionState(sb, companyId), correction.sourceEvidence(readSource()));
  writeFileSync(path.join(outDir, `execution-${result.correction_id}.json`), JSON.stringify({ result, after }, null, 1));
  console.log(`\nDatabase result: ${result.status} (correction ${result.correction_id})`);
  console.log(`Re-read status: ${after.status.toUpperCase()}${after.blockers.length ? `\n  - ${after.blockers.join("\n  - ")}` : ""}`);
  process.exit(after.status === "already_applied" ? 0 : 1);
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}
