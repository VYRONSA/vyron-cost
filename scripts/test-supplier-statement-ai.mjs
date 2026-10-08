#!/usr/bin/env node
/**
 * VOLORA — supplier statement AI interpretation (Phase 1), offline.
 *
 * Replays the model's REAL answers recorded for the synthetic statements
 * (scripts/fixtures/supplier-statement-ai, made by record-supplier-statement-ai-fixtures.mjs from
 * invented data) through the real interpretStatementWithAi, and checks the contract around it:
 * PDF.js stays the source of every date / amount / balance; nothing money-like is sent; every AI
 * identifier must be printed on the row it cites; strict schema + store:false; one retry for 429/5xx;
 * timeouts, budget refusal, outages, invalid JSON and partial answers fall back to the reader's own
 * reading marked Needs Review; usage is recorded under supplier_statement. No network, no database.
 *
 *   npm run test:supplier-statement-ai
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
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
console.warn = () => {};

const pdfs = await import("./support/synthetic-statement-pdfs.mjs");
const ex = await importFromRoot("src/lib/vyron-supplier-statement-pdf.ts");
const ai = await importFromRoot("src/lib/vyron-supplier-statement-ai.ts");
const mt = await importFromRoot("src/lib/vyron-supplier-statement-match.ts");
const fixture = (name) => JSON.parse(readFileSync(path.join(ROOT, "scripts/fixtures/supplier-statement-ai", `${name}.json`), "utf8"));
const withOutput = (response, mutate) => {
  const copy = JSON.parse(JSON.stringify(response));
  const part = copy.output.find((o) => o.type === "message").content.find((p) => p.type === "output_text");
  part.text = typeof mutate === "string" ? mutate : JSON.stringify(mutate(JSON.parse(part.text)));
  return copy;
};

/** fetch that answers from a recorded fixture; `script` can replace or fail specific calls. */
function replay(fx, script = {}) {
  const requests = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const input = JSON.parse(body.input[0].content[0].text);
    const key = body.text.format.name === "supplier_statement_identity" ? "identity" : `rows:${input.rows[0].lineIndex}`;
    requests.push({ url, body, input, key });
    const n = requests.filter((r) => r.key === key).length;
    const override = script[key]?.(n, init);
    if (override) return override;
    const rec = fx.calls.find((c) => c.name === body.text.format.name && (key === "identity" || c.firstLineIndex === input.rows[0].lineIndex));
    if (!rec) throw new Error(`No recorded answer for ${key}`);
    return new Response(JSON.stringify(rec.response), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, requests };
}
const usageLog = [];
const deps = (extra = {}) => ({ apiKey: "test-key", model: "gpt-4o", checkAllowance: async () => ({ allowed: true }), recordUsage: async (u) => usageLog.push(u), retryDelayMs: 1, timeoutMs: 5000, ...extra });
const OWN = [pdfs.OWN_COMPANY];
const extract = (name) => ex.extractSupplierStatementPdf(pdfs[name](), { ownCompanyNames: OWN });

// ---------------------------------------------------------------------------
section("1. Invoice + Our Reference statement (structure of the real supplier statement, invented data)");
const H = await extract("layoutInvoiceAndOurReference");
{
  check("the reader alone: row 1 (text ran together) has no reference and is excluded", H.transactions[0].status === "EXCLUDED" && !H.transactions[0].reference);
  check("the reader alone: row 7 takes 'Our Reference' as its reference", H.transactions[6].reference === "000000000010902");
  usageLog.length = 0;
  const { fetch, requests } = replay(fixture("layoutInvoiceAndOurReference"));
  const r = await ai.interpretStatementWithAi(H, { companyId: "co-1", userId: "u-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  const col = (h) => r.columns.find((c) => c.header === h)?.role;
  check("AI interpretation completed", r.aiStatus === "ok" && r.counts.aiLines === 8 && r.counts.readerLines === 0, `${r.aiStatus} ${r.aiMessage}`);
  check("Invoice column = documentNumber; Our Reference = supplierReference (separate roles)", col("Invoice") === "documentNumber" && col("Our Reference") === "supplierReference");
  check("5 invoices, 2 payments, 1 unallocated receipt, nothing unknown", r.counts.invoice === 5 && r.counts.payment === 2 && r.counts.unallocated_receipt === 1 && r.counts.unknown === 0, JSON.stringify(r.counts));
  check("0 invoices without a document number (the reader excluded 1)", r.counts.invoicesWithoutDocumentNumber === 0);
  const inv = r.lines.filter((l) => l.type === "invoice");
  check("every invoice keyed on its Invoice-column number, leading zeros kept", inv.map((l) => l.documentNumber).join(",") === "000000000002005,000000000002004,000000000002003,000000000002002,000000000002001", inv.map((l) => l.documentNumber).join(","));
  check("…with Our Reference kept as a secondary reference", inv.every((l) => l.secondaryReferences.length === 1 && /^0000000000109/.test(l.secondaryReferences[0])));
  check("row 1 (run-together text) is now an invoice with number and reference", r.lines[0].type === "invoice" && r.lines[0].documentNumber === "000000000002005" && r.lines[0].secondaryReferences[0] === "000000000010905" && !r.lines[0].needsReview);
  check("row 7: document number from the Invoice column, not Our Reference", r.lines[6].documentNumber === "000000000002002" && r.lines[6].secondaryReferences[0] === "000000000010902");
  const pays = r.lines.filter((l) => l.type === "payment");
  check("payments name the invoice they settle", pays.map((l) => l.paymentAllocatesDocumentNumber).join(",") === "000000000002001,000000000002002", JSON.stringify(pays.map((l) => l.paymentAllocatesDocumentNumber)));
  const un = r.lines.find((l) => l.type === "unallocated_receipt");
  check("'Unapplied cash' (R 0,00, balance moves) is an unallocated receipt, flagged for review", un.direction === "none" && un.needsReview && un.reviewReasons.some((x) => /Unallocated receipt: no amount is printed/.test(x)) && un.paymentAllocatesDocumentNumber === null && un.documentNumber === "_CR00002");
  check("only the unallocated receipt needs review", r.counts.needsReview === 1);
  check("dates, amounts and balances are the reader's on every row", r.lines.every((l, i) => l.date === H.transactions[i].date && l.debit === H.transactions[i].debit && l.credit === H.transactions[i].credit && l.balance === H.transactions[i].balance));
  check("supplier name not invented (logo only); email and website read from the text", r.metadata.supplierName.value === null && r.metadata.supplierEmail.value === "accounts@freshpantry.example" && r.metadata.supplierWebsite.value === "www.freshpantry.example");
  check("the account with the supplier is the customer's account, not the bank account", r.metadata.supplierAccountNumber.value !== "62-1234-5678", JSON.stringify(r.metadata.supplierAccountNumber));
  check("ordering newest-first (agrees with the row dates)", r.metadata.ordering === "newest_first");
  check("no amount was sent to the AI (only {amount} placeholders)", requests.every((q) => ex.findAmounts(q.body.input[0].content[0].text.replace(/\\"/g, '"')).length === 0) && requests.some((q) => q.body.input[0].content[0].text.includes("{amount}")));
  check("store:false, strict JSON schema, temperature 0 on every call", requests.every((q) => q.body.store === false && q.body.text.format.type === "json_schema" && q.body.text.format.strict === true && q.body.temperature === 0));
  check("the schemas have no field for a date value, amount or balance", !/debit|credit|amount|balance|total/i.test(JSON.stringify(Object.keys(ai.LINES_SCHEMA.properties.transactions.items.properties))) && !/amount|balance|total/i.test(Object.keys(ai.STATEMENT_SCHEMA.properties).join(",")));
  const u = usageLog[0];
  check("usage recorded once under supplier_statement (tokens, provider, model, tenant)", usageLog.length === 1 && u.featureId === "supplier_statement" && u.productId === "vyron_cost" && u.provider === "openai" && u.model === "gpt-4o" && u.companyId === "co-1" && u.userId === "u-1" && u.totalTokens > 0 && u.success === true, JSON.stringify(u));
  check("cost of the interpretation is reported", r.usage.calls === 2 && r.usage.costUsd > 0);
}

// ---------------------------------------------------------------------------
section("2. Other layouts (recorded answers)");
for (const [name, expect] of [
  ["layoutClassic", { invoice: 4, credit_note: 1, payment: 1 }],
  ["layoutErp", { invoice: 2, credit_note: 1, payment: 1, journal: 1 }],
  ["layoutWholesaler", { invoice: 3, payment: 1 }],
  ["layoutHeaderless", { invoice: 2, payment: 1 }],
  ["layoutMonthFirst", { invoice: 2, payment: 1, unknown: 1 }],
]) {
  const e = await extract(name);
  const { fetch } = replay(fixture(name));
  const r = await ai.interpretStatementWithAi(e, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  const got = Object.fromEntries(Object.entries(expect).map(([k]) => [k, r.counts[k]]));
  check(`${name}: ${JSON.stringify(expect)}`, r.aiStatus === "ok" && JSON.stringify(got) === JSON.stringify(expect), `${r.aiStatus} ${JSON.stringify(r.counts)}`);
  check(`${name}: every AI identifier is printed on its row`, r.lines.every((l) => [l.documentNumber, ...l.secondaryReferences, l.paymentAllocatesDocumentNumber].filter(Boolean).every((v) => ai.appearsIn(l.sourceText, v))));
}
{
  const e = await extract("layoutMonthFirst");
  const { fetch } = replay(fixture("layoutMonthFirst"));
  const r = await ai.interpretStatementWithAi(e, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  const misc = r.lines.find((l) => /Misc/.test(l.sourceText));
  check("an undescribed credit ('Misc') is unknown and needs review — not guessed as a payment", misc.type === "unknown" && misc.needsReview);
  check("month-first statement date read by the reader's rules (10/31/2026 → 2026-10-31)", r.metadata.statementDate.value === "2026-10-31");
}

// ---------------------------------------------------------------------------
section("3. Contract: the AI cannot introduce values");
const fxH = fixture("layoutInvoiceAndOurReference");
const rowsResponse = fxH.calls.find((c) => c.name === "supplier_statement_rows").response;
const identityResponse = fxH.calls.find((c) => c.name === "supplier_statement_identity").response;
{
  const { fetch } = replay(fxH, {
    "rows:1": () =>
      new Response(
        JSON.stringify(
          withOutput(rowsResponse, (j) => {
            j.transactions[1].documentNumberCell = "INV-999999"; // not on the row
            j.transactions[4].documentNumberCell = "R 650,50"; // an amount
            j.transactions[2].type = "invoice"; // a credit row
            j.transactions[7].secondaryReferenceCells = ["0000000000109"]; // part of a longer number
            return j;
          })
        ),
        { status: 200 }
      ),
  });
  const r = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  check("an identifier not printed on the row is rejected", r.rejected.some((x) => x.lineIndex === 2 && x.value === "INV-999999") && r.lines[1].documentNumber === null && r.lines[1].needsReview);
  check("…and an identified invoice without a number is Needs Review, not excluded", r.lines[1].type === "invoice" && r.lines[1].reviewReasons.some((x) => /no document number is printed/.test(x)));
  check("an amount offered as a document number is rejected", r.rejected.some((x) => x.lineIndex === 5 && /date or amount/.test(x.reason)) && r.lines[4].documentNumber === null);
  check("a type that contradicts the row's direction is Needs Review", r.lines[2].needsReview && r.lines[2].reviewReasons.some((x) => /but the row is a credit/.test(x)));
  check("part of a longer number is not accepted as a reference", r.lines[7].secondaryReferences.length === 0 && r.rejected.some((x) => x.lineIndex === 8));
}
{
  const { fetch } = replay(fxH, {
    identity: () =>
      new Response(
        JSON.stringify(
          withOutput(identityResponse, (j) => {
            j.supplierName = "Invented Foods Ltd";
            j.supplierAccountNumber = "62-1234-5678"; // the bank account in the banking details
            j.columns.push({ header: "Ghost", role: "other" });
            j.columns.find((c) => c.header === "Our Reference").role = "documentNumber";
            return j;
          })
        ),
        { status: 200 }
      ),
  });
  const r = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  check("a supplier name not written in the statement is rejected", r.metadata.supplierName.value === null && r.rejected.some((x) => x.field === "supplierName"));
  check("a bank account number is never taken as the account with the supplier", r.metadata.supplierAccountNumber.value === null && r.rejected.some((x) => x.field === "supplierAccountNumber" && /bank account/.test(x.reason)));
  check("a column heading that does not exist is rejected", r.rejected.some((x) => x.field === "columns" && x.value === "Ghost"));
  check("two document-number columns → neither is trusted", !r.columns.some((c) => c.role === "documentNumber") && r.rejected.some((x) => /More than one column/.test(x.reason)));
}

// ---------------------------------------------------------------------------
section("3b. Structural confirmation: the document's own evidence outranks AI confidence");
{
  const allMedium = (j) => ({ transactions: j.transactions.map((t) => ({ ...t, confidence: "medium" })) });
  const { fetch } = replay(fxH, { "rows:1": () => new Response(JSON.stringify(withOutput(rowsResponse, allMedium)), { status: 200 }) });
  const r = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch }) });
  const invoices = r.lines.filter((l) => l.type === "invoice");
  check("structurally confirmed invoices with AI 'medium' confidence are NOT Needs Review", invoices.length === 5 && invoices.every((l) => l.structurallyConfirmed && !l.needsReview), JSON.stringify(invoices.map((l) => [l.index, l.structurallyConfirmed, l.reviewReasons])));
  check("…and keep 'medium' for audit", invoices.every((l) => l.confidence === "medium"));
  check("medium confidence on rows that are not structurally confirmed (payments) still needs review", r.lines.filter((l) => l.type === "payment").every((l) => l.needsReview && l.reviewReasons.some((x) => /moderately confident/.test(x))));
  check("the unallocated receipt still needs review", r.lines.find((l) => l.type === "unallocated_receipt").needsReview);
  const { fetch: f2 } = replay(fxH, {
    "rows:1": () =>
      new Response(
        JSON.stringify(
          withOutput(rowsResponse, (j) => {
            const t = allMedium(j).transactions;
            t[1].documentNumberCell = "000000000010904"; // its Our Reference — printed, but not under "Invoice"
            t[2].type = "invoice"; // a credit row called an invoice
            return { transactions: t };
          })
        ),
        { status: 200 }
      ),
  });
  const r2 = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: f2 }) });
  check("a number taken from outside the Invoice column is not structurally confirmed → Needs Review", !r2.lines[1].structurallyConfirmed && r2.lines[1].needsReview && r2.lines[1].reviewReasons.some((x) => /not under the "Invoice" heading/.test(x)));
  check("contradictory evidence (invoice on a credit row) stays Needs Review", !r2.lines[2].structurallyConfirmed && r2.lines[2].needsReview && r2.lines[2].reviewReasons.some((x) => /but the row is a credit/.test(x)));
  check("high confidence is unaffected: the recorded answer still gives exactly 1 review item (the unallocated receipt)", (await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: replay(fxH).fetch }) })).counts.needsReview === 1);
}

// ---------------------------------------------------------------------------
section("3c. Payment allocation is read from the document-number column, not inferred");
{
  // The recorded statement: allocations come from the Invoice cell of each payment row.
  const base = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: replay(fxH).fetch }) });
  const pays = base.lines.filter((l) => l.type === "payment");
  check("payment allocations come from the Invoice cell (000000000002001, 000000000002002)", pays.map((l) => `${l.paymentAllocatesDocumentNumber}/${l.allocationSource}`).join() === "000000000002001/column,000000000002002/column");
  check("…and are recognised as invoices on this statement", pays.every((l) => l.allocationKind === "invoice_on_statement"));
  // The same statement with the AI answering the allocations differently each time.
  const variant = (mutate) => ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: replay(fxH, { "rows:1": () => new Response(JSON.stringify(withOutput(rowsResponse, (j) => (mutate(j.transactions), j))), { status: 200 }) }).fetch }) });
  const runs = [
    base,
    await variant((t) => (t[2].paymentAllocatesDocumentNumber = null)),
    await variant((t) => ((t[2].paymentAllocatesDocumentNumber = "INV-404"), (t[5].paymentAllocatesDocumentNumber = null))),
    await variant((t) => (t[5].paymentAllocatesDocumentNumber = "000000000010902")),
  ];
  const sig = (r) => r.lines.map((l) => l.paymentAllocatesDocumentNumber || "-").join(",");
  check("the same statement gives the same allocations however the AI answers", runs.every((r) => sig(r) === sig(base)), runs.map(sig).join(" | "));
  check("an AI allocation that is not printed (INV-404) is rejected and replaced by the column value", runs[2].rejected.some((x) => x.value === "INV-404") && runs[2].lines[2].paymentAllocatesDocumentNumber === "000000000002001");

  // A statement with both columns on payment rows: Our Reference is never the allocation.
  const header = [
    { text: "Date", x0: 17, x1: 37 },
    { text: "Invoice", x0: 74, x1: 105 },
    { text: "Description", x0: 158, x1: 208 },
    { text: "Our Reference", x0: 260, x1: 322 },
    { text: "Debit", x0: 409, x1: 431 },
    { text: "Credit", x0: 479, x1: 505 },
    { text: "Balance", x0: 543, x1: 578 },
  ];
  const tx = (index, invoice, desc, ourRef, credit, balance) => {
    const cells = [{ text: "05/09/2026", x0: 17, x1: 57 }, ...(invoice ? [{ text: invoice, x0: 74, x1: 132 }] : []), { text: desc, x0: 158, x1: 200 }, ...(ourRef ? [{ text: ourRef, x0: 260, x1: 318 }] : []), { text: `-R ${credit},00`, x0: 470, x1: 505 }, { text: `R ${balance},00`, x0: 540, x1: 578 }];
    return { index, page: 1, date: "2026-09-05", dateText: "05/09/2026", dueDate: null, reference: null, description: desc, typeText: null, type: "PAYMENT", debit: 0, credit, balance, status: "NOT_RECONCILED", flags: [], sourceText: cells.map((c) => c.text).join("  "), cells };
  };
  const crafted = { ...H, transactions: [tx(1, "000000000003001", "Payment", "000000000013001", 100, 900), tx(2, null, "Payment", "000000000013002", 50, 850), tx(3, "_CR00009", "Payment", null, 40, 810), { ...tx(4, "_CR00009", "Unapplied cash", null, 0, 860), credit: 0 }], structure: { headerCells: header, contextLines: [] }, digest: "crafted", fileSha256: "crafted" };
  const answer = (rows) => new Response(JSON.stringify({ status: "completed", usage: { input_tokens: 10, output_tokens: 10 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(rows) }] }] }), { status: 200 });
  const craftedFetch = async (_u, init) => {
    const name = JSON.parse(init.body).text.format.name;
    if (name === "supplier_statement_identity")
      return answer({ supplierName: null, supplierEmail: null, supplierWebsite: null, supplierVatNumber: null, supplierAccountNumber: null, statementDate: null, periodFrom: null, periodTo: null, currency: null, ordering: "unknown", columns: header.map((h) => ({ header: h.text, role: { Date: "date", Invoice: "documentNumber", Description: "description", "Our Reference": "supplierReference", Debit: "debit", Credit: "credit", Balance: "balance" }[h.text] })) });
    const row = (i, alloc) => ({ lineIndex: i, type: "payment", documentNumberCell: null, secondaryReferenceCells: [], paymentAllocatesDocumentNumber: alloc, descriptionMeaning: "Payment", evidence: "Credit, 'Payment'", confidence: "high" });
    // The AI (wrongly) offers the Our Reference value as the allocation on both rows.
    return answer({ transactions: [row(1, "000000000013001"), row(2, "000000000013002"), row(3, null), { ...row(4, null), type: "unallocated_receipt", documentNumberCell: "_CR00009" }] });
  };
  const c = await ai.interpretStatementWithAi(crafted, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: craftedFetch }) });
  check("Invoice column beats Our Reference: the payment settles 000000000003001, not its Our Reference", c.lines[0].paymentAllocatesDocumentNumber === "000000000003001" && c.lines[0].allocationSource === "column" && c.rejected.some((x) => x.value === "000000000013001"));
  check("a payment with no Invoice value has no allocation (Our Reference is not used) and says why", c.lines[1].paymentAllocatesDocumentNumber === null && /No document number under "Invoice"/.test(c.lines[1].allocationNote || "") && c.rejected.some((x) => x.value === "000000000013002"));
  check("…and an unallocated payment is not a review exception on its own", !c.lines[1].needsReview);
  check("a payment whose Invoice cell holds an unallocated receipt's reference is labelled a receipt, not an invoice", c.lines[2].paymentAllocatesDocumentNumber === "_CR00009" && c.lines[2].allocationKind === "receipt" && /not an invoice/.test(c.lines[2].allocationNote || ""));
  const cm = mt.matchInterpretedStatement(c, [], "Any Supplier");
  check("…and is not counted as a payment settling an invoice", cm.summary.paymentsWithAllocation === 1);
}

// ---------------------------------------------------------------------------
section("4. Contract: failures fall back to the reader, marked Needs Review");
const allReader = (r) => r.lines.length === H.transactions.length && r.lines.every((l, i) => l.typeSource === "reader" && l.needsReview && l.debit === H.transactions[i].debit);
{
  const bad = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: replay(fxH, { identity: () => new Response(JSON.stringify(withOutput(identityResponse, "this is not json")), { status: 200 }) }).fetch }) });
  check("invalid JSON → invalid_response, every row from the reader, Needs Review", bad.aiStatus === "invalid_response" && allReader(bad), bad.aiStatus);
  const wrongShape = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: replay(fxH, { "rows:1": () => new Response(JSON.stringify(withOutput(rowsResponse, () => ({ rows: [] }))), { status: 200 }) }).fetch }) });
  check("rows answer in the wrong shape → rows fall back to the reader", wrongShape.aiStatus === "invalid_response" && wrongShape.lines.every((l) => l.typeSource === "reader"));
  usageLog.length = 0;
  let called = 0;
  const budget = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ checkAllowance: async () => ({ allowed: false, status: "blocked" }), fetch: async () => (called++, new Response("{}")) }) });
  check("allowance used up (402) → budget_exceeded, no AI call, nothing charged", budget.aiStatus === "budget_exceeded" && called === 0 && usageLog.length === 0 && allReader(budget));
  const down = replay(fxH, { identity: () => new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 503 }) });
  const r503 = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: down.fetch }) });
  check("provider 503 → retried once, then provider_unavailable with the reader's rows", r503.aiStatus === "provider_unavailable" && down.requests.filter((q) => q.key === "identity").length === 2 && allReader(r503));
  const flaky = replay(fxH, { identity: (n) => (n === 1 ? new Response(JSON.stringify({ error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }), { status: 429 }) : null) });
  const r429 = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: flaky.fetch }) });
  check("429 once → one retry succeeds", r429.aiStatus === "ok" && flaky.requests.filter((q) => q.key === "identity").length === 2);
  const once400 = replay(fxH, { identity: () => new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 }) });
  await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: once400.fetch }) });
  check("a 400 is not retried", once400.requests.filter((q) => q.key === "identity").length === 1);
  const hang = async (_u, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const slow = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: hang, timeoutMs: 30 }) });
  check("no answer within the timeout → timeout, reader's rows", slow.aiStatus === "timeout" && allReader(slow));
  const parts = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ fetch: async (u, i) => (JSON.parse(i.body).text.format.name === "supplier_statement_rows" && JSON.parse(JSON.parse(i.body).input[0].content[0].text).rows[0].lineIndex === 5 ? new Response("{}", { status: 500 }) : replayHalf(u, i)), batchSize: 4 }) });
  check("one batch failing → partial: those rows from the reader, the rest from the AI", parts.aiStatus === "partial" && parts.lines.slice(0, 4).every((l) => l.typeSource === "ai") && parts.lines.slice(4).every((l) => l.typeSource === "reader" && l.needsReview), parts.aiStatus);
  const noKey = await ai.interpretStatementWithAi(H, { companyId: "co-1", ownCompanyNames: OWN, deps: deps({ apiKey: undefined, fetch: async () => (called++, new Response("{}")) }) });
  check("no API key → no_api_key, no call", noKey.aiStatus === "no_api_key" && allReader(noKey));
  check("statement AI is off unless SUPPLIER_STATEMENT_AI=on", ai.statementAiEnabled() === (process.env.SUPPLIER_STATEMENT_AI === "on"));
}

// A replay for the 4-row batching case: answers each batch from the recorded full answer.
async function replayHalf(_url, init) {
  const body = JSON.parse(init.body);
  if (body.text.format.name === "supplier_statement_identity") return new Response(JSON.stringify(identityResponse), { status: 200 });
  const wanted = new Set(JSON.parse(body.input[0].content[0].text).rows.map((r) => r.lineIndex));
  return new Response(JSON.stringify(withOutput(rowsResponse, (j) => ({ transactions: j.transactions.filter((t) => wanted.has(t.lineIndex)) }))), { status: 200 });
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
