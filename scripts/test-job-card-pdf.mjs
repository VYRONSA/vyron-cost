#!/usr/bin/env node
/**
 * Production Job Card PDF.   npm run test:job-card-pdf
 * Renders job cards from fixed documents and reads the text back with pdfjs.
 * Family A: no network, no database, no credentials, no writes (optionally
 * writes the PDF to the path in JOB_CARD_PDF_OUT for visual review).
 */
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

register("./support/session-security-test-hook.mjs", import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const { renderJobCardsPdf } = await import(pathToFileURL(path.join(ROOT, "src/lib/platform/documents/job-card-pdf.ts")).href);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  — ${detail}`}`);
};

const branding = {
  companyName: "Handcrafted Food Products (Pty) Ltd", tradingName: "Handcrafted Foods", logoDataUrl: null,
  logoPosition: "left", logoPositionX: null, logoPositionY: null, logoSizePreset: "medium", logoWidth: null, logoHeight: null,
  logoMaintainAspectRatio: true, palette: {}, vatNumber: null, registrationNumber: null, address: null, postalAddress: null,
  telephone: null, email: null, website: null, footerText: null, termsAndConditions: null, authorisationFooterText: null,
};
const card = (n, extra) => ({
  card: { id: `c${n}`, jobCardNumber: `JC-00000${n}`, status: "Awaiting Production", statusChangedAt: null, statusChangedBy: null, printCount: 0, createdAt: "", createdBy: "QA" },
  sourceType: "customer_sales_order", sourceId: `so${n}`, orderNumber: `SO-1000000${n}`, orderStatus: "Approved",
  customerName: "Sunrise Deli", customerLabel: "Customer", orderReceivedDate: "2026-11-24T08:00:00Z", requiredDate: "2026-11-27",
  specialInstructions: "Deliver before 07:00. No sesame.", ...extra,
});
const docs = [
  card(1, {
    items: [
      {
        productId: "p1", productName: "Beef Pie 180g", itemCode: "BP180", quantity: 240, unit: "each", bomReference: "Beef Pie 180g (Approved)",
        bomStatus: "COMPLETE", bomClassification: "VERIFIED_COMPLETE", bomWarning: null,
        ingredients: Array.from({ length: 30 }, (_, i) => ({ lineType: "Ingredient", name: `Ingredient ${i + 1}`, ingredientId: `i${i}`, quantity: 1.25 * (i + 1), unit: "kg" })),
      },
    ],
  }),
  card(2, {
    card: { id: "c2", jobCardNumber: "JC-000002", status: "On Hold", statusChangedAt: null, statusChangedBy: null, printCount: 0, createdAt: "", createdBy: "QA" },
    specialInstructions: null,
    items: [
      {
        productId: "p2", productName: "Curry Vegetable Pie", itemCode: null, quantity: 60, unit: "each", bomReference: null,
        bomStatus: "NO BOM", bomClassification: "INCOMPLETE", ingredients: null,
        bomWarning: "No usable BOM — ingredients are not listed. NO BOM: No BOM or recipe is linked to this finished good.",
      },
    ],
  }),
];
const bytes = renderJobCardsPdf(docs, branding, "QA Tester");
if (process.env.JOB_CARD_PDF_OUT) fs.writeFileSync(process.env.JOB_CARD_PDF_OUT, Buffer.from(bytes));
check("renders a PDF", Buffer.from(bytes).subarray(0, 5).toString() === "%PDF-");

const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
const pageText = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const tc = await (await pdf.getPage(p)).getTextContent();
  pageText.push(tc.items.map((i) => i.str).join(" "));
}
const all = pageText.join("\n");
check("card 1 starts on page 1, card 2 on its own page", pageText[0].includes("JC-000001") && pageText[pageText.length - 1].includes("JC-000002"));
check("long ingredient list continues onto another page", pdf.numPages >= 3, `pages=${pdf.numPages}`);
check("header: company, title, order link", all.includes("Handcrafted Foods") && all.includes("PRODUCTION JOB CARD") && all.includes("Sales Order SO-10000001"));
check("order facts: received and required dates", all.includes("Order Received") && all.includes("Required Date") && all.includes("27 Nov 2026"));
check("product, item code, qty, unit, BOM reference", all.includes("Beef Pie 180g") && all.includes("BP180") && all.includes("240") && all.includes("Beef Pie 180g (Approved)"));
check("ingredients listed with quantities", all.includes("Ingredient 30") && all.includes("37,5"));
check("status shown", all.includes("AWAITING PRODUCTION") && all.includes("ON HOLD"));
check("no-BOM card states it and lists no ingredient", pageText[pageText.length - 1].includes("No usable BOM") && !pageText[pageText.length - 1].includes("Ingredient 1 "));
check("special instructions printed, and 'None recorded' when blank", all.includes("No sesame") && all.includes("None recorded on the order"));
check("notes space and sign-off blocks", all.includes("Production notes") && all.includes("Prepared by") && all.includes("Production sign-off"));
check("footer states printing changes no order", all.includes("does not create or change an order"));
check("per-card page numbering", /Page 1 of \d/.test(pageText[0]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
