#!/usr/bin/env node
/**
 * VYRON Order Engine — fixture scenarios (the same fixtures the demo uses).
 *
 * Every scenario in src/lib/order-engine/demo/fixtures.ts is received through
 * its real adapter (manual / CSV / WooCommerce / Shopify), validated, and
 * checked against its expected outcome; every approvable scenario is then
 * approved and handed to the real sales-order engine, and the Draft sales
 * order is checked line by line (product, quantity, price, discount, tax,
 * PO reference, customer). Fictional tenant only; in-memory database.
 *
 *   node scripts/test-order-engine-fixtures.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-order-engine-fixtures";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const fixtures = await importFromRoot("src/lib/order-engine/demo/fixtures.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const { parseCsvOrder } = await importFromRoot("src/lib/order-engine/adapters/csv.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const { ISSUE_CATALOG } = await importFromRoot("src/lib/order-engine/issue-catalog.ts");

const { DEMO_COMPANY_ID: CO, DEMO_SCENARIOS, DEMO_TODAY, DEMO_PRODUCTS, demoSeed } = fixtures;
const CLERK = { userId: "demo-clerk", name: "Demo Clerk" };
const APPROVER = { userId: "demo-manager", name: "Demo Manager" };

const toCandidate = (input) => {
  if (input.kind === "candidate") return input.candidate;
  if (input.kind === "csv") return parseCsvOrder({ text: input.text, fileName: input.fileName });
  if (input.kind === "woocommerce") return platforms.normalizeWooCommerceOrder({ storeKey: input.storeKey, order: input.order });
  if (input.kind === "shopify") return platforms.normalizeShopifyOrder({ storeKey: input.storeKey, order: input.order });
  throw new Error(`unknown input ${input.kind}`);
};

const byId = new Map(DEMO_SCENARIOS.map((s) => [s.id, s]));

async function runScenario(db, scenario) {
  const { intake } = await service.receiveOrderCandidate(db, CO, toCandidate(scenario.input), CLERK);
  return service.performIntakeAction(db, CO, intake.id, "validate", CLERK, { today: DEMO_TODAY });
}

check("fixture catalogue has at least 17 scenarios", DEMO_SCENARIOS.length >= 17, String(DEMO_SCENARIOS.length));
check("every expected code exists in the issue catalogue", DEMO_SCENARIOS.every((s) => [...s.expect.codes, ...(s.expect.absent || [])].every((c) => c in ISSUE_CATALOG)));
check("demo 'today' is a Tuesday", new Date(`${DEMO_TODAY}T00:00:00Z`).getUTCDay() === 2);

for (const scenario of DEMO_SCENARIOS) {
  console.log(`\n${scenario.id} — ${scenario.title}`);
  const db = createFakeSupabase(demoSeed());
  for (const prerequisite of scenario.after || []) await runScenario(db, byId.get(prerequisite));
  let detail;
  try {
    detail = await runScenario(db, scenario);
  } catch (error) {
    check(`${scenario.id}: received and validated`, false, error.message);
    continue;
  }
  const codes = detail.intake.validation.issues.map((i) => i.code);
  check(`${scenario.id}: status ${scenario.expect.status}`, detail.intake.status === scenario.expect.status, `${detail.intake.status} ${JSON.stringify(codes)}`);
  for (const code of scenario.expect.codes) check(`${scenario.id}: raises ${code}`, codes.includes(code), JSON.stringify(codes));
  for (const code of scenario.expect.absent || []) check(`${scenario.id}: does not raise ${code}`, !codes.includes(code), JSON.stringify(codes));
  check(`${scenario.id}: every raised code is catalogued`, codes.every((c) => c in ISSUE_CATALOG), codes.filter((c) => !(c in ISSUE_CATALOG)).join(","));

  if (detail.intake.status !== "AWAITING_APPROVAL") continue;

  // Approve and hand off to the existing sales-order engine.
  const approved = await service.performIntakeAction(db, CO, detail.intake.id, "approve", APPROVER, {
    today: DEMO_TODAY,
    validationHash: detail.intake.validation_hash,
    acknowledgeWarnings: true,
  });
  check(`${scenario.id}: approved → CONFIRMED`, approved.intake.status === "CONFIRMED", approved.intake.status);
  const so = db.tables.vyron_customer_sales_orders.find((o) => o.id === approved.intake.sales_order_id);
  check(`${scenario.id}: Draft sales order created`, so?.status === "Draft");
  const soLines = db.tables.vyron_customer_sales_order_lines.filter((l) => l.sales_order_id === so?.id);
  const evaluations = approved.intake.validation.lines;
  check(`${scenario.id}: one sales-order line per order line`, soLines.length === evaluations.length, `${soLines.length} vs ${evaluations.length}`);
  check(
    `${scenario.id}: products, quantities and prices carried exactly`,
    evaluations.every((e) => soLines.some((l) => l.product_id === e.productId && l.quantity === e.quantity && l.selling_price === e.effectiveUnitPrice)),
    JSON.stringify(soLines.map((l) => [l.product_id, l.quantity, l.selling_price]))
  );
  check(`${scenario.id}: tax is the workspace rate`, soLines.every((l) => l.tax_rate === 15));
  check(`${scenario.id}: customer carried`, so?.customer_id === approved.intake.validation.customer.id);
  if (approved.intake.customer_po_number) check(`${scenario.id}: PO carried to the sales order`, String(so?.notes).includes(approved.intake.customer_po_number));
  check(`${scenario.id}: nothing posted, invoiced or queued`, db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_xero_sync_queue.length === 0 && db.tables.vyron_cost_stock_ledger.length === 0);
  check(`${scenario.id}: nothing reserved by the handoff`, db.tables.vyron_customer_sales_order_allocations.length === 1);

  if (scenario.id === "with-discount") {
    const line = soLines[0];
    // 24 × 28 = 672 gross, R60 off → 8.9286 %; the sales order recomputes 612 net.
    check("with-discount: discount carried as a percentage", Math.abs(line.discount_pct - 8.9286) < 0.0001, String(line.discount_pct));
    check("with-discount: sales-order net equals the order's net", Math.abs(so.subtotal - 612) < 0.01, String(so.subtotal));
  }
  if (scenario.id === "multi-product") {
    const beef = soLines.find((l) => l.product_id === DEMO_PRODUCTS.beefPie.id);
    check("multi-product: contract price 35 carried (not the standard 38)", beef?.selling_price === 35, String(beef?.selling_price));
  }
}

console.log("\nshopify-order resolution: a person converts tax-inclusive prices");
{
  const db = createFakeSupabase(demoSeed());
  const detail = await runScenario(db, byId.get("shopify-order"));
  const line = detail.lines[0];
  const notConfirmed = await service
    .editIntake(db, CO, detail.intake.id, { confirmPricesExTax: true }, CLERK)
    .then((d) => d)
    .catch((e) => e);
  check("confirming ex-tax prices clears the flag", notConfirmed?.intake?.prices_include_tax === false);
  await service.editIntake(db, CO, detail.intake.id, { updateLines: [{ lineId: line.id, unitPrice: 38 }], customerId: fixtures.DEMO_CUSTOMERS.lighthouse.id }, CLERK);
  const revalidated = await service.performIntakeAction(db, CO, detail.intake.id, "validate", CLERK, { today: DEMO_TODAY });
  const codes = revalidated.intake.validation.issues.map((i) => i.code);
  check("after conversion and choosing the customer, no tax block remains", !codes.includes("PRICES_INCLUDE_TAX") && !codes.includes("CUSTOMER_NOT_FOUND"), JSON.stringify(codes));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
