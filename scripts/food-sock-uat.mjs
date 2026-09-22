#!/usr/bin/env node
/**
 * VOLORA Order Engine — Food Sock UAT runner (in memory).
 *
 * Runs every Food Sock UAT scenario (src/lib/order-engine/uat/food-sock-uat.ts)
 * through the real Order Engine and sales-order engine on an IN-MEMORY
 * database, prints each outcome, and approves the two valid orders to show the
 * Sales Order handoff.
 *
 *   npm run uat:food-sock                              fictional catalogue
 *   npm run uat:food-sock -- --catalogue <file.json>   a catalogue snapshot
 *
 * A catalogue snapshot is a JSON file { products, stockItems, boms, bomLines }
 * exported from a UAT environment. Orders and customers are always fictional.
 * Nothing is written anywhere: no database, no network, no mailbox.
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "food-sock-uat-in-memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uat.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const uat = await importFromRoot("src/lib/order-engine/uat/food-sock-uat.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const extraction = await importFromRoot("src/lib/order-engine/extraction.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");

const arg = process.argv.indexOf("--catalogue");
let catalogue = uat.fictionalFoodSockCatalogue();
if (arg !== -1) {
  const file = process.argv[arg + 1];
  if (!file) throw new Error("--catalogue needs a file path.");
  const loaded = JSON.parse(readFileSync(file, "utf8"));
  for (const key of ["products", "stockItems", "boms", "bomLines"]) {
    if (!Array.isArray(loaded[key])) throw new Error(`Catalogue snapshot is missing "${key}".`);
  }
  // The snapshot is re-homed onto the in-memory UAT tenant; its own company ids are not used.
  const rehome = (rows) => rows.map((r) => ({ ...r, company_id: uat.FOOD_SOCK_UAT_COMPANY_ID }));
  catalogue = { products: rehome(loaded.products), stockItems: rehome(loaded.stockItems), boms: rehome(loaded.boms), bomLines: rehome(loaded.bomLines) };
}

const CO = uat.FOOD_SOCK_UAT_COMPANY_ID;
const CLERK = { userId: "uat-clerk", name: "UAT Order Desk" };
const MANAGER = { userId: "uat-manager", name: "UAT Sales Manager" };
const scenarios = uat.buildFoodSockUatScenarios(catalogue);
const byId = new Map(scenarios.map((s) => [s.id, s]));

async function receive(db, input) {
  if (input.kind === "candidate") return service.receiveOrderCandidate(db, CO, input.candidate, CLERK);
  if (input.kind === "woocommerce") return service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: input.storeKey, order: input.order }), CLERK);
  return extraction.receiveExtractedOrder(db, CO, { extraction: input.extraction, sourceKey: input.sourceKey }, CLERK);
}
async function run(db, id) {
  for (const prerequisite of byId.get(id).after || []) await run(db, prerequisite);
  const { intake } = await receive(db, byId.get(id).input);
  return service.performIntakeAction(db, CO, intake.id, "validate", CLERK, { today: uat.FOOD_SOCK_UAT_TODAY });
}

console.log(`\nVOLORA — Food Sock UAT (${arg !== -1 ? "catalogue snapshot" : "fictional catalogue"}, in memory; nothing is written anywhere)\n`);
let mismatches = 0;
for (const scenario of scenarios) {
  const db = createFakeSupabase(uat.foodSockUatSeed(catalogue));
  const detail = await run(db, scenario.id);
  const codes = detail.intake.validation.issues.map((i) => i.code);
  const ok = detail.intake.status === scenario.expect.status && scenario.expect.codes.every((c) => codes.includes(c)) && (scenario.expect.absent || []).every((c) => !codes.includes(c));
  if (!ok) mismatches++;
  console.log(`${ok ? "PASS" : "DIFF"}  ${scenario.id.padEnd(26)} ${detail.intake.status.padEnd(18)} ${codes.join(", ") || "no issues"}`);
  if (scenario.id === "valid-b2b" || scenario.id === "valid-b2c") {
    const approved = await service.performIntakeAction(db, CO, detail.intake.id, "approve", MANAGER, {
      today: uat.FOOD_SOCK_UAT_TODAY,
      validationHash: detail.intake.validation_hash,
      acknowledgeWarnings: true,
    });
    const so = db.tables.vyron_customer_sales_orders[0];
    console.log(`      approved → ${approved.intake.status}; Draft sales order ${so?.order_number} for ${so?.customer_name} (nothing reserved, invoiced or sent to Xero)`);
  }
  if (scenario.id === "production-required") {
    for (const req of detail.intake.validation.production || []) {
      console.log(`      produce ${req.shortfall} × ${req.productName}: ${req.components.map((c) => `${c.name} ${c.required}${c.unit ? " " + c.unit : ""}${c.shortfall ? ` (short ${c.shortfall})` : ""}`).join("; ")}`);
    }
  }
}
console.log(`\n${scenarios.length - mismatches}/${scenarios.length} scenarios behaved as expected.`);
process.exit(mismatches ? 1 : 0);
