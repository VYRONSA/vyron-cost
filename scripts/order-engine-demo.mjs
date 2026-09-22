#!/usr/bin/env node
/**
 * VYRON Order Engine — scripted demonstration (docs/order-engine/DEMO_SCRIPT.md).
 *
 * Tells the Tuesday story end to end with the REAL Order Engine and the REAL
 * sales-order engine, against the fictional "Harbour Kitchen Foods" tenant in
 * an in-memory database. Repeatable: same fixtures and "today" give the same
 * outcome every run (generated numbers and timestamps differ). Touches no
 * database, network, mailbox or client data.
 *
 *   npm run demo:order-engine
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "demo-order-engine";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://demo.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const fixtures = await importFromRoot("src/lib/order-engine/demo/fixtures.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const { receiveInboundEmail } = await importFromRoot("src/lib/order-engine/email-intake.ts");
const salesOrders = await importFromRoot("src/lib/vyron-customer-sales-orders.ts");
const { issueDefinition } = await importFromRoot("src/lib/order-engine/issue-catalog.ts");

const { DEMO_COMPANY_ID: CO, DEMO_TODAY, DEMO_PRODUCTS: P, DEMO_CUSTOMERS: C, DEMO_EXISTING_ORDER_ID, demoSeed } = fixtures;
const CLERK = { userId: "pieter.botha", name: "Pieter Botha (order desk)" };
const MANAGER = { userId: "thandi.mokoena", name: "Thandi Mokoena (sales manager)" };
const db = createFakeSupabase(demoSeed());

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const tone = { error: "\x1b[31m", warning: "\x1b[33m", info: "\x1b[36m" };
let step = 0;
const say = (title) => console.log(`\n${bold(`${++step}. ${title}`)}`);
const line = (s = "") => console.log(`   ${s}`);
const money = (n) => (n === null || n === undefined ? "—" : `R ${Number(n).toFixed(2)}`);
const showIssues = (issues) => {
  if (!issues.length) return line("No issues.");
  for (const i of issues) line(`${tone[i.severity]}${i.severity.toUpperCase().padEnd(7)}\x1b[0m ${issueDefinition(i.code)?.title || i.code}${i.lineNo ? ` (line ${i.lineNo})` : ""}: ${i.message}`);
};

console.log(bold("\nVOLORA — Order Engine demonstration"));
console.log(dim("Fictional tenant: Harbour Kitchen Foods. In-memory; nothing is written anywhere real."));

say("A customer sends an order");
line('Northside Grocers e-mails "PO NG-8801" with a CSV attachment (their buying system\'s export).');
const csv =
  "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price\n" +
  "Northside Grocers,NG-8801,2026-10-02,HK-PIE-BEEF,Beef & Ale Pie,48,35.00\n" +
  "Northside Grocers,NG-8801,2026-10-02,HK-PIE-CHK,Chicken & Leek Pie,30,36.00\n" +
  "Northside Grocers,NG-8801,2026-10-02,NS-QUICHE-SP,Spinach quiche (our code),24,32.00\n" +
  "Northside Grocers,NG-8801,2026-10-02,HK-SOUP-TOM,Tomato Soup,24,26.00\n";

say("VOLORA receives it");
const email = await receiveInboundEmail(
  db,
  CO,
  {
    messageId: "<ng-8801@northside-grocers.example>",
    provider: "demo",
    from: C.northside.email,
    to: ["orders@harbourkitchen.example"],
    subject: "PO NG-8801 — delivery Friday",
    receivedAt: "2026-09-29T07:42:00Z",
    bodyText: "Morning, order attached. Thanks!",
    attachments: [{ fileName: "NG-8801.csv", contentType: "text/csv", sizeBytes: csv.length, text: csv }],
  },
  CLERK
);
const intakeId = email.orders[0].intake.id;
line(`Message stored once (message id is the idempotency key); order ${bold(email.orders[0].intake.intake_number)} created with ${email.orders[0].lines.length} lines.`);
const again = await receiveInboundEmail(db, CO, { messageId: "<ng-8801@northside-grocers.example>", provider: "demo", from: C.northside.email, to: [], receivedAt: "2026-09-29T07:42:05Z", attachments: [] }, CLERK);
line(dim(`The mail server delivers it again: duplicate=${again.duplicate}; still ${db.tables.vyron_order_intakes.length} order.`));

say("VOLORA understands it — customer, products, prices, stock, production, margin");
let detail = await service.performIntakeAction(db, CO, intakeId, "validate", CLERK, { today: DEMO_TODAY });
const snap = () => detail.intake.validation;
line(`Customer: ${bold(snap().customer.name || "not identified")} (${snap().customer.matchRule || "—"})`);
for (const l of snap().lines) {
  const product = l.productName ? `${l.productName} [${l.matchRule}]` : `${tone.error}NOT MATCHED\x1b[0m`;
  const stock = l.available === null ? "" : ` · available ${l.available}${l.shortfall ? `, short ${l.shortfall}${l.hasBom ? " (can be produced)" : ""}` : ""}`;
  line(`line ${l.lineNo}: ${l.quantity} × ${product} @ ${money(l.effectiveUnitPrice)}${l.expectedUnitPrice && l.expectedUnitPrice !== l.effectiveUnitPrice ? ` (price list ${money(l.expectedUnitPrice)})` : ""}${stock}`);
}
line(`Expected value ${money(snap().totals.expectedSubtotal)} · cost ${money(snap().totals.expectedCost)} · GP ${money(snap().totals.expectedGp)} (${snap().totals.expectedGpPct}%) — shown to approvers only`);

say("VOLORA identifies exceptions");
line(`Status: ${bold(detail.intake.status)}`);
showIssues(snap().issues);

say("A person resolves the exception — no guessing");
const quicheLine = detail.lines.find((l) => l.raw_sku === "NS-QUICHE-SP");
line(`"NS-QUICHE-SP" is Northside's own code. The order desk chooses Spinach Quiche and the manager asks VOLORA to remember it for Northside.`);
await service.editIntake(db, CO, intakeId, { resolveLines: [{ lineId: quicheLine.id, productId: P.quiche.id, remember: true }] }, MANAGER, { canRemember: true });
detail = await service.performIntakeAction(db, CO, intakeId, "validate", CLERK, { today: DEMO_TODAY });
line(`Re-validated: ${bold(detail.intake.status)} — ${detail.intake.blocking_issue_count} blocking, ${detail.intake.warning_issue_count} warnings.`);
showIssues(snap().issues.filter((i) => i.severity !== "info"));

say("VOLORA sends the order for approval; the manager reviews and approves");
line("The manager acknowledges the warnings (soup price below list; chicken pies short — production required).");
detail = await service.performIntakeAction(db, CO, intakeId, "approve", MANAGER, {
  today: DEMO_TODAY,
  validationHash: detail.intake.validation_hash,
  acknowledgeWarnings: true,
  reason: "Agreed soup price with Northside by phone; chicken pies from Thursday's bake.",
});
line(`Order ${bold(detail.intake.status)} · sales order ${bold(detail.salesOrder.order_number)} (${detail.salesOrder.status}).`);

say("VOLORA hands the order to the EXISTING Sales Order engine");
const so = await salesOrders.getCustomerSalesOrder(db, CO, detail.intake.sales_order_id);
for (const l of so.lines) line(`SO line: ${l.quantity} × ${l.description} @ ${money(l.selling_price)} · VAT ${l.tax_rate}% · cost ${money(l.cost_per_unit)}`);
line(`Subtotal ${money(so.order.subtotal)} · VAT ${money(so.order.vat_amount)} · total ${money(so.order.total)}`);
line(dim(`Notes carry the reference: ${so.order.notes.split("\n")[0]}`));
line(`Nothing posted: invoices ${db.tables.vyron_customer_invoices.length}, Xero queue ${db.tables.vyron_xero_sync_queue.length}, stock ledger ${db.tables.vyron_cost_stock_ledger.length}, new reservations ${db.tables.vyron_customer_sales_order_allocations.filter((a) => a.sales_order_id !== DEMO_EXISTING_ORDER_ID).length}.`);

say("The existing fulfilment workflow takes over (unchanged)");
line("Sales Orders: submit → the engine's own approval rules; approve reserves stock net of other live orders.");
const submitted = await salesOrders.transitionCustomerSalesOrder(db, CO, so.order.id, "submit", MANAGER.userId).catch((e) => e);
if (submitted instanceof Error) {
  line(`${tone.warning}Stock reservation stops here:\x1b[0m ${submitted.message} — ${JSON.stringify(submitted.shortages?.map((s) => `${s.product_name} short ${s.shortfall_qty}`))}`);
  line("That is the existing engine protecting stock: produce the chicken pies (production run from the order), then approve.");
  db.tables.vyron_cost_stock_items.find((s) => s.entity_id === P.chickenPie.id).qty_on_hand += 40;
  db.tables.vyron_cost_stock_items.find((s) => s.entity_id === P.quiche.id).qty_on_hand += 24;
  line(dim("(demo: Thursday's bake adds 40 chicken pies and 24 quiches to stock)"));
}
const current = (await salesOrders.getCustomerSalesOrder(db, CO, so.order.id)).order.status;
const approved = current === "Approved" ? { status: "Approved" } : await salesOrders.transitionCustomerSalesOrder(db, CO, so.order.id, current === "Draft" ? "submit" : "approve", MANAGER.userId).then((o) => (o.status === "Awaiting Approval" ? salesOrders.transitionCustomerSalesOrder(db, CO, so.order.id, "approve", MANAGER.userId) : o));
line(`Sales order ${approved.status}; reserved: ${db.tables.vyron_customer_sales_order_allocations.filter((a) => a.sales_order_id === so.order.id).map((a) => a.reserved_qty).join(", ")}`);
for (const action of ["start_picking", "pack", "dispatch"]) {
  const moved = await salesOrders.transitionCustomerSalesOrder(db, CO, so.order.id, action, CLERK.userId);
  line(`${action.replace("_", " ")} → ${moved.status}`);
}
const converted = await salesOrders.convertSalesOrderToInvoice(db, CO, so.order.id, MANAGER.userId);
line(`Converted to invoice ${bold(converted.invoice.invoice_number)} — status ${converted.invoice.status}.`);
line(`Still nothing sent to Xero (${db.tables.vyron_xero_sync_queue.length} queued): posting the invoice is a separate, deliberate step in Customer Invoices.`);

say("The order's own story (from its audit trail)");
const finalDetail = await service.getIntakeDetail(db, CO, intakeId);
for (const e of finalDetail.events) line(`${dim(e.created_at.slice(11, 19))} ${e.event_type.padEnd(22)} ${e.actor_name || e.actor}${e.detail ? dim(` — ${e.detail.slice(0, 90)}`) : ""}`);
line(`Fulfilment: ${finalDetail.derived.fulfilmentStatus} · invoice: ${finalDetail.derived.invoiceStatus}`);

say("Next time, Northside's own code is recognised");
const next = await service.receiveOrderCandidate(db, CO, { source: "manual", customerName: "Northside Grocers", customerPoNumber: "NG-8802", requestedDeliveryDate: "2026-10-05", lines: [{ sku: "NS-QUICHE-SP", quantity: 12, unitPrice: 32 }] }, CLERK);
const nextValidated = await service.performIntakeAction(db, CO, next.intake.id, "validate", CLERK, { today: DEMO_TODAY });
line(`NS-QUICHE-SP → ${nextValidated.lines[0].match_rule} → ${nextValidated.intake.validation.lines[0].productName}; status ${bold(nextValidated.intake.status)}.`);

console.log(`\n${bold("End of demonstration.")} ${dim("Run again: same outcome (order numbers and times are generated).")}\n`);
