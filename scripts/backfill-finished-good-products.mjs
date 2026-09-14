#!/usr/bin/env node
/**
 * VYRON — give Finished Good BOMs that have no product the product they are
 * sold as.
 *
 * Until the BOM save created one, a Finished Good BOM saved without choosing a
 * product had product_id null and no product row. It showed in the BOM list but
 * could not be invoiced, sold or received into stock by anyone in the company.
 * New saves no longer leave that gap; this closes it for BOMs saved before.
 *
 * It runs the shipped rule, linkMissingFinishedGoodProduct, one BOM at a time:
 * the product already linked to the BOM, else the one active unlinked product of
 * exactly the same name, else a new product in the BOM's own company. The BOM
 * is not re-costed; its row changes only in product_id.
 *
 * One company per run. Dry run unless --apply is given. Every change is printed
 * as JSON with what is needed to reverse it (the product ids created, and the
 * BOMs whose product_id was set).
 *
 *   node scripts/backfill-finished-good-products.mjs --company <uuid>          # dry run
 *   node scripts/backfill-finished-good-products.mjs --company <uuid> --apply  # write
 */

import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/ts-transpile-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const args = process.argv.slice(2);
const companyId = args[args.indexOf("--company") + 1];
const apply = args.includes("--apply");
if (!args.includes("--company") || !UUID.test(String(companyId || ""))) {
  console.error("Usage: node scripts/backfill-finished-good-products.mjs --company <uuid> [--apply]");
  process.exit(2);
}

for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  const key = trimmed.slice(0, index).trim();
  if (!(key in process.env)) process.env[key] = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
}

const { createClient } = await import("@supabase/supabase-js");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/i, "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { linkMissingFinishedGoodProduct } = await import(
  pathToFileURL(path.join(ROOT, "src/lib/vyron-cost-recipes-data.ts")).href
);

const { data: workspace } = await supabase
  .from("vyron_workspaces")
  .select("id, company_name")
  .eq("company_id", companyId)
  .maybeSingle();
if (!workspace) {
  console.error(`No workspace owns company ${companyId}.`);
  process.exit(2);
}

const { data: boms, error } = await supabase
  .from("vyron_cost_boms")
  .select("id, bom_name, bom_purpose, status, product_id, cost_per_unit")
  .eq("company_id", companyId)
  .is("product_id", null)
  .neq("status", "Archived")
  .order("created_at");
if (error) throw new Error(error.message);
const candidates = (boms || []).filter((bom) => String(bom.bom_purpose || "").toLowerCase() !== "sub-bom");

console.log(`${workspace.company_name} (${companyId}): ${candidates.length} Finished Good BOM(s) with no product.`);
for (const bom of candidates) console.log(`  - ${bom.bom_name} [${bom.status}] ${bom.id}`);

if (!apply) {
  console.log("\nDry run. Nothing was written. Re-run with --apply to link them.");
  process.exit(0);
}

const changes = [];
for (const bom of candidates) {
  const result = await linkMissingFinishedGoodProduct(supabase, companyId, bom.id);
  changes.push({ bomId: bom.id, bomName: bom.bom_name, ...(result || { skipped: true }) });
}
console.log("\nApplied. Reversal record:");
console.log(JSON.stringify({ companyId, appliedAt: new Date().toISOString(), changes }, null, 2));
