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
  throw new Error(`unknown input ${input.kind}`);
}
const validate = (db, intakeId, company = CO) => service.performIntakeAction(db, company, intakeId, "validate", CLERK, { today: TODAY });
const approve = (db, detail, company = CO) =>
  service.performIntakeAction(db, company, detail.intake.id, "approve", MANAGER, { today: TODAY, validationHash: detail.intake.validation_hash, acknowledgeWarnings: true });

const scenarios = uat.buildFoodSockUatScenarios();
const byId = new Map(scenarios.map((s) => [s.id, s]));
async function runScenario(db, id) {
  for (const prerequisite of byId.get(id).after || []) await runScenario(db, prerequisite);
  const { intake } = await receive(db, byId.get(id).input);
  return validate(db, intake.id);
}

// ---------------------------------------------------------------------------
section("UAT catalogue and scenarios");
{
  const catalogue = uat.fictionalFoodSockCatalogue();
  check("fictional catalogue: every product and customer is marked UAT", catalogue.products.every((p) => p.product_name.startsWith("UAT ")) && Object.values(C).every((c) => c.customer_name.startsWith("UAT ")));
  check("UAT tenant is not Food Sock's company id", CO !== "e920c747-1d27-4d01-9e7c-182f9a7d0aa3");
  const required = ["valid-b2b", "valid-b2c", "unknown-sku", "unknown-customer", "duplicate-po", "insufficient-stock", "production-required", "low-margin", "missing-po", "missing-delivery-date", "invalid-quantity", "ambiguous-mapping", "low-confidence-extraction"];
  check("all required UAT scenarios exist", required.every((id) => byId.has(id)), required.filter((id) => !byId.has(id)).join(","));
  const again = uat.buildFoodSockUatScenarios();
  check("scenario generation is deterministic", JSON.stringify(again) === JSON.stringify(scenarios));
  check("every expected code is catalogued", scenarios.every((s) => s.expect.codes.every((c) => c in ISSUE_CATALOG)));
  let threw = false;
  try {
    uat.buildFoodSockUatScenarios({ products: [], stockItems: [], boms: [], bomLines: [] });
  } catch {
    threw = true;
  }
  check("a catalogue that cannot supply a scenario is refused, never silently skipped", threw);
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

console.log(`\n${passed}/${passed + failed} checks passed${failed ? `\n${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
