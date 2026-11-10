#!/usr/bin/env node
/**
 * Duplicate supplier invoice review rules (pure): grouping, original vs duplicate, last active copy
 * protected, posted/paid/stock-referenced/document copies blocked, delete only for clean drafts.
 *   npm run test:duplicate-invoice-resolution
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const m = await import(pathToFileURL(path.join(ROOT, "src/lib/vyron-supplier-invoice-duplicates.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`); };

const inv = (id, extra = {}) => ({
  id, invoice_number: "INV-1", supplier_id: "s", supplier_name: "Gourmet", invoice_date: "2026-11-01", status: "Captured", source_type: "import", file_name: null,
  duplicate_risk: true, matched_po_id: null, subtotal: 100, vat: 15, total: 115, notes: null, created_at: `2026-11-0${id.slice(-1)}T08:00:00Z`, updated_at: null,
  origin: "register", href: `/supplier-invoices/${id}`, ...extra,
});

console.log("grouping");
const g = m.buildDuplicateGroups(
  [inv("a1"), inv("a2"), inv("a3", { status: "Posted" }), inv("x1", { invoice_number: "OTHER" }), inv("b1", { invoice_number: "inv-2" }), inv("b2", { invoice_number: "INV-2", status: "Cancelled" })],
  { a1: 3, a2: 3 },
  { a2: 0 }
);
const A = g.find((x) => x.invoiceNumber === "INV-1");
check("single invoice is not a group", !g.some((x) => x.invoiceNumber === "OTHER"));
check("first captured active copy is the original", A.rows.find((r) => r.id === "a1").role === "original");
check("later copies are duplicates", A.rows.find((r) => r.id === "a2").role === "duplicate");
check("posted copy cannot be voided", A.rows.find((r) => r.id === "a3").canVoid === false && /reverse the posting/.test(A.rows.find((r) => r.id === "a3").blockedReason));
check("clean captured duplicate can be voided and deleted", A.rows.find((r) => r.id === "a2").canVoid && A.rows.find((r) => r.id === "a2").canDelete);
check("line counts carried", A.rows.find((r) => r.id === "a1").lineCount === 3);
const B = g.find((x) => x.invoiceNumber.toUpperCase() === "INV-2");
check("group with one active copy is resolved", B && B.resolved === true);
check("voided copy is marked voided", B.rows.find((r) => r.id === "b2").role === "voided" && !B.rows.find((r) => r.id === "b2").canVoid);
check("last active copy can never be voided", B.rows.find((r) => r.id === "b1").canVoid === false && /only active copy/.test(B.rows.find((r) => r.id === "b1").blockedReason));
check("unresolved groups listed first", g[0].resolved === false);

console.log("dependencies");
const d = m.buildDuplicateGroups(
  [inv("c1"), inv("c2", { matched_po_id: "po" }), inv("c3"), inv("c4", { origin: "document", status: "Approved" }), inv("c5", { status: "Paid" }), inv("c6", { status: "Approved" })],
  {},
  { c3: 2 }
)[0];
const r = (id) => d.rows.find((x) => x.id === id);
check("PO-matched copy can be voided but not deleted", r("c2").canVoid && !r("c2").canDelete);
check("stock-referenced copy blocked", !r("c3").canVoid && /Stock movements/.test(r("c3").blockedReason));
check("Invoice Intelligence document never changed here", !r("c4").canVoid && /document/.test(r("c4").blockedReason));
check("paid copy blocked", !r("c5").canVoid);
check("approved (not draft) copy: void yes, delete no", r("c6").canVoid && !r("c6").canDelete);
check("dependencies listed for the reviewer", r("c3").dependencies.some((x) => /stock movement/.test(x)) && r("c2").dependencies.some((x) => /purchase order/.test(x)));

console.log("comparison flags");
const diff = m.buildDuplicateGroups([inv("d1"), inv("d2", { total: 230, invoice_date: "2026-11-05" })], {}, {})[0];
check("differing amounts and dates are flagged", diff.amountsDiffer && diff.datesDiffer);
const same = m.buildDuplicateGroups([inv("e1"), inv("e2")], {}, {})[0];
check("identical copies not flagged as different", !same.amountsDiffer && !same.datesDiffer);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
