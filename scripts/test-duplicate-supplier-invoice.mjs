#!/usr/bin/env node
/**
 * VYRON — a supplier invoice number is processed once per supplier.
 *
 * KINGDOM FOODS QUERY (2026-11): "The system must detect duplicate supplier
 * invoice numbers, show a clear error when a duplicate is selected or captured,
 * and prevent duplicates from being processed."
 *
 * What was wrong (traced in code, d76f016):
 *   - Invoice Intelligence approval only raised a "duplicate_invoice" risk alert
 *     (exact supplier + number + date + total) and then approved anyway, writing
 *     costs, stock and the Xero bill a second time.
 *   - The supplier-invoice import silently OVERWROTE an earlier invoice with the
 *     same number — of any supplier in the company — and never set company_id.
 *   - Neither store was checked against the other.
 *
 * Drives the REAL approve / validate / corrections routes and the real import
 * and register-edit code against an in-memory database. No network, no real data.
 *
 *   npm run test:duplicate-supplier-invoice
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);

process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const importFromRoot = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);

let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_OWNER = uuid("a", 10);
const DOC = uuid("d", 1), DOC_OLD = uuid("d", 2), DOC_B = uuid("d", 3);
const SUP_MEAT = uuid("5", 1), SUP_VEG = uuid("5", 2), SUP_B = uuid("5", 3);
const INV_OLD = uuid("6", 1), INV_OTHER = uuid("6", 2);
const USERS = [{ id: U_OWNER, email: "owner@qa-a.test", password: "qa-pass-owner" }];

/** The document under review, plus whatever else the scenario holds. */
function seed({ documents = [], registerInvoices = [] } = {}) {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup" },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup" },
    ],
    vyron_workspace_memberships: [{ id: "m1", workspace_id: WS_A, user_id: U_OWNER, role: "OWNER", status: "Active", permissions: {} }],
    vyron_cost_suppliers: [
      { id: SUP_MEAT, company_id: CO_A, supplier_name: "QA Meat Supplier" },
      { id: SUP_VEG, company_id: CO_A, supplier_name: "QA Veg Supplier" },
      { id: SUP_B, company_id: CO_B, supplier_name: "QA Meat Supplier" },
    ],
    vyron_documents: [
      {
        id: DOC, tenant_id: CO_A, status: "reviewed", supplier_name: "QA Meat Supplier", invoice_number: "INV-QA-1001",
        invoice_date: "2026-10-20", purchase_order_id: null, purchase_order_number: null, subtotal: 1000, vat: 150, total: 1150,
        currency: "ZAR", field_confidence: { supplier: 95, invoiceNo: 95, invoiceDate: 95, total: 95 },
      },
      ...documents,
    ],
    vyron_document_line_items: [
      { id: "l1", document_id: DOC, description: "Beef mince 5kg", quantity: 4, unit: "kg", unit_price: 250, vat: 150, line_total: 1150, ignored: false, matched_entity_type: "ingredient", matched_entity_id: "ing-1", matched_entity_name: "Beef mince" },
    ],
    vyron_document_extraction_logs: [],
    vyron_po_approval_rules: [{ id: "po-r", company_id: CO_A, require_po_before_invoice_approval: false }],
    vyron_document_approval_rules: [],
    vyron_cost_ingredients: [{ id: "ing-1", company_id: CO_A, ingredient_name: "Beef mince", purchase_unit: "kg", purchase_cost: 240 }],
    vyron_cost_supplier_invoices: registerInvoices,
    vyron_cost_supplier_invoice_lines: [],
    vyron_document_approval_override_audit: [],
    vyron_document_po_link_override_audit: [],
    vyron_document_approval_audit: [],
    vyron_document_cost_audit: [],
    vyron_supplier_price_history: [],
    vyron_procurement_risk_alerts: [],
  };
}
const approvedDoc = (id, tenant, number, supplier = "QA Meat Supplier") => ({
  id, tenant_id: tenant, status: "archived", approved_at: "2026-10-01T09:00:00Z", supplier_name: supplier, invoice_number: number, invoice_date: "2026-10-01", total: 1150,
});
const registerInvoice = (id, supplierId, number, company = CO_A, supplierName = "QA Meat Supplier") => ({
  id, company_id: company, supplier_id: supplierId, supplier_name: supplierName, invoice_number: number, invoice_date: "2026-10-02", status: "Captured", subtotal: 1000, vat: 150, total: 1150,
});

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
let db = null;
function loadDb(seedTables) {
  db = createFakeSupabase(seedTables);
  globalThis.__VYRON_SESSION_TEST__.supabase = db;
  globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;
  return db;
}
const setCookieJar = (jar) => { globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})); };

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const approveRoute = await importFromRoot("src/app/api/documents/[id]/review/approve/route.ts");
const correctionsRoute = await importFromRoot("src/app/api/documents/[id]/review/corrections/route.ts");
const validateRoute = await importFromRoot("src/app/api/documents/[id]/review/validate/route.ts");
const uniqueness = await importFromRoot("src/lib/vyron-supplier-invoice-uniqueness.ts");
const { persistImportRows } = await importFromRoot("src/lib/vyron-import-persist.ts");
const { updateSupplierInvoice } = await importFromRoot("src/lib/vyron-supplier-invoices.ts");

async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try { return await fn(); } finally { Object.assign(console, saved); }
}
async function login(email, password) {
  setCookieJar({});
  const res = await quietly(() => loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } })));
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function call(jar, handler, route, body) {
  setCookieJar(jar);
  const request = new NextRequest(new URL(`/api/documents/${DOC}/review/${route}`, "http://qa.local"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const res = await quietly(() => handler(request, { params: Promise.resolve({ id: DOC }) }));
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
// The owner's supervisor override clears policy findings, so only the duplicate rule can stop approval.
const overrideBody = { force: false, forceTotalsMismatch: false, reconciliationNote: null, supervisorOverride: { reason: "QA: verified against the paper invoice", overriddenBy: "owner" } };
const approve = (jar) => call(jar, approveRoute.POST, "approve", overrideBody);
const doc = () => db.tables.vyron_documents.find((d) => d.id === DOC);
const costWrites = () => (db.tables.vyron_document_cost_audit || []).length + (db.tables.vyron_supplier_price_history || []).length;

loadDb(seed());
const jar = await login("owner@qa-a.test", "qa-pass-owner");
check("synthetic owner signs in through the real login route", Boolean(jar.vyron_workspace_user_session));

console.log("\n1. Matching rule");
{
  const n = uniqueness.normaliseInvoiceNumber;
  check("'INV-0910', 'inv 0910' and ' INV0910 ' are the same number", n("INV-0910") === n("inv 0910") && n("inv 0910") === n(" INV0910 "));
  check("different numbers stay different, and a blank number never matches", n("INV-0910") !== n("INV-0911") && n("  ") === "" && n(null) === "");
}

console.log("\n2. Invoice Intelligence approval refuses a duplicate");
{
  loadDb(seed());
  const first = await approve(jar);
  check("control: a first-time invoice is approved", first.status === 200 && doc().status === "archived", `${first.status} ${JSON.stringify(first.json).slice(0, 200)}`);

  loadDb(seed({ documents: [approvedDoc(DOC_OLD, CO_A, "inv qa 1001")] }));
  const dup = await approve(jar);
  check("same supplier + same number already approved -> 409 duplicateInvoice, even with a supervisor override", dup.status === 409 && dup.json?.duplicateInvoice === true, `${dup.status} ${JSON.stringify(dup.json).slice(0, 200)}`);
  check("the message names the supplier, the number and where it was captured", /Duplicate supplier invoice: QA Meat Supplier invoice inv qa 1001 has already been captured as an approved Invoice Intelligence document/.test(dup.json?.error || ""), dup.json?.error);
  check("the duplicate is not approved and no cost, price history or stock is written", doc().status === "reviewed" && !doc().approved_at && costWrites() === 0);

  // Already in the Supplier Invoice Register: the PDF is LINKED to it — compared for costing, never processed twice.
  loadDb(seed({ registerInvoices: [registerInvoice(INV_OLD, SUP_MEAT, "INV QA 1001")] }));
  db.tables.vyron_cost_stock_items = [{ id: "st-beef", company_id: CO_A, entity_type: "ingredient", entity_id: "ing-1", qty_on_hand: 10, average_cost: 240, current_cost: 240, unit: "kg" }];
  const linked = await approve(jar);
  check("an invoice already in the register: the PDF is linked to it (200), and the reply says so", linked.status === 200 && linked.json?.linkedRegisterInvoice?.id === INV_OLD && /already exists in the Supplier Invoice Register.*This PDF is linked to it/.test(linked.json?.message || ""), JSON.stringify(linked.json).slice(0, 240));
  check("…no second register invoice, and no stock cost or stock movement from the linked PDF", db.tables.vyron_cost_supplier_invoices.length === 1 && db.tables.vyron_cost_stock_items[0].current_cost === 240 && !(db.tables.vyron_stock_movements || []).length);
  check("…the register invoice records its linked PDF", /PDF linked: Invoice Intelligence document/.test(db.tables.vyron_cost_supplier_invoices[0].notes || ""));
  // A further copy of the same invoice: the PDF is already linked, so this one is a duplicate.
  db.tables.vyron_documents.push({ ...approvedDoc(DOC_OLD, CO_A, "INV-QA-1001"), status: "reviewed", approved_at: null });
  setCookieJar(jar);
  const thirdReq = new NextRequest(new URL(`/api/documents/${DOC_OLD}/review/approve`, "http://qa.local"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(overrideBody) });
  const third = await quietly(() => approveRoute.POST(thirdReq, { params: Promise.resolve({ id: DOC_OLD }) }));
  const thirdJson = await third.json();
  check("a second PDF of an invoice whose PDF is already linked is refused (409), even with a supervisor override", third.status === 409 && thirdJson.duplicateInvoice === true, JSON.stringify(thirdJson).slice(0, 200));

  loadDb(seed({ documents: [approvedDoc(DOC_OLD, CO_A, "INV-QA-1001", "QA Veg Supplier"), approvedDoc(DOC_B, CO_B, "INV-QA-1001")], registerInvoices: [registerInvoice(INV_OTHER, SUP_B, "INV-QA-1001", CO_B)] }));
  const other = await approve(jar);
  check("the same number from ANOTHER supplier, or in ANOTHER company, is not a duplicate", other.status === 200 && doc().status === "archived", `${other.status} ${JSON.stringify(other.json).slice(0, 200)}`);

  loadDb(seed({ documents: [{ ...approvedDoc(DOC_OLD, CO_A, "INV-QA-1001"), status: "reviewed", approved_at: null }] }));
  const unprocessed = await approve(jar);
  check("an unprocessed upload of the same invoice does not block the first approval", unprocessed.status === 200);
}

console.log("\n3. The error is shown before approval, and on capture");
{
  loadDb(seed({ documents: [approvedDoc(DOC_OLD, CO_A, "INV-QA-1001")] }));
  const v = await call(jar, validateRoute.POST, "validate", {});
  check("the approval pre-check returns the duplicate (409) so the screen shows it before Approve", v.status === 409 && v.json?.duplicateInvoice === true);
  loadDb(seed({ registerInvoices: [registerInvoice(INV_OLD, SUP_MEAT, "INV-QA-1001")] }));
  const vLink = await call(jar, validateRoute.POST, "validate", {});
  check("for an invoice already in the register, the pre-check says it will be linked (not refused)", vLink.status === 200 && vLink.json?.linkedRegisterInvoice?.id === INV_OLD && /This PDF is linked to it/.test(vLink.json?.linkedRegisterMessage || ""));
  loadDb(seed({ documents: [approvedDoc(DOC_OLD, CO_A, "INV-QA-0999")] }));
  const c = await call(jar, correctionsRoute.POST, "corrections", {
    fields: { supplierName: "QA Meat Supplier", invoiceNumber: "INV-QA-0999", invoiceDate: "2026-10-20", subtotal: 1000, vat: 150, total: 1150, currency: "ZAR" },
    lines: [],
  });
  check("capturing (correcting to) a number already processed for the supplier is refused", c.status === 409 && c.json?.duplicateInvoice === true && doc().invoice_number === "INV-QA-1001", `${c.status} ${JSON.stringify(c.json).slice(0, 160)}`);
}

console.log("\n4. Supplier invoice import");
{
  const row = (supplier, number, item = "Beef mince") => ({ supplier_name: supplier, invoice_number: number, invoice_date: "2026-10-20", item_description: item, quantity: "2", unit_price: "100" });
  loadDb(seed({ registerInvoices: [registerInvoice(INV_OLD, SUP_MEAT, "INV-500")] }));
  const result = await quietly(() => persistImportRows(db, CO_A, "supplier-invoices", [row("QA Meat Supplier", "inv 500"), row("QA Veg Supplier", "INV-500"), row("QA Meat Supplier", "INV-501")]));
  const invoices = db.tables.vyron_cost_supplier_invoices;
  const original = invoices.find((i) => i.id === INV_OLD);
  check("a re-imported invoice is reported as a duplicate, not imported", result.errors.some((e) => /inv 500: Duplicate supplier invoice: QA Meat Supplier invoice INV-500/.test(e)), result.errors.join(" | "));
  check("the original invoice is left exactly as it was (it used to be overwritten)", original && original.invoice_number === "INV-500" && original.supplier_id === SUP_MEAT && original.invoice_date === "2026-10-02");
  check("the same number from another supplier and a new number are imported, each with company_id", invoices.length === 3 && invoices.filter((i) => i.id !== INV_OLD).every((i) => i.company_id === CO_A) && invoices.some((i) => i.supplier_id === SUP_VEG && i.invoice_number === "INV-500"), JSON.stringify(invoices.map((i) => [i.supplier_name, i.invoice_number, i.company_id])));
  check("counts agree: 2 imported, 1 refused", result.imported === 2 && result.errors.length === 1);

  loadDb(seed({ documents: [approvedDoc(DOC_OLD, CO_A, "INV-777")] }));
  const fromDoc = await quietly(() => persistImportRows(db, CO_A, "supplier-invoices", [row("QA Meat Supplier", "INV-777")]));
  check("an invoice already approved in Invoice Intelligence cannot be imported again", fromDoc.imported === 0 && /Invoice Intelligence/.test(fromDoc.errors[0] || ""), fromDoc.errors.join(" | "));
}

console.log("\n5. Editing a register invoice");
{
  loadDb(seed({ registerInvoices: [registerInvoice(INV_OLD, SUP_MEAT, "INV-900"), registerInvoice(INV_OTHER, SUP_MEAT, "INV-901")] }));
  let error = null;
  try { await updateSupplierInvoice(db, CO_A, INV_OTHER, { invoiceNumber: "INV 900" }); } catch (e) { error = e; }
  check("renumbering an invoice onto another captured number is refused with the duplicate message", error instanceof uniqueness.DuplicateSupplierInvoiceError && error.status === 409, String(error));
  check("…and nothing changed", db.tables.vyron_cost_supplier_invoices.find((i) => i.id === INV_OTHER).invoice_number === "INV-901");
  const saved = await updateSupplierInvoice(db, CO_A, INV_OTHER, { invoiceNumber: "INV-901", notes: "QA note" });
  check("saving an invoice under its own number is not a duplicate of itself", saved && db.tables.vyron_cost_supplier_invoices.find((i) => i.id === INV_OTHER).notes === "QA note");
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) {
  console.log(`${failures} FAILED`);
  process.exit(1);
}
