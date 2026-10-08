#!/usr/bin/env node
/**
 * VOLORA — supplier statement matching (Phase 2): deterministic matching on the reviewed AI
 * interpretation, the signed review, and approval. Offline: recorded model answers for a synthetic
 * statement, an in-memory database, the real routes. No network, no real data.
 *
 *   npm run test:supplier-statement-match
 */
import { register } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = `qa-${randomBytes(32).toString("hex")}`;
delete process.env.VYRON_WORKSPACE_SESSION_SECRET;
delete process.env.OPENAI_API_KEY;
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
const section = (t) => console.log(`\n${t}`);
async function rejects(p) {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
}
console.warn = () => {};

const pdfs = await import("./support/synthetic-statement-pdfs.mjs");
const ex = await importFromRoot("src/lib/vyron-supplier-statement-pdf.ts");
const ai = await importFromRoot("src/lib/vyron-supplier-statement-ai.ts");
const mt = await importFromRoot("src/lib/vyron-supplier-statement-match.ts");
const recon = await importFromRoot("src/lib/vyron-supplier-reconciliation.ts");
const rep = await importFromRoot("src/lib/vyron-supplier-differences-report.ts");
const { createFakeSupabase } = await import("./support/document-email-test-stubs/fake-supabase.mjs");

const SUP = "Fresh Pantry Wholesale";
const OWN = [pdfs.OWN_COMPANY];
const fx = JSON.parse(readFileSync(path.join(ROOT, "scripts/fixtures/supplier-statement-ai/layoutInvoiceAndOurReference.json"), "utf8"));
const replayFetch = async (_u, init) => {
  const body = JSON.parse(init.body);
  const input = JSON.parse(body.input[0].content[0].text);
  const rec = fx.calls.find((c) => c.name === body.text.format.name && (body.text.format.name === "supplier_statement_identity" || c.firstLineIndex === input.rows[0].lineIndex));
  return new Response(JSON.stringify(rec.response), { status: 200 });
};
const pdfBytes = pdfs.layoutInvoiceAndOurReference();
const H = await ex.extractSupplierStatementPdf(pdfBytes, { ownCompanyNames: OWN });
const interpretation = await ai.interpretStatementWithAi(H, { companyId: "co", ownCompanyNames: OWN, deps: { fetch: replayFetch, apiKey: "k", model: "gpt-4o", checkAllowance: async () => ({ allowed: true }), recordUsage: async () => null } });

// A synthetic line for the pure rules.
const line = (index, over = {}) => ({ index, page: 1, date: "2026-09-10", debit: 100, credit: 0, balance: null, direction: "debit", type: "invoice", typeSource: "ai", documentNumber: null, secondaryReferences: [], paymentAllocatesDocumentNumber: null, descriptionMeaning: null, evidence: null, confidence: "high", structurallyConfirmed: false, balanceMovement: null, needsReview: false, reviewReasons: [], auditNotes: [], sourceText: "", ...over });
const ip = (lines) => ({ ...interpretation, lines });
const cand = (id, over = {}) => ({ id, invoiceNumber: null, invoiceDate: "2026-09-10", total: 100, supplierName: SUP, poNumber: null, origin: "register", ...over });
const matchOf = (lines, register, supplier = SUP) => mt.matchInterpretedStatement(ip(lines), register, supplier);

// ---------------------------------------------------------------------------
section("1. Document numbers");
{
  check("all-digit numbers ignore leading zeros: 000000002252489 = 02252489", mt.documentKey("000000002252489") === mt.documentKey("02252489"));
  check("…and safe separators: 0225-2489 = 2252489", mt.documentKey("0225-2489") === mt.documentKey("2252489"));
  check("different all-digit numbers never match: 2252489 ≠ 2252498", mt.documentKey("2252489") !== mt.documentKey("2252498"));
  check("letters keep their zeros: INV-0012 ≠ INV-12", mt.documentKey("INV-0012") !== mt.documentKey("INV-12"));
  const r = matchOf([line(1, { documentNumber: "000000002252489", debit: 250 })], [cand("v1", { invoiceNumber: "02252489", total: 250 })]);
  check("statement 000000002252489 matches VOLORA 02252489 (method: document number)", r.lines[0].status === "MATCHED" && r.lines[0].method === "document_number" && r.lines[0].voloraId === "v1");
  const r2 = matchOf([line(1, { documentNumber: "2252489", debit: 250, date: "2026-09-10" })], [cand("v1", { invoiceNumber: "2252498", total: 250, invoiceDate: "2026-09-10" })]);
  check("a different number never matches — even with the same amount and date it is Needs Review, not a match", r2.lines[0].status === "NEEDS_REVIEW" && r2.lines[0].voloraId === null);
  const r3 = matchOf([line(1, { documentNumber: "000000002252489" })], [cand("a", { invoiceNumber: "02252489" }), cand("b", { invoiceNumber: "2252489" })]);
  check("leading-zero collision (02252489 and 2252489 in VOLORA) → Needs Review, none chosen", r3.lines[0].status === "NEEDS_REVIEW" && r3.lines[0].candidates === 2 && r3.lines[0].voloraId === null);
  const r4 = matchOf([line(1, { documentNumber: "1001", debit: 120 })], [cand("v", { invoiceNumber: "1001", total: 100 })]);
  check("matched number with a different amount → Amount Difference with both amounts", r4.lines[0].status === "AMOUNT_DIFFERENCE" && r4.lines[0].difference === 20 && r4.lines[0].statementAmount === 120 && r4.lines[0].voloraTotal === 100);
  const r5 = matchOf([line(1, { documentNumber: "1001" }), line(2, { documentNumber: "0001001" })], [cand("v", { invoiceNumber: "1001" })]);
  check("the same number twice on the statement → duplicate", r5.lines.every((l) => l.status === "DUPLICATE"));
  const r6 = matchOf([line(1, { documentNumber: "1001" })], [cand("v", { invoiceNumber: "1001", supplierName: "Another Supplier" })]);
  check("another supplier's invoice is never a candidate", r6.lines[0].status !== "MATCHED");
}

section("2. Secondary references only after the document number fails");
{
  const r = matchOf([line(1, { documentNumber: "777", secondaryReferences: ["PO-55"] })], [cand("doc", { invoiceNumber: "777" }), cand("ref", { invoiceNumber: "X", poNumber: "PO-55" })]);
  check("the document number wins even when a reference also matches", r.lines[0].method === "document_number" && r.lines[0].voloraId === "doc");
  const r2 = matchOf([line(1, { documentNumber: "888", secondaryReferences: ["000000000010901"] })], [cand("po", { invoiceNumber: "INV-9", poNumber: "10901" })]);
  check("number not in VOLORA → matched on the row's reference (PO 10901 = 000000000010901)", r2.lines[0].status === "MATCHED" && r2.lines[0].method === "reference" && r2.lines[0].voloraId === "po");
  const r3 = matchOf([line(1, { secondaryReferences: ["PO-1"] })], [cand("a", { invoiceNumber: "A", poNumber: "PO-1" }), cand("b", { invoiceNumber: "B", poNumber: "PO-1" })]);
  check("a reference matching two VOLORA invoices → Needs Review", r3.lines[0].status === "NEEDS_REVIEW" && r3.lines[0].candidates === 2);
}

section("3. Amount + date: one candidate in both directions, never amount alone");
{
  const r = matchOf([line(1, { debit: 432.1, date: "2026-09-10" })], [cand("v", { invoiceNumber: "Z1", total: 432.1, invoiceDate: "2026-09-12" })]);
  check("no number printed, exactly one VOLORA invoice with this amount within 7 days, unique both ways → identified (confirm); the 2-day gap is reported as a date difference", r.lines[0].status === "DATE_DIFFERENCE" && r.lines[0].method === "amount_date" && r.lines[0].voloraId === "v" && r.lines[0].dateDifferenceDays === -2 && /confirm/.test(r.lines[0].note));
  const r1 = matchOf([line(1, { debit: 432.1, date: "2026-09-10" })], [cand("v", { invoiceNumber: "Z1", total: 432.1, invoiceDate: "2026-09-10" })]);
  check("…on the same date → Matched", r1.lines[0].status === "MATCHED" && r1.lines[0].method === "amount_date");
  const r2 = matchOf([line(1, { debit: 432.1 })], [cand("a", { total: 432.1 }), cand("b", { total: 432.1 })]);
  check("two VOLORA candidates → Needs Review", r2.lines[0].status === "NEEDS_REVIEW" && r2.lines[0].voloraId === null);
  const r3 = matchOf([line(1, { debit: 432.1 }), line(2, { debit: 432.1 })], [cand("a", { total: 432.1 })]);
  check("one candidate but two statement rows fit it (not unique in reverse) → Needs Review for both", r3.lines.every((l) => l.status === "NEEDS_REVIEW" && l.voloraId === null));
  const r4 = matchOf([line(1, { debit: 432.1, date: null })], [cand("a", { total: 432.1 })]);
  check("amount alone (no date) never matches", r4.lines[0].status === "MISSING_IN_VOLORA" && r4.lines[0].voloraId === null);
  const r5 = matchOf([line(1, { debit: 432.1, date: "2026-09-10" })], [cand("a", { total: 432.1, invoiceDate: "2026-08-01" })]);
  check("same amount outside the date window never matches", r5.lines[0].status === "MISSING_IN_VOLORA");
  const r6 = matchOf([line(1, { debit: 432.1 })], [cand("a", { total: 432.11 })]);
  check("an amount one cent different is not a match (no fuzzy amounts)", r6.lines[0].status === "MISSING_IN_VOLORA");
}

section("4. The structure statement against a VOLORA register (recorded AI answers)");
const voloraRegister = [
  cand("v2005", { invoiceNumber: "2005", total: 1200, invoiceDate: "2026-10-06" }),
  cand("v2004", { invoiceNumber: "000000000002004", total: 800, invoiceDate: "2026-10-01" }),
  cand("v2003", { invoiceNumber: "2003", total: 650, invoiceDate: "2026-09-20" }),
  cand("v2002a", { invoiceNumber: "2002", total: 300, invoiceDate: "2026-09-10" }),
  cand("v2002b", { invoiceNumber: "02002", total: 300, invoiceDate: "2026-09-10" }),
  cand("vpo", { invoiceNumber: "INV-K1", total: 500, invoiceDate: "2026-09-05", poNumber: "10901" }),
  cand("vextra", { invoiceNumber: "2999", total: 75, invoiceDate: "2026-09-15" }),
];
{
  const r = mt.matchInterpretedStatement(interpretation, voloraRegister, SUP);
  const at = (i) => r.lines.find((l) => l.index === i);
  check("Invoice column beats Our Reference: row 7 keyed on 000000000002002, not 000000000010902", interpretation.lines[6].documentNumber === "000000000002002");
  check("2005: statement 000000000002005 = VOLORA 2005", at(1).status === "MATCHED" && at(1).voloraId === "v2005");
  check("2004: exact number", at(2).status === "MATCHED" && at(2).voloraId === "v2004");
  check("2003: matched, R0.50 difference reported", at(5).status === "AMOUNT_DIFFERENCE" && at(5).difference === 0.5);
  check("2002: VOLORA holds 2002 and 02002 → Needs Review", at(7).status === "NEEDS_REVIEW" && at(7).candidates === 2);
  check("2001: not in VOLORA by number, matched by its Our Reference = PO 10901", at(8).status === "MATCHED" && at(8).method === "reference" && at(8).voloraId === "vpo");
  check("payments and the unallocated receipt are not matched against invoices", [3, 4, 6].every((i) => at(i).status === "NOT_RECONCILED" && at(i).documentType === null));
  check("…and are not in the differences report", r.differences.every((d) => d.row === null || ![3, 4, 6].includes(d.row)));
  check("VOLORA invoice in the period but not on the statement is reported", r.notOnStatement.map((c) => c.id).join() === "vextra");
  check("summary counts (supplier documents only)", r.summary.documents === 5 && r.summary.matched === 3 && r.summary.amountDifferences === 1 && r.summary.needsReview === 1 && r.summary.notOnStatement === 1 && r.summary.excludedRows === 3, JSON.stringify(r.summary));
  check("no payment or receipt figure in the reconciliation summary", !("paymentsWithAllocation" in r.summary) && !("unallocatedReceipts" in r.summary));
  check("differences report: 2003 amount, 2002 needs review, 2999 not on statement", r.differences.map((d) => `${d.category}:${d.documentNumber}`).join() === "AMOUNT_DIFFERENCE:000000000002003,NEEDS_REVIEW:000000000002002,NOT_ON_STATEMENT:2999", JSON.stringify(r.differences.map((d) => [d.category, d.documentNumber])));
  const other = mt.matchInterpretedStatement(interpretation, voloraRegister, "Some Other Supplier");
  check("the supplier is the one the user confirmed — never the AI's suggestion (other supplier → nothing matches)", other.summary.matched === 0 && other.lines.filter((l) => l.status === "MISSING_IN_VOLORA").length === 5);
}

section("4b. Supplier documents only");
{
  const GC = "Gourmet Cape Distributors (Pty) Ltd";
  const doc = (i, over) => line(i, over);
  const pay = (i, over) => line(i, { type: "payment", direction: "credit", debit: null, credit: 500, ...over });
  const lines = [
    doc(1, { documentNumber: "02291553", debit: 1000, date: "2026-10-01" }),
    doc(2, { documentNumber: "02287458", debit: 2000, date: "2026-09-22" }),
    doc(3, { documentNumber: "02262503", debit: 300.02, date: "2026-07-14" }),
    doc(4, { documentNumber: "02284252", debit: 400, date: "2026-09-08" }),
    doc(5, { documentNumber: "02252489", debit: 150.01, date: "2026-07-01" }),
    doc(6, { documentNumber: "02299999", debit: 99, date: "2026-10-03" }),
    doc(7, { type: "credit_note", direction: "credit", debit: null, credit: 50, documentNumber: "CN-1", date: "2026-09-01" }),
    doc(8, { type: "credit_note", direction: "credit", debit: null, credit: 70, documentNumber: "CN-2", date: "2026-09-02" }),
    doc(9, { type: "debit_note", documentNumber: "DN-1", debit: 25, date: "2026-09-03" }),
    doc(10, { type: "debit_note", documentNumber: "DN-2", debit: 30, date: "2026-09-04" }),
    doc(11, { documentNumber: "02262503X", debit: 10, date: "2026-09-05" }),
    doc(12, { documentNumber: "02262503X", debit: 10, date: "2026-09-05" }),
    doc(13, { documentNumber: "02270000", debit: 600, date: "2026-08-10" }),
    pay(14, { paymentAllocatesDocumentNumber: "02291553", allocationKind: "invoice_on_statement" }),
    pay(15, { paymentAllocatesDocumentNumber: "_CR00001", allocationKind: "receipt" }),
    line(16, { type: "unallocated_receipt", direction: "none", debit: null, credit: null, documentNumber: "_CR00001", needsReview: true, reviewReasons: ["Unallocated receipt: check how the supplier applied it."] }),
    pay(17, { paymentAllocatesDocumentNumber: "02299999", allocationKind: "invoice_on_statement" }),
  ];
  const reg = [
    cand("a", { supplierName: GC, invoiceNumber: "02291553", invoiceDate: "2026-01-10", total: 1000 }),
    cand("b", { supplierName: GC, invoiceNumber: "02287458", invoiceDate: "2022-09-26", total: 2000 }),
    cand("c", { supplierName: GC, invoiceNumber: "02262503", invoiceDate: "2026-07-14", total: 300.04 }),
    cand("d1", { supplierName: GC, invoiceNumber: "02284252", invoiceDate: "2026-09-08", total: 400 }),
    cand("d2", { supplierName: GC, invoiceNumber: "02284252", invoiceDate: "2026-09-08", total: 400 }),
    cand("d3", { supplierName: GC, invoiceNumber: "02284252", invoiceDate: "2026-09-09", total: 400 }),
    cand("e", { supplierName: GC, invoiceNumber: "02252489", invoiceDate: "2026-07-01", total: 150 }),
    cand("cn1", { supplierName: GC, invoiceNumber: "CN-1", invoiceDate: "2026-09-01", total: -50 }),
    cand("cn2", { supplierName: GC, invoiceNumber: "CN-2", invoiceDate: "2026-09-02", total: -75 }),
    cand("dn1", { supplierName: GC, invoiceNumber: "DN-1", invoiceDate: "2026-09-03", total: 25 }),
    cand("dn2", { supplierName: GC, invoiceNumber: "DN-2", invoiceDate: "2026-09-04", total: 35 }),
    cand("f", { supplierName: GC, invoiceNumber: "02270000", invoiceDate: "2026-08-01", total: 650 }),
    cand("g", { supplierName: GC, invoiceNumber: "02275555", invoiceDate: "2026-08-15", total: 80 }),
  ];
  const r = mt.matchInterpretedStatement(ip(lines), reg, GC);
  const at = (i) => r.lines.find((l) => l.index === i);
  check("a wrong VOLORA date keeps the document matched by number: 02291553 → Date Difference, not Missing", at(1).status === "DATE_DIFFERENCE" && at(1).voloraId === "a" && at(1).method === "document_number");
  check("…showing statement date, VOLORA date and the difference", at(1).statementDate === "2026-10-01" && at(1).voloraDate === "2026-01-10" && at(1).dateDifferenceDays === 264 && /statement 2026-10-01, VOLORA 2026-01-10/.test(at(1).note), at(1).note);
  check("02287458 dated four years apart in VOLORA → Date Difference, identified by number", at(2).status === "DATE_DIFFERENCE" && at(2).voloraId === "b" && at(2).dateDifferenceDays === 1457, String(at(2).dateDifferenceDays));
  check("02262503: amount differs by exactly −0.02 → Amount Difference with both amounts", at(3).status === "AMOUNT_DIFFERENCE" && at(3).statementAmount === 300.02 && at(3).voloraTotal === 300.04 && at(3).difference === -0.02 && /difference -0\.02/.test(at(3).note), at(3).note);
  check("02284252 three times in VOLORA → Needs Review, never auto-selected", at(4).status === "NEEDS_REVIEW" && at(4).voloraId === null && at(4).duplicateInVolora && at(4).candidates === 3 && /Duplicate in VOLORA/.test(at(4).note));
  check("…and its VOLORA records are not reported as 'not on statement'", !r.notOnStatement.some((c) => c.id.startsWith("d")));
  check("a one-cent difference stays within tolerance (Matched, the cent still shown)", at(5).status === "MATCHED" && at(5).difference === 0.01);
  check("a document VOLORA does not hold → Missing in VOLORA", at(6).status === "MISSING_IN_VOLORA");
  check("credit note that agrees → Matched (negative amounts)", at(7).status === "MATCHED" && at(7).statementAmount === -50 && at(7).documentType === "credit_note");
  check("credit note that differs → Credit/Debit Note Difference", at(8).status === "NOTE_DIFFERENCE" && at(8).difference === 5);
  check("debit note matched by number (positive amount)", at(9).status === "MATCHED" && at(9).documentType === "debit_note" && at(9).statementAmount === 25);
  check("debit note that differs → Credit/Debit Note Difference", at(10).status === "NOTE_DIFFERENCE" && at(10).difference === -5);
  check("the same number twice on the statement → Duplicate, none chosen", at(11).status === "DUPLICATE" && at(12).status === "DUPLICATE" && at(11).voloraId === null);
  check("amount and date both differ → Amount Difference, the date difference still shown", at(13).status === "AMOUNT_DIFFERENCE" && at(13).difference === -50 && at(13).dateDifferenceDays === 9);
  check("payments, receipt allocations and unapplied cash (_CR00001) are not reconciled — even when flagged", [14, 15, 16, 17].every((i) => at(i).status === "NOT_RECONCILED" && at(i).documentType === null));
  const s = r.summary;
  check("summary: documents only (13 = 9 invoices + 2 credit notes + 2 debit notes); 4 payment/receipt rows excluded", s.documents === 13 && s.invoices === 9 && s.creditNotes === 2 && s.debitNotes === 2 && s.excludedRows === 4, JSON.stringify(s));
  check("summary categories: 3 matched, 2 amount, 2 date, 2 duplicate, 1 missing, 2 note, 1 needs review", s.matched === 3 && s.amountDifferences === 2 && s.dateDifferences === 2 && s.duplicates === 2 && s.missing === 1 && s.noteDifferences === 2 && s.needsReview === 1, JSON.stringify(s));
  check("every document is in exactly one category", s.matched + s.amountDifferences + s.dateDifferences + s.duplicates + s.missing + s.noteDifferences + s.needsReview === s.documents);
  const cats = r.differences.map((d) => d.category);
  check("All Differences: every disagreeing document (10) plus the VOLORA document not on the statement", r.differences.length === 11 && cats.filter((c) => c === "NOT_ON_STATEMENT").length === 1 && r.differences.find((d) => d.category === "NOT_ON_STATEMENT").documentNumber === "02275555", JSON.stringify(cats));
  check("All Differences holds no payment, receipt or matched document", r.differences.every((d) => d.row === null || (d.row <= 13 && ![5, 7, 9].includes(d.row))));
  const dd = r.differences.find((d) => d.documentNumber === "02291553");
  check("a date difference in the report carries both dates and the day difference", dd.category === "DATE_DIFFERENCE" && dd.statementDate === "2026-10-01" && dd.voloraDate === "2026-01-10" && dd.dateDifferenceDays === 264);
  const other = mt.matchInterpretedStatement(ip(lines), reg.map((c) => (c.id === "a" ? { ...c, supplierName: "Gourmet Foods on the Go" } : c)), GC);
  check("no supplier alias: the same number under another supplier name is not a candidate", other.lines.find((l) => l.index === 1).status === "MISSING_IN_VOLORA");

  section("4c. Differences Report (built from the reconciliation result)");
  const sections = rep.reportSections(r.differences);
  const sec = (c) => sections.find((x) => x.category === c);
  const cell = (c, docNo, col) => {
    const x = sec(c);
    const row = x.rows.find((rw) => rw.cells[0] === docNo);
    return row ? row.cells[x.columns.indexOf(col)] : undefined;
  };
  const allCells = sections.flatMap((x) => x.rows.map((rw) => rw.cells.join(" | ")));
  check("1. only supplier-document differences: one section per difference type present, rows = All Differences", sections.map((x) => x.category).join() === "AMOUNT_DIFFERENCE,DATE_DIFFERENCE,NOTE_DIFFERENCE,DUPLICATE,MISSING_IN_VOLORA,NEEDS_REVIEW,NOT_ON_STATEMENT" && sections.reduce((t, x) => t + x.rows.length, 0) === r.differences.length);
  check("2. payments are excluded (no payment row or allocation appears)", !allCells.some((c) => /payment/i.test(c)) && sections.every((x) => x.rows.every((rw) => !["14", "15", "17"].includes(rw.key.split("-")[1]))));
  check("3. _CR receipts are excluded", !allCells.some((c) => /_CR/i.test(c)));
  check("…and a non-document difference is filtered out even if one were passed in", rep.reportableDifferences([...r.differences, { ...r.differences[0], documentType: "payment", documentNumber: "_CR00001" }]).length === r.differences.length);
  check("4. amount difference shows both amounts and the exact difference (02262503 style: -0.02)", /^R 300[.,]02$/.test(cell("AMOUNT_DIFFERENCE", "02262503", "Statement amount")) && /^R 300[.,]04$/.test(cell("AMOUNT_DIFFERENCE", "02262503", "VOLORA amount")) && /^-R 0[.,]02$/.test(cell("AMOUNT_DIFFERENCE", "02262503", "Difference")), JSON.stringify(sec("AMOUNT_DIFFERENCE").rows[0]));
  check("5. date difference shows both dates and the days (02291553: 2026-10-01 vs 2026-01-10, +264 days)", cell("DATE_DIFFERENCE", "02291553", "Statement date") === "2026-10-01" && cell("DATE_DIFFERENCE", "02291553", "VOLORA date") === "2026-01-10" && cell("DATE_DIFFERENCE", "02291553", "Days difference") === "+264 days" && cell("DATE_DIFFERENCE", "02287458", "Days difference") === "+1457 days");
  const dupVolora = cell("NEEDS_REVIEW", "02284252", "VOLORA records found");
  check("6. a duplicate VOLORA number lists every VOLORA record (3), and says none was chosen", dupVolora.split("\n").length === 3 && ["d1", "d2", "d3"].every((id) => dupVolora.includes(`id ${id}`)) && /none is chosen/.test(cell("NEEDS_REVIEW", "02284252", "Reason")), dupVolora);
  check("…a duplicate on the statement states that no VOLORA record was selected automatically", sec("DUPLICATE").rows.length === 2 && sec("DUPLICATE").rows.every((rw) => /no VOLORA record was selected automatically/.test(rw.cells.at(-1))));
  check("7. missing documents are clearly identified", cell("MISSING_IN_VOLORA", "02299999", "Result") === "Not found in VOLORA" && cell("MISSING_IN_VOLORA", "02299999", "Statement amount") !== "—");
  check("8. needs review includes the reason", /Duplicate in VOLORA: 3 records/.test(cell("NEEDS_REVIEW", "02284252", "Reason")));
  check("credit / debit note differences carry the note type and exact difference", cell("NOTE_DIFFERENCE", "CN-2", "Note type") === "Credit note" && /^R 5[.,]00$/.test(cell("NOTE_DIFFERENCE", "CN-2", "Difference")) && cell("NOTE_DIFFERENCE", "DN-2", "Note type") === "Debit note");
  const tiles = Object.fromEntries(rep.reportSummary(r.summary, r.differences).map((t) => [t.label, t.value]));
  check("9. summary counts come from the reconciliation result", tiles["Supplier documents reviewed"] === String(r.summary.documents) && tiles.Matched === String(r.summary.matched) && tiles["Amount differences"] === String(r.summary.amountDifferences) && tiles["Date differences"] === String(r.summary.dateDifferences) && tiles.Duplicates === String(r.summary.duplicates) && tiles["Missing in VOLORA"] === String(r.summary.missing) && tiles["Credit/debit note differences"] === String(r.summary.noteDifferences) && tiles["Needs review"] === String(r.summary.needsReview) && tiles["Total differences"] === String(r.differences.length), JSON.stringify(tiles));
  check("…and are not hardcoded (a different result gives different figures)", rep.reportSummary({ ...r.summary, documents: 999, missing: 7 }, []).find((t) => t.label === "Supplier documents reviewed").value === "999" && rep.reportSummary({ ...r.summary, missing: 7 }, []).find((t) => t.label === "Total differences").value === "0");
  check("search finds a document by number or reference", r.differences.filter((d) => rep.matchesSearch(d, "02291553")).length === 1 && r.differences.filter((d) => rep.matchesSearch(d, "")).length === r.differences.length);
}

section("4d. Print layout");
{
  const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
  const frame = readFileSync(path.join(ROOT, "src/components/reports/ReportDocument.tsx"), "utf8");
  const view = readFileSync(path.join(ROOT, "src/components/vyron-cost/suppliers/SupplierDifferencesReport.tsx"), "utf8");
  const printCss = css.slice(css.indexOf("Report printing"));
  check("10. the report renders in the shared report frame (print scope), with its tables as report tables", /from "@\/components\/reports\/ReportDocument"/.test(view) && /<ReportDocument/.test(view) && /<ReportTable/.test(view));
  check("…printing hides everything but the report (application navigation included)", /body\.vyron-printing-report \*\s*\{\s*visibility: hidden/.test(printCss) && /classList\.add\("vyron-printing-report"\)/.test(frame) && /window\.print\(\)/.test(frame));
  check("…buttons, inputs, selects and the controls bar are not printed", /\.vyron-report-controls,[\s\S]*?button,[\s\S]*?input,[\s\S]*?select \{\s*display: none !important/.test(printCss));
  check("…the search, filter and Back controls live in the unprinted controls bar", /controls=\{/.test(view) && /Back to reconciliation/.test(view) && /<select/.test(view) && /<input/.test(view));
  check("…table headers repeat on each page and rows are not split", /thead \{\s*display: table-header-group/.test(printCss) && /tr \{\s*break-inside: avoid/.test(printCss));
  check("…a visible Print Report button", /Print Report/.test(frame));
  const lib = readFileSync(path.join(ROOT, "src/lib/vyron-supplier-differences-report.ts"), "utf8");
  check("12. viewing / printing writes nothing: the report and its builder make no request and no database call", !/fetch\(|supabase|\.insert\(|\.update\(|\.delete\(/.test(view) && !/fetch\(|supabase|\.insert\(|\.update\(|\.delete\(/.test(lib.replace(/^\s*\*.*$/gm, "")));
}

section("5. Signed review → approval (in-memory database)");
const CO = "aaaaaaaa-0000-4000-8000-000000000001";
const seedDb = () => ({
  vyron_cost_supplier_invoices: voloraRegister.map((c) => ({ id: c.id, company_id: CO, supplier_id: "s1", supplier_name: c.supplierName, invoice_number: c.invoiceNumber, invoice_date: c.invoiceDate, status: "Approved", total: c.total, vat: null, matched_po_id: c.poNumber ? "po-1" : null, created_at: "2026-10-01T00:00:00Z" })),
  vyron_cost_purchase_orders: [{ id: "po-1", company_id: CO, po_number: "10901" }],
  vyron_cost_suppliers: [{ id: "s1", company_id: CO, supplier_name: SUP }],
  vyron_cost_supplier_invoice_lines: [],
  vyron_documents: [],
  vyron_document_line_items: [],
  vyron_supplier_reconciliations: [],
  vyron_supplier_reconciliation_lines: [],
});
{
  const db = createFakeSupabase(seedDb(), { honourOrder: true });
  const writes = [];
  const from = db.from.bind(db);
  db.from = (t) => {
    const q = from(t);
    for (const m of ["insert", "update", "upsert", "delete"]) {
      const o = q[m].bind(q);
      q[m] = (...a) => (writes.push(t), o(...a));
    }
    return q;
  };
  const token = mt.signReviewedInterpretation({ companyId: CO, extractionDigest: H.digest, fileSha256: H.fileSha256, interpretation });
  check("the server signs the reviewed interpretation", Boolean(token?.body && token?.signature));
  const preview = await recon.previewInterpretedStatementMatch(db, CO, { reviewBody: token.body, reviewSignature: token.signature, supplierName: SUP });
  check("match preview works from the signed review and writes nothing", preview.summary.matched === 3 && writes.length === 0, JSON.stringify(preview.summary));
  const base = { bytes: pdfBytes, fileName: "fresh-pantry.pdf", approvedDigest: H.digest, supplierName: SUP, ownCompanyNames: OWN, approvedBy: "QA Approver", reviewBody: token.body, reviewSignature: token.signature };
  const tampered = token.body.replace('"documentNumber":"000000000002004"', '"documentNumber":"000000000009999"');
  check("an altered review is refused", /could not be verified/.test((await rejects(recon.runApprovedInterpretedStatementReconciliation(db, CO, { ...base, reviewBody: tampered }, "u")))?.message || ""));
  check("another company's review is refused", /could not be verified/.test((await rejects(recon.runApprovedInterpretedStatementReconciliation(db, "bbbbbbbb-0000-4000-8000-000000000001", base, "u")))?.message || ""));
  const otherPdf = pdfs.layoutClassic();
  check("a different PDF is refused", /not the one that was reviewed/.test((await rejects(recon.runApprovedInterpretedStatementReconciliation(db, CO, { ...base, bytes: otherPdf }, "u")))?.message || ""));
  const bent = structuredClone(interpretation);
  bent.lines[0].debit = 1;
  const bentToken = mt.signReviewedInterpretation({ companyId: CO, extractionDigest: H.digest, fileSha256: H.fileSha256, interpretation: bent });
  check("a signed review whose amounts are not the reader's is refused", /dates and amounts/.test((await rejects(recon.runApprovedInterpretedStatementReconciliation(db, CO, { ...base, reviewBody: bentToken.body, reviewSignature: bentToken.signature }, "u")))?.message || ""));
  check("nothing was written by any refused approval", writes.length === 0);

  const res = await recon.runApprovedInterpretedStatementReconciliation(db, CO, base, "qa-user");
  const lines = db.tables.vyron_supplier_reconciliation_lines.filter((l) => l.reconciliation_id === res.reconciliation.id);
  const by = (n) => lines.find((l) => l.invoice_number === n);
  check("approval records the run with the deterministic outcomes", by("000000000002005").status === "MATCHED" && by("000000000002003").status === "TOTAL_DIFFERENCE" && by("000000000002002").status === "NEEDS_REVIEW" && by("000000000002001").status === "MATCHED");
  check("only supplier documents are written as statement lines (5) — no payment or receipt line", lines.filter((l) => l.source_row !== null).length === 5 && lines.every((l) => ["INVOICE", "CREDIT_NOTE"].includes(l.document_type)));
  check("…the VOLORA invoice not on the statement", lines.some((l) => l.status === "NOT_ON_SUPPLIER_DOCUMENT" && l.invoice_number === "2999"));
  const summary = db.tables.vyron_supplier_reconciliations[0].summary;
  check("payments and the receipt are excluded: counted for audit only, not skipped rows, not review items", summary.statement.excludedRows.payment === 2 && summary.statement.excludedRows.unallocated_receipt === 1 && summary.skippedRows.length === 0 && !("paymentAllocations" in summary.statement) && !("unallocatedReceipts" in summary.statement) && summary.statement.reviewItems.every((x) => ["invoice", "credit_note", "debit_note"].includes(x.type)), JSON.stringify(summary.statement.excludedRows));
  check("the run carries the supplier-document summary and the All Differences report", summary.statement.matching.method === "supplier-documents-v2" && summary.statement.matching.documents === 5 && summary.statement.differences.length === 3);
  check("the run is recorded under the confirmed supplier", db.tables.vyron_supplier_reconciliations[0].supplier_name === SUP);
  check("the approval response carries the differences report for the screen", res.summary.statement.differences.length === 3);
  const writesBefore = writes.length;
  const savedRun = structuredClone(db.tables.vyron_supplier_reconciliations[0].summary);
  const fromSaved = rep.reportSections(savedRun.statement.differences);
  const fromPreview = rep.reportSections(preview.differences);
  check("11. a saved run produces the same Differences Report as the preview, from its stored result (no AI, no re-match)", JSON.stringify(fromSaved) === JSON.stringify(fromPreview) && JSON.stringify(rep.reportSummary(savedRun.statement.matching, savedRun.statement.differences).slice(1)) === JSON.stringify(rep.reportSummary(preview.summary, preview.differences).slice(1)));
  check("…the saved run keeps the report header facts (statement date, account number, statement period)", ["statementDate", "accountNumber", "statementPeriodFrom", "statementPeriodTo", "supplierApproved"].every((k) => k in savedRun.statement));
  check("12. building the report from a saved run writes nothing", writes.length === writesBefore);
  check("supplier recorded as confirmed by the user; the AI's suggestion kept separately", summary.statement.supplierApproved === SUP && "supplierSuggested" in summary.statement);
  check("only the reconciliation record was written — no invoice, payment, allocation or stock change", [...new Set(writes)].sort().join() === "vyron_supplier_reconciliation_lines,vyron_supplier_reconciliations" && db.tables.vyron_cost_supplier_invoices.length === voloraRegister.length);
}

section("6. Through the real route, with the AI unavailable (no API key): safe fallback end to end");
{
  process.env.SUPPLIER_STATEMENT_AI = "on";
  const uuid = (t, n) => `${t}${t}${t}${t}0000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const WS = uuid("a", 2);
  const U = uuid("a", 10);
  const seed = seedDb();
  seed.vyron_workspaces = [{ id: WS, company_id: CO, company_name: pdfs.OWN_COMPANY, package_name: "Enterprise", status: "Setup", default_vat_rate: 15 }];
  seed.vyron_workspace_memberships = [{ id: "m1", workspace_id: WS, user_id: U, role: "PROCUREMENT", status: "Active", permissions: {} }];
  const db = createFakeSupabase(seed, { honourOrder: true });
  globalThis.__VYRON_SESSION_TEST__ = { supabase: db, browserSupabase: db, users: [{ id: U, email: "buyer@qa.test", password: "qa-pass" }], cookies: new Map(), headers: {} };
  const { NextRequest } = await import("next/server");
  const loginRoute = await importFromRoot("src/app/api/workspace/login/route.ts");
  const route = await importFromRoot("src/app/api/supplier-reconciliations/route.ts");
  const login = await loginRoute.POST(new NextRequest(new URL("/api/workspace/login", "http://qa.local"), { method: "POST", body: JSON.stringify({ email: "buyer@qa.test", password: "qa-pass" }), headers: { "content-type": "application/json" } }));
  globalThis.__VYRON_SESSION_TEST__.cookies = new Map(login.cookies.getAll().filter((c) => c.value).map((c) => [c.name, c.value]));
  const post = async (fields) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await route.POST(new NextRequest(new URL("/api/supplier-reconciliations", "http://qa.local"), { method: "POST", body: form }));
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const file = () => new File([pdfBytes], "fresh-pantry.pdf", { type: "application/pdf" });
  const ext = await post({ file: file(), action: "extract" });
  const docs = ext.json.interpretation.lines.filter((l) => ["invoice", "credit_note", "debit_note"].includes(l.type));
  const payments = ext.json.interpretation.lines.filter((l) => l.type === "payment");
  check("extract with the AI unavailable still succeeds: reader's reading, every supplier document Needs Review, signed for review", ext.status === 200 && ext.json.interpretation.aiStatus === "no_api_key" && docs.length > 0 && docs.every((l) => l.needsReview) && Boolean(ext.json.reviewToken?.signature));
  check("…payments raise no review item (the AI note is kept as an audit note)", payments.length > 0 && payments.every((l) => !l.needsReview && l.auditNotes.length > 0));
  const m = await post({ action: "match", reviewBody: ext.json.reviewToken.body, reviewSignature: ext.json.reviewToken.signature, supplierName: SUP });
  check("match preview through the route (read-only)", m.status === 200 && m.json.match.summary.documents > 0 && db.tables.vyron_supplier_reconciliations.length === 0);
  const forged = await post({ action: "match", reviewBody: ext.json.reviewToken.body, reviewSignature: "x".repeat(43), supplierName: SUP });
  check("a forged signature is refused by the route (400)", forged.status === 400);
  const ok = await post({ file: file(), action: "approve", approved: "true", digest: ext.json.extraction.digest, supplierName: SUP, reviewBody: ext.json.reviewToken.body, reviewSignature: ext.json.reviewToken.signature });
  check("approve through the route records the run", ok.status === 200 && db.tables.vyron_supplier_reconciliations.length === 1);
  delete process.env.SUPPLIER_STATEMENT_AI;
  const off = await post({ file: file(), action: "extract" });
  check("with the flag off, extract returns no interpretation (unchanged behaviour)", off.status === 200 && !("interpretation" in off.json) && !("reviewToken" in off.json));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
