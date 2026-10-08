#!/usr/bin/env node
/**
 * LOCAL-ONLY golden check of the statement AI on a REAL supplier statement. Never runs in CI:
 * it does nothing unless both are set —
 *   VOLORA_REAL_STATEMENT_PDF=<path to the statement PDF, kept outside the repository>
 *   VOLORA_STATEMENT_AI_LIVE=1          (sends the statement's amount-masked text to OpenAI, store:false)
 * Expectations (VOLORA_STATEMENT_AI_EXPECT, JSON) default to the Gourmet Foods statement:
 *   {"lines":472,"invoice":232,"payment":232,"unallocated_receipt":8}
 * Usage is not written to any database. Needs OPENAI_API_KEY (environment, or .env.local).
 *
 *   VOLORA_REAL_STATEMENT_PDF=… VOLORA_STATEMENT_AI_LIVE=1 npm run test:supplier-statement-ai-live
 */
import { register } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const file = process.env.VOLORA_REAL_STATEMENT_PDF;
if (process.env.VOLORA_STATEMENT_AI_LIVE !== "1" || !file || !existsSync(file)) {
  console.log("NOT RUN: set VOLORA_REAL_STATEMENT_PDF (an existing file) and VOLORA_STATEMENT_AI_LIVE=1 to run the live golden check.");
  process.exit(0);
}
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
register("./support/session-security-test-hook.mjs", import.meta.url);
if (!process.env.OPENAI_API_KEY && existsSync(path.join(ROOT, ".env.local"))) {
  const m = /^OPENAI_API_KEY=(.*)$/m.exec(readFileSync(path.join(ROOT, ".env.local"), "utf8"));
  if (m) process.env.OPENAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}
console.warn = () => {};
let failures = 0;
let checks = 0;
const check = (name, cond, detail = "") => {
  checks++;
  if (!cond) {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const ex = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-supplier-statement-pdf.ts")).href);
const ai = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-supplier-statement-ai.ts")).href);
const expect = { lines: 472, invoice: 232, payment: 232, unallocated_receipt: 8, needsReview: 0, ...(process.env.VOLORA_STATEMENT_AI_EXPECT ? JSON.parse(process.env.VOLORA_STATEMENT_AI_EXPECT) : {}) };
const own = (process.env.VOLORA_OWN_COMPANY || "Handcrafted Food Products (Pty) Ltd").split("|");

const extraction = await ex.extractSupplierStatementPdf(new Uint8Array(readFileSync(file)), { ownCompanyNames: own });
const started = Date.now();
const r = await ai.interpretStatementWithAi(extraction, { companyId: "local-golden", ownCompanyNames: own, deps: { checkAllowance: async () => ({ allowed: true }), recordUsage: async () => null } });
const seconds = ((Date.now() - started) / 1000).toFixed(1);
// Optional local dump of the rows needing review (VOLORA_STATEMENT_AI_DUMP=<file outside the repository>).
if (process.env.VOLORA_STATEMENT_AI_DUMP) (await import("node:fs")).writeFileSync(process.env.VOLORA_STATEMENT_AI_DUMP, JSON.stringify(process.env.VOLORA_STATEMENT_AI_DUMP_FULL === "1" ? { interpretation: r } : { counts: r.counts, metadata: r.metadata, review: r.lines.filter((l) => l.needsReview) }, null, 1));

console.log(`\nReader alone: ${extraction.transactions.length} lines; ${extraction.counts.toReconcile} to reconcile, ${extraction.counts.notReconciled} payments/other, ${extraction.counts.excluded} excluded`);
console.log(`AI: ${r.aiStatus}${r.aiMessage ? ` (${r.aiMessage})` : ""}; model ${r.model}; ${r.usage?.calls} calls, ${r.usage?.inputTokens} in / ${r.usage?.outputTokens} out tokens, ~$${r.usage?.costUsd?.toFixed(3)}; ${seconds}s`);
console.log(`counts: ${JSON.stringify(r.counts)}`);
console.log(`columns: ${r.columns.map((c) => `${c.header}=${c.role}`).join(", ")}`);
console.log(`metadata: ${JSON.stringify(Object.fromEntries(Object.entries(r.metadata).map(([k, v]) => [k, typeof v === "object" ? v.value : v])))}`);
if (r.rejected.length) console.log(`rejected (${r.rejected.length}): ${JSON.stringify(r.rejected.slice(0, 8))}`);
const review = r.lines.filter((l) => l.needsReview);
const reasons = {};
for (const l of review) for (const x of l.reviewReasons) reasons[x.replace(/\d[\d ,.]*/g, "#").slice(0, 90)] = (reasons[x.replace(/\d[\d ,.]*/g, "#").slice(0, 90)] || 0) + 1;
console.log(`needs review: ${review.length} — ${JSON.stringify(reasons)}`);

console.log("");
check("AI interpretation completed for every row", r.aiStatus === "ok" && r.counts.aiLines === extraction.transactions.length, `${r.aiStatus} ${r.aiMessage}`);
check(`${expect.lines} lines`, r.lines.length === expect.lines, String(r.lines.length));
check(`${expect.invoice} invoices`, r.counts.invoice === expect.invoice, String(r.counts.invoice));
check(`${expect.payment} payments`, r.counts.payment === expect.payment, String(r.counts.payment));
check(`${expect.unallocated_receipt} unallocated receipts`, r.counts.unallocated_receipt === expect.unallocated_receipt, String(r.counts.unallocated_receipt));
check("0 invoice lines without a document number", r.counts.invoicesWithoutDocumentNumber === 0, String(r.counts.invoicesWithoutDocumentNumber));
const docCol = r.columns.find((c) => c.role === "documentNumber")?.header;
check("the Invoice column is the document number", /invoice/i.test(docCol || ""), String(docCol));
check("Our Reference is kept as a separate (supplier) reference", r.columns.some((c) => /our ref/i.test(c.header) && c.role === "supplierReference"));
// The Invoice-column value on each row, by position (the reader's own split): every invoice must carry exactly it.
const inColumn = (l) => (ai.splitRowByHeader(extraction.transactions[l.index - 1].cells, extraction.structure.headerCells)?.[docCol] || "").split(" ")[0];
const invoices = r.lines.filter((l) => l.type === "invoice");
const mismatched = invoices.filter((l) => l.documentNumber !== inColumn(l));
check("every invoice's document number is its Invoice-column number (leading zeros kept)", mismatched.length === 0, mismatched.slice(0, 3).map((l) => `#${l.index} ${l.documentNumber} vs ${inColumn(l)}`).join("; "));
const pays = r.lines.filter((l) => l.type === "payment");
const allocated = pays.filter((l) => l.paymentAllocatesDocumentNumber);
const invNos = new Set(invoices.map((l) => l.documentNumber));
console.log(`  --   payments naming the invoice they settle: ${allocated.length}/${pays.length} (${allocated.filter((l) => invNos.has(l.paymentAllocatesDocumentNumber)).length} name an invoice on this statement)`);
check("every payment allocation is read from the Invoice column (deterministic)", allocated.every((l) => l.allocationSource === "column") && pays.filter((l) => !l.paymentAllocatesDocumentNumber).every((l) => Boolean(l.allocationNote)));
check("payment allocations are preserved", allocated.length > 0 && allocated.every((l) => ai.appearsIn(l.sourceText, l.paymentAllocatesDocumentNumber)));
check("dates, amounts and balances are the reader's on every row", r.lines.every((l, i) => l.date === extraction.transactions[i].date && l.debit === extraction.transactions[i].debit && l.credit === extraction.transactions[i].credit && l.balance === extraction.transactions[i].balance));
const mediumOnly = r.lines.filter((l) => l.needsReview && l.reviewReasons.length === 1 && /moderately confident/.test(l.reviewReasons[0]));
check("0 review items caused solely by medium AI confidence", mediumOnly.length === 0, mediumOnly.slice(0, 3).map((l) => `#${l.index} ${l.type}`).join("; "));
check(`${expect.needsReview} review items in total`, r.counts.needsReview === expect.needsReview, String(r.counts.needsReview));
check("no payment or receipt is a review item (not supplier documents)", r.lines.filter((l) => l.needsReview).every((l) => ["invoice", "credit_note", "debit_note"].includes(l.type) || l.reviewReasons.some((x) => /may be a supplier document/.test(x))));
check("every invoice is structurally confirmed by the Invoice column", invoices.every((l) => l.structurallyConfirmed), String(invoices.filter((l) => l.structurallyConfirmed).length));
check("unapplied cash (_CR…) is not flagged; what was observed is kept as an audit note", r.lines.filter((l) => l.type === "unallocated_receipt").every((l) => !l.needsReview && l.auditNotes.length > 0));
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
