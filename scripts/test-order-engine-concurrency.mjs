#!/usr/bin/env node
/**
 * VYRON Order Engine — concurrency, race and idempotency regression.
 *
 * Two people (or two deliveries of the same order) acting at once. The
 * in-memory database enforces the same unique constraints as the migration
 * (options.unique), and simultaneous requests are started with Promise.all so
 * their reads and writes genuinely interleave at every await.
 *
 * Invariants proven: never a duplicate order, never a second sales order,
 * never an approval based on data the approver did not see, never a double
 * reservation, never an order that skips approval.
 *
 *   node scripts/test-order-engine-concurrency.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-order-engine-concurrency";
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
const settle = (promises) => Promise.allSettled(promises);
const codeOf = (r) => (r.status === "rejected" ? r.reason?.code || r.reason?.message : "OK");

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const fixtures = await importFromRoot("src/lib/order-engine/demo/fixtures.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const { receiveInboundEmail } = await importFromRoot("src/lib/order-engine/email-intake.ts");
const { parseCsvOrder } = await importFromRoot("src/lib/order-engine/adapters/csv.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const salesOrders = await importFromRoot("src/lib/vyron-customer-sales-orders.ts");

const { DEMO_COMPANY_ID: CO, DEMO_TODAY, DEMO_PRODUCTS, DEMO_CUSTOMERS, DEMO_EXISTING_ORDER_ID, DEMO_SCENARIOS, demoSeed } = fixtures;
const ANN = { userId: "approver-ann", name: "Ann" };
const BEN = { userId: "approver-ben", name: "Ben" };
const CLERK = { userId: "clerk", name: "Clerk" };

const UNIQUE = {
  vyron_order_intakes: [["company_id", "source", "source_key"], ["company_id", "intake_number"], ["sales_order_id"]],
  vyron_order_intake_lines: [["intake_id", "line_no"], ["intake_id", "source_line_reference"]],
  vyron_order_source_messages: [["company_id", "channel", "message_id"]],
  vyron_customer_sales_orders: [["id"], ["company_id", "order_number"]],
  vyron_order_product_aliases: [{ columns: ["company_id", "customer_id", "source_code_normalized"], where: (row) => !row.revoked_at && row.customer_id }],
  vyron_order_customer_identities: [{ columns: ["company_id", "source", "external_reference_normalized"], where: (row) => !row.revoked_at }],
};
const freshDb = () => createFakeSupabase(demoSeed(), { unique: UNIQUE });
const intakeSOs = (db) => db.tables.vyron_customer_sales_orders.filter((o) => o.id !== DEMO_EXISTING_ORDER_ID);
const scenario = (id) => DEMO_SCENARIOS.find((s) => s.id === id).input.candidate;

async function awaiting(db, candidate = scenario("simple-valid")) {
  const { intake } = await service.receiveOrderCandidate(db, CO, candidate, CLERK);
  return service.performIntakeAction(db, CO, intake.id, "validate", CLERK, { today: DEMO_TODAY });
}
const approve = (db, detail, actor, extra = {}) =>
  service.performIntakeAction(db, CO, detail.intake.id, "approve", actor, { today: DEMO_TODAY, validationHash: detail.intake.validation_hash, acknowledgeWarnings: true, ...extra });

console.log("\n1. Two users approve the same order, one after the other");
{
  const db = freshDb();
  const d = await awaiting(db);
  await approve(db, d, ANN);
  const second = await approve(db, d, BEN).catch((e) => e);
  check("the second approval is refused (INVALID_TRANSITION)", second?.code === "INVALID_TRANSITION");
  check("exactly one sales order", intakeSOs(db).length === 1);
  check("the decision belongs to the first approver", db.tables.vyron_order_intakes[0].decision_by === ANN.userId);
}

console.log("\n2. Two users approve at exactly the same time");
{
  const db = freshDb();
  const d = await awaiting(db);
  const results = await settle([approve(db, d, ANN), approve(db, d, BEN)]);
  const ok = results.filter((r) => r.status === "fulfilled");
  check("exactly one approval succeeds", ok.length === 1, results.map(codeOf).join(","));
  check("the other is refused as a conflict", results.some((r) => r.status === "rejected" && ["CONFLICT", "INVALID_TRANSITION"].includes(r.reason?.code)), results.map(codeOf).join(","));
  check("exactly one sales order", intakeSOs(db).length === 1, String(intakeSOs(db).length));
  check("exactly one APPROVED event", db.tables.vyron_order_intake_events.filter((e) => e.event_type === "APPROVED").length === 1);
  check("the intake is CONFIRMED and linked", db.tables.vyron_order_intakes[0].status === "CONFIRMED" && db.tables.vyron_order_intakes[0].sales_order_id === intakeSOs(db)[0].id);
}

console.log("\n3. The order changes after the approver opened it");
{
  const db = freshDb();
  const opened = await awaiting(db);
  await service.performIntakeAction(db, CO, opened.intake.id, "request_changes", BEN, { reason: "Quantity to confirm" });
  await service.editIntake(db, CO, opened.intake.id, { updateLines: [{ lineId: opened.lines[0].id, quantity: 30 }] }, CLERK);
  await service.performIntakeAction(db, CO, opened.intake.id, "validate", CLERK, { today: DEMO_TODAY });
  const stale = await approve(db, opened, ANN).catch((e) => e);
  check("approving what was opened earlier is refused (CONFLICT)", stale?.code === "CONFLICT");
  check("no sales order", intakeSOs(db).length === 0);
}

console.log("\n4. Stock changes after validation");
{
  const db = freshDb();
  const d = await awaiting(db);
  db.tables.vyron_cost_stock_items.find((s) => s.entity_id === DEMO_PRODUCTS.beefPie.id).qty_on_hand = 5;
  const r = await approve(db, d, ANN).catch((e) => e);
  check("approval refused; the refreshed validation shows the shortage", r?.code === "CONFLICT" && db.tables.vyron_order_intakes[0].validation.issues.some((i) => i.code === "INSUFFICIENT_STOCK"));
  check("no sales order", intakeSOs(db).length === 0);
}

console.log("\n5. The customer's price changes after validation");
{
  const db = freshDb();
  const d = await awaiting(db, scenario("multi-product"));
  db.tables.vyron_customer_price_list_items[0].final_price = 33;
  const r = await approve(db, d, ANN).catch((e) => e);
  check("approval refused after a price-list change (CONFLICT)", r?.code === "CONFLICT");
  const refreshed = db.tables.vyron_order_intakes[0].validation.lines.find((l) => l.productId === DEMO_PRODUCTS.beefPie.id);
  check("the refreshed validation carries the new price", refreshed?.effectiveUnitPrice === 33, JSON.stringify(refreshed));
}

console.log("\n6. Another order reserves the stock between validation and approval");
{
  const db = freshDb();
  const d = await awaiting(db, scenario("insufficient-stock").lines ? scenario("insufficient-stock") : undefined);
  // Before approval another live order reserves 15 more chicken pies.
  db.tables.vyron_customer_sales_orders.push({ id: "other-live", company_id: CO, order_number: "SO-OTHER", status: "Approved" });
  db.tables.vyron_customer_sales_order_allocations.push({ id: "al-other", company_id: CO, sales_order_id: "other-live", product_id: DEMO_PRODUCTS.chickenPie.id, reserved_qty: 15, status: "Reserved" });
  const r = await approve(db, d, ANN).catch((e) => e);
  check("approval refused — the approver never approves on stale availability", r?.code === "CONFLICT");
  const stock = db.tables.vyron_order_intakes[0].validation.issues.find((i) => i.code === "INSUFFICIENT_STOCK");
  check("the new availability includes the other reservation (55 reserved, 5 free)", stock?.data?.reservedElsewhere === 55 && stock?.data?.available === 5, JSON.stringify(stock?.data));
}

console.log("\n7. The same external order arrives twice at the same moment");
{
  const db = freshDb();
  const woo = DEMO_SCENARIOS.find((s) => s.id === "woocommerce-order").input;
  const candidate = () => platforms.normalizeWooCommerceOrder({ storeKey: woo.storeKey, order: woo.order });
  const results = await settle([service.receiveOrderCandidate(db, CO, candidate(), CLERK), service.receiveOrderCandidate(db, CO, candidate(), CLERK)]);
  check("both deliveries succeed", results.every((r) => r.status === "fulfilled"), results.map(codeOf).join(","));
  check("exactly one order exists", db.tables.vyron_order_intakes.length === 1);
  check("one reports duplicate, pointing at the same order", results.filter((r) => r.value?.duplicate).length === 1 && new Set(results.map((r) => r.value.intake.id)).size === 1);
  check("its lines were written once", db.tables.vyron_order_intake_lines.length === 2);
}

console.log("\n8. The same CSV uploaded twice (at once, and again later)");
{
  const db = freshDb();
  const input = DEMO_SCENARIOS.find((s) => s.id === "csv-order").input;
  const results = await settle([0, 1].map(() => service.receiveOrderCandidate(db, CO, parseCsvOrder({ text: input.text, fileName: input.fileName }), CLERK)));
  check("simultaneous uploads → one order", db.tables.vyron_order_intakes.length === 1 && results.every((r) => r.status === "fulfilled"));
  const later = await service.receiveOrderCandidate(db, CO, parseCsvOrder({ text: input.text, fileName: "renamed.csv" }), CLERK);
  check("a later re-upload (renamed) is the same order", later.duplicate && db.tables.vyron_order_intakes.length === 1);
}

console.log("\n9. A source order retried after it was received and approved");
{
  const db = freshDb();
  const candidate = { ...scenario("simple-valid"), source: "api", sourceKey: "tenant-api:order:77" };
  const d = await awaiting(db, candidate);
  await approve(db, d, ANN);
  const retry = await service.receiveOrderCandidate(db, CO, candidate, CLERK);
  check("the retry returns the confirmed order", retry.duplicate && retry.intake.status === "CONFIRMED");
  const changed = await service.receiveOrderCandidate(db, CO, { ...candidate, lines: [{ sku: "HK-PIE-BEEF", quantity: 99, unitPrice: 38 }] }, CLERK).catch((e) => e);
  check("a retry with different content is refused, never overwrites", changed?.code === "DUPLICATE_SOURCE_CONFLICT" && db.tables.vyron_order_intake_lines[0].quantity === 24);
  check("still one sales order", intakeSOs(db).length === 1);
}

console.log("\n10. An approval request retried (double click, network retry)");
{
  const db = freshDb();
  const d = await awaiting(db);
  const burst = await settle([approve(db, d, ANN), approve(db, d, ANN), approve(db, d, ANN)]);
  check("one of three identical requests succeeds", burst.filter((r) => r.status === "fulfilled").length === 1, burst.map(codeOf).join(","));
  const after = await approve(db, d, ANN).catch((e) => e);
  check("a retry after success is refused", after?.code === "INVALID_TRANSITION");
  check("one sales order", intakeSOs(db).length === 1);
}

console.log("\n11. Handoff retried concurrently after a failure");
{
  const db = freshDb();
  db.tables.vyron_workspaces[0].default_vat_rate = null;
  const d = await awaiting(db);
  await approve(db, d, ANN).catch(() => undefined);
  check("handoff failed; order APPROVED", db.tables.vyron_order_intakes[0].status === "APPROVED" && intakeSOs(db).length === 0);
  db.tables.vyron_workspaces[0].default_vat_rate = 15;
  const results = await settle([
    service.performIntakeAction(db, CO, d.intake.id, "confirm", ANN),
    service.performIntakeAction(db, CO, d.intake.id, "confirm", BEN),
  ]);
  check("exactly one sales order despite two retries", intakeSOs(db).length === 1, results.map(codeOf).join(","));
  check("the intake ends CONFIRMED", db.tables.vyron_order_intakes[0].status === "CONFIRMED");
  check("the losing retry is a conflict, not a failure", results.every((r) => r.status === "fulfilled" || ["CONFLICT", "INVALID_TRANSITION"].includes(r.reason?.code)), results.map(codeOf).join(","));
}

console.log("\n12. Two people remember the same item code at once");
{
  const db = freshDb();
  const d = await awaiting(db, scenario("unmatched-sku"));
  const line = d.lines[0];
  const edits = await settle([
    service.editIntake(db, CO, d.intake.id, { resolveLines: [{ lineId: line.id, productId: DEMO_PRODUCTS.beefPie.id, remember: true }] }, ANN, { canRemember: true }),
    service.editIntake(db, CO, d.intake.id, { resolveLines: [{ lineId: line.id, productId: DEMO_PRODUCTS.chickenPie.id, remember: true }] }, BEN, { canRemember: true }),
  ]);
  const live = db.tables.vyron_order_product_aliases.filter((a) => !a.revoked_at);
  check("one edit wins; the other conflicts", edits.filter((r) => r.status === "fulfilled").length === 1, edits.map(codeOf).join(","));
  check("at most one live alias for the code", live.length <= 1, String(live.length));
}

console.log("\n13. The same e-mail delivered twice at once");
{
  const db = freshDb();
  const message = {
    messageId: "<po-7790@northside.example>",
    provider: "test",
    from: DEMO_CUSTOMERS.northside.email,
    to: ["orders@harbourkitchen.example"],
    subject: "PO 7790",
    receivedAt: "2026-09-29T07:30:00Z",
    attachments: [{ fileName: "po.csv", contentType: "text/csv", sizeBytes: 80, text: "sku,qty,price\nHK-PIE-BEEF,12,35\n" }],
  };
  const results = await settle([receiveInboundEmail(db, CO, message, CLERK), receiveInboundEmail(db, CO, message, CLERK)]);
  check("both deliveries answered", results.every((r) => r.status === "fulfilled"), results.map(codeOf).join(","));
  check("one message stored, one order", db.tables.vyron_order_source_messages.length === 1 && db.tables.vyron_order_intakes.length === 1);
}

console.log("\n14. Two validations at once");
{
  const db = freshDb();
  const { intake } = await service.receiveOrderCandidate(db, CO, scenario("simple-valid"), CLERK);
  const results = await settle([0, 1].map(() => service.performIntakeAction(db, CO, intake.id, "validate", CLERK, { today: DEMO_TODAY })));
  check("one validation lands; the other is a conflict", results.filter((r) => r.status === "fulfilled").length === 1, results.map(codeOf).join(","));
  check("state is consistent", db.tables.vyron_order_intakes[0].status === "AWAITING_APPROVAL" && db.tables.vyron_order_intakes[0].version === 2);
}

console.log("\n15. No double reservation downstream");
{
  const db = freshDb();
  // Two intake orders for chicken pies: 15 each; only 20 free.
  const make = async (po) => {
    const d = await awaiting(db, { ...scenario("simple-valid"), customerPoNumber: po, lines: [{ sku: "HK-PIE-CHK", quantity: 15, unitPrice: 36 }] });
    return approve(db, d, ANN);
  };
  const a = await make("R-1");
  const b = await make("R-2");
  check("both intakes confirmed as Draft sales orders (nothing reserved yet)", a.intake.status === "CONFIRMED" && b.intake.status === "CONFIRMED");
  const first = await salesOrders.transitionCustomerSalesOrder(db, CO, a.intake.sales_order_id, "approve", ANN.userId);
  const second = await salesOrders.transitionCustomerSalesOrder(db, CO, b.intake.sales_order_id, "approve", ANN.userId).catch((e) => e);
  check("the first sales order reserves 15 of 20", first.status === "Approved");
  check("the second is refused — 5 left, not 20 (no double reservation)", second?.code === "SALES_ORDER_STOCK_SHORTAGE" && second.shortages?.[0]?.available_qty === 5, JSON.stringify(second?.shortages));
}

console.log("\n16. No order skips approval");
{
  const db = freshDb();
  const { intake } = await service.receiveOrderCandidate(db, CO, scenario("simple-valid"), CLERK);
  for (const action of ["approve", "confirm"]) {
    const r = await service.performIntakeAction(db, CO, intake.id, action, ANN, { validationHash: "x" }).catch((e) => e);
    check(`${action} from RECEIVED is refused`, r?.code === "INVALID_TRANSITION");
  }
  const exception = await awaiting(db, scenario("unmatched-sku"));
  const r = await service.performIntakeAction(db, CO, exception.intake.id, "approve", ANN, { validationHash: exception.intake.validation_hash }).catch((e) => e);
  check("approve from EXCEPTION is refused", r?.code === "INVALID_TRANSITION");
  check("no sales order was created by any of these", intakeSOs(db).length === 0);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
