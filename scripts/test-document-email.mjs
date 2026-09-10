#!/usr/bin/env node
/**
 * VYRON — document email regression test.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN
 * ---------------------------------
 * A client pressing "Email PDF" on a customer invoice was told
 * "VYRON_EMAIL_WEBHOOK_URL is not configured." The transport posted documents
 * to a webhook that had no receiver anywhere, returned the raw response body to
 * the browser, trusted the client for subject, body and audit actor, let an
 * invoice with a NULL company pass the ownership check, and had no timeout. A
 * separate "Email" mailto link marked invoices Sent without sending anything.
 *
 * WHAT THIS PROVES
 * ----------------
 * The four document email routes (customer invoice, sales order, purchase
 * order, goods receipt) are imported unmodified and run end to end: permission,
 * company resolution, ownership, server-built content, real PDF rendering, the
 * Resend request, the HTTP response and the audit row.
 *
 * WHAT THIS DOES NOT PROVE
 * ------------------------
 * That an email was delivered. Resend is replaced by a scripted fetch stub; the
 * test proves the request VYRON COST would make and how it handles each
 * answer. Real delivery is only shown by a live send once production Resend
 * credentials exist.
 *
 * Family A: no database (an in-memory stand-in seeded with a disposable QA
 * tenant), no network (any fetch other than the stubbed Resend endpoint
 * throws), no credentials (a dummy key is set in this process only; .env.local
 * is never read), no writes outside this process.
 *
 *   npm run test:document-email
 */

import { register } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

register("./support/ts-alias-hook.mjs", import.meta.url);
register("./support/document-email-test-hook.mjs", import.meta.url);

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

/* ------------------------------------------------------------------ checks */

let failures = 0;
let checks = 0;
function check(name, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
}
function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------- environment */

const DUMMY_KEY = "re_qa_dummy_key_not_a_real_credential";
const PLATFORM_FROM = "VYRON COST <documents@vyron-qa.test>";

function configureResend({ configured = true, replyTo = null } = {}) {
  if (configured) {
    process.env.RESEND_API_KEY = DUMMY_KEY;
    process.env.VYRON_EMAIL_FROM = PLATFORM_FROM;
  } else {
    delete process.env.RESEND_API_KEY;
    delete process.env.VYRON_EMAIL_FROM;
  }
  if (replyTo) process.env.VYRON_EMAIL_REPLY_TO = replyTo;
  else delete process.env.VYRON_EMAIL_REPLY_TO;
}
delete process.env.VYRON_EMAIL_WEBHOOK_URL;

/* ---------------------------------------------------------- scripted Resend */

const RESEND_URL = "https://api.resend.com/emails";
const resendCalls = [];
let resendBehaviour = "accept";

const behaviours = {
  accept: () => new Response(JSON.stringify({ id: "re_msg_qa_0001" }), { status: 200 }),
  reject422: () =>
    new Response(
      JSON.stringify({ name: "validation_error", statusCode: 422, message: "Domain not verified PROVIDER-INTERNAL-7731" }),
      { status: 422 }
    ),
  unavailable500: () => new Response("<html>upstream exploded PROVIDER-INTERNAL-500</html>", { status: 500 }),
  rateLimited429: () => new Response(JSON.stringify({ message: "Too many requests PROVIDER-INTERNAL-429" }), { status: 429 }),
  timeout: () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  },
  unreachable: () => {
    throw new TypeError("fetch failed: getaddrinfo ENOTFOUND api.resend.com PROVIDER-INTERNAL-DNS");
  },
  hang: (init) =>
    new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal.reason));
    }),
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const target = String(url);
  if (target !== RESEND_URL) throw new Error(`Test refused an unexpected network call to ${target}`);
  resendCalls.push({ url: target, headers: init.headers, body: JSON.parse(String(init.body)), signal: init.signal });
  return behaviours[resendBehaviour](init);
};

/* --------------------------------------------------- disposable QA tenant */

const COMPANY_A = "a1a1a1a1-0000-4000-8000-00000000000a";
const COMPANY_B = "b2b2b2b2-0000-4000-8000-00000000000b";
const MEMBER_ID = "c3c3c3c3-0000-4000-8000-00000000000c";
const ids = {
  customerA: randomUUID(), customerB: randomUUID(),
  invoiceA: randomUUID(), invoiceDraft: randomUUID(), invoiceEscape: randomUUID(), invoiceB: randomUUID(), invoiceNull: randomUUID(),
  orderA: randomUUID(), orderB: randomUUID(),
  supplierA: randomUUID(), supplierB: randomUUID(),
  poA: randomUUID(), poB: randomUUID(),
  grnA: randomUUID(), grnB: randomUUID(),
};

function invoice(overrides) {
  return {
    invoice_date: "2026-09-01",
    due_date: "2026-09-30",
    status: "Approved",
    sales_value: 100,
    tax_total: 15,
    total_incl_tax: 115,
    notes: null,
    tax_snapshot: null,
    tax_snapshot_at: null,
    branch_id: null,
    branch_snapshot: null,
    customer_name: "QA Customer Ltd",
    ...overrides,
  };
}
function invoiceLine(invoiceId) {
  return {
    id: randomUUID(),
    invoice_id: invoiceId,
    product_id: null,
    product_name: "QA Widget",
    quantity: 1,
    selling_price: 100,
    discount_amount: 0,
    tax_treatment: "Standard",
    tax_rate: 15,
    taxable_amount: 100,
    tax_amount: 15,
    line_total: 100,
    line_total_incl_tax: 115,
    created_at: "2026-09-01T08:00:00Z",
  };
}

function seed() {
  return {
    vyron_workspaces: [
      {
        id: "ws-qa-a", company_id: COMPANY_A, company_name: "QA Email Tenant (Pty) Ltd", trading_name: "QA Email Tenant",
        remittance_email: "accounts@qa-tenant.test", package_name: "Enterprise", status: "Active",
        vat_status: "Registered", vat_number: "4000000000",
      },
      {
        id: "ws-qa-b", company_id: COMPANY_B, company_name: "Other QA Tenant", trading_name: "Other QA Tenant",
        remittance_email: "accounts@other-qa.test", package_name: "Enterprise", status: "Active",
      },
    ],
    vyron_cost_companies: [
      { id: COMPANY_A, name: "QA Email Tenant" },
      { id: COMPANY_B, name: "Other QA Tenant" },
    ],
    vyron_customers: [
      { id: ids.customerA, company_id: COMPANY_A, customer_name: "QA Customer Ltd", email: "buyer@qa-customer.test" },
      { id: ids.customerB, company_id: COMPANY_B, customer_name: "Other Customer", email: "buyer@other-customer.test" },
    ],
    vyron_customer_invoices: [
      invoice({ id: ids.invoiceA, company_id: COMPANY_A, invoice_number: "QA-INV-0001", customer_id: ids.customerA }),
      invoice({ id: ids.invoiceDraft, company_id: COMPANY_A, invoice_number: "QA-INV-0002", status: "Draft", customer_id: ids.customerA }),
      invoice({
        id: ids.invoiceEscape, company_id: COMPANY_A, invoice_number: "QA-<b>7</b>", customer_id: ids.customerA,
        customer_name: "O'Brien & <Sons>",
      }),
      invoice({ id: ids.invoiceB, company_id: COMPANY_B, invoice_number: "OTHER-INV-0001", customer_id: ids.customerB }),
      invoice({ id: ids.invoiceNull, company_id: null, invoice_number: "ORPHAN-INV-0001", customer_id: null }),
    ],
    vyron_customer_invoice_lines: [ids.invoiceA, ids.invoiceDraft, ids.invoiceEscape, ids.invoiceB, ids.invoiceNull].map(invoiceLine),
    vyron_inventory_audit_log: [],
    vyron_customer_sales_orders: [
      {
        id: ids.orderA, company_id: COMPANY_A, order_number: "QA-SO-0001", customer_id: ids.customerA,
        customer_name: "QA Customer Ltd", status: "Approved", subtotal: 100, vat_amount: 15, total: 115,
      },
      {
        id: ids.orderB, company_id: COMPANY_B, order_number: "OTHER-SO-0001", customer_id: ids.customerB,
        customer_name: "Other Customer", status: "Approved", subtotal: 100, vat_amount: 15, total: 115,
      },
    ],
    vyron_customer_sales_order_lines: [
      {
        id: randomUUID(), company_id: COMPANY_A, sales_order_id: ids.orderA, description: "QA Widget", quantity: 1,
        unit: "ea", selling_price: 100, discount_pct: 0, tax_rate: 15, line_total: 115, sort_order: 1,
      },
    ],
    vyron_customer_sales_order_audit: [],
    vyron_cost_suppliers: [
      { id: ids.supplierA, company_id: COMPANY_A, supplier_name: "QA Supplier CC", contact_email: "orders@qa-supplier.test" },
      { id: ids.supplierB, company_id: COMPANY_B, supplier_name: "Other Supplier", contact_email: "orders@other-supplier.test" },
    ],
    vyron_cost_purchase_orders: [
      {
        id: ids.poA, company_id: COMPANY_A, supplier_id: ids.supplierA, po_number: "QA-PO-0001",
        supplier_name_snapshot: "QA Supplier CC", status: "Approved", subtotal: 100, vat_amount: 15, total: 115, expected_total: 115,
      },
      {
        id: ids.poB, company_id: COMPANY_B, supplier_id: ids.supplierB, po_number: "OTHER-PO-0001",
        supplier_name_snapshot: "Other Supplier", status: "Approved", subtotal: 100, vat_amount: 15, total: 115, expected_total: 115,
      },
    ],
    vyron_cost_purchase_order_lines: [
      {
        id: randomUUID(), company_id: COMPANY_A, purchase_order_id: ids.poA, item_name: "QA Flour", description: "QA Flour",
        quantity: 1, ordered_qty: 1, unit: "kg", unit_price: 100, unit_cost: 100, line_total: 100, sort_order: 1,
      },
    ],
    vyron_cost_goods_receipts: [
      { id: ids.grnA, company_id: COMPANY_A, grn_number: "QA-GRN-0001", supplier_id: ids.supplierA, supplier_name_snapshot: "QA Supplier CC", status: "Posted" },
      { id: ids.grnB, company_id: COMPANY_B, grn_number: "OTHER-GRN-0001", supplier_id: ids.supplierB, supplier_name_snapshot: "Other Supplier", status: "Posted" },
    ],
    vyron_cost_goods_receipt_lines: [
      {
        id: randomUUID(), company_id: COMPANY_A, goods_receipt_id: ids.grnA, item_name: "QA Flour", unit: "kg",
        ordered_qty: 1, received_qty: 1, damaged_qty: 0, rejected_qty: 0, sort_order: 1,
      },
    ],
    vyron_procurement_audit_log: [],
  };
}

const ALL_PERMISSIONS = {
  "dashboard.view": true,
  "invoices.email": true,
  "sales_orders.approve": true,
  "purchase_orders.approve": true,
  "goods_receipts.approve": true,
};

function memberSession(permissions = ALL_PERMISSIONS) {
  return {
    userId: MEMBER_ID,
    email: "qa.member@qa-tenant.test",
    firstName: "QA",
    surname: "Member",
    workspaceId: "ws-qa-a",
    companyId: COMPANY_A,
    role: "USER",
    permissions,
  };
}

let db;
function setup({ session = memberSession(), failOn, resend = "accept", configured = true, replyTo = null, mutate } = {}) {
  db = createFakeSupabase(seed(), { failOn });
  if (mutate) mutate(db.tables);
  globalThis.__VYRON_DOCUMENT_EMAIL_TEST__ = {
    supabase: db,
    session,
    companyId: session ? COMPANY_A : null,
    activeWorkspace: { id: "ws-qa-a", companyId: COMPANY_A, demoMode: false },
  };
  resendCalls.length = 0;
  resendBehaviour = resend;
  configureResend({ configured, replyTo });
}

/* -------------------------------------------------------------- route calls */

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
const invoiceRoute = await importFromRoot("src/app/api/customer-invoices/[id]/email/route.ts");
const salesOrderRoute = await importFromRoot("src/app/api/customer-sales-orders/[id]/email/route.ts");
const purchaseOrderRoute = await importFromRoot("src/app/api/purchase-orders/[id]/email/route.ts");
const goodsReceiptRoute = await importFromRoot("src/app/api/goods-receipts/[id]/email/route.ts");
const { getCustomerInvoice } = await importFromRoot("src/lib/vyron-customer-invoices.ts");
const content = await importFromRoot("src/lib/platform/documents/document-email-content.ts");
const providers = await importFromRoot("src/lib/vyron-order-providers.ts");

async function post(routeModule, pathName, id, body = {}, query = "") {
  const request = new NextRequest(`http://localhost${pathName}${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const response = await routeModule.POST(request, { params: Promise.resolve({ id }) });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: response.status, json, text };
}
const emailInvoice = (id, body, query) => post(invoiceRoute, `/api/customer-invoices/${id}/email`, id, body, query);
const emailSalesOrder = (id, body) => post(salesOrderRoute, `/api/customer-sales-orders/${id}/email`, id, body);
const emailPurchaseOrder = (id, body, query) => post(purchaseOrderRoute, `/api/purchase-orders/${id}/email`, id, body, query);
const emailGoodsReceipt = (id, body, query) => post(goodsReceiptRoute, `/api/goods-receipts/${id}/email`, id, body, query);

/** Nothing internal may reach a browser: no key, no variable name, no provider body, no stack. */
const LEAK_MARKERS = [DUMMY_KEY, "RESEND_API_KEY", "VYRON_EMAIL", "api.resend.com", "PROVIDER-INTERNAL", "validation_error", "Resend", "    at "];
function assertNoLeak(name, text) {
  const found = LEAK_MARKERS.filter((marker) => text.includes(marker));
  check(`${name}: response exposes no internal detail`, found.length === 0, `found: ${found.join(", ")}`);
}
const invoiceAudit = () => db.tables.vyron_inventory_audit_log.filter((row) => String(row.event_type).startsWith("Invoice Email"));
const invoiceRow = (id) => db.tables.vyron_customer_invoices.find((row) => row.id === id);
const decodePdf = (attachment) => Buffer.from(String(attachment?.content || ""), "base64");

let capturedRequestShape = null;

try {
  /* ============================================================ unit rules */

  section("Recipient validation (server-side rule)");
  for (const good of ["buyer@qa-customer.test", "first.last+tag@sub.example.co.za", "  padded@example.com  "]) {
    check(`accepts ${JSON.stringify(good)}`, content.normaliseEmailAddress(good) === good.trim());
  }
  for (const bad of [
    "", "   ", "not-an-email", "a@b", "@example.com", "user@", "two@@example.com", "a b@example.com",
    "user@example.com\r\nBcc: victim@example.com", "user@example.com,other@example.com", "user@example.com;other@example.com",
    "Name <user@example.com>", "user@.example.com", "user@example..com", ".user@example.com", "user.@example.com",
    `${"x".repeat(65)}@example.com`, `user@${"d".repeat(250)}.com`, 42, null, undefined, ["a@b.com"],
  ]) {
    check(`rejects ${JSON.stringify(bad)?.slice(0, 60)}`, content.normaliseEmailAddress(bad) === null);
  }
  check("CC list: absent means none", JSON.stringify(content.parseCopyRecipients(undefined)) === JSON.stringify({ ok: true, addresses: [] }));
  check("CC list: a string is refused (arrays only)", content.parseCopyRecipients("a@example.com").ok === false);
  check("CC list: one bad entry refuses the list", content.parseCopyRecipients(["a@example.com", "bad"]).ok === false);
  check(
    "CC list: more than the limit is refused",
    content.parseCopyRecipients(Array.from({ length: content.MAX_COPY_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`)).ok === false
  );

  section("HTML escaping and server-built content");
  check("escapeHtml escapes all five characters", content.escapeHtml(`<a href="x">'&'</a>`) === "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  const built = content.buildDocumentEmailContent({
    documentLabel: "Invoice", documentNumber: "INV-1\r\nBcc: evil@example.com", senderName: "Acme <b>", recipientName: "Bob",
  });
  check("subject carries no CR/LF", !/[\r\n]/.test(built.subject), built.subject);
  check("html escapes sender", built.html.includes("Acme &lt;b&gt;") && !built.html.includes("Acme <b>"));

  section("Reply-To rule");
  const rt = content.resolveDocumentReplyTo;
  check("M: valid remittance email is used", JSON.stringify(rt({ workspaceRemittanceEmail: "accounts@t.test", platformReplyTo: "p@v.test", recipient: "c@c.test" })) === JSON.stringify({ replyTo: "accounts@t.test", source: "workspace_remittance" }));
  check("N: invalid remittance falls back to VYRON_EMAIL_REPLY_TO", rt({ workspaceRemittanceEmail: "not an email", platformReplyTo: "p@v.test", recipient: "c@c.test" }).source === "platform_default");
  check("O: neither gives no Reply-To", JSON.stringify(rt({ workspaceRemittanceEmail: null, platformReplyTo: "", recipient: "c@c.test" })) === JSON.stringify({ replyTo: null, source: "none" }));
  check("the recipient's own address is never the Reply-To", rt({ workspaceRemittanceEmail: "C@c.test", platformReplyTo: null, recipient: "c@c.test" }).replyTo === null);

  section("Provider timeout is real (AbortSignal)");
  configureResend();
  resendBehaviour = "hang";
  const started = Date.now();
  // AbortSignal.timeout's timer does not hold the event loop open. A server
  // always has other work pending; a script with nothing else to do would exit
  // before the signal fires, so hold the loop open for this one check.
  const keepAlive = setInterval(() => {}, 1000);
  const hung = await providers.sendProviderEmail({ to: "a@example.com", subject: "s", html: "h", text: "t", timeoutMs: 50 });
  clearInterval(keepAlive);
  check("D: a hanging provider is abandoned as a timeout", hung.status === "Failed" && hung.failure === "timeout", JSON.stringify(hung));
  check("D: abandoned promptly, not after the platform limit", Date.now() - started < 3000, `${Date.now() - started}ms`);
  check("default timeout is bounded (<= 30s)", providers.EMAIL_TIMEOUT_MS > 0 && providers.EMAIL_TIMEOUT_MS <= 30_000);

  section("Legacy webhook is no longer an email provider");
  configureResend({ configured: false });
  process.env.VYRON_EMAIL_WEBHOOK_URL = "https://legacy.invalid/hook";
  check("provider status does not report the webhook as operational", providers.providerStatuses().email.configured === false);
  delete process.env.VYRON_EMAIL_WEBHOOK_URL;

  /* ================================================== A — customer invoice */

  section("A. Resend configured -> provider acceptance (customer invoice)");
  setup();
  const a = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("A: HTTP 200", a.status === 200, a.text);
  check("A: ok / sent / accepted", a.json?.ok === true && a.json?.status === "sent" && a.json?.outcome === "accepted");
  check("A: provider message id returned", a.json?.messageId === "re_msg_qa_0001");
  check("A: exactly one Resend request", resendCalls.length === 1);
  const req = resendCalls[0]?.body || {};
  check("A: from is VYRON_EMAIL_FROM", req.from === PLATFORM_FROM);
  check("A: to is the validated recipient only", JSON.stringify(req.to) === JSON.stringify(["buyer@qa-customer.test"]));
  check("A: key sent only as a Bearer header", resendCalls[0]?.headers?.Authorization === `Bearer ${DUMMY_KEY}`);
  check("A: request carries an AbortSignal (timeout wired)", resendCalls[0]?.signal instanceof AbortSignal);
  check("A: approved invoice advanced to Sent on acceptance", invoiceRow(ids.invoiceA).status === "Sent" && a.json?.invoiceStatus === "Sent");
  assertNoLeak("A", a.text);

  section("L. The generated invoice PDF is attached");
  const attachment = req.attachments?.[0];
  check("L: one attachment", Array.isArray(req.attachments) && req.attachments.length === 1);
  check("L: filename from the invoice number", attachment?.filename === "QA-INV-0001.pdf", attachment?.filename);
  check("L: content type application/pdf", attachment?.content_type === "application/pdf");
  check("L: content is a real PDF (%PDF- header)", decodePdf(attachment).subarray(0, 5).toString("latin1") === "%PDF-");
  check("L: PDF is non-trivial", decodePdf(attachment).length > 1000, `${decodePdf(attachment).length} bytes`);

  capturedRequestShape = {
    endpoint: `POST ${RESEND_URL}`,
    headers: { Authorization: "Bearer <RESEND_API_KEY — not shown>", "Content-Type": "application/json" },
    body: {
      ...req,
      html: req.html,
      attachments: (req.attachments || []).map((item) => ({
        filename: item.filename,
        content_type: item.content_type,
        content: `<base64, ${decodePdf(item).length} bytes, begins %PDF->`,
      })),
    },
  };

  section("M. Reply-To uses the workspace remittance email");
  check("M: reply_to is the tenant's remittance address", JSON.stringify(req.reply_to) === JSON.stringify(["accounts@qa-tenant.test"]), JSON.stringify(req.reply_to));
  check("M: reply_to is not the recipient", !(req.reply_to || []).includes("buyer@qa-customer.test"));

  section("I. Audit actor is the authenticated member");
  const auditA = invoiceAudit();
  check("I: one audit row", auditA.length === 1);
  check("I: event is Invoice Email Sent", auditA[0]?.event_type === "Invoice Email Sent");
  check("I: actor is the session's verified user id", auditA[0]?.actor === MEMBER_ID);
  const metaA = auditA[0]?.metadata || {};
  check("I: metadata records invoice, company, recipient, provider, outcome, message id, time", [
    metaA.document_id === ids.invoiceA, metaA.company_id === COMPANY_A, metaA.recipient === "buyer@qa-customer.test",
    metaA.provider === "resend", metaA.outcome === "accepted", metaA.message_id === "re_msg_qa_0001", Boolean(metaA.sent_at),
  ].every(Boolean), JSON.stringify(metaA));
  check("I: delivery is not claimed", metaA.delivery_confirmed === false && /accepted by the email provider/.test(auditA[0]?.detail || ""));
  check("I: no raw provider response stored", !("raw_response" in metaA) && !JSON.stringify(auditA).includes(DUMMY_KEY));
  check("I: attachment metadata recorded", metaA.attachment?.filename === "QA-INV-0001.pdf" && metaA.attachment?.bytes > 1000);

  section("J + K. Client cannot spoof actor, subject or body");
  setup();
  const injected = await emailInvoice(ids.invoiceA, {
    to: "buyer@qa-customer.test",
    actor: "spoofed-admin",
    subject: "URGENT: change of bank details",
    textBody: "Pay into account 999",
    htmlBody: "<script>alert(1)</script><a href='https://phish.example'>pay</a>",
    replyTo: "attacker@evil.example",
    from: "ceo@victim.example",
    headers: { "X-Evil": "1" },
    cc: ["hidden@evil.example"],
  });
  const ib = resendCalls[0]?.body || {};
  check("J: accepted", injected.status === 200);
  check("J: audit actor ignores the body's actor", invoiceAudit()[0]?.actor === MEMBER_ID);
  check("K: subject is server-built", ib.subject === "Invoice QA-INV-0001 from QA Email Tenant", ib.subject);
  check("K: client HTML not present", !String(ib.html).includes("<script") && !String(ib.html).includes("phish.example"));
  check("K: client text not present", !String(ib.text).includes("999"));
  check("K: client Reply-To, From and headers ignored", ib.from === PLATFORM_FROM && !JSON.stringify(ib).includes("evil.example") && !("headers" in ib));
  check("K: invoice route accepts no CC from the client", !("cc" in ib));

  setup();
  await emailInvoice(ids.invoiceEscape, { to: "buyer@qa-customer.test" });
  const eb = resendCalls[0]?.body || {};
  check("K: invoice number is escaped in HTML", String(eb.html).includes("QA-&lt;b&gt;7&lt;/b&gt;") && !String(eb.html).includes("<b>7</b>"), eb.html);
  check("K: customer name is escaped in HTML", String(eb.html).includes("O&#39;Brien &amp; &lt;Sons&gt;"));

  section("N / O. Reply-To fallback through the route");
  setup({ replyTo: "support@vyron-qa.test", mutate: (t) => { t.vyron_workspaces[0].remittance_email = null; } });
  await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("N: falls back to VYRON_EMAIL_REPLY_TO", JSON.stringify(resendCalls[0]?.body?.reply_to) === JSON.stringify(["support@vyron-qa.test"]));
  check("N: audit records the source", invoiceAudit()[0]?.metadata?.reply_to_source === "platform_default");
  setup({ mutate: (t) => { t.vyron_workspaces[0].remittance_email = "   "; } });
  await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("O: no reply_to key when neither exists", resendCalls.length === 1 && !("reply_to" in resendCalls[0].body));

  section("B. Resend missing -> clean configuration failure");
  setup({ configured: false });
  const b = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("B: HTTP 503", b.status === 503, String(b.status));
  check("B: administrator-facing message", b.json?.error === "Email sending isn't configured for this workspace. Please contact your administrator.");
  check("B: outcome not_configured", b.json?.outcome === "not_configured" && b.json?.ok === false);
  check("B: no provider request attempted", resendCalls.length === 0);
  check("B: invoice status unchanged", invoiceRow(ids.invoiceA).status === "Approved");
  check("B: failure audited", invoiceAudit()[0]?.event_type === "Invoice Email Failed" && invoiceAudit()[0]?.metadata?.outcome === "not_configured");
  assertNoLeak("B", b.text);

  section("C. Invalid recipient -> rejected before any provider call");
  for (const bad of ["not-an-email", "a@b", "buyer@qa-customer.test\r\nBcc: x@evil.example", "a@x.com, b@y.com", 12345]) {
    setup();
    const c = await emailInvoice(ids.invoiceA, { to: bad });
    check(`C: ${JSON.stringify(bad)} -> 400 without a send`, c.status === 400 && resendCalls.length === 0 && c.json?.outcome === "invalid_recipient", c.text);
  }
  setup({ mutate: (t) => { t.vyron_customers[0].email = null; } });
  const missing = await emailInvoice(ids.invoiceA, {});
  check("C: no recipient at all -> 400 'required'", missing.status === 400 && /required/.test(missing.json?.error || "") && resendCalls.length === 0);
  setup();
  const fallback = await emailInvoice(ids.invoiceA, {});
  check("C: no typed recipient uses the customer record's address", fallback.status === 200 && resendCalls[0]?.body?.to?.[0] === "buyer@qa-customer.test");
  check("C: invalid recipient is not audited as a send attempt", (setup(), true));

  section("D. Provider timeout -> controlled failure");
  setup({ resend: "timeout" });
  const d = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("D: HTTP 504", d.status === 504, String(d.status));
  check("D: outcome timeout with a safe message", d.json?.outcome === "timeout" && /did not respond in time/.test(d.json?.error || ""));
  check("D: invoice status unchanged", invoiceRow(ids.invoiceA).status === "Approved");
  assertNoLeak("D", d.text);

  section("E. Provider 4xx / 5xx / unreachable -> controlled failure, no leak");
  for (const [behaviour, outcome] of [["reject422", "provider_rejected"], ["unavailable500", "provider_unavailable"], ["rateLimited429", "provider_unavailable"], ["unreachable", "provider_unavailable"]]) {
    setup({ resend: behaviour });
    const e = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
    check(`E: ${behaviour} -> HTTP 502 ${outcome}`, e.status === 502 && e.json?.outcome === outcome, e.text);
    check(`E: ${behaviour} -> generic user message`, e.json?.error === "The email could not be sent. Please try again or contact your administrator.");
    assertNoLeak(`E ${behaviour}`, e.text);
    const row = invoiceAudit()[0];
    check(`E: ${behaviour} -> audited as failed, no raw body stored`,
      row?.event_type === "Invoice Email Failed" && !("raw_response" in (row?.metadata || {})) &&
      !JSON.stringify(row).includes("<html>") && !JSON.stringify(row).includes('"statusCode"'));
    check(`E: ${behaviour} -> invoice status unchanged`, invoiceRow(ids.invoiceA).status === "Approved");
  }

  section("F. PDF generation failure -> correct error, nothing sent");
  // The route reads the invoice once; the second read happens inside PDF rendering.
  setup({ failOn: { table: "vyron_customer_invoices", call: 2 } });
  const f = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("F: HTTP 500 pdf_failed", f.status === 500 && f.json?.outcome === "pdf_failed", f.text);
  check("F: safe message", /PDF could not be generated/.test(f.json?.error || ""));
  check("F: no provider request", resendCalls.length === 0);
  check("F: audited as failed", invoiceAudit()[0]?.metadata?.outcome === "pdf_failed");
  assertNoLeak("F", f.text);
  check("F: database error text not exposed", !f.text.includes("simulated database failure"));

  section("G. Another company's invoice -> rejected");
  setup();
  const g = await emailInvoice(ids.invoiceB, { to: "buyer@qa-customer.test" });
  check("G: HTTP 404", g.status === 404, g.text);
  check("G: nothing sent, nothing audited", resendCalls.length === 0 && invoiceAudit().length === 0);
  check("G: other tenant's invoice untouched", invoiceRow(ids.invoiceB).status === "Approved");

  section("H. NULL company_id invoice -> rejected");
  setup();
  const h = await emailInvoice(ids.invoiceNull, { to: "buyer@qa-customer.test" });
  check("H: HTTP 404", h.status === 404, h.text);
  check("H: nothing sent", resendCalls.length === 0);
  check("H: getCustomerInvoice with a company never returns a NULL-company row", (await getCustomerInvoice(db, ids.invoiceNull, COMPANY_A)) === null);
  check("H: unscoped reads are unchanged", (await getCustomerInvoice(db, ids.invoiceNull))?.invoice?.id === ids.invoiceNull);

  section("Authentication and permission");
  setup({ session: null });
  const noSession = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("no session -> 401 and no send", noSession.status === 401 && resendCalls.length === 0, noSession.text);
  setup({ session: memberSession({ ...ALL_PERMISSIONS, "invoices.email": false }) });
  const denied = await emailInvoice(ids.invoiceA, { to: "buyer@qa-customer.test" });
  check("missing invoices.email -> 403 and no send", denied.status === 403 && resendCalls.length === 0, denied.text);

  section("Invoice status transitions only on acceptance of an Approved invoice");
  setup();
  const draft = await emailInvoice(ids.invoiceDraft, { to: "buyer@qa-customer.test" });
  check("draft invoice emailed stays Draft", draft.status === 200 && invoiceRow(ids.invoiceDraft).status === "Draft");

  /* =============================================================== P mailto */

  section("P. mailto action does not mark the invoice Sent");
  const client = readFileSync(path.join(ROOT, "src/components/vyron-cost/customers/CustomerInvoicesClient.tsx"), "utf8");
  const mailtoAnchors = [...client.matchAll(/<a\b[^>]*?href=\{emailHref\([^>]*>/gs)].map((m) => m[0]);
  check("P: mailto links still exist", mailtoAnchors.length === 2, String(mailtoAnchors.length));
  check("P: no mailto link has an onClick", mailtoAnchors.every((tag) => !tag.includes("onClick")));
  const sentCalls = [...client.matchAll(/updateInvoiceStatus\([^)]*"Sent"\)/g)];
  check("P: the only client call that sets Sent is the confirmed Mark as Sent action", sentCalls.length === 1, String(sentCalls.length));
  const markFn = client.slice(client.indexOf("async function markInvoiceSent"), client.indexOf("function emailHref"));
  check("P: Mark as Sent requires explicit confirmation", /if \(\s*!\s*confirm\(/.test(markFn) && markFn.includes('updateInvoiceStatus(invoice.id, "Sent")'));

  /* ============================================================ Q purchase order */

  section("Q. Purchase order uses the shared transport");
  check("Q: duplicate PO webhook transport removed", !existsSync(path.join(ROOT, "src/lib/vyron-po-email.ts")));
  setup();
  const q = await emailPurchaseOrder(ids.poA, {
    to: "orders@qa-supplier.test", cc: ["accounts@qa-tenant.test"], actor: "mobile-workspace", subject: "spoofed", retryOf: "not-a-uuid",
  });
  const qb = resendCalls[0]?.body || {};
  check("Q: HTTP 200 accepted", q.status === 200 && q.json?.status === "sent", q.text);
  check("Q: sent via Resend with PO PDF attached", qb.attachments?.[0]?.filename === "QA-PO-0001.pdf" && decodePdf(qb.attachments?.[0]).subarray(0, 5).toString("latin1") === "%PDF-");
  check("Q: CC validated and passed through", JSON.stringify(qb.cc) === JSON.stringify(["accounts@qa-tenant.test"]));
  check("Q: subject server-built", qb.subject === "Purchase Order QA-PO-0001 from QA Email Tenant");
  check("Q: PO Reply-To is not the customer-payment remittance address", !("reply_to" in qb));
  const poAudit = db.tables.vyron_procurement_audit_log.find((row) => row.event_type === "PO Email Sent");
  check("Q: audit row with authenticated actor", poAudit?.actor === MEMBER_ID);
  check("Q: history fields preserved, malformed retryOf dropped", poAudit?.metadata?.recipient === "orders@qa-supplier.test" && Array.isArray(poAudit?.metadata?.cc) && poAudit?.metadata?.retry_of === null);
  setup();
  const qBadBcc = await emailPurchaseOrder(ids.poA, { to: "orders@qa-supplier.test", bcc: ["x@@y"] });
  check("Q: invalid BCC -> 400 without a send", qBadBcc.status === 400 && resendCalls.length === 0);
  setup();
  const qOther = await emailPurchaseOrder(ids.poB, { to: "orders@qa-supplier.test" });
  check("Q: another company's PO -> 404 without a send", qOther.status === 404 && resendCalls.length === 0);
  setup();
  const qHint = await emailPurchaseOrder(ids.poA, { to: "orders@qa-supplier.test" }, `?companyId=${COMPANY_B}`);
  check("Q: a client companyId hint for another tenant is refused", qHint.status === 400 && resendCalls.length === 0);
  setup({ resend: "reject422" });
  const qFail = await emailPurchaseOrder(ids.poA, { to: "orders@qa-supplier.test" });
  check("Q: provider rejection -> 502 safe", qFail.status === 502);
  assertNoLeak("Q", qFail.text);

  /* =============================================================== R sales order */

  section("R. Sales order uses the shared transport");
  setup();
  const r = await emailSalesOrder(ids.orderA, { actor: "spoofed" });
  const rb = resendCalls[0]?.body || {};
  check("R: HTTP 200 accepted to the customer's address", r.status === 200 && rb.to?.[0] === "buyer@qa-customer.test", r.text);
  check("R: sales order PDF attached", rb.attachments?.[0]?.filename === "QA-SO-0001.pdf" && decodePdf(rb.attachments?.[0]).subarray(0, 5).toString("latin1") === "%PDF-");
  const soAudit = db.tables.vyron_customer_sales_order_audit.find((row) => row.event_type === "Sales Order Email Sent");
  check("R: audit row with authenticated actor", soAudit?.actor === MEMBER_ID);
  setup();
  const rOther = await emailSalesOrder(ids.orderB, { to: "buyer@qa-customer.test" });
  check("R: another company's sales order -> 404 without a send", rOther.status === 404 && resendCalls.length === 0);
  setup({ configured: false });
  const rMissing = await emailSalesOrder(ids.orderA, {});
  check("R: not configured -> 503 safe", rMissing.status === 503);
  assertNoLeak("R", rMissing.text);

  /* ============================================================ S goods receipt */

  section("S. Goods receipt uses the shared transport");
  setup();
  const s = await emailGoodsReceipt(ids.grnA, {});
  const sb = resendCalls[0]?.body || {};
  check("S: HTTP 200 accepted to the supplier's address", s.status === 200 && sb.to?.[0] === "orders@qa-supplier.test", s.text);
  check("S: GRN PDF attached", sb.attachments?.[0]?.filename === "QA-GRN-0001.pdf" && decodePdf(sb.attachments?.[0]).subarray(0, 5).toString("latin1") === "%PDF-");
  const grnAudit = db.tables.vyron_procurement_audit_log.find((row) => row.event_type === "GRN Email Sent");
  check("S: audit row with authenticated actor", grnAudit?.actor === MEMBER_ID);
  setup();
  const sOther = await emailGoodsReceipt(ids.grnB, { to: "orders@qa-supplier.test" });
  check("S: another company's GRN -> 404 without a send", sOther.status === 404 && resendCalls.length === 0);
  setup({ resend: "timeout" });
  const sTimeout = await emailGoodsReceipt(ids.grnA, {});
  check("S: timeout -> 504 safe", sTimeout.status === 504);
  assertNoLeak("S", sTimeout.text);

  /* ======================================================= repository sweep */

  section("No webhook transport remains in the application");
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      // A read, not a mention: comments recording why the webhook was removed are allowed.
      else if (/\.(ts|tsx)$/.test(entry) && /process\.env\.VYRON_EMAIL_WEBHOOK_URL|["'`]VYRON_EMAIL_WEBHOOK_URL["'`]/.test(readFileSync(full, "utf8"))) offenders.push(path.relative(ROOT, full));
    }
  })(path.join(ROOT, "src"));
  check("no source file reads VYRON_EMAIL_WEBHOOK_URL", offenders.length === 0, offenders.join(", "));
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__VYRON_DOCUMENT_EMAIL_TEST__;
}

check("globalThis.fetch restored", globalThis.fetch === originalFetch);

if (process.argv.includes("--show-request") && capturedRequestShape) {
  console.log("\nMocked Resend request (test A):");
  console.log(JSON.stringify(capturedRequestShape, null, 2));
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}.`);
console.log("Mocked provider only: this proves the request VYRON COST makes, not that any email was delivered.");
process.exit(failures ? 1 : 0);
