#!/usr/bin/env node
/**
 * VOLORA — Customer tax invoice layout (presentation only).
 *
 * Renders invoices through the REAL document engine and reads the text back out of the PDF with
 * pdfjs: every figure supplied is printed exactly, long descriptions wrap, a long invoice runs
 * over several pages with the column header and "Page n of N" footer on each, nothing is drawn
 * into the footer area, optional blocks disappear cleanly, and every other document keeps the
 * standard layout. Family A: no network, no database, no credentials.
 *
 *   npm run test:customer-invoice-layout
 */
import { register } from "node:module";
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
    console.log(`  FAIL ${name}${detail ? `\n       ${String(detail).slice(0, 400)}` : ""}`);
  } else console.log(`  ok   ${name}`);
};

const { renderDocumentPdf } = await importFromRoot("src/lib/platform/documents/vyron-document-pdf-engine.ts");
const pdfjs = await import(pathToFileURL(path.join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.mjs")).href);
const MM = 72 / 25.4;

/** Text items per page with their position (mm from the top). */
async function readPdf(bytes) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl: path.join(ROOT, "node_modules/pdfjs-dist/standard_fonts").split(path.sep).join("/") + "/" }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();
    const height = page.getViewport({ scale: 1 }).height;
    pages.push(items.filter((it) => it.str.trim()).map((it) => ({ text: it.str, yTop: (height - it.transform[5]) / MM })));
  }
  return pages;
}
const joined = (page) => page.map((i) => i.text).join(" ").replace(/\s+/g, " ");
const zar = (n) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/\s/g, " ");
const norm = (s) => s.replace(/\s/g, " ");

const branding = {
  companyName: "QA Foods (Pty) Ltd", tradingName: null, logoDataUrl: null, logoPosition: "top_left", logoPositionX: null, logoPositionY: null, logoSizePreset: "medium",
  logoWidth: null, logoHeight: null, logoMaintainAspectRatio: true, palette: null, vatNumber: "4000000001", registrationNumber: null,
  address: "1 Test Street\nTestville\nWestern Cape", postalAddress: null, telephone: "021 000 0000", email: "accounts@qa.test", website: null, footerText: null, termsAndConditions: null, authorisationFooterText: null,
};
const columns = [
  { key: "code", label: "Code", width: 20 },
  { key: "product", label: "Description" },
  { key: "qty", label: "Unit Qty", align: "center", width: 13 },
  { key: "boxQty", label: "Box Qty", align: "center", width: 13 },
  { key: "unitPrice", label: "Unit Price", align: "right", width: 20 },
  { key: "taxable", label: "Taxable Amount", align: "right", width: 24 },
  { key: "vatRate", label: "VAT %", align: "center", width: 22 },
  { key: "vatAmount", label: "VAT Amount", align: "right", width: 22 },
  { key: "lineTotal", label: "Line Total", align: "right", width: 24 },
];
const base = (over = {}) => ({
  docTitle: "Tax Invoice",
  docClassLabel: "Full Tax Invoice",
  docNumber: "SI-QA0001",
  branding,
  parties: [
    { heading: "From", name: "QA Foods (Pty) Ltd", lines: ["1 Test Street", "VAT No: 4000000001"] },
    { heading: "Bill To", name: "QA Customer", lines: ["9 Customer Road", "VAT Status: Not provided"] },
  ],
  meta: [
    { label: "Invoice Number", value: "SI-QA0001" },
    { label: "Invoice Date", value: "2026-11-10" },
    { label: "Due Date", value: "2026-12-10" },
    { label: "Status", value: "Draft" },
    { label: "Currency", value: "ZAR (South African Rand)" },
    { label: "Tax Details", value: "Company tax profile" },
  ],
  lineColumns: columns,
  lineRows: [{ code: "PIE-1", product: "Chicken & Mushroom Pie 180g", qty: "48", boxQty: "2", unitPrice: "19.95", taxable: "239.40", vatRate: "15.00%", vatAmount: "35.91", lineTotal: "275.31" }],
  totals: { subtotal: 239.4, vatAmount: 35.91, vatSummary: [{ rate: "VAT @ 15.00%", base: 239.4, vat: 35.91 }], grandTotal: 275.31, currency: "ZAR" },
  paymentDetails: { heading: "Banking Details", fields: [{ label: "Bank", value: "QA Bank" }, { label: "Account Name", value: "QA Foods" }, { label: "Account Number", value: "123456789" }, { label: "Branch Code", value: "250655" }, { label: "Account Type", value: "Current" }, { label: "Remittance To", value: "pay@qa.test" }], reference: "Please use SI-QA0001 as your payment reference." },
  notes: null,
  generatedAtIso: "2026-11-10T07:03:07.000Z",
  layout: "tax-invoice",
  ...over,
});

console.log("\n1. One line: every block of the reference layout");
{
  const [p] = await readPdf(renderDocumentPdf(base()));
  const t = joined(p);
  check("title, class, number and SA generation time in the header", t.includes("TAX INVOICE") && t.includes("Full Tax Invoice") && t.includes("SI-QA0001 / Generated 2026-11-10 09:03:07"), t.slice(0, 300));
  check("supplier address on the right of the header, one line per address line (no overlap)", ["1 Test Street", "Testville", "Western Cape"].every((l) => p.some((i) => i.text === l && i.yTop < 40)));
  check("no logo → the header names the company", p.some((i) => i.text === "QA Foods (Pty) Ltd" && i.yTop < 15));
  check("FROM / BILL TO", t.includes("FROM") && t.includes("BILL TO") && t.includes("QA Customer"));
  check("invoice information: number, date, due date, status, currency, tax details", ["INVOICE NUMBER", "INVOICE DATE", "DUE DATE", "STATUS", "CURRENCY", "TAX DETAILS", "ZAR (South African Rand)", "Company tax profile"].every((s) => t.includes(s)));
  check("columns: Code, Description, Unit Qty, Box Qty, Unit Price, Taxable Amount, VAT %, VAT Amount, Line Total", ["Code", "Description", "Unit Qty", "Box Qty", "Unit Price", "Taxable", "VAT %", "VAT Amount", "Line Total"].every((s) => t.includes(s)));
  check("line figures printed exactly as supplied", ["48", "2", "19.95", "239.40", "15.00%", "35.91", "275.31"].every((s) => t.includes(s)));
  check("totals: subtotal, VAT with rate and base, total incl VAT", norm(t).includes(`Subtotal (excl VAT) ${zar(239.4)}`) && norm(t).includes(`VAT @ 15.00% on ${zar(239.4)} ${zar(35.91)}`) && norm(t).includes(`Total (incl VAT) ZAR ${zar(275.31)}`), norm(t));
  check("banking details: every configured field and the payment reference", ["Banking Details", "BANK", "QA Bank", "ACCOUNT NAME", "ACCOUNT NUMBER", "123456789", "BRANCH CODE", "250655", "ACCOUNT TYPE", "REMITTANCE TO", "pay@qa.test", "Please use SI-QA0001 as your payment reference."].every((s) => t.includes(s)));
  check("footer: company | Tax Invoice number, Page 1 of 1", t.includes("QA Foods (Pty) Ltd | Tax Invoice SI-QA0001") && t.includes("Page 1 of 1"));
}

console.log("\n2. Many lines, long descriptions, zero-rated lines → several pages");
{
  const rows = Array.from({ length: 70 }, (_, i) => ({
    code: `CODE-${i + 1}`,
    product: i % 7 === 0 ? `Line ${i + 1} — a deliberately long product description that must wrap over several lines inside its column without overlapping any figure END${i + 1}` : `Line ${i + 1} product END${i + 1}`,
    qty: String(i + 1),
    unitPrice: "10.00",
    taxable: (10 * (i + 1)).toFixed(2),
    vatRate: i % 5 === 0 ? "Zero-rated" : "15.00%",
    vatAmount: i % 5 === 0 ? "0.00" : (1.5 * (i + 1)).toFixed(2),
    lineTotal: (i % 5 === 0 ? 10 * (i + 1) : 11.5 * (i + 1)).toFixed(2),
  }));
  const pages = await readPdf(renderDocumentPdf(base({ lineRows: rows, totals: { subtotal: 24850, vatAmount: 2970, vatSummary: [{ rate: "VAT @ 15.00%", base: 19800, vat: 2970 }, { rate: "Zero-rated", base: 5050, vat: 0 }], grandTotal: 27820, currency: "ZAR" } })));
  const all = pages.map(joined).join(" ");
  check(`runs over several pages (${pages.length})`, pages.length >= 3);
  check("every line is printed, including the end of every long description", rows.every((r, i) => all.includes(`END${i + 1}`) && all.includes(`CODE-${i + 1}`)));
  check("each line is printed once (no row duplicated across a page break)", rows.every((r, i) => all.split(`CODE-${i + 1} `).length === 2));
  check("zero-rated lines show their treatment", all.includes("Zero-rated"));
  const tablePages = pages.filter((p) => /CODE-\d+/.test(joined(p)));
  check(`the column header repeats on every page that carries lines (${tablePages.length})`, tablePages.length >= 3 && tablePages.every((p) => joined(p).includes("Unit Price") && joined(p).includes("Line Total")));
  check("Page n of N on every page with the invoice number", pages.every((p, i) => joined(p).includes(`Page ${i + 1} of ${pages.length}`) && joined(p).includes("Tax Invoice SI-QA0001")));
  check("nothing but the footer is drawn below the content area (no clipped or overlapping rows)", pages.every((p) => p.filter((i) => i.yTop > 281).every((i) => /Page \d+ of \d+|QA Foods \(Pty\) Ltd \| Tax Invoice SI-QA0001/.test(i.text))), JSON.stringify(pages.map((p) => p.filter((i) => i.yTop > 281).map((i) => i.text))));
  const totalsPage = pages.map(joined).map(norm).find((t) => t.includes("Total (incl VAT) ZAR")) || "";
  check(
    "totals printed once and together on one page (subtotal, both VAT groups, total)",
    norm(all).split("Total (incl VAT) ZAR").length === 2 &&
      totalsPage.includes(`Subtotal (excl VAT) ${zar(24850)}`) &&
      totalsPage.includes(`VAT @ 15.00% on ${zar(19800)} ${zar(2970)}`) &&
      totalsPage.includes(`Zero-rated on ${zar(5050)}`) &&
      totalsPage.includes(`Total (incl VAT) ZAR ${zar(27820)}`)
  );
  check("banking details follow the totals and are complete", pages.map(joined).join(" ").indexOf("Banking Details") > pages.map(joined).join(" ").indexOf("Total (incl VAT) ZAR") && all.includes("Please use SI-QA0001 as your payment reference."));
}

console.log("\n3. Optional details missing");
{
  const [p] = await readPdf(renderDocumentPdf(base({ paymentDetails: null, parties: [{ heading: "From", name: "QA Foods (Pty) Ltd", lines: [] }, { heading: "Bill To", name: "Walk-in customer", lines: [] }], branding: { ...branding, address: null } })));
  const t = joined(p);
  check("no banking configured → no banking block, nothing invented", !t.includes("Banking Details") && !t.includes("ACCOUNT NUMBER"));
  check("customer with no address or VAT details still renders cleanly", t.includes("Walk-in customer") && t.includes("Total (incl VAT) ZAR"));
}

console.log("\n4. Other documents keep the standard layout");
{
  const [p] = await readPdf(renderDocumentPdf(base({ layout: undefined, docTitle: "Purchase Order", docNumber: "PO-1" })));
  const t = joined(p);
  check("a document without the invoice layout still uses the standard header ('·' separator, company name)", t.includes("PO-1 · Generated") && t.includes("PURCHASE ORDER") && !t.includes("PO-1 / Generated"));
}

console.log("\n5. The customer invoice adapter selects the layout and changes no value");
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(path.join(ROOT, "src/lib/platform/documents/adapters/customer-invoice.ts"), "utf8");
  check("adapter sets layout: \"tax-invoice\"", src.includes('layout: "tax-invoice"'));
  check("adapter columns: Unit Qty, Box Qty, Taxable Amount, VAT %, VAT Amount", src.includes('label: "Unit Qty"') && src.includes('label: "Box Qty"') && src.includes('label: "Taxable Amount"') && src.includes('label: "VAT %"') && src.includes('label: "VAT Amount"'));
  check("Box Qty is the stored, user-entered line value — no pack-size lookup, no division of Unit Qty", src.includes("formatBoxQty(line.box_qty)") && !src.includes("vyron_cost_product_pack_sizes") && !src.includes("unitsPerBox"));
  const { formatBoxQty } = await importFromRoot("src/lib/platform/documents/adapters/customer-invoice.ts");
  check("stored Box Qty prints as entered: 6 → 6, 0.5 → 0.5, 1.25 → 1.25, '2.0000' → 2, 0 → 0, 1.2345 → 1.2345", formatBoxQty(6) === "6" && formatBoxQty(0.5) === "0.5" && formatBoxQty(1.25) === "1.25" && formatBoxQty("2.0000") === "2" && formatBoxQty(0) === "0" && formatBoxQty("1.2345") === "1.2345");
  check("no Box Qty entered (or an unusable one) → '-', never calculated", formatBoxQty(null) === "-" && formatBoxQty(undefined) === "-" && formatBoxQty("") === "-" && formatBoxQty("abc") === "-" && formatBoxQty(-3) === "-");
  // The Box Qty display helper only formats a stored number; it touches no money, so it is left out of the scan.
  const moneySrc = src.replace(/export function formatBoxQty[\s\S]*?\r?\n\}\r?\n/, "");
  check("the Box Qty helper is the only code excluded from the scan", moneySrc.length < src.length && !moneySrc.includes("export function formatBoxQty"));
  check("adapter still reads stored figures only (no rate arithmetic introduced)", !/\*\s*0?\.15|\*\s*15\b|\/\s*100/.test(moneySrc));
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
