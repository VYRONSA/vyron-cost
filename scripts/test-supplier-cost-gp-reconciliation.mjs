#!/usr/bin/env node
/**
 * VYRON — supplier invoice → cost → sales invoice → GP report reconciliation.
 *
 * PRODUCTION DEFECT THIS LOCKS DOWN (Kingdom Foods, measured 2026-10-06)
 * ---------------------------------------------------------------------
 * "The Sales and GP reports figures differ." From 2026-09-28 the company began
 * approving supplier invoices in Supplier Invoice Intelligence. Approval wrote
 * each line's invoice unit price straight into the master cost:
 *   - per-pack prices became per-unit costs ("Paper Plates 50s" R58.70 → R58.70
 *     a plate; "Foilene Roll 1000s" R138.93 → R138.93 a sheet), and
 *   - spice lines matched to a finished product overwrote its cost
 *     (Steak & Kidney Pie 150g R4.74 → R139.98).
 * Every sales invoice raised after that captured the inflated cost, so GP for
 * 30 Sep–1 Oct collapsed (6 lines, ~R189k of cost of sales that never existed).
 * Separately, the GP engine read invoice lines in one request: a tenant with
 * more lines than PostgREST returns (1000 by default) was silently truncated.
 *
 * Drives the REAL approve route (with the real session, tenant and policy
 * code), the real createCustomerInvoice, the real GP engine and the real
 * sales-by-customer-item report. Only the process boundary is replaced (an
 * in-memory database with PostgREST's response cap switched on). Family A: no
 * network, no database, no credentials, no real tenant data.
 *
 *   npm run test:supplier-cost-gp
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
const section = (title) => console.log(`\n${title}`);
const round2 = (n) => Math.round(n * 100) / 100;

const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CO_A = uuid("a", 1), CO_B = uuid("b", 1);
const WS_A = uuid("a", 2), WS_B = uuid("b", 2);
const U_A = uuid("a", 10), U_B = uuid("b", 10);
const USERS = [
  { id: U_A, email: "owner@qa-a.test", password: "qa-pass-a" },
  { id: U_B, email: "owner@qa-b.test", password: "qa-pass-b" },
];
const SOUND = { classification: "Verified", quality: 100, completenessStatus: "Complete", reconciliationStatus: "Reconciled", columnMappingFailed: false };

/** A supplier invoice whose header agrees with its lines (VAT 15 %), so only the cost rules are exercised. */
function supplierInvoice(id, tenant, invoiceNumber, invoiceDate, lines) {
  const items = lines.map((l, i) => {
    const ex = round2(l.quantity * l.unit_price);
    const vat = round2(ex * 0.15);
    return { id: `${id}-l${i + 1}`, document_id: id, ignored: false, vat, line_total: round2(ex + vat), ...l };
  });
  const subtotal = round2(items.reduce((t, l) => t + l.quantity * l.unit_price, 0));
  const vat = round2(items.reduce((t, l) => t + l.vat, 0));
  return {
    document: {
      id,
      tenant_id: tenant,
      status: "reviewed",
      supplier_name: "QA Wholesale",
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      purchase_order_id: null,
      purchase_order_number: null,
      subtotal,
      vat,
      total: round2(subtotal + vat),
      currency: "ZAR",
      field_confidence: { supplier: 95, invoiceNo: 95, invoiceDate: 95, total: 95 },
    },
    lines: items,
    extraction: { id: `${id}-x`, document_id: id, stage: "extraction", status: "success", created_at: `${invoiceDate}T08:00:00Z`, metadata: { extractionQuality: SOUND } },
  };
}

const DOC_SEP = uuid("d", 1); // 15 September: the shapes that broke production, plus one sound line
const DOC_SEP30 = uuid("d", 2); // 30 September: boundary, a sound price move
const DOC_B = uuid("d", 3); // tenant B, pointing at tenant A's ingredient id
const DOC_PENDING = uuid("d", 4); // tenant A, still under review
const DOC_DELETED = uuid("d", 5); // tenant A, deleted

const SEPTEMBER = supplierInvoice(DOC_SEP, CO_A, "SUP-0915", "2026-09-15", [
  { description: "Cake Flour", quantity: 10, unit: "kg", unit_price: 14, matched_entity_type: "ingredient", matched_entity_id: "ing-flour", matched_entity_name: "Cake Flour" },
  { description: "Foilene Roll 40x60", quantity: 15, unit: "1000s", unit_price: 138.93, matched_entity_type: "packaging", matched_entity_id: "pkg-foil", matched_entity_name: "Sheet Foilene" },
  { description: "20 kg x Steak & Kidney Pie Spice", quantity: 20, unit: "", unit_price: 139.98, matched_entity_type: "product", matched_entity_id: "p-skp", matched_entity_name: "Steak & Kidney Pie 150g" },
  { description: "CORNSTARCH 25KG", quantity: 4, unit: "KG", unit_price: 700.75, matched_entity_type: "ingredient", matched_entity_id: "ing-corn", matched_entity_name: "Corn Starch" },
  { description: "Paper Plates 50s", quantity: 3, unit: "50s", unit_price: 58.7, matched_entity_type: "packaging", matched_entity_id: "pkg-plate", matched_entity_name: "Paper plates" },
]);
const SEPTEMBER_30 = supplierInvoice(DOC_SEP30, CO_A, "SUP-0930", "2026-09-30", [
  { description: "Butter", quantity: 5, unit: "KG", unit_price: 95, matched_entity_type: "ingredient", matched_entity_id: "ing-butter", matched_entity_name: "Butter" },
]);
const FOREIGN = supplierInvoice(DOC_B, CO_B, "SUP-B-1", "2026-09-20", [
  { description: "Cake Flour", quantity: 1, unit: "kg", unit_price: 99, matched_entity_type: "ingredient", matched_entity_id: "ing-flour", matched_entity_name: "Cake Flour" },
]);

function seed() {
  return {
    vyron_workspaces: [
      { id: WS_A, company_id: CO_A, company_name: "QA Tenant A", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
      { id: WS_B, company_id: CO_B, company_name: "QA Tenant B", package_name: "Enterprise", status: "Setup", default_vat_rate: 15 },
    ],
    vyron_workspace_memberships: [
      { id: "m1", workspace_id: WS_A, user_id: U_A, role: "OWNER", status: "Active", permissions: {} },
      { id: "m2", workspace_id: WS_B, user_id: U_B, role: "OWNER", status: "Active", permissions: {} },
    ],
    vyron_documents: [
      SEPTEMBER.document,
      SEPTEMBER_30.document,
      FOREIGN.document,
      // Not processed: still under review, and deleted. Neither belongs in the register.
      { ...SEPTEMBER.document, id: DOC_PENDING, invoice_number: "SUP-PENDING", status: "reviewed" },
      { ...SEPTEMBER.document, id: DOC_DELETED, invoice_number: "SUP-DELETED", status: "deleted", deleted_at: "2026-09-20T10:00:00Z" },
    ],
    vyron_cost_suppliers: [
      { id: "sup-a", company_id: CO_A, supplier_name: "QA Wholesale" },
      { id: "sup-b", company_id: CO_B, supplier_name: "QA B Supplier" },
    ],
    // Invoices loaded through the import route (the register's own table).
    vyron_cost_supplier_invoices: [
      { id: "si-0812", company_id: CO_A, supplier_id: "sup-a", supplier_name: "QA Wholesale", invoice_number: "SUP-0812", invoice_date: "2026-08-12", status: "Approved", source_type: "import", subtotal: 100, vat: 15, total: 115, created_at: "2026-08-20T00:00:00Z" },
      // The same supplier invoice also approved in Invoice Intelligence (DOC_SEP30): a cross-source duplicate.
      { id: "si-0930", company_id: CO_A, supplier_id: "sup-a", supplier_name: "QA Wholesale", invoice_number: "SUP-0930", invoice_date: "2026-09-30", status: "Approved", source_type: "import", subtotal: 475, vat: 71.25, total: 546.25, created_at: "2026-10-01T00:00:00Z" },
    ],
    vyron_cost_supplier_invoice_lines: [
      { id: "sil-1", invoice_id: "si-0812", item_name: "Cake Flour", quantity: 5, unit: "kg", unit_cost: 13, line_excl: 65 },
      { id: "sil-2", invoice_id: "si-0812", item_name: "Butter", quantity: 0.4, unit: "kg", unit_cost: 87.5, line_excl: 35 },
      { id: "sil-3", invoice_id: "si-0930", item_name: "Butter", quantity: 5, unit: "kg", unit_cost: 95, line_excl: 475 },
    ],
    vyron_document_line_items: [...SEPTEMBER.lines, ...SEPTEMBER_30.lines, ...FOREIGN.lines],
    vyron_document_extraction_logs: [SEPTEMBER.extraction, SEPTEMBER_30.extraction, FOREIGN.extraction],
    vyron_po_approval_rules: [
      { id: "po-a", company_id: CO_A, require_po_before_invoice_approval: false },
      { id: "po-b", company_id: CO_B, require_po_before_invoice_approval: false },
    ],
    vyron_document_approval_rules: [],
    vyron_cost_ingredients: [
      { id: "ing-flour", company_id: CO_A, ingredient_name: "Cake Flour", purchase_unit: "kg", purchase_cost: 13 },
      { id: "ing-corn", company_id: CO_A, ingredient_name: "Corn Starch", purchase_unit: "kg", purchase_cost: 11.2 },
      { id: "ing-butter", company_id: CO_A, ingredient_name: "Butter", purchase_unit: "kg", purchase_cost: 90 },
      { id: "pkg-foil", company_id: CO_A, ingredient_name: "Sheet Foilene", purchase_unit: "each", purchase_cost: 0.14 },
      { id: "pkg-plate", company_id: CO_A, ingredient_name: "Paper plates", purchase_unit: "each", purchase_cost: 1.17 },
    ],
    vyron_cost_stock_items: [
      { id: "si-flour", company_id: CO_A, entity_type: "ingredient", entity_id: "ing-flour", item_code: "FLOUR", qty_on_hand: 100, average_cost: 13, current_cost: 13, unit: "kg" },
      { id: "si-foil", company_id: CO_A, entity_type: "packaging", entity_id: "pkg-foil", item_code: "FOIL", qty_on_hand: 5000, average_cost: 0.14, current_cost: 0.14, unit: "each" },
      { id: "si-skp", company_id: CO_A, entity_type: "finished_goods", entity_id: "p-skp", item_code: "SKP", qty_on_hand: 1000, average_cost: 4.74, current_cost: 4.74, unit: "each" },
    ],
    vyron_cost_products: [
      { id: "p-skp", company_id: CO_A, product_name: "Steak & Kidney Pie 150g", selling_price: 10.9, total_cost: 4.74 },
      { id: "p-cmp", company_id: CO_A, product_name: "Chicken & Mushroom Pie 180g", selling_price: 12.5, total_cost: 6.3 },
      { id: "p-b", company_id: CO_B, product_name: "Tenant B Pie", selling_price: 20, total_cost: 8 },
    ],
    vyron_customers: [
      { id: "c-a", company_id: CO_A, customer_name: "QA Retailer" },
      { id: "c-b", company_id: CO_B, customer_name: "QA B Retailer" },
    ],
    vyron_customer_invoices: [],
    vyron_customer_invoice_lines: [],
    vyron_customer_price_list_assignments: [],
    vyron_customer_price_list_items: [],
    vyron_customer_price_lists: [],
    vyron_customer_price_list_versions: [],
    vyron_customer_branches: [],
    vyron_document_approval_override_audit: [],
    vyron_document_po_link_override_audit: [],
    vyron_document_approval_audit: [],
    vyron_document_cost_audit: [],
    vyron_supplier_price_history: [],
    vyron_procurement_risk_alerts: [],
  };
}

const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");
const { NextRequest } = await import("next/server");
// A deliberately small response cap: every report read must page, exactly as against PostgREST.
const MAX_ROWS = 4;
globalThis.__VYRON_SESSION_TEST__ = { supabase: null, browserSupabase: null, users: USERS, cookies: new Map(), headers: {} };
// The cap is on the tables the reports read; the approval reads its own few lines as production does.
const db = createFakeSupabase(seed(), { maxRows: { vyron_customer_invoices: MAX_ROWS, vyron_customer_invoice_lines: MAX_ROWS } });
globalThis.__VYRON_SESSION_TEST__.supabase = db;
globalThis.__VYRON_SESSION_TEST__.browserSupabase = db;

const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
const approveRoute = await importFromRoot("src/app/api/documents/[id]/review/approve/route.ts");
const { createCustomerInvoice } = await importFromRoot("src/lib/vyron-customer-invoices.ts");
const { getCustomerGpReport } = await importFromRoot("src/lib/vyron-customer-gp-reporting.ts");
const { getSalesByCustomerItemReport } = await importFromRoot("src/lib/vyron-customer-sales-reports.ts");
const guard = await importFromRoot("src/lib/vyron-supplier-cost-guard.ts");
const { listSupplierInvoiceRegister } = await importFromRoot("src/lib/vyron-supplier-invoices.ts");

async function quietly(fn) {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}
async function login(email, password) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map();
  const res = await quietly(() =>
    loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }))
  );
  return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
}
async function approve(jar, documentId) {
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar));
  const request = new NextRequest(new URL(`/api/documents/${documentId}/review/approve`, "http://qa.local"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ force: false, forceTotalsMismatch: false }),
  });
  const res = await quietly(() => approveRoute.POST(request, { params: Promise.resolve({ id: documentId }) }));
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const t = (name) => db.tables[name] || [];
const ingredient = (id) => t("vyron_cost_ingredients").find((r) => r.id === id);
const product = (id) => t("vyron_cost_products").find((r) => r.id === id);
const stockItem = (id) => t("vyron_cost_stock_items").find((r) => r.id === id);

// ---------------------------------------------------------------------------
section("The cost rule (pure)");
{
  check("same plain unit (kg ↔ KG, each ↔ ea, L ↔ litre) is provable", guard.sameCostUnit("KG", "kg") && guard.sameCostUnit("ea", "each") && guard.sameCostUnit("L", "litre"));
  check("a pack size never matches (5kg, 50s, 1000s, 1000, 25KG)", ["5kg", "50s", "1000s", "1000", "25KG"].every((u) => !guard.sameCostUnit(u, "kg") && !guard.sameCostUnit(u, "each")));
  check("blank or unknown-vs-plain units are not provable (CASE vs L, BAG vs kg, '' vs each)", !guard.sameCostUnit("CASE", "L") && !guard.sameCostUnit("BAG", "kg") && !guard.sameCostUnit("", "each"));
  check("a product cost is never taken from a supplier line", guard.decideSupplierCostUpdate({ entityType: "product", invoiceUnit: "each", masterUnit: "each", previousCost: 4.74, newCost: 4.8 }).apply === false);
  check("more than double / under half the current cost is held", !guard.decideSupplierCostUpdate({ entityType: "ingredient", invoiceUnit: "kg", masterUnit: "kg", previousCost: 11.2, newCost: 700.75 }).apply && !guard.decideSupplierCostUpdate({ entityType: "ingredient", invoiceUnit: "kg", masterUnit: "kg", previousCost: 100, newCost: 40 }).apply);
  check("a zero price never replaces a cost", guard.decideSupplierCostUpdate({ entityType: "ingredient", invoiceUnit: "kg", masterUnit: "kg", previousCost: 169.69, newCost: 0 }).apply === false);
  check("an ordinary price move in the same unit applies", guard.decideSupplierCostUpdate({ entityType: "ingredient", invoiceUnit: "kg", masterUnit: "kg", previousCost: 13, newCost: 14 }).apply === true);
}

// ---------------------------------------------------------------------------
section("September supplier invoices → captured cost (real approve route)");
const jarA = await login("owner@qa-a.test", "qa-pass-a");
const jarB = await login("owner@qa-b.test", "qa-pass-b");
check("synthetic owners sign in through the real login route", Boolean(jarA.vyron_workspace_user_session && jarB.vyron_workspace_user_session));
{
  const r = await approve(jarA, DOC_SEP);
  check("15 Sep invoice approves", r.status === 200 && r.json?.ok === true, JSON.stringify(r.json).slice(0, 400));
  check("exactly one cost applied (Cake Flour 13 → 14 per kg), four held", r.json?.updatedCount === 1 && r.json?.heldCount === 4, JSON.stringify({ updated: r.json?.updatedCount, held: r.json?.heldCount }));
  check("Cake Flour master cost is the supplier's per-kg price", Number(ingredient("ing-flour").purchase_cost) === 14 && Number(ingredient("ing-flour").true_unit_cost) === 14);
  check("Sheet Foilene stays 0.14 each (a 1000s price is not a sheet price)", Number(ingredient("pkg-foil").purchase_cost) === 0.14);
  check("Paper plates stay 1.17 each (a 50s price is not a plate price)", Number(ingredient("pkg-plate").purchase_cost) === 1.17);
  check("Corn Starch stays 11.20 (a 25 kg bag priced as 'KG' is held as implausible)", Number(ingredient("ing-corn").purchase_cost) === 11.2);
  check("Steak & Kidney Pie keeps its costing 4.74 (a spice line cannot set a pie's cost)", Number(product("p-skp").total_cost) === 4.74);
  const held = r.json?.costUpdatesHeld || [];
  check(
    "each held line says why",
    ["UNIT_UNVERIFIED", "PRODUCT_COST_NOT_FROM_SUPPLIER", "IMPLAUSIBLE_CHANGE"].every((code) => held.some((h) => h.code === code)) && held.every((h) => h.reason && h.entityId),
    JSON.stringify(held.map((h) => h.code))
  );
  check("a 'cost update held' alert per held line, none counted as supplier risk", t("vyron_procurement_risk_alerts").filter((a) => a.risk_type === "cost_update_held").length === 4 && !t("vyron_procurement_risk_alerts").some((a) => a.risk_type === "high_risk_supplier"));
  check("the cost audit records only the applied change (so a rollback reverses only real changes)", t("vyron_document_cost_audit").length === 1 && t("vyron_document_cost_audit")[0].entity_id === "ing-flour");
  check("price history still records every supplier price, held or applied", t("vyron_supplier_price_history").length === 5);
  check("stock cost: Flour moves to 14; Foil and the pie's stock cost do not move", Number(stockItem("si-flour").current_cost) === 14 && Number(stockItem("si-foil").current_cost) === 0.14 && Number(stockItem("si-skp").current_cost) === 4.74);

  const r30 = await approve(jarA, DOC_SEP30);
  check("30 Sep (period boundary) invoice: Butter 90 → 95 per kg applies", r30.status === 200 && Number(ingredient("ing-butter").purchase_cost) === 95 && r30.json?.updatedCount === 1);

  const again = await approve(jarA, DOC_SEP);
  check("re-approving the 15 Sep invoice changes nothing (no second cost, no second audit)", again.status === 409 && t("vyron_document_cost_audit").length === 2 && Number(ingredient("ing-flour").purchase_cost) === 14);

  const foreign = await approve(jarB, DOC_B);
  check("tenant B's approval cannot touch tenant A's ingredient (company-scoped lookup)", foreign.status === 200 && Number(ingredient("ing-flour").purchase_cost) === 14 && !t("vyron_document_cost_audit").some((a) => a.document_id === DOC_B));
  const crossTenant = await approve(jarB, DOC_SEP30);
  check("tenant B cannot approve tenant A's invoice (refused, not processed)", crossTenant.status === 403 || crossTenant.status === 404, String(crossTenant.status));
}

// ---------------------------------------------------------------------------
section("Supplier Invoice Register: every processed supplier invoice, however it was captured");
{
  // Production (Kingdom Foods, 2026-10-06): the register read only imported invoices, so 22 September
  // invoices approved in Invoice Intelligence were missing and September showed one invoice.
  const { invoices, lineCounts } = await listSupplierInvoiceRegister(db, CO_A);
  const byNumber = (n) => invoices.filter((r) => r.invoice_number === n);
  const sep = byNumber("SUP-0915")[0];
  const sep30 = byNumber("SUP-0930").find((r) => r.origin === "document");
  check("both September invoices approved in Invoice Intelligence are in the register", Boolean(sep) && Boolean(sep30), JSON.stringify(invoices.map((r) => [r.invoice_number, r.origin])));
  check("imported invoices are still there", byNumber("SUP-0812").length === 1 && byNumber("SUP-0812")[0].origin === "register");
  check("an approved document opens the approved document, read-only", sep?.origin === "document" && sep?.href === `/document-intelligence/archive/${DOC_SEP}` && sep?.status === "Approved" && sep?.source_type === "Invoice Intelligence");
  check("an imported invoice still opens the register's own page", byNumber("SUP-0812")[0]?.href === "/supplier-invoices/si-0812");
  check("document totals and dates are the approved document's", sep?.total === SEPTEMBER.document.total && sep?.subtotal === SEPTEMBER.document.subtotal && sep?.vat === SEPTEMBER.document.vat && sep?.invoice_date === "2026-09-15");
  check("line counts: approved document lines and imported lines", lineCounts[DOC_SEP] === 5 && lineCounts[DOC_SEP30] === 1 && lineCounts["si-0812"] === 2, JSON.stringify(lineCounts));
  check("documents still under review, or deleted, are not processed invoices", !byNumber("SUP-PENDING").length && !byNumber("SUP-DELETED").length);
  check("another tenant's approved invoice never appears", !invoices.some((r) => r.id === DOC_B || r.invoice_number === "SUP-B-1"));
  const dup = byNumber("SUP-0930");
  check("the same supplier invoice imported AND approved is shown twice and flagged, not hidden", dup.length === 2 && dup.every((r) => r.duplicate_risk === true));
  check("a single invoice is not flagged", sep?.duplicate_risk === false && byNumber("SUP-0812")[0].duplicate_risk === false);
  const september = invoices.filter((r) => String(r.invoice_date).startsWith("2026-09"));
  check("September lists every processed invoice: 2 approved documents + 1 imported", september.length === 3, JSON.stringify(september.map((r) => r.invoice_number)));
  check("newest invoice date first", invoices.every((r, i) => i === 0 || String(invoices[i - 1].invoice_date || "") >= String(r.invoice_date || "")));
  const b = await listSupplierInvoiceRegister(db, CO_B);
  check("tenant B's register lists only its own approved invoice", b.invoices.length === 1 && b.invoices[0].id === DOC_B);
}

// ---------------------------------------------------------------------------
section("Captured cost → sales invoices → GP report → sales report");
async function sale(company, customerId, invoiceDate, lines, status = "Posted", creditedInvoiceId = null) {
  const created = await createCustomerInvoice(db, company, { customerId, customerName: "QA", invoiceDate, lines, creditedInvoiceId });
  const id = created?.invoice?.id || created?.id || t("vyron_customer_invoices").at(-1).id;
  const row = t("vyron_customer_invoices").find((i) => i.id === id);
  row.status = status;
  return row;
}
const skp = (q) => ({ productId: "p-skp", productName: "Steak & Kidney Pie 150g", quantity: q, sellingPrice: 10.9 });
const cmp = (q) => ({ productId: "p-cmp", productName: "Chicken & Mushroom Pie 180g", quantity: q, sellingPrice: 12.5 });
{
  await sale(CO_A, "c-a", "2026-08-31", [skp(10)]); // before the period
  const s1 = await sale(CO_A, "c-a", "2026-09-01", [skp(480), cmp(96)]); // first day
  await sale(CO_A, "c-a", "2026-09-15", [skp(120), cmp(24), skp(6)]);
  await sale(CO_A, "c-a", "2026-09-30", [skp(480), cmp(48), cmp(12)]); // last day — the day production broke
  await sale(CO_A, "c-a", "2026-09-30", [skp(999)], "Draft"); // not posted: never in either report
  await sale(CO_A, "c-a", "2026-09-20", [{ ...skp(-24) }], "Posted", s1.id); // credit note in the period
  await sale(CO_A, "c-a", "2026-10-01", [skp(240)]); // after the period
  await sale(CO_B, "c-b", "2026-09-15", [{ productId: "p-b", productName: "Tenant B Pie", quantity: 50, sellingPrice: 20 }]); // other tenant

  const septLines = t("vyron_customer_invoice_lines").filter((l) => {
    const inv = t("vyron_customer_invoices").find((i) => i.id === l.invoice_id);
    return inv.company_id === CO_A && inv.status === "Posted" && inv.invoice_date >= "2026-09-01" && inv.invoice_date <= "2026-09-30";
  });
  check("the response cap is really on (more September lines than one response)", septLines.length > MAX_ROWS, `${septLines.length} lines, cap ${MAX_ROWS}`);
  check("every pie line captured the pie's costing (4.74 / 6.30), never a supplier price", septLines.every((l) => [4.74, 6.3].includes(Number(l.cost_per_unit))), JSON.stringify([...new Set(septLines.map((l) => l.cost_per_unit))]));

  const expectedRevenue = round2(septLines.reduce((s, l) => s + Number(l.quantity) * Number(l.selling_price), 0));
  const expectedCost = round2(septLines.reduce((s, l) => s + Number(l.quantity) * Number(l.cost_per_unit), 0));
  const headers = t("vyron_customer_invoices").filter((i) => i.company_id === CO_A && i.status === "Posted" && i.invoice_date >= "2026-09-01" && i.invoice_date <= "2026-09-30");
  const headerRevenue = round2(headers.reduce((s, i) => s + Number(i.sales_value), 0));
  const headerCost = round2(headers.reduce((s, i) => s + Number(i.cost_value), 0));
  check("posted September headers agree with their lines (revenue and cost)", headerRevenue === expectedRevenue && headerCost === expectedCost, `${headerRevenue}/${expectedRevenue} ${headerCost}/${expectedCost}`);

  const gp = await getCustomerGpReport(db, CO_A, { from: "2026-09-01", to: "2026-09-30" });
  check("GP report revenue = posted September sales incl. the credit note", gp.metrics.revenue === expectedRevenue, `${gp.metrics.revenue} vs ${expectedRevenue}`);
  check("GP report cost of sales = the cost captured on those lines", gp.metrics.costOfSales === expectedCost, `${gp.metrics.costOfSales} vs ${expectedCost}`);
  check("GP report gross profit = revenue − cost", gp.metrics.grossProfit === round2(expectedRevenue - expectedCost));
  check("GP %", Math.abs(gp.metrics.gpPct - round2(((expectedRevenue - expectedCost) / expectedRevenue) * 100)) < 0.01);
  check("31 Aug, 1 Oct, the draft and tenant B are excluded", gp.byInvoice.every((r) => r.invoiceDate >= "2026-09-01" && r.invoiceDate <= "2026-09-30") && gp.byInvoice.length === headers.length);
  const productRevenue = round2(gp.byProduct.reduce((s, p) => s + p.revenue, 0));
  check("the product view reconciles to the invoice view (no line lost to the response cap)", productRevenue === expectedRevenue, `${productRevenue} vs ${expectedRevenue}`);

  const sales = await getSalesByCustomerItemReport(db, CO_A, { from: "2026-09-01", to: "2026-09-30" });
  const salesValue = round2((sales.lines || sales.rows || []).reduce((s, l) => s + Number(l.lineValue ?? 0), 0));
  check("Sales report value = GP report revenue for the same period", salesValue === gp.metrics.revenue, `${salesValue} vs ${gp.metrics.revenue}`);

  const all = await getCustomerGpReport(db, CO_A, {});
  const allPosted = t("vyron_customer_invoices").filter((i) => i.company_id === CO_A && i.status === "Posted");
  check("all dates: GP report = every posted invoice of this company only", all.metrics.revenue === round2(allPosted.reduce((s, i) => s + Number(i.sales_value), 0)) && all.byInvoice.length === allPosted.length);
  const b = await getCustomerGpReport(db, CO_B, { from: "2026-09-01", to: "2026-09-30" });
  check("tenant B sees only its own sale", b.metrics.revenue === 1000 && b.byInvoice.length === 1);
}

console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
