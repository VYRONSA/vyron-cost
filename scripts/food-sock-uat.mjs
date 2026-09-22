#!/usr/bin/env node
/**
 * VOLORA Order Engine — Food Sock UAT runner (in memory).
 *
 * Runs every Food Sock UAT scenario (src/lib/order-engine/uat/food-sock-uat.ts)
 * through the real Order Engine and sales-order engine on an IN-MEMORY
 * database, reports catalogue coverage and quality, and prints a verdict per
 * scenario:
 *
 *   PASS                        it did what the scenario says
 *   BLOCKED - BUSINESS DECISION something the business has not decided
 *   BLOCKED - DATA              something the catalogue is missing
 *   FAIL - ENGINEERING          the application is wrong
 *
 *   npm run uat:food-sock                              fictional catalogue
 *   npm run uat:food-sock -- --catalogue <file.json>   a catalogue snapshot
 *   npm run uat:food-sock -- --catalogue <file> --check-only   catalogue report only
 *   npm run uat:food-sock -- ... --json <file>         write the whole report
 *
 * A catalogue snapshot is a JSON file exported beforehand from a
 * NON-PRODUCTION environment, and must classify itself as such. Orders and
 * customers in the scenarios are always fictional. Nothing is written
 * anywhere: no database, no network, no mailbox, no provider.
 */
import { register } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "food-sock-uat-in-memory";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://uat.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const ExcelJS = (await import("exceljs")).default;
const uat = await importFromRoot("src/lib/order-engine/uat/food-sock-uat.ts");
const catalogueValidation = await importFromRoot("src/lib/order-engine/uat/catalogue-validation.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const extraction = await importFromRoot("src/lib/order-engine/extraction.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const connector = await importFromRoot("src/lib/order-engine/connectors/email-connector.ts");
const csvAdapter = await importFromRoot("src/lib/order-engine/adapters/csv.ts");

const flag = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : process.argv[at + 1] || true;
};

let catalogue = uat.fictionalFoodSockCatalogue();
const snapshotFile = flag("--catalogue") || flag("--snapshot");
if (typeof snapshotFile === "string") {
  // A snapshot is a FILE, exported beforehand from a non-production environment.
  // This runner never connects to any database.
  catalogue = uat.loadUatSnapshot(JSON.parse(readFileSync(snapshotFile, "utf8")));
}
const checkOnly = process.argv.includes("--check-only");
const jsonOut = flag("--json");

const CO = uat.FOOD_SOCK_UAT_COMPANY_ID;
const CLERK = { userId: "uat-clerk", name: "UAT Order Desk" };
const MANAGER = { userId: "uat-manager", name: "UAT Sales Manager" };

// ---------------------------------------------------------------------------
// Catalogue: what is in it, and what is missing from it
// ---------------------------------------------------------------------------

const rule = "=".repeat(78);
const report = catalogueValidation.validateCatalogue(catalogue);
const scope = catalogueValidation.compareWithMigratedScope(report);

console.log(`\n${rule}`);
console.log(typeof snapshotFile === "string" ? "  SNAPSHOT / NON-PRODUCTION - Food Sock UAT" : "  FICTIONAL CATALOGUE / NON-PRODUCTION - Food Sock UAT");
console.log(rule);
if (typeof snapshotFile === "string") {
  console.log(`  snapshot file  : ${snapshotFile}`);
  console.log(`  classification : ${catalogue.meta?.classification || "-"}`);
  if (catalogue.meta?.source) console.log(`  source         : ${catalogue.meta.source}`);
  if (catalogue.meta?.environment) console.log(`  environment    : ${catalogue.meta.environment}`);
  if (catalogue.meta?.takenAt) console.log(`  taken at       : ${catalogue.meta.takenAt}`);
}
console.log("  orders         : fictional. In memory only - no database, no network, nothing written.\n");

const c = report.counts;
const cov = report.coverage;
console.log("  COVERAGE");
console.log(`    catalogue    : ${c.products} products (${c.activeProducts} active, ${c.discontinuedProducts} discontinued)`);
console.log(`    SKUs         : ${c.withSku}/${c.products} products have a SKU (${cov.sku}% of active)`);
console.log(`    BOMs         : ${c.withBom} BOMs, ${c.bomLines} lines, ${c.components} components (${cov.bom}% of active products have exactly one BOM)`);
console.log(`    stock        : ${c.stockItems} stock rows (${cov.stock}% of active products measured)`);
console.log(`    cost         : ${cov.cost}% of active products have a cost`);
console.log(`    cases        : ${c.packSizes} pack sizes (${cov.packSize}% of active products)`);
console.log(`    customers    : ${c.customers} in the snapshot`);
console.log(`    pricing      : ${c.customerPrices} customer prices (${cov.customerPricing}% of customers have a price list)`);
console.log(`    rules        : ${c.customerRules} customer rules (${cov.customerRules}% of customers)`);
console.log(`    mappings     : ${c.aliases} item-code mappings, ${c.customerIdentities} remembered customer references`);

if (typeof snapshotFile === "string") {
  console.log("\n  RECONCILIATION with the controlled Food Sock migration scope");
  for (const row of scope) {
    console.log(`    ${row.matches ? "ok  " : "DIFF"} ${row.item.padEnd(18)} expected ${String(row.expected).padStart(4)}  found ${String(row.found).padStart(4)}`);
  }
}

console.log(`\n  CATALOGUE EXCEPTIONS: ${report.findings.length} (data ${report.byKind.DATA}, business decision ${report.byKind.DECISION}, engineering ${report.byKind.ENGINEERING})`);
for (const [code, count] of Object.entries(report.byCode).sort((a, b) => b[1] - a[1])) {
  const example = report.findings.find((f) => f.code === code);
  console.log(`    ${String(count).padStart(4)} × ${code.padEnd(28)} ${example.kind.padEnd(11)} ${example.detail}`);
}
if (!report.findings.length) console.log("    none");
console.log(`\n  Orderable: ${report.orderable ? "yes" : "NO - nothing in this catalogue can be ordered"}`);

if (checkOnly) {
  if (jsonOut) writeFileSync(String(jsonOut), JSON.stringify({ catalogue: report, scope }, null, 2));
  console.log("");
  process.exit(report.byKind.ENGINEERING ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

let scenarios = [];
let blocked = [];
let buildError = null;
try {
  ({ scenarios, blocked } = uat.buildFoodSockUatPlan(catalogue));
} catch (error) {
  buildError = error instanceof Error ? error.message : String(error);
}
const byId = new Map(scenarios.map((s) => [s.id, s]));

/** Put one scenario's input into the engine, exactly as its channel would. */
async function receive(db, input) {
  if (input.kind === "candidate") return { outcome: "ORDER", result: await service.receiveOrderCandidate(db, CO, input.candidate, CLERK) };
  if (input.kind === "woocommerce") {
    return { outcome: "ORDER", result: await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: input.storeKey, order: input.order }), CLERK) };
  }
  if (input.kind === "extraction") {
    return { outcome: "ORDER", result: await extraction.receiveExtractedOrder(db, CO, { extraction: input.extraction, sourceKey: input.sourceKey }, CLERK) };
  }
  if (input.kind === "csv") {
    const candidate = csvAdapter.parseCsvOrder({ text: input.text, fileName: input.fileName });
    return { outcome: "ORDER", result: await service.receiveOrderCandidate(db, CO, candidate, CLERK) };
  }
  if (input.kind === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Order");
    ws.addRow(input.header);
    for (const row of input.rows) ws.addRow(row);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    return message(db, { ...input, attachment: { fileName: input.fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: bytes.toString("base64"), sizeBytes: bytes.length } });
  }
  if (input.kind === "email") return message(db, input);
  throw new Error(`Unknown UAT input "${input.kind}".`);
}

/** Hand a message over the e-mail connector boundary. No mailbox is connected. */
async function message(db, input) {
  const attachment = input.attachment.text
    ? { ...input.attachment, contentBase64: Buffer.from(input.attachment.text, "utf8").toString("base64"), sizeBytes: Buffer.byteLength(input.attachment.text) }
    : input.attachment;
  const handed = await connector.receiveConnectorMessage(
    db,
    {
      messageId: `<uat-${input.attachment.fileName}@uat.example>`,
      provider: "uat-simulated",
      from: input.from || "buyer@uat-retail-north.example",
      to: [input.deliveredTo || "orders@uat-foodsock.example"],
      deliveredTo: input.deliveredTo || "orders@uat-foodsock.example",
      subject: input.subject || "UAT order",
      receivedAt: "2026-10-06T07:30:00Z",
      attachments: [attachment],
    },
    CLERK
  );
  if (handed.status === "QUARANTINED") return { outcome: "QUARANTINED", detail: handed.judgement.summary };
  if (handed.status !== "ACCEPTED") return { outcome: "ERROR", error: `${handed.status}: ${handed.reason || ""}` };
  if (handed.result.status === "NEEDS_EXTRACTION") return { outcome: "DOCUMENT_HELD", detail: handed.result.reason };
  if (handed.result.status !== "PARSED" || !handed.result.orders.length) {
    return { outcome: "ERROR", error: `${handed.result.status}: ${handed.result.reason || "no order"}` };
  }
  return { outcome: "ORDER", result: handed.result.orders[0] };
}

async function run(db, id) {
  for (const prerequisite of byId.get(id).after || []) await run(db, prerequisite);
  const received = await receive(db, byId.get(id).input);
  if (received.outcome !== "ORDER") return received;
  const detail = await service.performIntakeAction(db, CO, received.result.intake.id, "validate", CLERK, { today: uat.FOOD_SOCK_UAT_TODAY });
  return { outcome: "ORDER", detail };
}

const results = [];
if (buildError) {
  console.log(`\n  SCENARIOS: could not be built from this catalogue — ${buildError}\n`);
  results.push({ id: "(build)", verdict: /catalogue has no product|no products/i.test(buildError) ? "BLOCKED — DATA" : "FAIL — ENGINEERING", reason: buildError });
} else {
  console.log(`\n  SCENARIOS (${scenarios.length + blocked.length})\n`);
  // Scenarios this catalogue has no fitting product for. Blocked on the data,
  // reported with what was missing — never quietly dropped.
  for (const item of blocked) {
    console.log(`  ${"BLOCKED - DATA".padEnd(28)} ${item.id.padEnd(26)} ${item.channel.padEnd(10)} not run`);
    console.log(`  ${" ".repeat(28)} ${item.reason}`);
    results.push({ id: item.id, channel: item.channel, verdict: "BLOCKED — DATA", reason: item.reason });
  }
  for (const scenario of scenarios) {
    const db = createFakeSupabase(uat.foodSockUatSeed(catalogue));
    let actual;
    let detail = null;
    try {
      const outcome = await run(db, scenario.id);
      detail = outcome.detail || null;
      actual =
        outcome.outcome === "ORDER"
          ? { outcome: "ORDER", status: outcome.detail.intake.status, codes: outcome.detail.intake.validation.issues.map((i) => i.code) }
          : { outcome: outcome.outcome, detail: outcome.detail, error: outcome.error };
    } catch (error) {
      actual = { outcome: "ERROR", error: error instanceof Error ? error.message : String(error) };
    }
    const { verdict, reason } = uat.classifyUatResult(scenario, actual);
    const label = verdict === "PASS" ? "PASS" : verdict.replace("—", "-");
    console.log(
      `  ${label.padEnd(28)} ${scenario.id.padEnd(26)} ${scenario.channel.padEnd(10)} ${
        actual.outcome === "ORDER" ? `${actual.status} ${(actual.codes || []).join(", ") || "no issues"}` : actual.outcome
      }`
    );
    if (reason) console.log(`  ${" ".repeat(28)} ${reason}`);
    results.push({ id: scenario.id, channel: scenario.channel, verdict, reason, actual });

    // The two valid orders are taken all the way to a Draft sales order.
    if ((scenario.id === "valid-b2b" || scenario.id === "valid-b2c") && detail && verdict === "PASS") {
      const approved = await service.performIntakeAction(db, CO, detail.intake.id, "approve", MANAGER, {
        today: uat.FOOD_SOCK_UAT_TODAY,
        validationHash: detail.intake.validation_hash,
        acknowledgeWarnings: true,
      });
      const so = db.tables.vyron_customer_sales_orders[0];
      console.log(
        `  ${" ".repeat(28)} approved → ${approved.intake.status}; Draft sales order ${so?.order_number} for ${so?.customer_name} ` +
          `(nothing reserved, invoiced or sent to Xero)`
      );
    }
    if (scenario.id === "production-required" && detail) {
      for (const req of detail.intake.validation.production || []) {
        console.log(
          `  ${" ".repeat(28)} produce ${req.shortfall} × ${req.productName}: ` +
            req.components.map((x) => `${x.name} ${x.required}${x.unit ? " " + x.unit : ""}${x.shortfall ? ` (short ${x.shortfall})` : ""}`).join("; ")
        );
      }
    }
  }
}

const tally = results.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] || 0) + 1 }), {});
console.log(`\n${rule}`);
console.log(
  `  ${tally.PASS || 0} PASS · ${tally["BLOCKED — BUSINESS DECISION"] || 0} BLOCKED - BUSINESS DECISION · ` +
    `${tally["BLOCKED — DATA"] || 0} BLOCKED - DATA · ${tally["FAIL — ENGINEERING"] || 0} FAIL - ENGINEERING`
);
console.log(`  Catalogue exceptions: ${report.findings.length} (data ${report.byKind.DATA}, decision ${report.byKind.DECISION}, engineering ${report.byKind.ENGINEERING})`);
console.log(rule);

if (jsonOut) {
  writeFileSync(String(jsonOut), JSON.stringify({ catalogue: report, scope, scenarios: results, tally }, null, 2));
  console.log(`  Report written to ${jsonOut}`);
}
console.log("");

// Only an engineering failure fails the run: a missing decision or a gap in the
// catalogue is a finding for the business, not a broken build.
process.exit((tally["FAIL — ENGINEERING"] || 0) > 0 || report.byKind.ENGINEERING > 0 ? 1 : 0);
