#!/usr/bin/env node
/**
 * VYRON Order Engine — channel activation.
 *
 * FICTIONAL / NON-PRODUCTION. In-memory database, no network, no provider, no
 * credential, no production data.
 *
 * What is proved here:
 *   - a channel never becomes active because it is configured or has credentials;
 *   - the stages run in order, and each has its own conditions;
 *   - channels are independent — one broken channel does not stop the others;
 *   - a connector refuses to hand work in while its channel is not active;
 *   - the first live order from a channel is looked at by a person, and nothing
 *     is invoiced, posted, manufactured or reserved by it.
 *
 *   node scripts/test-order-engine-activation.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-order-engine-activation";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
delete process.env.VYRON_MAIL_WEBHOOK_SECRET;
delete process.env.VYRON_PDF_EXTRACTOR_KEY;
delete process.env.VYRON_WEB_STORE_CREDENTIALS;

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
const rejects = (p) => p.then(() => null, (e) => e);
const section = (t) => console.log(`\n${t}`);

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const activation = await importFromRoot("src/lib/order-engine/activation.ts");
const service = await importFromRoot("src/lib/order-engine/service.ts");
const connector = await importFromRoot("src/lib/order-engine/connectors/email-connector.ts");
const uat = await importFromRoot("src/lib/order-engine/uat/food-sock-uat.ts");
const platforms = await importFromRoot("src/lib/order-engine/adapters/platforms.ts");
const pdf = await importFromRoot("src/lib/order-engine/extractors/pdf.ts");
const extraction = await importFromRoot("src/lib/order-engine/extraction.ts");

const { FOOD_SOCK_UAT_COMPANY_ID: CO, foodSockUatSeed, FOOD_SOCK_UAT_TODAY: UAT_TODAY, UAT_CUSTOMERS } = uat;
const BOSS = { userId: "approver", name: "Approver" };
const CLERK = { userId: "clerk", name: "Clerk" };
const STORE = "woocommerce:uat-store";

/** The fictional tenant with every channel switched back to DISABLED. */
function db0({ keepActive = [] } = {}) {
  const seed = foodSockUatSeed();
  for (const row of seed.vyron_order_channel_settings) {
    if (keepActive.includes(row.channel_key)) continue;
    row.activation_state = "DISABLED";
    row.activated_at = null;
    row.activated_by = null;
    row.uat_passed_at = null;
    row.uat_reference = null;
    row.enabled = false;
  }
  return createFakeSupabase(seed);
}

/** Give the fictional web store everything its activation conditions ask for. */
function readyTheStore(db) {
  const settings = db.tables.vyron_order_engine_settings.find((r) => r.company_id === CO);
  settings.shipping_treatment = "separate_line";
  settings.refund_treatment = "never_netted";
  settings.sku_alignment = "source_equals_vyron";
  settings.b2c_customer_id = UAT_CUSTOMERS.webAccount.id;
  process.env.VYRON_WEB_STORE_CREDENTIALS = "qa-only-not-a-real-credential";
}

const stateOf = (db, key) => db.tables.vyron_order_channel_settings.find((r) => r.channel_key === key)?.activation_state;
const readiness = (list, type, key) => list.find((c) => c.channelType === type && (!key || c.channelKey === key));

// ---------------------------------------------------------------------------
section("The stages exist and run in order");
{
  const db = db0();
  readyTheStore(db);
  const move = (to, extra = {}) => activation.setChannelActivation(db, CO, { channelType: "web_store", channelKey: STORE, to, ...extra }, BOSS);

  check("every stage is named", activation.ACTIVATION_STATES.join(",") === "DISABLED,CONFIGURED,READY_FOR_UAT,UAT_PASSED,READY_FOR_ACTIVATION,ACTIVE,SUSPENDED");
  check("every channel type is named", activation.CHANNEL_TYPES.join(",") === "manual,csv,xlsx,email,pdf,web_store");

  const skip = await rejects(move("ACTIVE"));
  check("a disabled channel cannot jump straight to active", skip?.code === "INVALID_TRANSITION" && stateOf(db, STORE) === "DISABLED");
  const skipUat = await rejects(move("UAT_PASSED"));
  check("…nor straight to tested", skipUat?.code === "INVALID_TRANSITION");

  await move("CONFIGURED");
  check("disabled → configured", stateOf(db, STORE) === "CONFIGURED");
  await move("READY_FOR_UAT");
  const noEvidence = await rejects(move("UAT_PASSED"));
  check("testing cannot be recorded as passed without its evidence", noEvidence?.code === "INVALID_INPUT" && /evidence|reference/i.test(noEvidence.message));
  await move("UAT_PASSED", { uatReference: "FS-UAT-2026-10" });
  const row = db.tables.vyron_order_channel_settings.find((r) => r.channel_key === STORE);
  check("the evidence is kept with the date", row.uat_reference === "FS-UAT-2026-10" && Boolean(row.uat_passed_at));
  await move("READY_FOR_ACTIVATION");
  await move("ACTIVE");
  check("activation records who did it and when", row.activation_state === "ACTIVE" && row.activated_by === "approver" && Boolean(row.activated_at));

  const noReason = await rejects(move("SUSPENDED"));
  check("suspending needs a reason", noReason?.code === "INVALID_INPUT");
  await move("SUSPENDED", { reason: "Store migration" });
  check("a suspended channel keeps the reason", row.activation_state === "SUSPENDED" && row.suspended_reason === "Store migration");
  await move("ACTIVE");
  check("a suspended channel can come back", row.activation_state === "ACTIVE" && row.suspended_reason === null);
  await move("DISABLED");
  check("disabling clears the activation record", row.activation_state === "DISABLED" && row.activated_at === null && row.activated_by === null && row.enabled === false);
}

// ---------------------------------------------------------------------------
section("Credentials never activate anything");
{
  delete process.env.VYRON_WEB_STORE_CREDENTIALS;
  const db = db0();
  const list = await activation.loadChannelReadiness(db, CO);

  const email = readiness(list, "email");
  check("the e-mail channel starts disabled even with a mailbox configured", email.state === "DISABLED");
  check("…and says exactly what it still needs", email.ready === false && email.blockedBy.length > 0);
  check("…including the provider secret, which lives in the environment", email.requirements.some((r) => r.id === "provider_secret" && !r.met));
  check("…and a sender policy, duplicate protection, audit trail and exception handling are all listed", ["sender_policy", "duplicate_protection", "audit_trail", "exception_handling", "attachment_policy"].every((id) => email.requirements.some((r) => r.id === id)));

  const pdf = readiness(list, "pdf");
  check("the PDF channel names no provider and cannot be ready", pdf.state === "DISABLED" && pdf.ready === false);
  check("…it requires a provider, a credential, the canonical schema, confidence, raw values and page references", ["provider_identity", "provider_available", "credential", "schema", "confidence", "raw_values", "page_references", "low_confidence_blocks"].every((id) => pdf.requirements.some((r) => r.id === id)));
  check("…and low confidence blocks approval", pdf.requirements.find((r) => r.id === "low_confidence_blocks").met === true);

  const store = readiness(list, "web_store", STORE);
  check("the web store needs D1, an identity, credentials, VAT, statuses, shipping, refunds and mappings", ["d1_fulfil", "store_identity", "credential", "vat", "status_mapping", "shipping", "refunds", "product_mappings", "customer_mappings"].every((id) => store.requirements.some((r) => r.id === id)));

  // Activation is refused while a condition is outstanding.
  await activation.setChannelActivation(db, CO, { channelType: "email", to: "CONFIGURED" }, BOSS);
  await activation.setChannelActivation(db, CO, { channelType: "email", to: "READY_FOR_UAT" }, BOSS);
  await activation.setChannelActivation(db, CO, { channelType: "email", to: "UAT_PASSED", uatReference: "FS-UAT" }, BOSS);
  await activation.setChannelActivation(db, CO, { channelType: "email", to: "READY_FOR_ACTIVATION" }, BOSS);
  const refused = await rejects(activation.setChannelActivation(db, CO, { channelType: "email", to: "ACTIVE" }, BOSS));
  check("a channel that is not ready cannot be activated, and says why", refused?.code === "INVALID_INPUT" && /not ready/i.test(refused.message));

  process.env.VYRON_MAIL_WEBHOOK_SECRET = "qa-only-not-a-real-secret";
  const withSecret = readiness(await activation.loadChannelReadiness(db, CO), "email");
  check("the secret is read from the environment, never from the repository", withSecret.requirements.find((r) => r.id === "provider_secret").met === true);
  const stillRefused = await rejects(activation.setChannelActivation(db, CO, { channelType: "email", to: "ACTIVE" }, BOSS));
  check("…and having it is still not enough on its own", stillRefused?.code === "INVALID_INPUT");
  delete process.env.VYRON_MAIL_WEBHOOK_SECRET;
}

// ---------------------------------------------------------------------------
section("In-app channels: no connector, no credential");
{
  const db = db0();
  const list = await activation.loadChannelReadiness(db, CO);
  for (const type of ["manual", "csv", "xlsx"]) {
    check(`${type} is live without a connector`, readiness(list, type).state === "ACTIVE" && readiness(list, type).ready === true);
  }
  const manual = await service.receiveOrderCandidate(db, CO, { source: "manual", customerName: "Clifton Fresh Market", customerPoNumber: "PO-A1", requestedDeliveryDate: "2026-10-20", lines: [{ sku: "FS-SOUP-TOM-500", quantity: 6, unitPrice: 42 }] }, CLERK);
  check("a person can still key an order in while every connector is off", Boolean(manual.intake.id));
}

// ---------------------------------------------------------------------------
section("A connector refuses work while its channel is not active");
{
  const db = db0();
  const message = {
    messageId: "<not-active-1@uat.example>",
    provider: "uat-provider",
    from: "buyer@uat-retail-north.example",
    to: ["orders@uat-foodsock.example"],
    deliveredTo: "orders@uat-foodsock.example",
    subject: "PO UAT-PO-9001",
    receivedAt: "2026-10-06T08:00:00Z",
    attachments: [{ fileName: "po.csv", contentType: "text/csv", sizeBytes: 90, text: "sku,quantity,unit_price\nFS-SOUP-TOM-500,6,42\n" }],
  };
  const held = await connector.receiveConnectorMessage(db, message, CLERK);
  check("an inbound message is refused while the e-mail channel is off", held.status === "CHANNEL_NOT_ACTIVE" && /not active/i.test(held.reason));
  check("…nothing was stored and no order was invented", db.tables.vyron_order_source_messages.length === 0 && db.tables.vyron_order_intakes.length === 0);
  const failure = db.tables.vyron_order_channel_settings.find((r) => r.channel_type === "email");
  check("…but the attempt is recorded against the channel", Boolean(failure.last_failure_at) && /not active/i.test(failure.last_failure_reason));

  const wooOrder = { id: 7301, status: "processing", currency: "ZAR", date_created: "2026-10-06T09:00:00", billing: { email: "buyer@uat-retail-north.example" }, line_items: [{ id: 1, sku: "FS-SOUP-TOM-500", quantity: 4, price: 42 }] };
  const refusedWeb = await rejects(service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: wooOrder }), CLERK));
  check(
    "a web store cannot hand an order over while its channel is off",
    (refusedWeb?.code === "NOT_ENABLED" || refusedWeb?.code === "INVALID_INPUT") && db.tables.vyron_order_intakes.length === 0,
    refusedWeb ? `${refusedWeb.code}: ${refusedWeb.message}` : "no error was raised"
  );
}

// ---------------------------------------------------------------------------
section("Channels are independent");
{
  const db = db0({ keepActive: [STORE, "email"] });
  await activation.setChannelActivation(db, CO, { channelType: "email", to: "SUSPENDED", reason: "Provider outage" }, BOSS);
  const wooOrder = { id: 7302, status: "processing", currency: "ZAR", date_created: "2026-10-06T09:00:00", billing: { email: "buyer@uat-retail-north.example" }, line_items: [{ id: 1, sku: "FS-SOUP-TOM-500", quantity: 4, price: 42 }] };
  const web = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: wooOrder }), CLERK);
  check("the web store keeps working while e-mail is suspended", Boolean(web.intake.id) && stateOf(db, "email") === "SUSPENDED");
  const manual = await service.receiveOrderCandidate(db, CO, { source: "manual", customerName: "Clifton Fresh Market", customerPoNumber: "PO-A2", requestedDeliveryDate: "2026-10-20", lines: [{ sku: "FS-SOUP-TOM-500", quantity: 2, unitPrice: 42 }] }, CLERK);
  check("so does keying an order in by hand", Boolean(manual.intake.id));
  const list = await activation.loadChannelReadiness(db, CO);
  check("each channel reports its own state", readiness(list, "web_store", STORE).state === "ACTIVE" && readiness(list, "email").state === "SUSPENDED" && readiness(list, "manual").state === "ACTIVE");
  check("a successful order is recorded against its own channel only", Boolean(db.tables.vyron_order_channel_settings.find((r) => r.channel_key === STORE).last_success_at) && !db.tables.vyron_order_channel_settings.find((r) => r.channel_key === "email").last_success_at);
}

// ---------------------------------------------------------------------------
section("The first live order from a channel");
{
  const db = db0({ keepActive: [STORE] });
  const wooOrder = { id: 7401, status: "processing", currency: "ZAR", date_created: "2026-10-06T09:00:00", billing: { email: "orders@cliftonfresh.example" }, line_items: [{ id: 1, sku: "FS-SOUP-TOM-500", quantity: 4, price: 42 }] };
  const first = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: wooOrder }), CLERK);
  const channel = db.tables.vyron_order_channel_settings.find((r) => r.channel_key === STORE);
  check("the first order a live channel produces is recorded on the channel", channel.first_live_intake_id === first.intake.id && Boolean(channel.first_live_at));

  const detail = await service.performIntakeAction(db, CO, first.intake.id, "validate", CLERK, { today: UAT_TODAY });
  const codes = detail.intake.validation.issues.map((i) => i.code);
  check("…and raised to the approver as the first one through this path", codes.includes("FIRST_LIVE_ORDER_FROM_CHANNEL"));
  check("…as a warning, so it is acknowledged rather than silently passed", detail.intake.validation.issues.find((i) => i.code === "FIRST_LIVE_ORDER_FROM_CHANNEL").severity === "warning");

  const second = await service.receiveOrderCandidate(db, CO, platforms.normalizeWooCommerceOrder({ storeKey: "uat-store", order: { ...wooOrder, id: 7402 } }), CLERK);
  const secondDetail = await service.performIntakeAction(db, CO, second.intake.id, "validate", CLERK, { today: UAT_TODAY });
  check("the second order is not treated as a first", !secondDetail.intake.validation.issues.map((i) => i.code).includes("FIRST_LIVE_ORDER_FROM_CHANNEL"));
  check("…and the recorded first order does not move", db.tables.vyron_order_channel_settings.find((r) => r.channel_key === STORE).first_live_intake_id === first.intake.id);

  if (detail.intake.status === "AWAITING_APPROVAL" || detail.intake.status === "RECEIVED") {
    const unacknowledged = await rejects(service.performIntakeAction(db, CO, first.intake.id, "approve", BOSS, { today: UAT_TODAY }));
    check("approving without acknowledging the warnings is refused", unacknowledged?.code === "WARNINGS_NOT_ACKNOWLEDGED" || unacknowledged?.code === "VALIDATION_REQUIRED" || unacknowledged?.code === "INVALID_TRANSITION");
  } else {
    check("the first order stopped in exceptions and cannot be approved as it stands", detail.intake.status === "EXCEPTION");
  }
  check("nothing was invoiced, posted to Xero, manufactured or reserved by any of this", db.tables.vyron_customer_invoices.length === 0 && db.tables.vyron_xero_sync_queue.length === 0 && db.tables.vyron_stock_movements.length === 0 && db.tables.vyron_customer_sales_order_allocations.length === 0);
}

// ---------------------------------------------------------------------------
section("PDF: what a provider must satisfy before it can be activated");
{
  // A fictional in-memory extractor. No provider is connected, nothing leaves
  // this process, and it is removed again at the end of the section.
  const FICTIONAL = {
    id: "uat-fictional-extractor",
    label: "UAT fictional extractor",
    available: () => true,
    async extract(document) {
      return {
        status: "SUCCEEDED",
        provider: "uat-fictional-extractor",
        pageCount: 2,
        confidence: "HIGH",
        raw: { engine: "fictional", pages: 2, text: "PO UAT-PO-8100" },
        extraction: {
          version: 1,
          extractor: { name: "uat-fictional-extractor", version: "0", method: "ocr" },
          confidence: "HIGH",
          document: { fileName: document.fileName, contentType: document.contentType, sha256: document.sha256, pages: 2 },
          customer: "UAT Retail Buyer North",
          po_number: "UAT-PO-8100",
          requested_delivery_date: "2026-10-20",
          confidence_by_field: { po_number: { confidence: "HIGH", source: "page 1" }, requested_delivery_date: { confidence: "MEDIUM", source: "page 1" } },
          order_lines: [
            {
              sku: "FS-SOUP-TOM-500",
              quantity: 6,
              unit_price: 42,
              source_sku: "FS SOUP TOM 500",
              source_quantity: "6 cases",
              source_price: "R42,00",
              confidence: { sku: { confidence: "HIGH", source: "page 2" }, quantity: { confidence: "HIGH", source: "page 2" } },
            },
          ],
        },
        at: new Date().toISOString(),
      };
    },
  };
  pdf.registerPdfExtractor(FICTIONAL);
  const db = db0();
  const settings = db.tables.vyron_order_engine_settings.find((r) => r.company_id === CO);
  settings.pdf_extractor = FICTIONAL.id;

  let list = await activation.loadChannelReadiness(db, CO);
  let pdfChannel = readiness(list, "pdf");
  check("a registered, named extractor satisfies the provider conditions", pdfChannel.requirements.find((r) => r.id === "provider_identity").met && pdfChannel.requirements.find((r) => r.id === "provider_available").met);
  check("…but the credential is still required, and lives in the environment", pdfChannel.requirements.find((r) => r.id === "credential").met === false && pdfChannel.ready === false);

  const attempt = await pdf.extractDocument({ fileName: "UAT-PO-8100.pdf", contentType: "application/pdf", sizeBytes: 11000, sha256: "fictional-hash" }, { companyId: CO, extractorId: FICTIONAL.id });
  check("the response validates against the canonical contract", attempt.status === "SUCCEEDED" && (() => { try { extraction.assertExtraction(attempt.extraction); return true; } catch { return false; } })());
  check("…carries confidence, overall and per field", attempt.confidence === "HIGH" && attempt.extraction.confidence_by_field.po_number.confidence === "HIGH" && attempt.extraction.order_lines[0].confidence.sku.confidence === "HIGH");
  check("…keeps the values as written beside the normalised ones", attempt.extraction.order_lines[0].source_quantity === "6 cases" && attempt.extraction.order_lines[0].source_price === "R42,00");
  check("…keeps the page references the provider gave", attempt.extraction.confidence_by_field.po_number.source === "page 1" && attempt.extraction.order_lines[0].confidence.quantity.source === "page 2");
  check("…and the raw response is retained", attempt.raw.engine === "fictional" && attempt.pageCount === 2);

  const noConfidence = { ...attempt.extraction, confidence: undefined };
  const refused = await rejects(Promise.resolve().then(() => extraction.assertExtraction(noConfidence)));
  check("a response without confidence is refused", refused?.code === "INVALID_INPUT");
  const noLines = { ...attempt.extraction, order_lines: [] };
  const refusedLines = await rejects(Promise.resolve().then(() => extraction.assertExtraction(noLines)));
  check("a response with no lines is refused rather than made into an empty order", refusedLines?.code === "INVALID_INPUT");

  // The channel is still off, so the document is never sent to the provider.
  const held = await connector.recordDocumentExtraction(db, CO, { messageRowId: null, fileName: "UAT-PO-8100.pdf", contentType: "application/pdf", sizeBytes: 11000, sha256: "fictional-hash", extractorId: FICTIONAL.id }, CLERK);
  check("with the PDF channel off, a document is not sent to the provider at all", held.status === "NOT_CONFIGURED" && /not active/i.test(held.reason));

  pdf.__clearPdfExtractors();
  list = await activation.loadChannelReadiness(db, CO);
  pdfChannel = readiness(list, "pdf");
  check("a configured extractor that is not in this deployment is reported, not faked", pdfChannel.requirements.find((r) => r.id === "provider_available").met === false);
}

// ---------------------------------------------------------------------------
section("Tenants and keys");
{
  const db = db0({ keepActive: [STORE] });
  const OTHER = "c0000000-0000-4000-8000-0000000000ff";
  const otherList = await activation.loadChannelReadiness(db, OTHER);
  check("another tenant sees its own channels, not this one's", readiness(otherList, "web_store").state === "DISABLED" && readiness(otherList, "email").state === "DISABLED");
  const unnamed = await rejects(activation.setChannelActivation(db, CO, { channelType: "web_store", to: "CONFIGURED" }, BOSS));
  check("a web store must be identified by its own key", unnamed?.code === "INVALID_INPUT");
  const unknown = await rejects(activation.setChannelActivation(db, CO, { channelType: "telepathy", to: "CONFIGURED" }, BOSS));
  check("an unknown channel is refused", unknown?.code === "INVALID_INPUT");
  const unknownState = await rejects(activation.setChannelActivation(db, CO, { channelType: "email", to: "LIVE" }, BOSS));
  check("an unknown state is refused", unknownState?.code === "INVALID_INPUT");
  const sameState = await rejects(activation.setChannelActivation(db, CO, { channelType: "web_store", channelKey: STORE, to: "ACTIVE" }, BOSS));
  check("a channel cannot be moved to the state it is already in", sameState?.code === "INVALID_INPUT");
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
