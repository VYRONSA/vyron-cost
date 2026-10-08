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
const line = (index, over = {}) => ({ index, page: 1, date: "2026-09-10", debit: 100, credit: 0, balance: null, direction: "debit", type: "invoice", typeSource: "ai", documentNumber: null, secondaryReferences: [], paymentAllocatesDocumentNumber: null, descriptionMeaning: null, evidence: null, confidence: "high", structurallyConfirmed: false, balanceMovement: null, needsReview: false, reviewReasons: [], sourceText: "", ...over });
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
  check("matched number with a different amount → amount differs", r4.lines[0].status === "TOTAL_DIFFERENCE" && r4.lines[0].difference === 20);
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
  check("no number printed, exactly one VOLORA invoice with this amount within 7 days, unique both ways → matched (confirm)", r.lines[0].status === "MATCHED" && r.lines[0].method === "amount_date" && /confirm/.test(r.lines[0].note));
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
  check("2003: matched, R0.50 difference reported", at(5).status === "TOTAL_DIFFERENCE" && at(5).difference === 0.5);
  check("2002: VOLORA holds 2002 and 02002 → Needs Review", at(7).status === "NEEDS_REVIEW" && at(7).candidates === 2);
  check("2001: not in VOLORA by number, matched by its Our Reference = PO 10901", at(8).status === "MATCHED" && at(8).method === "reference" && at(8).voloraId === "vpo");
  check("payments and the unallocated receipt are not matched against invoices", [3, 4, 6].every((i) => at(i).status === "NOT_RECONCILED"));
  check("VOLORA invoice in the period but not on the statement is reported", r.notOnStatement.map((c) => c.id).join() === "vextra");
  check("summary counts", r.summary.matched === 3 && r.summary.totalDifferences === 1 && r.summary.needsReview === 1 && r.summary.paymentsWithAllocation === 2 && r.summary.unallocatedReceipts === 1, JSON.stringify(r.summary));
  const other = mt.matchInterpretedStatement(interpretation, voloraRegister, "Some Other Supplier");
  check("the supplier is the one the user confirmed — never the AI's suggestion (other supplier → nothing matches)", other.summary.matched === 0 && other.lines.filter((l) => l.status === "MISSING_IN_VOLORA").length === 5);
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
  check("…the VOLORA invoice not on the statement", lines.some((l) => l.status === "NOT_ON_SUPPLIER_DOCUMENT" && l.invoice_number === "2999"));
  const summary = db.tables.vyron_supplier_reconciliations[0].summary;
  check("payment allocations kept as statement evidence", summary.statement.paymentAllocations.map((p) => p.settles).join() === "000000000002001,000000000002002");
  check("the unallocated receipt kept with its balance impact, and as a review item", summary.statement.unallocatedReceipts.length === 1 && summary.statement.unallocatedReceipts[0].balanceMovement === 250 && summary.statement.reviewItems.some((x) => x.type === "unallocated_receipt"));
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
  check("extract with the AI unavailable still succeeds: reader's reading, every row Needs Review, signed for review", ext.status === 200 && ext.json.interpretation.aiStatus === "no_api_key" && ext.json.interpretation.lines.every((l) => l.needsReview) && Boolean(ext.json.reviewToken?.signature));
  const m = await post({ action: "match", reviewBody: ext.json.reviewToken.body, reviewSignature: ext.json.reviewToken.signature, supplierName: SUP });
  check("match preview through the route (read-only)", m.status === 200 && m.json.match.summary.statementInvoices > 0 && db.tables.vyron_supplier_reconciliations.length === 0);
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
