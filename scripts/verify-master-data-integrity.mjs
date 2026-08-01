#!/usr/bin/env node
/**
 * VYRON COST — Product Gap Resolution Phase 0 verification.
 *
 * Verifies the deterministic logic delivered by Phase 0:
 *   - the standards-compliant CSV parser
 *   - the Supplier Resolution matching hierarchy
 *   - layered duplicate invoice detection
 *
 * Family A under the Repository Safety Programme: no database, no credentials,
 * no network, no application server. It imports the production modules directly
 * so it tests the shipped logic rather than a copy of it.
 *
 *   node scripts/verify-master-data-integrity.mjs
 *
 * Exits 0 on pass, 1 on failure.
 */

import {
  parseDelimitedText,
  parseDelimitedTable,
  neutraliseFormulaInjection,
  detectDelimiter,
  stripBom,
} from "../src/lib/vyron-csv-parser.ts";
import {
  exactNameKey,
  normalisedNameKey,
  normalisedVatKey,
  nameSimilarity,
  matchSupplierInIndex,
} from "../src/lib/vyron-supplier-resolution.ts";
import {
  evaluateDuplicateLayers,
  computeDocumentHash,
} from "../src/lib/vyron-duplicate-invoice-detection.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

// ── 1. CSV parser — the defects that motivated the replacement ──────────────
const embedded = parseDelimitedText('supplier_name,category\n"Acme Foods, Ltd",Protein\n');
check("embedded comma inside quotes stays one field", embedded[1][0] === "Acme Foods, Ltd", JSON.stringify(embedded[1]));
check("field after an embedded comma is not shifted", embedded[1][1] === "Protein", JSON.stringify(embedded[1]));

const escaped = parseDelimitedText('name\n"He said ""hello"""\n');
check("escaped quotes collapse to one", escaped[1][0] === 'He said "hello"', JSON.stringify(escaped[1]));

const bom = parseDelimitedTable("﻿supplier_name,category\nAcme,Protein\n");
check("UTF-8 BOM stripped from first header", bom.header[0] === "supplier_name", JSON.stringify(bom.header));
check("stripBom is idempotent on clean input", stripBom("abc") === "abc");

const multiline = parseDelimitedText('name,note\n"Acme","line one\nline two"\n');
check("quoted newline stays within one record", multiline.length === 2, `records=${multiline.length}`);
check("quoted newline preserved in value", multiline[1][1] === "line one\nline two", JSON.stringify(multiline[1][1]));

const empties = parseDelimitedText("a,b,c\n1,,3\n");
check("empty column preserved, not dropped", empties[1].length === 3 && empties[1][1] === "", JSON.stringify(empties[1]));

const crlf = parseDelimitedText("a,b\r\n1,2\r\n");
check("CRLF line endings handled", crlf.length === 2 && crlf[1][1] === "2", JSON.stringify(crlf));
const cr = parseDelimitedText("a,b\r1,2\r");
check("bare CR line endings handled", cr.length === 2 && cr[1][1] === "2", JSON.stringify(cr));

const noTrailingNewline = parseDelimitedText("a,b\n1,2");
check("missing trailing newline still yields the last record", noTrailingNewline.length === 2);

check("semicolon delimiter detected", detectDelimiter("a;b;c\n1;2;3") === ";");
check("tab delimiter detected", detectDelimiter("a\tb\n1\t2") === "\t");
check("comma is the default when no delimiter is present", detectDelimiter("abc\ndef") === ",");

const blankRow = parseDelimitedTable("a,b\n1,2\n,\n3,4\n");
check("blank row is reported, not silently dropped", blankRow.rows.filter((r) => r.isBlank).length === 1, JSON.stringify(blankRow.rows.map((r) => r.isBlank)));
check("line numbers account for the header", blankRow.rows[0].lineNumber === 2 && blankRow.rows[2].lineNumber === 4);

// Formula injection
check("equals prefix neutralised", neutraliseFormulaInjection("=1+1") === "'=1+1");
check("plus prefix neutralised", neutraliseFormulaInjection("+SUM(A1)") === "'+SUM(A1)");
check("at prefix neutralised", neutraliseFormulaInjection("@SUM(A1)") === "'@SUM(A1)");
check("tab prefix neutralised", neutraliseFormulaInjection("\t=1+1") === "'\t=1+1");
check("cmd injection neutralised", neutraliseFormulaInjection('=cmd|\' /c calc\'!A1').startsWith("'"));
check("NEGATIVE NUMBER IS NOT corrupted", neutraliseFormulaInjection("-12.5") === "-12.5");
check("negative integer is not corrupted", neutraliseFormulaInjection("-3") === "-3");
check("non-numeric minus IS neutralised", neutraliseFormulaInjection("-SUM(A1)") === "'-SUM(A1)");
check("ordinary value untouched", neutraliseFormulaInjection("Acme Foods") === "Acme Foods");
const injected = parseDelimitedText("name\n=HYPERLINK(1)\n");
check("formula neutralised through the parser", injected[1][0].startsWith("'"), injected[1][0]);
// Header names round-trip to their literal value: neutralisation adds a leading
// apostrophe, header processing removes it. The character itself is never lost,
// otherwise a column would silently fail to match its template.
check("header name round-trips through neutralisation", parseDelimitedTable("=name,b\n1,2\n").header[0] === "=name", parseDelimitedTable("=name,b\n1,2\n").header[0]);
check("ordinary header is unaffected", parseDelimitedTable("supplier_name,b\n1,2\n").header[0] === "supplier_name");

// ── 2. Supplier Resolution — matching hierarchy ─────────────────────────────
check("exact key is case and whitespace insensitive", exactNameKey("  Acme   Foods ") === "acme foods");
check("Pty Ltd suffix removed", normalisedNameKey("Acme Foods (Pty) Ltd") === "acme foods", normalisedNameKey("Acme Foods (Pty) Ltd"));
check("Limited suffix removed", normalisedNameKey("Acme Foods Limited") === "acme foods");
check("CC suffix removed", normalisedNameKey("Acme Foods CC") === "acme foods");
check("trailing punctuation removed", normalisedNameKey("Acme Foods, Ltd.") === "acme foods");
check("ampersand normalised", normalisedNameKey("Smith & Sons") === normalisedNameKey("Smith and Sons"));
check("leading 'the' removed", normalisedNameKey("The Acme Group") === "acme");
check("VAT key ignores spaces and slashes", normalisedVatKey("4123 456/789") === "4123456789");
check("distinct names are not equal", normalisedNameKey("Acme Foods") !== normalisedNameKey("Acme Feeds"));

check("identical names score 1", nameSimilarity("Acme Foods", "Acme Foods") === 1);
check("legal-suffix variants score 1", nameSimilarity("Acme Foods Pty Ltd", "Acme Foods") === 1);
check("one-character typo scores high", nameSimilarity("Acme Foods", "Acme Food") > 0.85);
check("unrelated names score low", nameSimilarity("Acme Foods", "Zenith Packaging") < 0.4);

function index(rows) {
  const byVat = new Map();
  const byExactName = new Map();
  const byNormalisedName = new Map();
  for (const row of rows) {
    const vat = normalisedVatKey(row.vat_number);
    if (vat) byVat.set(vat, row);
    byExactName.set(exactNameKey(row.supplier_name), row);
    byNormalisedName.set(normalisedNameKey(row.supplier_name), row);
  }
  return { byVat, byExactName, byNormalisedName, all: rows };
}

const suppliers = index([
  { id: "s1", supplier_name: "Acme Foods (Pty) Ltd", vat_number: "4123456789" },
  { id: "s2", supplier_name: "Zenith Packaging", vat_number: null },
]);

check(
  "TIER 1 — VAT match wins even when the name differs",
  matchSupplierInIndex(suppliers, { supplierName: "Completely Different Name", vatNumber: "4123 456 789" }).tier === "vat"
);
check(
  "TIER 1 — matched row is the VAT holder",
  matchSupplierInIndex(suppliers, { supplierName: "Whatever", vatNumber: "4123456789" }).row.id === "s1"
);
check("TIER 2 — exact name match", matchSupplierInIndex(suppliers, { supplierName: "acme foods (pty) ltd" }).tier === "exact-name");
check("TIER 3 — normalised name match", matchSupplierInIndex(suppliers, { supplierName: "Acme Foods Limited" }).tier === "normalised-name");
check("TIER 3 — matched row is correct", matchSupplierInIndex(suppliers, { supplierName: "Acme Foods" }).row.id === "s1");

const fuzzy = matchSupplierInIndex(suppliers, { supplierName: "Acme Food" });
check("TIER 4 — fuzzy returns NO row", fuzzy.row === null, JSON.stringify(fuzzy.row));
check("TIER 4 — fuzzy reports candidates for review", fuzzy.candidates.length > 0);
check("TIER 4 — candidate names the existing supplier", fuzzy.candidates[0].id === "s1");
check("TIER 4 — candidate carries a similarity score", fuzzy.candidates[0].similarity > 0.85);

const unmatched = matchSupplierInIndex(suppliers, { supplierName: "Northern Cold Storage" });
check("TIER 5 — no match and no candidates for an unrelated name", unmatched.row === null && unmatched.candidates.length === 0);
check("empty supplier name yields no match", matchSupplierInIndex(suppliers, { supplierName: "  " }).row === null);

// ── 3. Duplicate invoice detection — layers ────────────────────────────────
const existing = [
  { id: "d1", supplier_id: "s1", supplier_name: "Acme Foods", invoice_number: "INV-1001", invoice_date: "2026-05-10", total: 1500, file_hash: "hash-a" },
  { id: "d2", supplier_id: "s2", supplier_name: "Zenith Packaging", invoice_number: "ZP-77", invoice_date: "2026-05-01", total: 900, file_hash: "hash-b" },
];

const layer1 = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Acme Foods", invoiceNumber: "inv 1001", invoiceDate: "2026-06-01", total: 9999 },
  existing
);
check("LAYER 1 — supplier + invoice number detected", layer1.isDuplicate && layer1.matches[0].layer === "supplier-invoice-number");
check("LAYER 1 — action is block", layer1.action === "block");
check("LAYER 1 — invoice number match ignores case and separators", layer1.matches[0].matchedDocumentId === "d1");

const layer2 = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Totally Different Supplier", invoiceNumber: "XX-1", invoiceDate: "2026-07-01", total: 1, fileHash: "hash-b" },
  existing
);
check("LAYER 2 — identical file detected across suppliers", layer2.matches[0].layer === "document-hash");
check("LAYER 2 — action is block", layer2.action === "block");

const layer3 = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Acme Foods", invoiceNumber: "INV-2002", invoiceDate: "2026-05-12", total: 1500 },
  existing
);
check("LAYER 3 — same supplier, same total, close date", layer3.matches[0].layer === "date-total");
check("LAYER 3 — action is warn, not block", layer3.action === "warn");

const layer4 = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Acme Foods", invoiceNumber: "INV-3003", invoiceDate: "2026-11-30", total: 1500 },
  existing
);
check("LAYER 4 — same supplier and total, distant date", layer4.matches[0].layer === "operator-review");
check("LAYER 4 — action is review, never block", layer4.action === "review");

const clean = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Northern Cold Storage", invoiceNumber: "NCS-1", invoiceDate: "2026-06-01", total: 42 },
  existing
);
check("a genuinely new invoice is NOT flagged", clean.isDuplicate === false && clean.action === null);

const selfCompare = evaluateDuplicateLayers(
  { documentId: "d1", tenantId: "t1", supplierName: "Acme Foods", invoiceNumber: "INV-1001", invoiceDate: "2026-05-10", total: 1500 },
  existing
);
check("a document never matches itself", selfCompare.isDuplicate === false);

const differentSupplierSameNumber = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "Zenith Packaging", invoiceNumber: "INV-1001", invoiceDate: "2026-05-10", total: 1500 },
  existing
);
check(
  "same invoice number from a DIFFERENT supplier is not a Layer 1 duplicate",
  !differentSupplierSameNumber.matches.some((m) => m.layer === "supplier-invoice-number"),
  JSON.stringify(differentSupplierSameNumber.matches.map((m) => m.layer))
);

const supplierIdMatch = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierId: "s1", supplierName: "Renamed Acme", invoiceNumber: "INV-1001", invoiceDate: "2026-05-10", total: 1500 },
  existing
);
check("supplier_id matches even when the name has changed", supplierIdMatch.matches[0]?.layer === "supplier-invoice-number");

const noHash = evaluateDuplicateLayers(
  { documentId: "new", tenantId: "t1", supplierName: "New Supplier", invoiceNumber: "N-1", invoiceDate: "2026-06-01", total: 5 },
  existing,
  { hashAvailable: false }
);
check("missing hash column is reported, not silently passed", noHash.hashLayerUnavailable === true);

check("document hash is stable", computeDocumentHash(Buffer.from("abc")) === computeDocumentHash(Buffer.from("abc")));
check("document hash differs for different bytes", computeDocumentHash(Buffer.from("abc")) !== computeDocumentHash(Buffer.from("abd")));
check("document hash is sha256 length", computeDocumentHash(Buffer.from("abc")).length === 64);

// ── Result ─────────────────────────────────────────────────────────────────
const rule = "-".repeat(74);
process.stdout.write(`\n${rule}\n  VYRON COST — MASTER DATA INTEGRITY VERIFICATION (Phase 0)\n${rule}\n`);
process.stdout.write(`  Passed: ${passed}\n  Failed: ${failures.length}\n`);
if (failures.length) {
  process.stdout.write(`${rule}\n`);
  for (const failure of failures) process.stdout.write(`  FAIL  ${failure}\n`);
}
process.stdout.write(`${rule}\n  ${failures.length ? "VERIFICATION FAILED" : "VERIFICATION PASSED"}\n${rule}\n\n`);
process.exit(failures.length ? 1 : 0);
