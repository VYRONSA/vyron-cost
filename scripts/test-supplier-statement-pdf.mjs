#!/usr/bin/env node
/**
 * VOLORA — supplier statement PDF ingestion: supplier-agnostic extraction, review and approval.
 *
 * Synthetic PDFs (scripts/support/synthetic-statement-pdfs.mjs) represent several invented
 * suppliers with deliberately different layouts — column order and names, date formats, number
 * formats, page breaks, headings or none — plus a scan and a password-protected file. Drives the
 * REAL extraction module, the reconciliation library and the /api/supplier-reconciliations route
 * (real session, in-memory database). Family A: no network, no database, no real supplier data.
 *
 *   npm run test:supplier-statement-pdf
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { jsPDF } from "jspdf";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://qa.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "qa-anon";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
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
const section = (title) => console.log(`\n${title}`);
async function rejects(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}
// pdfjs warns about fonts it does not need for text positions; keep the output readable.
const warn = console.warn;
console.warn = (...args) => (/standardFontDataUrl|fetchStandardFontData|Warning:/.test(String(args[0])) ? undefined : warn(...args));

const pdfs = await import("./support/synthetic-statement-pdfs.mjs");
const ex = await importFromRoot("src/lib/vyron-supplier-statement-pdf.ts");
const recon = await importFromRoot("src/lib/vyron-supplier-reconciliation.ts");
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");

const OWN = [pdfs.OWN_COMPANY];
const extract = (bytes) => ex.extractSupplierStatementPdf(bytes, { ownCompanyNames: OWN });
const txn = (e, ref) => e.transactions.find((t) => t.reference === ref);

// ---------------------------------------------------------------------------
section("1. Amounts and dates in any common format");
{
  const v = (s) => ex.findAmounts(s).map((a) => a.value);
  check("SA format: space thousands, decimal comma", v("1 250,50")[0] === 1250.5);
  check("international: comma thousands, decimal point", v("1,250.50")[0] === 1250.5);
  check("European: point thousands, decimal comma", v("1.250,50")[0] === 1250.5);
  check("R prefix", v("R 3 400,75")[0] === 3400.75);
  check("negatives: minus, trailing minus, brackets, CR suffix", v("-250.00")[0] === -250 && v("250,00-")[0] === -250 && v("(2 950.00)")[0] === -2950 && v("1,000.00 CR")[0] === -1000);
  check("DR suffix stays positive", v("15.00 DR")[0] === 15);
  check("codes, quantities and dates are not amounts", v("INV-5501").length === 0 && v("45821").length === 0 && v("12.10.26").length === 0 && v("2026-10-02").length === 0);
  check("two amounts on one line", v("Lamb 2 450.00  2 950.00").join("|") === "2450|2950");
  const d = (s) => ex.findDates(s).map((t) => `${t.kind}:${t.y}-${t.b}-${t.a}`);
  check("ISO", d("2026-10-02")[0] === "iso:2026-10-2");
  check("numeric with / . - separators and 2-digit years", ex.findDates("31/10/2026 16.10.26 05-10-2026").length === 3);
  check("month names: 05 Oct 2026, 5-Oct-26, October 5, 2026", ex.findDates("05 Oct 2026").length === 1 && ex.findDates("5-Oct-26").length === 1 && ex.findDates("October 5, 2026").length === 1);
}

// ---------------------------------------------------------------------------
section("2. Layout A — accounting package, 2 pages, Date | Reference | Description | Debit | Credit | Balance");
{
  const e = await extract(pdfs.layoutClassic());
  check("read as columns; all six headings recognised", e.layout === "columns" && ["date", "reference", "description", "debit", "credit", "balance"].every((c) => e.columns.includes(c)));
  check("supplier from the letterhead; the customer (own company) is never the supplier", e.supplier.value === "Coastal Fresh Produce (Pty) Ltd" && !e.supplier.candidates.includes(pdfs.OWN_COMPANY));
  check("statement date and account number", e.statementDate.value === "2026-10-31" && e.accountNumber.value === "HFP001");
  check("opening = first brought-forward balance (page 2 b/f is a page break, not a new opening)", e.openingBalance.value === 1000);
  check("closing = total due from the ageing table", e.closingBalance.value === 8000);
  check("six transactions across both pages", e.transactions.length === 6 && e.transactions.filter((t) => t.page === 2).length === 2);
  check("invoice, payment and credit note classified", txn(e, "IN10231").type === "INVOICE" && txn(e, "PMT8812").type === "PAYMENT" && txn(e, "CN2201").type === "CREDIT_NOTE");
  check("debit / credit / balance columns read", txn(e, "IN10244").debit === 1150.5 && txn(e, "CN2201").credit === 150.5 && txn(e, "CN2201").balance === 3300);
  check("wrapped description joined to its line", /delivered to Cape Town depot/.test(txn(e, "IN10322").description));
  check("balance check: 1 000 + 7 000 = 8 000 agrees; no warnings or unread lines", e.balanceCheck.agrees === true && e.warnings.length === 0 && e.unreadLines.length === 0);
  check("5 to reconcile, the payment read but not reconciled", e.counts.toReconcile === 5 && e.counts.notReconciled === 1 && e.counts.excluded === 0);
}

// ---------------------------------------------------------------------------
section("3. Layout B — ERP export, Doc No. | Type | Doc Date | Due Date | Amount (one signed column)");
{
  const e = await extract(pdfs.layoutErp());
  check("different column names and order recognised", e.layout === "columns" && ["reference", "type", "date", "due", "amount"].every((c) => e.columns.includes(c)));
  check("supplier in capitals", e.supplier.value === "METRO PACKAGING LIMITED");
  check("stated period", e.periodFrom.value === "2026-10-01" && e.periodTo.value === "2026-10-31");
  check("due date read separately from document date", txn(e, "INV-5501").date === "2026-10-02" && txn(e, "INV-5501").dueDate === "2026-11-01");
  check("credit note from a minus amount; payment from a CR suffix; journal as other", txn(e, "CRN-0091").credit === 250 && txn(e, "CRN-0091").type === "CREDIT_NOTE" && txn(e, "RCP-7781").type === "PAYMENT" && txn(e, "RCP-7781").credit === 1000 && txn(e, "JNL-12").type === "OTHER");
  check("opening 2,000.00 + lines = closing 5,415.75", e.openingBalance.value === 2000 && e.closingBalance.value === 5415.75 && e.balanceCheck.agrees === true);
  check("3 reconciled, payment and journal not", e.counts.toReconcile === 3 && e.counts.notReconciled === 2);
}

// ---------------------------------------------------------------------------
section("4. Layout C — wholesaler, Invoice No | Date | Details | Amount | Balance, named months, brackets");
{
  const e = await extract(pdfs.layoutWholesaler());
  check("supplier from 'Remit to'", e.supplier.value === "Karoo Meat Wholesalers CC");
  check("period from 'For the month of October 2026'", e.periodFrom.value === "2026-10-01" && e.periodTo.value === "2026-10-31");
  check("named-month dates", txn(e, "45821").date === "2026-10-05");
  check("payment in brackets is a credit", txn(e, "PAY-301").credit === 2950 && txn(e, "PAY-301").type === "PAYMENT");
  check("untyped debit taken as an invoice — flagged as a warning, not silently", txn(e, "45821").type === "INVOICE" && txn(e, "45821").flags.some((f) => f.severity === "warning" && /taken as an invoice/.test(f.message)));
  check("the line whose running balance does not agree is flagged", txn(e, "45844").flags.some((f) => /running balance on the statement is 2999.00/.test(f.message)));
  check("statement-level difference reported (closing 2 999 vs 2 790 computed)", e.balanceCheck.agrees === false && e.balanceCheck.difference === 209 && e.warnings.some((w) => /does not equal the closing balance/.test(w)));
  check("an amount without a date is listed as not read, never invented as a transaction", e.unreadLines.some((u) => /Delivery surcharge/.test(u.text)) && !e.transactions.some((t) => /surcharge/i.test(t.description || "")));
}

// ---------------------------------------------------------------------------
section("5. Layout D — no column headings, dd.mm.yy, decimal comma, trailing minus");
{
  const e = await extract(pdfs.layoutHeaderless());
  check("read by position, and the document says so", e.layout === "rows" && e.warnings.some((w) => /No column headings/.test(w)));
  check("dates day-first, proven by 16.10.26", e.dateOrder === "day-first" && txn(e, "INV88231").date === "2026-10-02");
  check("amount and running balance by position", txn(e, "INV88231").debit === 1250.5 && txn(e, "INV88231").balance === 1250.5);
  check("trailing-minus payment is a credit", txn(e, "RC-1102").credit === 1250.5 && txn(e, "RC-1102").type === "PAYMENT");
  check("missing opening balance flagged, not assumed", e.openingBalance.value === null && /No opening/.test(e.openingBalance.flag));
  check("statement date 'as at 31.10.26', closing 'Balance due'", e.statementDate.value === "2026-10-31" && e.closingBalance.value === 640);
}

// ---------------------------------------------------------------------------
section("6. Layout E — month-first dates, Charges / Payments columns");
{
  const e = await extract(pdfs.layoutMonthFirst());
  check("month-first proven by 10/31/2026; dates read accordingly", e.dateOrder === "month-first" && txn(e, "S-1001").date === "2026-10-05" && e.statementDate.value === "2026-10-31");
  check("'Charges' and 'Payments' recognised as debit and credit", e.columns.includes("debit") && e.columns.includes("credit") && txn(e, "S-1002").debit === 120);
  check("a credit that does not say what it is → excluded with the reason", txn(e, "X-55").status === "EXCLUDED" && txn(e, "X-55").flags.some((f) => f.severity === "error" && /payment or a credit note/.test(f.message)));
  check("payment without a reference is read, not reconciled, not an error", e.transactions.find((t) => /Payment/.test(t.description || "")).status === "NOT_RECONCILED");
  check("balance forward 0.00 + lines = amount due 70.00", e.openingBalance.value === 0 && e.balanceCheck.agrees === true);
}

// ---------------------------------------------------------------------------
section("7. Supplier not guessed; ambiguous dates; refusals");
{
  const g = await extract(pdfs.layoutTwoCompanies());
  check("two company names → no supplier chosen, both offered, flagged", g.supplier.value === null && g.supplier.candidates.length === 2 && /Choose the supplier/.test(g.supplier.flag));
  check("dates that do not prove their order are read day-first WITH a warning", g.warnings.some((w) => /read day-first/.test(w)));
  check("a conflicting date order makes ambiguous dates unreadable", (() => {
    const lines = [
      { page: 1, y: 700, h: 9, cells: [{ text: "Date", x0: 40, x1: 60 }, { text: "Reference", x0: 110, x1: 150 }, { text: "Debit", x0: 380, x1: 400 }], text: "" },
      { page: 1, y: 684, h: 9, cells: [{ text: "13/10/2026", x0: 40, x1: 85 }, { text: "INV-1", x0: 110, x1: 130 }, { text: "10,00", x0: 380, x1: 400 }], text: "" },
      { page: 1, y: 668, h: 9, cells: [{ text: "10/14/2026", x0: 40, x1: 85 }, { text: "INV-2", x0: 110, x1: 130 }, { text: "10,00", x0: 380, x1: 400 }], text: "" },
      { page: 1, y: 652, h: 9, cells: [{ text: "05/06/2026", x0: 40, x1: 85 }, { text: "INV-3", x0: 110, x1: 130 }, { text: "10,00", x0: 380, x1: 400 }], text: "" },
    ].map((l) => ({ ...l, text: l.cells.map((c) => c.text).join("  ") }));
    const r = ex.interpretStatement({ lines, pageCount: 1, fileSha256: "x" });
    const third = r.transactions.find((t) => t.reference === "INV-3");
    return third.status === "EXCLUDED" && third.date === null && r.warnings.some((w) => /both day\/month and month\/day/.test(w));
  })());
  const scan = await rejects(extract(pdfs.layoutScanned()));
  check("a scanned (text-less) PDF is refused clearly; no OCR", scan instanceof ex.StatementPdfError && /no usable text layer/.test(scan.message) && /scanned/.test(scan.message));
  const locked = new jsPDF({ unit: "pt", encryption: { userPassword: "secret", ownerPassword: "owner", userPermissions: ["print"] } });
  locked.text("Coastal Fresh Produce (Pty) Ltd", 40, 40);
  const lockedErr = await rejects(extract(new Uint8Array(locked.output("arraybuffer"))));
  check("a password-protected PDF is refused", lockedErr instanceof ex.StatementPdfError && /password/i.test(lockedErr.message), lockedErr?.message);
  const notPdf = await rejects(extract(new TextEncoder().encode("Date,Reference,Amount\n2026-10-01,INV-1,10.00\n")));
  check("a non-PDF file is refused", notPdf instanceof ex.StatementPdfError && /not a PDF/.test(notPdf.message));
  const sameBytes = pdfs.layoutClassic();
  const a1 = await extract(sameBytes);
  const a2 = await extract(sameBytes);
  const b = await extract(pdfs.layoutErp());
  check("extraction is deterministic (same file → same digest); different file → different digest", a1.digest === a2.digest && a1.digest !== b.digest && /^[0-9a-f]{64}$/.test(a1.digest));
}

// ---------------------------------------------------------------------------
section("8. Approval gate (library)");
const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const SUPPLIER = "Coastal Fresh Produce (Pty) Ltd";
const seedDb = () => ({
  vyron_workspaces: [{ id: "aaaaaaaa-0000-4000-8000-000000000002", company_id: CO, company_name: pdfs.OWN_COMPANY, package_name: "Enterprise", status: "Setup", default_vat_rate: 15 }],
  vyron_cost_suppliers: [{ id: "sup-1", company_id: CO, supplier_name: SUPPLIER }],
  vyron_cost_supplier_invoices: [
    { id: "si-1", company_id: CO, supplier_id: "sup-1", supplier_name: SUPPLIER, invoice_number: "IN10231", invoice_date: "2026-10-03", status: "Approved", vat: 300, total: 2300, created_at: "2026-10-04T00:00:00Z" },
    { id: "si-2", company_id: CO, supplier_id: "sup-1", supplier_name: SUPPLIER, invoice_number: "IN10244", invoice_date: "2026-10-05", status: "Approved", vat: 150.07, total: 1100.5, created_at: "2026-10-06T00:00:00Z" },
    { id: "si-3", company_id: CO, supplier_id: "sup-1", supplier_name: SUPPLIER, invoice_number: "IN10301", invoice_date: "2026-10-20", status: "Approved", vat: 521.74, total: 4000, created_at: "2026-10-21T00:00:00Z" },
  ],
  vyron_cost_supplier_invoice_lines: [],
  vyron_documents: [],
  vyron_document_line_items: [],
  vyron_supplier_reconciliations: [],
  vyron_supplier_reconciliation_lines: [],
});
{
  const db = createFakeSupabase(seedDb(), { honourOrder: true });
  const bytes = pdfs.layoutClassic();
  const context = await recon.loadStatementContext(db, CO);
  check("context: own company name and VOLORA supplier names (read-only)", context.ownCompanyNames[0] === pdfs.OWN_COMPANY && context.supplierNames[0] === SUPPLIER && db.tables.vyron_supplier_reconciliations.length === 0);
  const e = await ex.extractSupplierStatementPdf(bytes, { ownCompanyNames: context.ownCompanyNames });
  const base = { bytes, fileName: "coastal-oct.pdf", supplierName: SUPPLIER, ownCompanyNames: context.ownCompanyNames, approvedBy: "QA Approver" };
  const wrong = await rejects(recon.runApprovedStatementReconciliation(db, CO, { ...base, approvedDigest: "0".repeat(64) }, "qa-user"));
  check("a digest that is not the reviewed extraction → refused, nothing written", wrong instanceof recon.ReconciliationError && /not the one that was reviewed/.test(wrong.message) && db.tables.vyron_supplier_reconciliations.length === 0);
  const otherFile = await rejects(recon.runApprovedStatementReconciliation(db, CO, { ...base, bytes: pdfs.layoutErp(), approvedDigest: e.digest }, "qa-user"));
  check("a different PDF sent with the reviewed digest → refused", /not the one that was reviewed/.test(otherFile?.message || "") && db.tables.vyron_supplier_reconciliations.length === 0);
  const noSupplier = await rejects(recon.runApprovedStatementReconciliation(db, CO, { ...base, supplierName: "  ", approvedDigest: e.digest }, "qa-user"));
  check("no supplier → refused", /Choose the supplier/.test(noSupplier?.message || "") && db.tables.vyron_supplier_reconciliations.length === 0);

  const result = await recon.runApprovedStatementReconciliation(db, CO, { ...base, approvedDigest: e.digest }, "qa-user");
  const lines = db.tables.vyron_supplier_reconciliation_lines.filter((l) => l.reconciliation_id === result.reconciliation.id);
  const byNo = (n) => lines.find((l) => l.invoice_number === n);
  check("approved → one reconciliation record with the reviewed invoice / credit-note lines only", db.tables.vyron_supplier_reconciliations.length === 1 && lines.filter((l) => l.source_row !== null).length === 5 && !lines.some((l) => l.invoice_number === "PMT8812"));
  check("matched, total difference, missing and credit note found", byNo("IN10231").status === "MATCHED" && byNo("IN10244").status === "TOTAL_DIFFERENCE" && byNo("IN10322").status === "MISSING_IN_VOLORA" && byNo("CN2201").status === "CREDIT_NOTE" && byNo("CN2201").supplier_total === -150.5);
  const summary = db.tables.vyron_supplier_reconciliations[0].summary;
  check("the record keeps the statement: digest, approver, detected/approved supplier, balances, check", summary.statement.extractionDigest === e.digest && summary.statement.approvedBy === "QA Approver" && summary.statement.supplierDetected === SUPPLIER && summary.statement.openingBalance === 1000 && summary.statement.closingBalance === 8000 && summary.statement.balanceCheck.agrees === true);
  check("file name and SHA-256 of the PDF recorded", db.tables.vyron_supplier_reconciliations[0].source_file_name === "coastal-oct.pdf" && db.tables.vyron_supplier_reconciliations[0].source_sha256 === e.fileSha256);
  check("nothing else written: no invoices, no stock, no ledger", db.tables.vyron_cost_supplier_invoices.length === 3 && !db.tables.vyron_cost_stock_ledger);

  const eE = await ex.extractSupplierStatementPdf(pdfs.layoutMonthFirst(), { ownCompanyNames: context.ownCompanyNames });
  const mapped = recon.statementLinesFromExtraction(eE, "Prairie Spice Co. Inc.");
  check("excluded lines are reported as skipped with their reason, never reconciled", mapped.lines.length === 2 && mapped.skipped.length === 1 && /payment or a credit note/.test(mapped.skipped[0].reason));
}

// ---------------------------------------------------------------------------
section("9. API route: extraction writes nothing; approval required; permissions");
{
  const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const WS = uuid("a", 2);
  const U_BUYER = uuid("a", 10);
  const U_VIEWER = uuid("a", 11);
  const USERS = [
    { id: U_BUYER, email: "buyer@qa-a.test", password: "qa-pass-buyer" },
    { id: U_VIEWER, email: "viewer@qa-a.test", password: "qa-pass-viewer" },
  ];
  const seed = seedDb();
  seed.vyron_workspaces[0].id = WS;
  seed.vyron_workspace_memberships = [
    { id: "m1", workspace_id: WS, user_id: U_BUYER, role: "PROCUREMENT", status: "Active", permissions: {} },
    { id: "m2", workspace_id: WS, user_id: U_VIEWER, role: "VIEW_ONLY", status: "Active", permissions: {} },
  ];
  const db = createFakeSupabase(seed, { honourOrder: true });
  const writes = [];
  const originalFrom = db.from.bind(db);
  db.from = (table) => {
    const q = originalFrom(table);
    for (const m of ["insert", "update", "upsert", "delete"]) {
      const orig = q[m].bind(q);
      q[m] = (...a) => {
        writes.push({ table, m });
        return orig(...a);
      };
    }
    return q;
  };
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: USERS, cookies: new Map(), headers: {} };
  const { NextRequest } = await import("next/server");
  const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
  const route = await importFromRoot("src/app/api/supplier-reconciliations/route.ts");
  const setJar = (jar) => (globalThis.__VYRON_SESSION_TEST__.cookies = new Map(Object.entries(jar || {})));
  const login = async (email, password) => {
    setJar({});
    const res = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email, password }), headers: { "content-type": "application/json" } }));
    return Object.fromEntries(res.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  };
  const post = async (jar, fields) => {
    setJar(jar);
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await route.POST(new NextRequest(new URL("/api/supplier-reconciliations", "http://qa.local"), { method: "POST", body: form }));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const pdfFile = (bytes, name = "statement.pdf") => new File([bytes], name, { type: "application/pdf" });
  const coastal = pdfs.layoutClassic(); // one file, as the browser re-sends it on approval
  const buyer = await login("buyer@qa-a.test", "qa-pass-buyer");
  const viewer = await login("viewer@qa-a.test", "qa-pass-viewer");
  writes.length = 0;

  check("anonymous → 401", (await post({}, { file: pdfFile(pdfs.layoutClassic()) })).status === 401);
  check("a member without supplier edit rights → 403", (await post(viewer, { file: pdfFile(pdfs.layoutClassic()) })).status === 403);
  const extracted = await post(buyer, { file: pdfFile(coastal, "coastal.pdf"), action: "extract" });
  check("extract returns the statement for review", extracted.status === 200 && extracted.json.mode === "review" && extracted.json.extraction.transactions.length === 6 && extracted.json.knownSuppliers.includes(SUPPLIER));
  check("extraction wrote nothing at all (zero inserts / updates / deletes on any table)", writes.length === 0, JSON.stringify(writes));
  const scan = await post(buyer, { file: pdfFile(pdfs.layoutScanned()), action: "extract" });
  check("a scan is refused with a clear 400", scan.status === 400 && /no usable text layer/.test(scan.json.error));
  const digest = extracted.json.extraction.digest;
  const notApproved = await post(buyer, { file: pdfFile(coastal, "coastal.pdf"), action: "approve", digest, supplierName: SUPPLIER });
  check("approve without the explicit approval flag → refused, nothing written", notApproved.status === 400 && /approve/.test(notApproved.json.error) && db.tables.vyron_supplier_reconciliations.length === 0);
  const tampered = await post(buyer, { file: pdfFile(pdfs.layoutErp(), "coastal.pdf"), action: "approve", approved: "true", digest, supplierName: SUPPLIER });
  check("approving a different file than the one reviewed → refused", tampered.status === 400 && /not the one that was reviewed/.test(tampered.json.error) && db.tables.vyron_supplier_reconciliations.length === 0);
  const approved = await post(buyer, { file: pdfFile(coastal, "coastal.pdf"), action: "approve", approved: "true", digest, supplierName: SUPPLIER });
  check("explicit approval → reconciliation recorded", approved.status === 200 && approved.json.summary.supplierInvoices === 5 && db.tables.vyron_supplier_reconciliations.length === 1 && db.tables.vyron_supplier_reconciliations[0].company_id === CO);
  const csv = await post(buyer, { file: new File(["Invoice Number,Total\nIN10231,2300.00\n"], "list.csv", { type: "text/csv" }), supplierName: SUPPLIER });
  check("CSV upload still reconciles directly (unchanged)", csv.status === 200 && csv.json.summary.matched === 1 && db.tables.vyron_supplier_reconciliations.length === 2);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
