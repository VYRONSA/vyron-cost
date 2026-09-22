#!/usr/bin/env node
/**
 * VOLORA Order Engine — Food Sock ordering foundation (UAT).
 *
 * Runs every Food Sock UAT scenario (src/lib/order-engine/uat/food-sock-uat.ts)
 * through the real Order Engine and the real sales-order engine on an
 * in-memory database: intake from each channel (manual, web store, e-mail CSV /
 * XLSX / PDF, document extraction), the canonical extraction contract,
 * deterministic customer / SKU / external-id matching, duplicates, price,
 * stock, production, margin, customer rules, tenant ordering settings, the
 * Exception Centre, approval, concurrent approval, the idempotent Sales Order
 * handoff, B2B / B2C, historical-order refusal and tenant isolation.
 *
 * Fictional data only (a fictional UAT tenant). No Food Sock data, no real
 * database, no network, no mailbox.
 *
 *   npm run test:order-engine-food-sock
 */
import { register } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-order-engine-food-sock";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://test.invalid";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]):/, "$1:"), "..");
const importFromRoot = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const uat = await importFromRoot("src/lib/order-engine/uat/food-sock-uat.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const extraction = await importFromRoot("src/lib/order-engine/extraction.ts");
const settingsLib = await importFromRoot("src/lib/order-engine/settings.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const { receiveInboundEmail } = await importFromRoot("src/lib/order-engine/email-intake.ts");
const connector = await importFromRoot("src/lib/order-engine/connectors/email-connector.ts");
const mailboxes = await importFromRoot("src/lib/order-engine/mailboxes.ts");
const security = await importFromRoot("src/lib/order-engine/email-security.ts");
const decisions = await importFromRoot("src/lib/order-engine/decisions.ts");
const pdf = await importFromRoot("src/lib/order-engine/extractors/pdf.ts");
const csv = await importFromRoot("src/lib/order-engine/adapters/csv.ts");
const catalogueCheck = await importFromRoot("src/lib/order-engine/uat/catalogue-validation.ts");
const { ISSUE_CATALOG } = await importFromRoot("src/lib/order-engine/issue-catalog.ts");
const { createRequire } = await import("node:module");
const ExcelJS = createRequire(pathToFileURL(path.join(ROOT, "package.json")).href)("exceljs");

let passed = 0;
let failed = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (title) => console.log(`\n${title}`);

const CO = uat.FOOD_SOCK_UAT_COMPANY_ID;
const TODAY = uat.FOOD_SOCK_UAT_TODAY;
const C = uat.UAT_CUSTOMERS;
const CLERK = { userId: "uat-clerk", name: "UAT Order Desk" };
const MANAGER = { userId: "uat-manager", name: "UAT Sales Manager" };
const newDb = (extra = {}) => {
  const seed = uat.foodSockUatSeed();
  for (const [table, rows] of Object.entries(extra)) seed[table] = [...(seed[table] || []), ...rows];
  return createFakeSupabase(seed);
};
const codesOf = (detail) => detail.intake.validation.issues.map((i) => i.code);

async function receive(db, input, company = CO) {
  if (input.kind === "candidate") return service.receiveOrderCandidate(db, company, input.candidate, CLERK);
  if (input.kind === "woocommerce") return service.receiveOrderCandidate(db, company, platforms.normalizeWooCommerceOrder({ storeKey: input.storeKey, order: input.order }), CLERK);
  if (input.kind === "extraction") return extraction.receiveExtractedOrder(db, company, { extraction: input.extraction, sourceKey: input.sourceKey }, CLERK);
  if (input.kind === "csv") return service.receiveOrderCandidate(db, company, csv.parseCsvOrder({ text: input.text, fileName: input.fileName }), CLERK);
  if (input.kind === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Order");
    ws.addRow(input.header);
    for (const row of input.rows) ws.addRow(row);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    return handMessage(db, company, input, { fileName: input.fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: bytes.toString("base64"), sizeBytes: bytes.length });
  }
  if (input.kind === "email") {
    const attachment = input.attachment.text
      ? { ...input.attachment, contentBase64: Buffer.from(input.attachment.text, "utf8").toString("base64"), sizeBytes: Buffer.byteLength(input.attachment.text) }
      : input.attachment;
    return handMessage(db, company, input, attachment);
  }
  throw new Error(`unknown input ${input.kind}`);
}

/** Hand a message over the connector boundary and return the order it produced (or the outcome). */
async function handMessage(db, company, input, attachment) {
  const handed = await connector.receiveConnectorMessage(
    db,
    {
      messageId: `<uat-${attachment.fileName}@uat.example>`,
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
  if (handed.status === "QUARANTINED") return { outcome: "QUARANTINED" };
  if (handed.status !== "ACCEPTED") return { outcome: handed.status };
  if (handed.result.status === "NEEDS_EXTRACTION") return { outcome: "DOCUMENT_HELD" };
  if (handed.result.status !== "PARSED" || !handed.result.orders.length) return { outcome: handed.result.status };
  return handed.result.orders[0];
}
const validate = (db, intakeId, company = CO) => service.performIntakeAction(db, company, intakeId, "validate", CLERK, { today: TODAY });
const approve = (db, detail, company = CO) =>
  service.performIntakeAction(db, company, detail.intake.id, "approve", MANAGER, { today: TODAY, validationHash: detail.intake.validation_hash, acknowledgeWarnings: true });

const scenarios = uat.buildFoodSockUatScenarios();
const byId = new Map(scenarios.map((s) => [s.id, s]));
async function runScenario(db, id) {
  for (const prerequisite of byId.get(id).after || []) await runScenario(db, prerequisite);
  const received = await receive(db, byId.get(id).input);
  // Two scenarios deliberately produce no order: a quarantined message and a
  // document held for an extractor. They are returned as they are.
  if (received.outcome) return received;
  return validate(db, received.intake.id);
}

// ---------------------------------------------------------------------------
section("UAT catalogue and scenarios");
{
  const catalogue = uat.fictionalFoodSockCatalogue();
  check("fictional catalogue: every product and customer is marked UAT", catalogue.products.every((p) => p.product_name.startsWith("UAT ")) && Object.values(C).every((c) => c.customer_name.startsWith("UAT ")));
  check("UAT tenant is not Food Sock's company id", CO !== "e920c747-1d27-4d01-9e7c-182f9a7d0aa3");
  const required = [
    "valid-b2b", "valid-b2c", "unknown-sku", "unknown-customer", "duplicate-po", "insufficient-stock", "production-required",
    "low-margin", "missing-po", "missing-delivery-date", "invalid-quantity", "ambiguous-mapping", "low-confidence-extraction",
    // Phase 4: the rest of the Food Sock ordering process.
    "contract-price", "customer-item-code", "whole-case", "csv-order", "xlsx-order", "email-order", "email-outside-policy", "pdf-pending-extraction",
  ];
  check("all required UAT scenarios exist", required.every((id) => byId.has(id)), required.filter((id) => !byId.has(id)).join(","));
  const again = uat.buildFoodSockUatScenarios();
  check("scenario generation is deterministic", JSON.stringify(again) === JSON.stringify(scenarios));
  check("every expected code is catalogued", scenarios.every((s) => (s.expect.codes || []).every((c) => c in ISSUE_CATALOG)));
  check("every scenario names the channel it arrives through", scenarios.every((s) => ["manual", "csv", "xlsx", "email", "pdf", "web_store"].includes(s.channel)));
  const channels = new Set(scenarios.map((s) => s.channel));
  check("every channel is covered by at least one scenario", ["manual", "csv", "xlsx", "email", "pdf", "web_store"].every((ch) => channels.has(ch)), [...channels].join(","));
  let threw = false;
  try {
    uat.buildFoodSockUatScenarios({ products: [], stockItems: [], boms: [], bomLines: [] });
  } catch {
    threw = true;
  }
  check("a catalogue that cannot supply a scenario is refused, never silently skipped", threw);

  // A real catalogue may simply have no product of some shape. That blocks
  // those scenarios on the data, and only those.
  const noBomless = {
    ...uat.fictionalFoodSockCatalogue(),
    boms: uat.fictionalFoodSockCatalogue().products.map((p, i) => ({ id: `f5b00000-0000-4000-8000-${String(900 + i).padStart(12, "0")}`, product_id: p.id, bom_name: `${p.product_name} recipe` })),
  };
  const plan = uat.buildFoodSockUatPlan(noBomless);
  check("a catalogue where every product has a BOM blocks only the scenario that needs one without", plan.blocked.length === 1 && plan.blocked[0].id === "insufficient-stock");
  check("…and says what was missing", /no product without a BOM/i.test(plan.blocked[0].reason));
  check("…while every other scenario still runs", plan.scenarios.length === scenarios.length - 1);
  const full = uat.buildFoodSockUatPlan();
  check("a complete catalogue blocks nothing", full.blocked.length === 0 && full.scenarios.length === scenarios.length);
  check("every scenario declares which product profile it needs", scenarios.every((s) => Array.isArray(uat.SCENARIO_NEEDS[s.id])));
}

for (const scenario of scenarios) {
  section(`Scenario ${scenario.id} — ${scenario.title}`);
  const db = newDb();
  let detail;
  try {
    detail = await runScenario(db, scenario.id);
  } catch (error) {
    check(`${scenario.id}: received and validated`, false, error.message);
    continue;
  }
  // The two scenarios that produce no order on purpose.
  if (scenario.expect.outcome && scenario.expect.outcome !== "ORDER") {
    check(`${scenario.id}: ${scenario.expect.outcome.toLowerCase().replace("_", " ")}`, detail.outcome === scenario.expect.outcome, String(detail.outcome));
    check(`${scenario.id}: no order was invented`, db.tables.vyron_order_intakes.length === 0);
    check(`${scenario.id}: nothing created in Sales Orders`, db.tables.vyron_customer_sales_orders.length === 0);
    continue;
  }
  const codes = codesOf(detail);
  check(`${scenario.id}: status ${scenario.expect.status}`, detail.intake.status === scenario.expect.status, `${detail.intake.status} ${JSON.stringify(codes)}`);
  for (const code of scenario.expect.codes) check(`${scenario.id}: raises ${code}`, codes.includes(code), JSON.stringify(codes));
  for (const code of scenario.expect.absent || []) check(`${scenario.id}: does not raise ${code}`, !codes.includes(code), JSON.stringify(codes));
  check(`${scenario.id}: every raised code is catalogued`, codes.every((c) => c in ISSUE_CATALOG), codes.filter((c) => !(c in ISSUE_CATALOG)).join(","));
  check(`${scenario.id}: source snapshot frozen on the order and every line`, Object.keys(detail.intake.source_snapshot || {}).length > 0 && detail.lines.every((l) => "source_quantity" in (l.source_snapshot || {})));
  check(`${scenario.id}: nothing created in Sales Orders by validation`, db.tables.vyron_customer_sales_orders.length === 0);
}

// ---------------------------------------------------------------------------
section("B2B vs B2C context");
{
  const db = newDb();
  const b2b = await runScenario(db, "valid-b2b");
  const b2c = await runScenario(db, "valid-b2c");
  check("manual trade order is B2B with its channel", b2b.intake.order_context === "B2B" && b2b.intake.source_channel === "manual");
  check("web-store order is B2C on channel web_store:<store>", b2c.intake.order_context === "B2C" && b2c.intake.source_channel === "web_store:uat-store");
  check("unknown web customer booked to the configured B2C account (rule b2c_account)", b2c.intake.validation.customer.id === C.webAccount.id && b2c.intake.validation.customer.matchRule === "b2c_account");
  check("both reach the same canonical validation snapshot shape", b2b.intake.validation.version === 1 && b2c.intake.validation.version === 1 && b2c.intake.validation.context === "B2C");

  const dbNo = newDb();
  dbNo.tables.vyron_order_engine_settings[0].b2c_customer_id = null;
  const blocked = await runScenario(dbNo, "valid-b2c");
  check("no B2C account decided → web order stops (B2C_ACCOUNT_NOT_CONFIGURED), booked nowhere", blocked.intake.status === "EXCEPTION" && codesOf(blocked).includes("B2C_ACCOUNT_NOT_CONFIGURED") && !blocked.intake.validation.customer.id);
}

// ---------------------------------------------------------------------------
section("Approval and the Sales Order handoff");
{
  const db = newDb();
  const validated = await runScenario(db, "valid-b2b");
  const confirmed = await approve(db, validated);
  const so = db.tables.vyron_customer_sales_orders;
  check("approval → CONFIRMED with exactly one sales order", confirmed.intake.status === "CONFIRMED" && so.length === 1);
  check("sales order linked back to the intake", confirmed.intake.sales_order_id === so[0]?.id);
  check("sales order is a Draft for the matched customer", so[0]?.status === "Draft" && so[0]?.customer_id === C.retailNorth.id);
  const soLines = db.tables.vyron_customer_sales_order_lines.filter((l) => l.sales_order_id === so[0]?.id);
  const stocked = validated.intake.validation.lines[0];
  check("sales order carries product, quantity and approved price", soLines.length === 1 && soLines[0].product_id === stocked.productId && Number(soLines[0].quantity) === 24 && Number(soLines[0].selling_price) === stocked.effectiveUnitPrice);
  check("sales order carries VAT at the workspace rate", Number(soLines[0]?.tax_rate) === 15);
  check("sales order carries requested delivery date", String(so[0]?.requested_delivery_date || "").slice(0, 10) === "2026-10-14");
  check("sales order carries PO and intake reference (provenance)", String(so[0]?.notes || "").includes("PO UAT-PO-1001") && String(so[0]?.notes || "").includes(validated.intake.intake_number));
  check("sales-order audit records the intake", db.tables.vyron_customer_sales_order_audit.some((a) => a.event_type === "CREATED_FROM_ORDER_INTAKE" && a.metadata?.intakeId === validated.intake.id));
  check("nothing invoiced, e-mailed or queued for Xero", db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_xero_sync_queue.length === 0);
  check("no stock reserved by approval (Draft sales order)", db.tables.vyron_customer_sales_order_allocations.length === 0);
  let again = null;
  try {
    await approve(db, validated);
  } catch (error) {
    again = error.code;
  }
  check("a second approval is refused; still one sales order", again === "INVALID_TRANSITION" && db.tables.vyron_customer_sales_orders.length === 1, String(again));
  let confirmAgain = null;
  try {
    await service.performIntakeAction(db, CO, validated.intake.id, "confirm", MANAGER, {});
  } catch (error) {
    confirmAgain = error.code;
  }
  check("confirm after handoff is refused (idempotent)", confirmAgain === "INVALID_TRANSITION" && db.tables.vyron_customer_sales_orders.length === 1);
}
{
  const db = newDb();
  const validated = await runScenario(db, "valid-b2b");
  const results = await Promise.allSettled([approve(db, validated), approve(db, validated), approve(db, validated)]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  check("three concurrent approvals → exactly one succeeds, one sales order", ok === 1 && db.tables.vyron_customer_sales_orders.length === 1, `ok=${ok} so=${db.tables.vyron_customer_sales_orders.length}`);
}
{
  const db = newDb();
  const validated = await runScenario(db, "valid-b2c");
  const confirmed = await approve(db, validated);
  check("approved B2C order hands off to the B2C account", confirmed.intake.status === "CONFIRMED" && db.tables.vyron_customer_sales_orders[0]?.customer_id === C.webAccount.id);
}
{
  const db = newDb();
  const validated = await runScenario(db, "valid-b2b");
  db.tables.vyron_cost_stock_items.find((s) => s.entity_id === validated.intake.validation.lines[0].productId && s.entity_type === "finished_goods").qty_on_hand = 1;
  let code = null;
  try {
    await approve(db, validated);
  } catch (error) {
    code = error.code;
  }
  check("approval re-runs live validation: stock moved → approval refused, nothing created", code === "CONFLICT" && db.tables.vyron_customer_sales_orders.length === 0, String(code));
}
{
  const db = newDb();
  const validated = await runScenario(db, "unknown-sku");
  let code = null;
  try {
    await service.performIntakeAction(db, CO, validated.intake.id, "approve", MANAGER, { today: TODAY, validationHash: validated.intake.validation_hash, acknowledgeWarnings: true });
  } catch (error) {
    code = error.code;
  }
  check("an order with blocking exceptions cannot be approved", code === "INVALID_TRANSITION" && db.tables.vyron_customer_sales_orders.length === 0, String(code));
}

// ---------------------------------------------------------------------------
section("Production requirement");
{
  const db = newDb();
  const detail = await runScenario(db, "production-required");
  const req = detail.intake.validation.production?.[0];
  check("production requirement recorded on the validation", Boolean(req) && req.shortfall === 25 && req.availableFinished === 12);
  check("BOM named with its components", Boolean(req?.bomName) && req.components.length === 3);
  const mince = req?.components.find((c) => c.name === "UAT Beef mince");
  check("component requirement = shortfall × qty × (1 + wastage) ÷ yield", mince && Math.abs(mince.required - 25 * 0.16 * 1.05) < 1e-9, JSON.stringify(mince));
  check("component shortfall measured against component stock", mince && mince.available === 3 && Math.abs(mince.shortfall - (25 * 0.16 * 1.05 - 3)) < 1e-9);
  check("components short → COMPONENT_SHORTAGE warning, componentsAvailable false", codesOf(detail).includes("COMPONENT_SHORTAGE") && req.componentsAvailable === false);
  check("nothing produced, reserved or purchased", db.tables.vyron_stock_movements.length === 0 && db.tables.vyron_cost_stock_ledger.length === 0);
}

// ---------------------------------------------------------------------------
section("Source facts are never overwritten");
{
  const db = newDb();
  const detail = await runScenario(db, "valid-b2b");
  const line = detail.lines[0];
  await service.performIntakeAction(db, CO, detail.intake.id, "request_changes", MANAGER, { reason: "Customer agreed a larger quantity by phone." });
  const edited = await service.editIntake(db, CO, detail.intake.id, { updateLines: [{ lineId: line.id, quantity: 30 }], customerPoNumber: "UAT-PO-1001-B" }, CLERK);
  check("working quantity changed", Number(edited.lines[0].quantity) === 30);
  check("line source snapshot still says 24", edited.lines[0].source_snapshot.source_quantity === 24);
  check("order source snapshot still has the original PO", edited.intake.source_snapshot.po_number === "UAT-PO-1001");
  const revalidated = await validate(db, detail.intake.id);
  const changes = revalidated.intake.validation.issues.filter((i) => i.code === "SOURCE_VALUE_CHANGED");
  check("changes from what the customer sent are raised for the approver", changes.length === 2 && changes.some((c) => c.message.includes("quantity 24 → 30")) && changes.some((c) => c.message.includes("PO UAT-PO-1001 → UAT-PO-1001-B")));
}

// ---------------------------------------------------------------------------
section("Canonical extraction contract");
{
  const scenario = byId.get("low-confidence-extraction");
  const candidate = extraction.extractionToCandidate(scenario.input.extraction, { source: "pdf", sourceKey: "k1" });
  check("non-ISO date is not interpreted (null + note + LOW)", candidate.requestedDeliveryDate === null && candidate.notes.includes("14/10/2026") && candidate.extraction.fields.requested_delivery_date.confidence === "LOW");
  check("value as written kept beside the parsed number", candidate.lines[0].quantity === 12 && candidate.lines[0].sourceValues.quantity === "12 cases?");
  check("extractor and overall confidence carried", candidate.extraction.extractor.name === "uat-fixture" && candidate.extraction.confidence === "LOW");
  const db = newDb();
  const detail = await runScenario(db, "low-confidence-extraction");
  check("as-written quantity frozen in the line snapshot", detail.lines[0].source_snapshot.as_written?.quantity === "12 cases?");
  check("extraction confidence stored on the intake", detail.intake.extraction_confidence === "LOW");
  const refuse = (mutate) => {
    try {
      extraction.extractionToCandidate(mutate(JSON.parse(JSON.stringify(scenario.input.extraction))), { source: "pdf", sourceKey: "x" });
      return false;
    } catch {
      return true;
    }
  };
  check("extraction without confidence refused", refuse((e) => ({ ...e, confidence: undefined })));
  check("extraction with a non-numeric quantity refused", refuse((e) => ({ ...e, order_lines: [{ ...e.order_lines[0], quantity: "a dozen" }] })));
  check("extraction without lines refused", refuse((e) => ({ ...e, order_lines: [] })));
  check("extraction without an extractor refused", refuse((e) => ({ ...e, extractor: { name: "", method: "ai" } })));
  const again = await extraction.receiveExtractedOrder(db, CO, { extraction: scenario.input.extraction, sourceKey: scenario.input.sourceKey }, CLERK);
  check("the same document received twice is one order", again.duplicate === true && db.tables.vyron_order_intakes.length === 1);
}

// ---------------------------------------------------------------------------
section("E-mail boundary: PDF, XLSX");
{
  const db = newDb();
  const message = {
    messageId: "<uat-pdf-1@uat.example>",
    provider: "uat",
    from: "orders@uat-retail-north.example",
    to: ["orders@uat-foodsock.example"],
    subject: "PO UAT-PO-2001",
    receivedAt: "2026-10-06T08:00:00Z",
    bodyText: "Please see the attached order.",
    attachments: [{ fileName: "UAT-PO-2001.pdf", contentType: "application/pdf", sizeBytes: 12000 }],
  };
  const held = await receiveInboundEmail(db, CO, message, CLERK);
  check("PDF-only e-mail → NEEDS_EXTRACTION, no order created", held.status === "NEEDS_EXTRACTION" && db.tables.vyron_order_intakes.length === 0);
  const centre = await service.listExceptionCentre(db, CO);
  check("the held document appears in the Exception Centre", centre.documents.some((d) => d.code === "DOCUMENT_NEEDS_EXTRACTION" && d.documents.includes("UAT-PO-2001.pdf")));
  const redelivered = await receiveInboundEmail(db, CO, message, CLERK);
  check("the same message delivered again is stored once", redelivered.duplicate === true && db.tables.vyron_order_source_messages.length === 1);
  const stocked = scenarios[0].input.candidate.lines[0];
  const extracted = await extraction.receiveExtractedOrder(
    db,
    CO,
    {
      messageRowId: held.messageRowId,
      sourceKey: `${message.messageId}#UAT-PO-2001.pdf`,
      senderEmail: message.from,
      extraction: {
        version: 1,
        extractor: { name: "uat-fixture", method: "ai" },
        confidence: "HIGH",
        customer: C.retailNorth.customer_name,
        po_number: "UAT-PO-2001",
        requested_delivery_date: "2026-10-15",
        order_lines: [{ sku: stocked.sku, product_name: stocked.description, quantity: 6, unit_price: stocked.unitPrice }],
      },
    },
    CLERK
  );
  const msg = db.tables.vyron_order_source_messages[0];
  check("an extraction of the held PDF becomes an order linked to the message", extracted.intake.source_message_id === held.messageRowId && msg.processing_status === "PARSED" && msg.intake_id === extracted.intake.id);
  const validated = await validate(db, extracted.intake.id);
  check("an extracted order is always reviewed (EXTRACTION_REVIEW)", codesOf(validated).includes("EXTRACTION_REVIEW"));

  // XLSX attachment → same column mapping as CSV
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Order");
  ws.addRow(["customer", "po_number", "requested_delivery_date", "sku", "description", "quantity", "unit_price"]);
  ws.addRow([C.retailNorth.customer_name, "UAT-PO-3001", "2026-10-16", stocked.sku, stocked.description, 18, stocked.unitPrice]);
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const xlsx = await receiveInboundEmail(
    db,
    CO,
    { ...message, messageId: "<uat-xlsx-1@uat.example>", attachments: [{ fileName: "UAT-PO-3001.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: bytes.length, contentBase64: bytes.toString("base64") }] },
    CLERK
  );
  const xlsxOrder = xlsx.orders[0];
  check("XLSX attachment → one order via the CSV mapping", xlsx.status === "PARSED" && xlsxOrder && xlsxOrder.lines.length === 1 && Number(xlsxOrder.lines[0].quantity) === 18 && xlsxOrder.intake.customer_po_number === "UAT-PO-3001");
  const xlsxValidated = await validate(db, xlsxOrder.intake.id);
  check("XLSX order validates like any other", xlsxValidated.intake.status === "AWAITING_APPROVAL", JSON.stringify(codesOf(xlsxValidated)));
  const broken = await receiveInboundEmail(db, CO, { ...message, messageId: "<uat-xlsx-2@uat.example>", attachments: [{ fileName: "bad.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 5, contentBase64: Buffer.from("not a workbook").toString("base64") }] }, CLERK);
  check("an unreadable XLSX → FAILED with a reason, no order", broken.status === "FAILED" && Boolean(broken.reason));
}

// ---------------------------------------------------------------------------
section("Deterministic matching: external ids, names, duplicates");
{
  const stockedId = scenarios[0].input.candidate.lines[0];
  const product = uat.fictionalFoodSockCatalogue().products.find((p) => p.sku === stockedId.sku);
  const db = newDb({
    vyron_import_source_links: [
      { id: "f5e00000-0000-4000-8000-000000000001", company_id: CO, source_system: "woocommerce:uat-store", source_entity: "product", source_key: "product:777", entity_type: "product", entity_id: product.id },
      { id: "f5e00000-0000-4000-8000-000000000002", company_id: CO, source_system: "woocommerce:uat-store", source_entity: "customer", source_key: "4242", entity_type: "customer", entity_id: C.retailNorth.id },
    ],
  });
  const order = {
    id: 60001,
    number: "UAT-WEB-60001",
    status: "processing",
    prices_include_tax: false,
    customer_id: 4242,
    billing: { email: "someone@uat.example", first_name: "Linked", last_name: "Customer" },
    line_items: [{ id: 1, product_id: 777, sku: "STORE-OWN-CODE", name: "Store name for the meal", quantity: 3, subtotal: String(Number(product.selling_price) * 3), total: String(Number(product.selling_price) * 3) }],
  };
  const { intake } = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order }), CLERK);
  const detail = await validate(db, intake.id);
  check("web line matched by the linked source product id (external_id), not by guessing its store SKU", detail.intake.validation.lines[0].productId === product.id && detail.intake.validation.lines[0].matchRule === "external_id");
  check("web customer matched by the linked source customer id (external_id)", detail.intake.validation.customer.id === C.retailNorth.id && detail.intake.validation.customer.matchRule === "external_id");

  const unlinked = { ...order, id: 60002, number: "UAT-WEB-60002", customer_id: 0, line_items: [{ ...order.line_items[0], product_id: 888 }] };
  const second = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: unlinked }), CLERK);
  const secondDetail = await validate(db, second.intake.id);
  check("no link and an unknown store SKU → UNMATCHED exception (no fuzzy fallback)", codesOf(secondDetail).includes("PRODUCT_UNMATCHED"));

  const nameOnly = { source: "manual", context: "B2B", customerName: C.retailNorth.customer_name, customerPoNumber: "UAT-PO-4001", requestedDeliveryDate: "2026-10-14", lines: [{ description: product.product_name, quantity: 2, unitPrice: product.selling_price }] };
  const byName = await validate(db, (await service.receiveOrderCandidate(db, CO, nameOnly, CLERK)).intake.id);
  check("SKU-less line: exact product name matched and raised for review (setting 'review')", byName.intake.validation.lines[0].matchRule === "name_exact" && codesOf(byName).includes("PRODUCT_MATCHED_BY_NAME"));
  db.tables.vyron_order_engine_settings[0].product_name_matching = "off";
  const noName = await validate(db, (await service.receiveOrderCandidate(db, CO, { ...nameOnly, customerPoNumber: "UAT-PO-4002" }, CLERK)).intake.id);
  check("setting 'off': the same line is UNMATCHED", codesOf(noName).includes("PRODUCT_UNMATCHED"));

  // Duplicate order reference across sources
  const viaEmailCsv = { source: "csv", sourceKey: "uat-upload-1.csv", externalOrderNumber: "UAT-WEB-60001", customerName: C.retailNorth.customer_name, lines: [{ sku: product.sku, quantity: 3, unitPrice: product.selling_price }] };
  const dup = await validate(db, (await service.receiveOrderCandidate(db, CO, viaEmailCsv, CLERK)).intake.id);
  check("same order reference from another source → POSSIBLE_DUPLICATE_ORDER", codesOf(dup).includes("POSSIBLE_DUPLICATE_ORDER"));

  // Receive idempotency and changed content
  const again = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order }), CLERK);
  check("same web order delivered twice → one order", again.duplicate === true);
  let conflict = null;
  try {
    await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: { ...order, line_items: [{ ...order.line_items[0], quantity: 9 }] } }), CLERK);
  } catch (error) {
    conflict = error.code;
  }
  check("same web order with changed content → refused, never overwritten", conflict === "DUPLICATE_SOURCE_CONFLICT");
}

// ---------------------------------------------------------------------------
section("Tenant ordering settings");
{
  const db = newDb();
  db.tables.vyron_order_engine_settings[0].duplicate_po_action = "block";
  const dup = await runScenario(db, "duplicate-po");
  check("repeated PO set to 'block' → EXCEPTION", dup.intake.status === "EXCEPTION" && dup.intake.validation.issues.some((i) => i.code === "POSSIBLE_DUPLICATE_PO" && i.severity === "error"));
  db.tables.vyron_order_engine_settings[0].min_lead_time_days = 14;
  const late = await validate(db, (await receive(db, { kind: "candidate", candidate: { ...byId.get("valid-b2b").input.candidate, customerPoNumber: "UAT-PO-5001" } })).intake.id);
  check("lead time set → a date inside it is raised (DELIVERY_LEAD_TIME)", codesOf(late).includes("DELIVERY_LEAD_TIME"));

  const bare = createFakeSupabase({ vyron_customers: [] });
  const defaults = await settingsLib.loadOrderSettings(bare, CO);
  check("no settings row → conservative defaults", defaults.configured === false && defaults.b2cCustomerId === null && defaults.duplicatePoAction === "warn" && defaults.productNameMatching === "review" && defaults.minLeadTimeDays === null);
  let foreign = null;
  try {
    await settingsLib.saveOrderSettings(db, CO, { b2cCustomerId: "00000000-0000-4000-8000-00000000beef" }, MANAGER);
  } catch (error) {
    foreign = error.code;
  }
  check("B2C account must belong to this company", foreign === "INVALID_INPUT");
  let badLead = null;
  try {
    await settingsLib.saveOrderSettings(db, CO, { minLeadTimeDays: 500 }, MANAGER);
  } catch (error) {
    badLead = error.code;
  }
  check("lead time outside 0–90 refused", badLead === "INVALID_INPUT");
  const saved = await settingsLib.saveOrderSettings(db, CO, { b2cCustomerId: C.webAccount.id, productNameMatching: "off", duplicatePoAction: "warn", minLeadTimeDays: 2 }, MANAGER);
  check("settings saved and read back", saved.productNameMatching === "off" && saved.minLeadTimeDays === 2 && saved.b2cCustomerId === C.webAccount.id);
}

// ---------------------------------------------------------------------------
section("Exception Centre");
{
  const db = newDb();
  await runScenario(db, "unknown-sku");
  await runScenario(db, "production-required");
  await runScenario(db, "low-margin");
  const centre = await service.listExceptionCentre(db, CO);
  const unmatched = centre.open.find((r) => r.code === "PRODUCT_UNMATCHED");
  check("blocking exception listed with severity, source, explanation and action", unmatched && unmatched.blocking && unmatched.source === "manual" && Boolean(unmatched.message) && Boolean(unmatched.action));
  check("exception records who raised it and when", unmatched && unmatched.raisedBy === CLERK.name && Boolean(unmatched.raisedAt));
  const stock = centre.open.find((r) => r.code === "INSUFFICIENT_STOCK");
  check("original vs expected values shown (stock)", stock && /ordered/.test(stock.originalValue || "") && /available/.test(stock.expectedValue || ""));
  const price = centre.open.find((r) => r.code === "PRICE_MISMATCH");
  check("original vs expected values shown (price)", price && price.originalValue !== null && price.expectedValue !== null);
  check("blocking exceptions listed first", centre.open.findIndex((r) => !r.blocking) > centre.open.findLastIndex((r) => r.blocking));
}

// ---------------------------------------------------------------------------
section("Historical web orders (Metorik / WooCommerce history)");
{
  const db = newDb();
  const historical = platforms.normalizeWooCommerceOrder({
    storeKey: "uat-store",
    purpose: "historical",
    order: { id: 1, number: "HIST-1", status: "completed", line_items: [{ id: 1, sku: "UAT-FSM-001", name: "x", quantity: 1, subtotal: "72", total: "72" }] },
  });
  let code = null;
  try {
    await service.receiveOrderCandidate(db, CO, historical, CLERK);
  } catch (error) {
    code = error.code;
  }
  check("a historical order is refused by intake — never a sales order or invoice", code === "INVALID_INPUT" && db.tables.vyron_order_intakes.length === 0 && db.tables.vyron_customer_sales_orders.length === 0);
}

// ---------------------------------------------------------------------------
section("Tenant isolation");
{
  const OTHER = "0b000000-0000-4000-8000-00000000c0de";
  const product = uat.fictionalFoodSockCatalogue().products[0];
  const db = newDb({
    vyron_customers: [{ id: "0b0c0000-0000-4000-8000-000000000001", company_id: OTHER, customer_name: "UAT Other Tenant Buyer", status: "Active", active: true }],
    vyron_cost_products: [{ id: "0b0f0000-0000-4000-8000-000000000001", company_id: OTHER, product_name: "Other tenant product", sku: "OTHER-ONLY-SKU", selling_price: 10, total_cost: 5 }],
    vyron_import_source_links: [
      { id: "0b0e0000-0000-4000-8000-000000000001", company_id: OTHER, source_system: "woocommerce:uat-store", source_entity: "product", source_key: "product:555", entity_type: "product", entity_id: "0b0f0000-0000-4000-8000-000000000001" },
    ],
    vyron_order_engine_settings: [{ company_id: OTHER, b2c_customer_id: "0b0c0000-0000-4000-8000-000000000001", product_name_matching: "review", duplicate_po_action: "block", min_lead_time_days: null, updated_by: "other", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }],
  });
  const crossCustomer = await validate(db, (await service.receiveOrderCandidate(db, CO, { source: "manual", customerName: "UAT Other Tenant Buyer", lines: [{ sku: product.sku, quantity: 1, unitPrice: 72 }] }, CLERK)).intake.id);
  check("another tenant's customer is never matched", codesOf(crossCustomer).includes("CUSTOMER_NOT_FOUND"));
  const crossSku = await validate(db, (await service.receiveOrderCandidate(db, CO, { source: "manual", customerName: C.retailNorth.customer_name, lines: [{ sku: "OTHER-ONLY-SKU", quantity: 1, unitPrice: 10 }] }, CLERK)).intake.id);
  check("another tenant's SKU is never matched", codesOf(crossSku).includes("PRODUCT_UNMATCHED"));
  const web = platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: { id: 70001, status: "processing", prices_include_tax: false, customer_id: 0, billing: { first_name: "X" }, line_items: [{ id: 1, product_id: 555, sku: "NOPE", name: "n", quantity: 1, subtotal: "10", total: "10" }] } });
  const crossLink = await validate(db, (await service.receiveOrderCandidate(db, CO, web, CLERK)).intake.id);
  check("another tenant's source links are never used", codesOf(crossLink).includes("PRODUCT_UNMATCHED") && crossLink.intake.validation.customer.id === C.webAccount.id);
  let crossChoice = null;
  try {
    await service.receiveOrderCandidate(db, CO, { source: "manual", customerId: "0b0c0000-0000-4000-8000-000000000001", lines: [{ sku: product.sku, quantity: 1 }] }, CLERK);
  } catch (error) {
    crossChoice = error.code;
  }
  check("choosing another tenant's customer is refused", crossChoice === "INVALID_INPUT");
  const otherSettings = await settingsLib.loadOrderSettings(db, OTHER);
  const ownSettings = await settingsLib.loadOrderSettings(db, CO);
  check("settings are per tenant", otherSettings.duplicatePoAction === "block" && ownSettings.duplicatePoAction === "warn");
  const otherCentre = await service.listExceptionCentre(db, OTHER);
  check("another tenant's Exception Centre shows none of these orders", otherCentre.open.length === 0 && otherCentre.documents.length === 0);
  const otherList = await service.listIntakes(db, OTHER, { view: "all" });
  check("another tenant's order list is empty", (otherList.intakes || otherList.rows || otherList).length === 0);
  let notFound = null;
  try {
    await service.getIntakeDetail(db, OTHER, crossSku.intake.id);
  } catch (error) {
    notFound = error.code;
  }
  check("another tenant cannot open this tenant's order", notFound === "NOT_FOUND");
}

// ---------------------------------------------------------------------------
section("No Food Sock identifiers in runtime logic");
{
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  walk(path.join(ROOT, "src/lib/order-engine"));
  walk(path.join(ROOT, "src/app/api/order-intake"));
  const offenders = files.filter((f) => /e920c747-1d27-4d01-9e7c-182f9a7d0aa3/i.test(readFileSync(f, "utf8")));
  check("no hard-coded Food Sock company id in the Order Engine or its API", offenders.length === 0, offenders.join(", "));
}


// ---------------------------------------------------------------------------
section("E-mail connector: the tenant comes from the receiving address");
{
  const db = newDb();
  const MAILBOX = "orders@uat-foodsock.example";
  const base = {
    messageId: "<conn-1@uat.example>",
    provider: "uat-provider",
    from: "buyer@uat-retail-north.example",
    to: [MAILBOX],
    deliveredTo: MAILBOX,
    subject: "PO UAT-PO-7001",
    receivedAt: "2026-10-06T07:00:00Z",
    bodyText: "Order attached.",
    attachments: [],
  };
  const stocked = scenarios.find((x) => x.id === "valid-b2b").input.candidate.lines[0];
  const csvText = `customer,po_number,requested_delivery_date,sku,description,quantity,unit_price\n${C.retailNorth.customer_name},UAT-PO-7001,2026-10-14,${stocked.sku},${stocked.description},12,${stocked.unitPrice}\n`;

  const unknown = await connector.receiveConnectorMessage(db, { ...base, messageId: "<conn-unknown@uat.example>", deliveredTo: "nobody@elsewhere.example" }, CLERK);
  check("an unknown receiving address is not processed and stores nothing", unknown.status === "NO_MAILBOX" && db.tables.vyron_order_source_messages.length === 0);

  const resolved = await mailboxes.resolveMailboxByAddress(db, MAILBOX.toUpperCase());
  check("the mailbox resolves the tenant (case-insensitively)", resolved?.companyId === CO);
  db.tables.vyron_order_mailboxes[0].status = "DISABLED";
  check("a disabled mailbox resolves to nothing", (await mailboxes.resolveMailboxByAddress(db, MAILBOX)) === null);
  db.tables.vyron_order_mailboxes[0].status = "ACTIVE";

  const accepted = await connector.receiveConnectorMessage(
    db,
    { ...base, attachments: [{ fileName: "po.csv", contentType: "text/csv", sizeBytes: csvText.length, text: csvText }] },
    CLERK
  );
  check("an expected sender with a CSV becomes an order in the mailbox's company", accepted.status === "ACCEPTED" && accepted.companyId === CO && accepted.result.orders.length === 1);
  const stored = db.tables.vyron_order_source_messages.find((m) => m.message_id === base.messageId);
  check("the message records its mailbox and attachment provenance", stored?.mailbox_id === db.tables.vyron_order_mailboxes[0].id && stored.attachments[0].sha256 && stored.attachments[0].fileName === "po.csv");
  check("the order keeps its link to the message it arrived in", accepted.result.orders[0].intake.source_message_id === stored.id);

  const stranger = await connector.receiveConnectorMessage(
    db,
    { ...base, messageId: "<conn-2@uat.example>", from: "someone@not-a-customer.example", attachments: [{ fileName: "po.csv", contentType: "text/csv", sizeBytes: csvText.length, text: csvText }] },
    CLERK
  );
  check("an unexpected sender is quarantined, never processed into an order", stranger.status === "QUARANTINED" && stranger.judgement.reasons.includes("SENDER_NOT_ALLOWED") && db.tables.vyron_order_intakes.length === 1);
  const quarantined = db.tables.vyron_order_source_messages.find((m) => m.message_id === "<conn-2@uat.example>");
  check("the quarantined message is stored with the reason", quarantined?.processing_status === "QUARANTINED" && String(quarantined.processing_error || "").includes("not an expected sender"));
  const centre = await service.listExceptionCentre(db, CO);
  check("it appears in the Exception Centre as held for review", centre.documents.some((d) => d.code === "EMAIL_NOT_ACCEPTED"));

  const duplicate = await connector.receiveConnectorMessage(
    db,
    { ...base, messageId: "<conn-3@uat.example>", attachments: [{ fileName: "po-again.csv", contentType: "text/csv", sizeBytes: csvText.length, text: csvText }] },
    CLERK
  );
  check("the same attachment under a new message id is held as a duplicate", duplicate.status === "QUARANTINED" && duplicate.judgement.reasons.includes("DUPLICATE_ATTACHMENT"));

  const big = await connector.receiveConnectorMessage(
    db,
    { ...base, messageId: "<conn-4@uat.example>", attachments: [{ fileName: "huge.csv", contentType: "text/csv", sizeBytes: 40 * 1024 * 1024, text: "x" }] },
    CLERK
  );
  check("an oversized attachment is held", big.status === "QUARANTINED" && big.judgement.reasons.includes("ATTACHMENT_NOT_ACCEPTED"));
  const exe = await connector.receiveConnectorMessage(
    db,
    { ...base, messageId: "<conn-5@uat.example>", attachments: [{ fileName: "order.exe", contentType: "application/x-msdownload", sizeBytes: 10, text: "x" }] },
    CLERK
  );
  check("an unsupported attachment type is held", exe.status === "QUARANTINED" && exe.judgement.reasons.includes("ATTACHMENT_NOT_ACCEPTED"));
}

section("E-mail security: sender verification is only ever reported, never assumed");
{
  const mailbox = { id: "m1", company_id: CO, receiving_address: "orders@uat-foodsock.example", status: "ACTIVE", allowed_sender_domains: ["uat-retail-north.example"], allowed_senders: null, max_attachment_bytes: null, allowed_mime_types: null, require_verified_sender: true, updated_by: "u" };
  const message = { messageId: "<v1>", provider: "p", from: "buyer@uat-retail-north.example", to: [], receivedAt: "2026-10-06T07:00:00Z", attachments: [] };
  const silent = security.judgeInboundEmail(message, mailbox);
  check("no verification supplied → not accepted, and nothing is claimed", !silent.accept && silent.reasons.includes("SENDER_VERIFICATION_NOT_SUPPLIED") && silent.verification.stated === false && silent.verification.passed === null);
  const failed = security.judgeInboundEmail({ ...message, verification: { spf: "fail", dkim: "pass", dmarc: "fail" } }, mailbox);
  check("provider says verification failed → held", !failed.accept && failed.reasons.includes("SENDER_VERIFICATION_FAILED") && failed.verification.passed === false);
  const passed = security.judgeInboundEmail({ ...message, verification: { spf: "pass", dkim: "pass", dmarc: "pass" } }, mailbox);
  check("provider says it passed → accepted, and the result is recorded as the provider's", passed.accept && passed.verification.passed === true && passed.verification.spf === "pass");
  const noPolicy = security.judgeInboundEmail(message, { ...mailbox, allowed_sender_domains: null, require_verified_sender: false });
  check("a mailbox with no sender policy holds everything for a person", !noPolicy.accept && noPolicy.reasons.includes("SENDER_POLICY_NOT_SET"));
}

section("PDF: held until an extractor is configured");
{
  const db = newDb();
  const MAILBOX = "orders@uat-foodsock.example";
  const message = {
    messageId: "<pdf-conn-1@uat.example>",
    provider: "uat-provider",
    from: "buyer@uat-retail-north.example",
    to: [MAILBOX],
    deliveredTo: MAILBOX,
    subject: "PO UAT-PO-7002",
    receivedAt: "2026-10-06T08:00:00Z",
    attachments: [{ fileName: "UAT-PO-7002.pdf", contentType: "application/pdf", sizeBytes: 22000, sha256: "abc123" }],
  };
  check("no PDF extractor is registered in this build", pdf.listPdfExtractors().length === 0);
  const held = await connector.receiveConnectorMessage(db, message, CLERK);
  check("a PDF is accepted, held for extraction, and no order is invented", held.status === "ACCEPTED" && held.result.status === "NEEDS_EXTRACTION" && db.tables.vyron_order_intakes.length === 0);
  const run = db.tables.vyron_order_document_extractions[0];
  check("the attempt is recorded as NOT_CONFIGURED with the document's provenance", run?.status === "NOT_CONFIGURED" && run.provider === null && run.attachment_sha256 === "abc123" && run.attachment_name === "UAT-PO-7002.pdf");
  check("nothing was normalised from the document", JSON.stringify(run.normalized) === "{}" && /not active|No document extractor is configured/.test(String(run.error)));
  check("the PDF channel is not active, so no document was ever sent to a provider", String(run.error).includes("not active"));
  const centre = await service.listExceptionCentre(db, CO);
  const doc = centre.documents.find((d) => d.code === "DOCUMENT_NEEDS_EXTRACTION");
  check("the Exception Centre says the document was received but not read", Boolean(doc) && doc.documents.includes("UAT-PO-7002.pdf"));
  const attempt = await pdf.extractDocument({ fileName: "x.pdf", contentType: "application/pdf", sizeBytes: 1, sha256: null }, { companyId: CO, extractorId: "acme-reader" });
  check("a configured but unavailable extractor is reported, not faked", attempt.status === "NOT_CONFIGURED" && attempt.reason.includes("acme-reader"));
}

section("Web channel decisions");
{
  const wooOrder = (id) => ({ id, number: `W-${id}`, status: "processing", prices_include_tax: false, customer_id: 0, billing: { first_name: "Web", last_name: "Shopper" }, line_items: [{ id: 1, product_id: 1, sku: "UAT-FSD-007", name: "UAT Bone Broth 500ml", quantity: 1, subtotal: "58", total: "58" }] });
  const receiveWeb = (db, id) => service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: wooOrder(id) }), CLERK);

  const undecided = newDb();
  undecided.tables.vyron_order_engine_settings[0].web_orders_mode = null;
  const heldOrder = await validate(undecided, (await receiveWeb(undecided, 81001)).intake.id);
  check("web orders with no decision are received but blocked (never silently fulfilled)", heldOrder.intake.status === "EXCEPTION" && codesOf(heldOrder).includes("WEB_ORDERS_MODE_NOT_DECIDED"));

  const historyOnly = newDb();
  historyOnly.tables.vyron_order_engine_settings[0].web_orders_mode = "history_only";
  let refused = null;
  try {
    await receiveWeb(historyOnly, 81002);
  } catch (error) {
    refused = error.message;
  }
  check("history-only: a web order is refused at intake", Boolean(refused) && refused.includes("historical") && historyOnly.tables.vyron_order_intakes.length === 0);

  const disabled = newDb();
  disabled.tables.vyron_order_channel_settings[0].enabled = false;
  let channelRefused = null;
  try {
    await receiveWeb(disabled, 81003);
  } catch (error) {
    channelRefused = error.message;
  }
  check("a disabled channel is refused at intake", Boolean(channelRefused) && channelRefused.includes("not enabled"));

  const wrongStatus = newDb();
  const statusOrder = { ...wooOrder(81004), status: "pending" };
  const statusDetail = await validate(wrongStatus, (await service.receiveOrderCandidate(wrongStatus, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: statusOrder }), CLERK)).intake.id);
  check("a store status the company does not fulfil is blocked", statusDetail.intake.status === "EXCEPTION" && codesOf(statusDetail).includes("WEB_STATUS_NOT_ELIGIBLE"));

  const vatChannel = newDb();
  vatChannel.tables.vyron_order_channel_settings[0].prices_include_tax = true;
  const silentTax = { ...wooOrder(81005) };
  delete silentTax.prices_include_tax;
  const vatDetail = await validate(vatChannel, (await service.receiveOrderCandidate(vatChannel, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: silentTax }), CLERK)).intake.id);
  check("the channel's VAT basis applies when the order is silent", vatDetail.intake.status === "EXCEPTION" && codesOf(vatDetail).includes("PRICES_INCLUDE_TAX"));

  const unknownVat = newDb();
  unknownVat.tables.vyron_order_channel_settings[0].prices_include_tax = null;
  const unknownDetail = await validate(unknownVat, (await service.receiveOrderCandidate(unknownVat, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: silentTax }), CLERK)).intake.id);
  check("an unknown VAT basis is raised, not assumed", codesOf(unknownDetail).includes("WEB_VAT_BASIS_UNKNOWN"));
}

section("CSV and Excel: nothing ambiguous is reinterpreted");
{
  const head = "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price";
  const parse = (text) => {
    try {
      return { ok: true, candidate: csv.parseCsvOrder({ text }) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  };
  const decimalComma = parse(`${head}\n${C.retailNorth.customer_name},PO-1,2026-10-14,UAT-FSD-007,Broth,10,"1,50"`);
  check("a comma decimal is refused, not silently read as 150", !decimalComma.ok && decimalComma.error.includes("ambiguous"));
  const grouped = parse(`${head}\n${C.retailNorth.customer_name},PO-1,2026-10-14,UAT-FSD-007,Broth,10,"1,234.50"`);
  check("an unambiguous thousands separator is accepted", grouped.ok && grouped.candidate.lines[0].unitPrice === 1234.5);
  const localDate = parse(`${head}\n${C.retailNorth.customer_name},PO-1,05/06/2026,UAT-FSD-007,Broth,10,58`);
  check("an ambiguous date is refused with both readings explained", !localDate.ok && localDate.error.includes("5 June or 6 May"));
  const unitQty = parse(`${head}\n${C.retailNorth.customer_name},PO-1,2026-10-14,UAT-FSD-007,Broth,10 cases,58`);
  check("a quantity with a unit in it is refused", !unitQty.ok && unitQty.error.includes("not a plain number"));
  const twoQty = parse(`customer,po_number,sku,quantity,qty,unit_price\nX,PO,SKU,1,2,3`);
  check("two columns meaning the same thing are refused", !twoQty.ok && twoQty.error.includes("both mean quantity"));
  const vatFlag = parse(`customer,prices_include_vat,sku,quantity,unit_price\nX,maybe,SKU,1,10`);
  check("an unclear VAT flag is refused", !vatFlag.ok && vatFlag.error.includes("does not say clearly"));
  const vatYes = parse(`customer,prices_include_vat,sku,quantity,unit_price\nX,yes,SKU,1,10`);
  check("a clear VAT flag is carried onto the order", vatYes.ok && vatYes.candidate.pricesIncludeTax === true);
  const currency = parse(`customer,currency,sku,quantity,unit_price\nX,Rand,SKU,1,10`);
  check("a currency that is not a three-letter code is refused", !currency.ok && currency.error.includes("three-letter"));
  const extra = parse(`customer,po_number,sku,quantity,unit_price,warehouse_note\nX,PO,SKU,1,10,leave at gate`);
  check("columns the template does not define are reported, not silently ignored", extra.ok && extra.candidate.extraction.sourceFacts.unmappedColumns.includes("warehouse_note"));
  const withTax = parse(`customer,sku,quantity,unit_price,vat,customer_reference\nX,SKU,2,10,3,ACC-9`);
  check("VAT and customer reference columns are read", withTax.ok && withTax.candidate.lines[0].taxAmount === 3 && withTax.candidate.customerReference === "ACC-9");
  const asWritten = parse(`${head}\n${C.retailNorth.customer_name},PO-1,2026-10-14,UAT-FSD-007,Broth,10,58.00`);
  check("the file's own values are kept as written", asWritten.ok && asWritten.candidate.lines[0].sourceValues.price === "58.00");
}

section("Sales Order handoff: deeper audit");
{
  const db = newDb();
  // A customer contract price that differs from the master price.
  const stocked = scenarios.find((x) => x.id === "valid-b2b").input.candidate.lines[0];
  const product = uat.fictionalFoodSockCatalogue().products.find((p) => p.sku === stocked.sku);
  db.tables.vyron_customer_price_lists.push({ id: "f5d00000-0000-4000-8000-000000000001", company_id: CO, name: "UAT contract", status: "Active" });
  db.tables.vyron_customer_price_list_items.push({ id: "f5d00000-0000-4000-8000-000000000002", company_id: CO, price_list_id: "f5d00000-0000-4000-8000-000000000001", product_id: product.id, final_price: 51, status: "Active", effective_from: "2026-01-01" });
  db.tables.vyron_customer_price_list_assignments.push({ id: "f5d00000-0000-4000-8000-000000000003", company_id: CO, customer_id: C.retailNorth.id, contract_price_list_id: "f5d00000-0000-4000-8000-000000000001", status: "Active" });
  const candidate = { ...byId.get("valid-b2b").input.candidate, lines: [{ ...stocked, unitPrice: null }], customerPoNumber: "UAT-PO-8001" };
  const detail = await validate(db, (await service.receiveOrderCandidate(db, CO, candidate, CLERK)).intake.id);
  check("with no price on the order, the customer's contract price is used", detail.intake.validation.lines[0].effectiveUnitPrice === 51 && detail.intake.validation.lines[0].priceSource);
  const confirmed = await approve(db, detail);
  const so = db.tables.vyron_customer_sales_orders[0];
  const soLine = db.tables.vyron_customer_sales_order_lines[0];
  check("the sales order carries the approved (contract) price, not the master price", Number(soLine.selling_price) === 51);
  check("VAT comes from the workspace rate", Number(soLine.tax_rate) === 15);
  check("the intake and sales order stay linked both ways", confirmed.intake.sales_order_id === so.id && String(so.notes).includes(confirmed.intake.intake_number));
  check("no invoice, Xero queue entry, stock movement or reservation was created", db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_xero_sync_queue.length === 0 && db.tables.vyron_stock_movements.length === 0 && db.tables.vyron_customer_sales_order_allocations.length === 0);

  // Retry after a partial failure: the sales order exists but has no lines.
  const retryDb = newDb();
  const retryDetail = await runScenario(retryDb, "valid-b2b");
  const claimed = await service.performIntakeAction(retryDb, CO, retryDetail.intake.id, "approve", MANAGER, {
    today: TODAY,
    validationHash: retryDetail.intake.validation_hash,
    acknowledgeWarnings: true,
  }).catch((e) => e);
  const orderId = retryDb.tables.vyron_customer_sales_orders[0]?.id;
  retryDb.tables.vyron_customer_sales_order_lines = retryDb.tables.vyron_customer_sales_order_lines.filter((l) => l.sales_order_id !== orderId);
  let retryError = null;
  try {
    await service.performIntakeAction(retryDb, CO, retryDetail.intake.id, "confirm", MANAGER, {});
  } catch (error) {
    retryError = error;
  }
  check("a half-written sales order is never silently completed on retry", claimed.intake?.status === "CONFIRMED" && retryError !== null);
  check("and no second sales order is created", retryDb.tables.vyron_customer_sales_orders.length === 1);
}

section("Workflow boundaries: the Order Engine does not absorb downstream work");
{
  const engineFiles = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.ts$/.test(name)) engineFiles.push(full);
    }
  };
  walk(path.join(ROOT, "src/lib/order-engine"));
  const downstream = ["vyron_customer_invoices", "vyron_customer_invoice_lines", "vyron_xero_sync_queue", "vyron_stock_movements", "vyron_cost_stock_ledger", "vyron_production_runs"];
  const offenders = [];
  for (const file of engineFiles) {
    const text = readFileSync(file, "utf8");
    for (const table of downstream) {
      if (new RegExp(`from\\("${table}"\\)`).test(text)) offenders.push(`${path.basename(file)} → ${table}`);
    }
  }
  check("the Order Engine never reads or writes invoices, Xero, stock ledger or production tables", offenders.length === 0, offenders.join(", "));
  const serviceText = readFileSync(path.join(ROOT, "src/lib/order-engine/service.ts"), "utf8");
  check("the handoff goes through the existing sales-order engine only", serviceText.includes("saveCustomerSalesOrder") && !serviceText.includes("insert into vyron_customer_sales_orders"));
}

section("Audit trail");
{
  const db = newDb();
  const detail = await runScenario(db, "valid-b2b");
  await approve(db, detail);
  const events = db.tables.vyron_order_intake_events.filter((e) => e.intake_id === detail.intake.id);
  const types = events.map((e) => e.event_type);
  check("every transition is recorded (received → validated → approval requested → approved → confirmed)", ["RECEIVED", "VALIDATED", "APPROVAL_REQUESTED", "APPROVED", "CONFIRMED"].every((t) => types.includes(t)), types.join(","));
  check("every event carries tenant, order, actor and timestamp", events.every((e) => e.company_id === CO && e.intake_id === detail.intake.id && e.actor && e.created_at));
  const approved = events.find((e) => e.event_type === "APPROVED");
  check("the approval records who, from which state, and the validation it was based on", approved.actor === MANAGER.userId && approved.from_status === "AWAITING_APPROVAL" && approved.to_status === "APPROVED" && approved.metadata.validationHash);
  const confirmedEvent = events.find((e) => e.event_type === "CONFIRMED");
  check("the handoff records the sales order it created", confirmedEvent.metadata.salesOrderId === db.tables.vyron_customer_sales_orders[0].id);
  const held = await service.performIntakeAction(db, CO, (await runScenario(db, "unknown-sku")).intake.id, "cancel", MANAGER, { reason: "Customer withdrew the order." });
  const cancel = db.tables.vyron_order_intake_events.filter((e) => e.intake_id === held.intake.id).find((e) => e.event_type === "CANCELLED");
  check("a decision that needs a reason records it", cancel.detail === "Customer withdrew the order." && cancel.actor === MANAGER.userId);
}

section("Tenant isolation of the new configuration");
{
  const OTHER = "0b000000-0000-4000-8000-00000000c0de";
  const db = newDb({
    vyron_order_engine_settings: [{ company_id: OTHER, b2c_customer_id: null, product_name_matching: "off", duplicate_po_action: "block", min_lead_time_days: 5, web_orders_mode: "history_only", updated_by: "other", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }],
    vyron_order_channel_settings: [{ id: "0b080000-0000-4000-8000-000000000001", company_id: OTHER, channel_key: "woocommerce:uat-store", label: "Other tenant store", enabled: false, prices_include_tax: true, eligible_statuses: ["nothing"], updated_by: "other", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }],
    vyron_order_mailboxes: [{ id: "0b0a0000-0000-4000-8000-000000000001", company_id: OTHER, receiving_address: "orders@other-tenant.example", status: "ACTIVE", allowed_sender_domains: null, allowed_senders: null, max_attachment_bytes: null, allowed_mime_types: null, require_verified_sender: false, updated_by: "other", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" }],
  });
  const ours = await settingsLib.loadOrderSettings(db, CO);
  check("another tenant's settings never apply here", ours.duplicatePoAction === "warn" && ours.webOrdersMode === "fulfil" && ours.minLeadTimeDays === null);
  const theirChannel = await settingsLib.loadChannelSettings(db, CO, "woocommerce:uat-store");
  check("channels are per tenant (same key, different row)", theirChannel.enabled === true && theirChannel.prices_include_tax === false);
  check("mailbox lists are per tenant", (await mailboxes.listMailboxes(db, CO)).every((m) => m.company_id === CO));
  const theirs = await mailboxes.resolveMailboxByAddress(db, "orders@other-tenant.example");
  check("an address resolves only to its own tenant", theirs?.companyId === OTHER);
  let crossSave = null;
  try {
    await mailboxes.saveMailbox(db, CO, { receivingAddress: "orders@other-tenant.example" }, MANAGER);
  } catch (error) {
    crossSave = error.code;
  }
  check("one receiving address cannot be claimed by two companies", crossSave === "INVALID_INPUT", String(crossSave));
  const register = await decisions.loadDecisionRegister(db, CO);
  check("the decision register is per tenant", register.find((d) => d.id === "D1").state === "CONFIGURED" && register.find((d) => d.id === "D6").current.includes("Warns"));
}

section("Decision register");
{
  const db = newDb();
  const register = await decisions.loadDecisionRegister(db, CO);
  check("every decision D1-D12 is represented", register.length === 12 && register.map((d) => d.id).join(",") === "D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12");
  check("an undecided decision says exactly what happens until it is made", register.filter((d) => d.state === "AWAITING_DECISION").every((d) => d.untilDecided.length > 10));
  check("blocking decisions are marked as blocking", register.find((d) => d.id === "D12").blocks === true);
  const bare = createFakeSupabase({ vyron_customers: [] });
  const empty = await decisions.loadDecisionRegister(bare, CO);
  check("with nothing configured, only the two safe defaults are decided", empty.filter((d) => d.state === "CONFIGURED").map((d) => d.id).join(",") === "D6,D7");
  check("and nothing claims to be configured that is not", empty.find((d) => d.id === "D2").current === "Not decided" && empty.find((d) => d.id === "D1").current === "Not decided");
}


// ---------------------------------------------------------------------------
section("Catalogue validation: data quality, business decisions and defects are told apart");
{
  const report = catalogueCheck.validateCatalogue(uat.fictionalFoodSockCatalogue());
  check("a sound fictional catalogue has no engineering findings", report.byKind.ENGINEERING === 0);
  check("it is orderable", report.orderable === true);
  check("coverage is measured, not assumed", report.coverage.sku === 100 && report.coverage.cost === 100 && report.coverage.stock === 100);
  check("a product with no BOM is a data finding, not a defect", report.findings.some((f) => f.code === "MISSING_BOM" && f.kind === "DATA"));

  // A deliberately damaged catalogue: every check has something to find.
  const base = uat.fictionalFoodSockCatalogue();
  const broken = {
    ...base,
    products: [
      ...base.products.map((p, i) => (i === 0 ? { ...p, sku: null } : p)),
      { id: "f5f00000-0000-4000-8000-000000000098", product_name: "UAT Duplicate SKU A", sku: "UAT-DUP-1", selling_price: 10, total_cost: 4 },
      { id: "f5f00000-0000-4000-8000-000000000099", product_name: "UAT Duplicate SKU B", sku: "uat-dup-1", selling_price: 10, total_cost: 4 },
      { id: "f5f00000-0000-4000-8000-000000000097", product_name: "UAT Discontinued Meal", sku: "UAT-OLD-1", selling_price: 10, total_cost: 4, status: "Discontinued" },
      { id: "f5f00000-0000-4000-8000-000000000096", product_name: "UAT Costless Meal", sku: "UAT-NOCOST", selling_price: 10, total_cost: null },
    ],
    boms: [...base.boms, { id: "f5b00000-0000-4000-8000-000000000090", product_id: "f5f00000-0000-4000-8000-000000000098", bom_name: "UAT empty recipe" }],
    bomLines: [
      ...base.bomLines,
      { id: "f570000-0000-4000-8000-000000000091", bom_id: "f5b00000-0000-4000-8000-000000000095", ingredient_id: "x", line_name: "orphan line", quantity: 1 },
      { id: "f570000-0000-4000-8000-000000000092", bom_id: base.boms[0].id, ingredient_id: null, line_name: "component-less line", quantity: 1 },
    ],
    customers: [
      { id: "f5c00000-0000-4000-8000-000000000090", customer_name: "UAT Same Name" },
      { id: "f5c00000-0000-4000-8000-000000000091", customer_name: "UAT Same Name" },
    ],
    productAliases: [
      { id: "a1", customer_id: "f5c00000-0000-4000-8000-000000000090", source_code_normalized: "sku:SHARED", product_id: base.products[0].id },
      { id: "a2", customer_id: "f5c00000-0000-4000-8000-000000000090", source_code_normalized: "sku:SHARED", product_id: base.products[1].id },
      { id: "a3", customer_id: "f5c00000-0000-4000-8000-000000000090", source_code_normalized: "sku:GONE", product_id: "not-in-this-snapshot" },
    ],
    customerIdentities: [{ id: "i1", external_reference: "woocommerce:store:9", customer_id: null }],
  };
  const bad = catalogueCheck.validateCatalogue(broken);
  const has = (code, kind) => bad.findings.some((f) => f.code === code && f.kind === kind);
  check("missing SKU is found", has("MISSING_SKU", "DATA"));
  check("duplicate SKU is found, whatever the case or separators", has("DUPLICATE_SKU", "DATA"));
  check("a discontinued product is found", has("INACTIVE_PRODUCT", "DATA"));
  check("a product without a cost is found", has("MISSING_COST", "DATA"));
  check("a product without stock is found", has("MISSING_STOCK", "DATA"));
  check("a product without a BOM is found", has("MISSING_BOM", "DATA"));
  check("a BOM with no components is found", has("BOM_WITHOUT_COMPONENTS", "DATA"));
  check("a BOM line naming no component is found", has("MISSING_COMPONENT", "DATA"));
  check("customers with the same name are found (an order naming it will stop)", has("AMBIGUOUS_CUSTOMER_NAME", "DATA"));
  check("a customer with no price list is a business decision, not a defect", has("MISSING_CUSTOMER_PRICE", "DECISION"));
  check("a customer with no ordering rules is a business decision", has("MISSING_CUSTOMER_RULES", "DECISION"));
  check("a code mapped to two products is found", has("AMBIGUOUS_MAPPING", "DATA"));
  check("a mapping to a product that is not here is found", has("MAPPING_WITHOUT_PRODUCT", "DATA"));
  check("a remembered reference pointing at no customer is found", has("MISSING_CUSTOMER_MAPPING", "DATA"));
  check("an orphan BOM line is an engineering finding: the extract is incomplete", has("BOM_LINE_WITHOUT_BOM", "ENGINEERING"));
  check("a data problem is never reported as an application defect", bad.findings.filter((f) => f.kind === "ENGINEERING").every((f) => f.code.includes("NOT_IN_SNAPSHOT") || f.code === "BOM_LINE_WITHOUT_BOM"));

  const scope = catalogueCheck.compareWithMigratedScope(bad);
  check("a snapshot is reconciled against the controlled migration scope", scope.length === 5 && scope.every((row) => typeof row.expected === "number" && typeof row.found === "number"));
  check("the scope figures are the migrated Food Sock ones", catalogueCheck.FOOD_SOCK_MIGRATED_SCOPE.finishedProducts === 31 && catalogueCheck.FOOD_SOCK_MIGRATED_SCOPE.bomLines === 348 && catalogueCheck.FOOD_SOCK_MIGRATED_SCOPE.components === 51);
}

// ---------------------------------------------------------------------------
section("A snapshot must say where it came from");
{
  const body = { products: [{ id: "p1", product_name: "X", sku: "X-1", selling_price: 10, total_cost: 5 }], stockItems: [], boms: [], bomLines: [] };
  const fails = (raw) => {
    try {
      uat.loadUatSnapshot(raw);
      return null;
    } catch (error) {
      return error.message;
    }
  };
  check("an unclassified snapshot is refused", /classification/i.test(fails(body) || ""));
  check("a snapshot classified as something else is refused", /classified/i.test(fails({ ...body, classification: "INTERNAL" }) || ""));
  check("a snapshot without an environment is refused", /environment/i.test(fails({ ...body, classification: "NON-PRODUCTION / UAT" }) || ""));
  check("a snapshot that says it came from production is refused", /never run from a production extract/i.test(fails({ ...body, classification: "NON-PRODUCTION / UAT", meta: { environment: "production-replica" } }) || ""));
  check("a snapshot that says it came from a live system is refused", /never run from a production extract/i.test(fails({ ...body, classification: "NON-PRODUCTION / UAT", meta: { environment: "live-copy" } }) || ""));
  const good = uat.loadUatSnapshot({ ...body, classification: "NON-PRODUCTION / UAT", meta: { environment: "uat-restore", source: "restore of a backup", takenAt: "2026-10-01" } });
  check("a properly classified snapshot loads, re-homed onto the fictional tenant", good.products[0].company_id === CO && good.meta.environment === "uat-restore");
  check("the classification is carried into the report", good.meta.classification === uat.SNAPSHOT_CLASSIFICATION);
  const extended = uat.loadUatSnapshot({
    ...body,
    classification: "NON-PRODUCTION / UAT",
    meta: { environment: "uat-restore" },
    customers: [{ id: "c1", customer_name: "Snapshot Customer" }],
    productAliases: [{ id: "a1", source_code_normalized: "sku:ABC", product_id: "p1" }],
    customerIdentities: [{ id: "i1", external_reference: "x", customer_id: "c1" }],
    packSizes: [{ id: "k1", product_id: "p1", units_per_box: 6, confidence: "Confirmed" }],
  });
  check("a snapshot can carry customers, mappings, identities and case sizes", extended.customers.length === 1 && extended.productAliases.length === 1 && extended.customerIdentities.length === 1 && extended.packSizes.length === 1);
  check("coverage counts what the snapshot actually supplied", uat.snapshotCoverage(extended).aliases === 1 && uat.snapshotCoverage(extended).customerIdentities === 1);
}

// ---------------------------------------------------------------------------
section("End to end: a customer's file becomes a Draft Sales Order, and nothing more");
{
  const db = newDb();
  const catalogue = uat.fictionalFoodSockCatalogue();
  const { stocked } = uat.pickUatProducts(catalogue);
  const text = [
    "customer,po_number,requested_delivery_date,sku,description,quantity,unit_price",
    `${C.retailNorth.customer_name},UAT-PO-E2E-1,2026-10-15,${stocked.sku},${stocked.product_name},20,${stocked.selling_price}`,
  ].join("\n");

  // source → intake
  const candidate = csv.parseCsvOrder({ text, fileName: "UAT-PO-E2E-1.csv" });
  const received = await service.receiveOrderCandidate(db, CO, candidate, CLERK);
  check("the file becomes one order, with the file named as its source", received.intake.source === "csv" && String(received.intake.source_reference || "").includes("UAT-PO-E2E-1.csv"));
  check("what the file said is frozen on the order", received.intake.source_snapshot.po_number === "UAT-PO-E2E-1");

  // matching → validation
  const detail = await validate(db, received.intake.id);
  const lineEval = detail.intake.validation.lines[0];
  const product = catalogue.products.find((p) => p.sku === stocked.sku);
  check("the line matched the product by its SKU, deterministically", lineEval.productId === product.id && lineEval.matchRule && lineEval.matchRule.startsWith("sku"));
  check("the customer matched by name", detail.intake.customer_id === C.retailNorth.id);
  check("the order is ready for a person to approve", detail.intake.status === "AWAITING_APPROVAL");

  // approval → Draft sales order
  const confirmed = await approve(db, detail);
  const so = db.tables.vyron_customer_sales_orders[0];
  const soLine = db.tables.vyron_customer_sales_order_lines.find((l) => l.sales_order_id === so.id);
  check("approval creates exactly one sales order, in Draft", db.tables.vyron_customer_sales_orders.length === 1 && so.status === "Draft");
  check("the sales order is for the right customer", so.customer_id === C.retailNorth.id);
  check("the sales order line is the right product (the SKU the customer quoted)", soLine.product_id === product.id && product.sku === stocked.sku);
  check("the quantity is the quantity ordered", Number(soLine.quantity) === 20);
  check("the price is the approved price", Number(soLine.selling_price) === lineEval.effectiveUnitPrice);
  check("VAT is the workspace rate", Number(soLine.tax_rate) === 15);
  check("the PO is carried", String(so.notes || "").includes("UAT-PO-E2E-1"));
  check("the requested delivery date is carried", String(so.requested_delivery_date || "").slice(0, 10) === "2026-10-15");
  check("the source reference is carried", String(so.notes || "").includes(confirmed.intake.intake_number));
  check("the order and the sales order point at each other (provenance)", confirmed.intake.sales_order_id === so.id);
  check("the sales-order audit records which order it came from", db.tables.vyron_customer_sales_order_audit.some((a) => a.event_type === "CREATED_FROM_ORDER_INTAKE" && a.metadata?.intakeId === received.intake.id));
  check("the whole path is on the order's own audit trail", ["RECEIVED", "VALIDATED", "APPROVED", "HANDOFF_COMPLETED"].every((type) => db.tables.vyron_order_intake_events.some((e) => e.intake_id === received.intake.id && e.event_type === type)) || db.tables.vyron_order_intake_events.filter((e) => e.intake_id === received.intake.id).length >= 3);

  // and nothing beyond a Draft sales order
  check("nothing was invoiced", db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_customer_invoice_lines.length === 0);
  check("nothing was queued for Xero", db.tables.vyron_xero_sync_queue.length === 0);
  check("no stock moved and no ledger entry was written", db.tables.vyron_stock_movements.length === 0 && db.tables.vyron_cost_stock_ledger.length === 0);
  check("nothing was reserved", db.tables.vyron_customer_sales_order_allocations.length === 0);
  check("nothing was manufactured", (db.tables.vyron_cost_production_runs || []).length === 0);
}

console.log(`\n${passed}/${passed + failed} checks passed${failed ? `\n${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
