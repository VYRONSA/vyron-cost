import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Shared VYRON platform document engine — every document type (Purchase Order, Goods
 * Receipt Note, Customer Invoice, Sales Order, Stock Count Sheet, Production Run, and
 * future document types) supplies only header/lines/totals/footer data through this
 * contract. This module owns the actual PDF layout so no document type duplicates it.
 */

export type DocumentPdfBranding = {
  companyName: string;
  tradingName: string | null;
  logoDataUrl: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  address: string | null;
  postalAddress: string | null;
  telephone: string | null;
  email: string | null;
  website: string | null;
};

export type DocumentPdfParty = {
  heading: string;
  name: string;
  lines: string[];
};

export type DocumentPdfMetaField = {
  label: string;
  value: string;
};

export type DocumentPdfLineColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type DocumentPdfLineRow = Record<string, string>;

export type DocumentPdfVatSummaryRow = {
  rate: string;
  base: number;
  vat: number;
};

export type DocumentPdfTotals = {
  subtotal: number;
  discountTotal?: number;
  vatAmount: number;
  vatSummary?: DocumentPdfVatSummaryRow[];
  grandTotal: number;
  currency?: string;
};

export type DocumentPdfAuthorisationLine = {
  label: string;
  value: string;
};

export type DocumentPdfModel = {
  docTitle: string;
  docNumber: string;
  branding: DocumentPdfBranding;
  parties: DocumentPdfParty[];
  meta: DocumentPdfMetaField[];
  lineColumns: DocumentPdfLineColumn[];
  lineRows: DocumentPdfLineRow[];
  /** Omit for documents with no monetary total (e.g. a Goods Receipt Note or Stock Count Sheet). */
  totals?: DocumentPdfTotals;
  notes?: string | null;
  termsAndConditions?: string | null;
  authorisation?: DocumentPdfAuthorisationLine[];
  generatedAtIso?: string;
};

const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_CONTENT_RIGHT = PAGE_WIDTH - PAGE_MARGIN;

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function displayCompanyName(branding: DocumentPdfBranding) {
  return branding.tradingName || branding.companyName || "VYRON COST";
}

/** Truncates text with an ellipsis so it never overflows a fixed-width column (e.g. long UUID actor ids). */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = "…";
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(truncated + ellipsis) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ellipsis;
}

export function renderDocumentPdf(model: DocumentPdfModel): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = model.totals?.currency || "ZAR";
  const generatedAt = new Date(model.generatedAtIso || new Date().toISOString());

  // Header band
  doc.setFillColor(7, 17, 31);
  doc.rect(0, 0, PAGE_WIDTH, 34, "F");
  doc.setTextColor(255, 255, 255);

  const headerTextX = model.branding.logoDataUrl ? PAGE_MARGIN + 22 : PAGE_MARGIN;
  if (model.branding.logoDataUrl) {
    try {
      doc.addImage(model.branding.logoDataUrl, "PNG", PAGE_MARGIN, 6, 18, 18);
    } catch {
      // Non-blocking: fall back to text-only header when the logo can't be embedded.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(displayCompanyName(model.branding), headerTextX, 15);
  doc.setFontSize(11);
  doc.text(model.docTitle, headerTextX, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${model.docNumber} · Generated ${generatedAt.toLocaleString("en-ZA")}`, headerTextX, 30);

  const companyMetaLines = [
    model.branding.address,
    [model.branding.telephone, model.branding.email].filter(Boolean).join(" | "),
    model.branding.website,
    model.branding.vatNumber ? `VAT: ${model.branding.vatNumber}` : null,
    model.branding.registrationNumber ? `Reg: ${model.branding.registrationNumber}` : null,
  ].filter(Boolean) as string[];
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  const headerMetaMaxWidth = PAGE_CONTENT_RIGHT - headerTextX - 4;
  companyMetaLines.forEach((line, index) =>
    doc.text(fitText(doc, line, headerMetaMaxWidth), PAGE_CONTENT_RIGHT, 10 + index * 4, { align: "right" })
  );

  // Party blocks (company / counterparty)
  let y = 44;
  doc.setTextColor(15, 23, 42);
  const columnWidth = (PAGE_CONTENT_RIGHT - PAGE_MARGIN) / Math.max(1, model.parties.length);
  const partyTextWidth = columnWidth - 6;
  model.parties.forEach((party, index) => {
    const x = PAGE_MARGIN + index * columnWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(party.heading, x, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(fitText(doc, party.name, partyTextWidth), x, y + 5);
    party.lines.forEach((line, lineIndex) => doc.text(fitText(doc, line, partyTextWidth), x, y + 10 + lineIndex * 5));
  });

  const partyBlockHeight = Math.max(
    ...model.parties.map((party) => 10 + party.lines.length * 5),
    16
  );
  y += partyBlockHeight + 8;

  // Meta box (doc number/date/status/refs/etc.)
  if (model.meta.length) {
    const metaBoxHeight = 8 + Math.ceil(model.meta.length / 4) * 12;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(PAGE_MARGIN, y, PAGE_CONTENT_RIGHT - PAGE_MARGIN, metaBoxHeight, 2, 2, "S");
    const metaColumnWidth = (PAGE_CONTENT_RIGHT - PAGE_MARGIN) / 4;
    const metaTextWidth = metaColumnWidth - 8;
    model.meta.forEach((field, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = PAGE_MARGIN + 4 + col * metaColumnWidth;
      const fieldY = y + 8 + row * 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(fitText(doc, field.label.toUpperCase(), metaTextWidth), x, fieldY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(fitText(doc, field.value || "-", metaTextWidth), x, fieldY + 5);
    });
    y += metaBoxHeight + 8;
  }

  // Line items table
  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: [7, 17, 31], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    head: [model.lineColumns.map((column) => column.label)],
    body: model.lineRows.map((row) => model.lineColumns.map((column) => row[column.key] ?? "")),
    columnStyles: Object.fromEntries(
      model.lineColumns.map((column, index) => [index, { halign: column.align === "right" ? "right" : "left" }])
    ),
  });

  const tableEndY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 10) + 8;
  const totalsX = 128;
  let sectionY = tableEndY;

  if (model.totals) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    let totalsY = tableEndY;
    doc.text("Subtotal", totalsX, totalsY);
    doc.text(money(model.totals.subtotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });

    if (model.totals.discountTotal) {
      totalsY += 6;
      doc.text("Discount", totalsX, totalsY);
      doc.text(money(model.totals.discountTotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    }

    if (model.totals.vatSummary?.length) {
      for (const row of model.totals.vatSummary) {
        totalsY += 6;
        doc.setFont("helvetica", "normal");
        doc.text(`VAT @ ${row.rate}`, totalsX, totalsY);
        doc.text(money(row.vat, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
        doc.setFont("helvetica", "bold");
      }
    } else {
      totalsY += 6;
      doc.text("VAT", totalsX, totalsY);
      doc.text(money(model.totals.vatAmount, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    }

    totalsY += 4;
    doc.setDrawColor(148, 163, 184);
    doc.line(totalsX, totalsY, PAGE_CONTENT_RIGHT, totalsY);

    totalsY += 7;
    doc.setFontSize(11);
    doc.text("Total", totalsX, totalsY);
    doc.text(money(model.totals.grandTotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });

    sectionY = totalsY + 12;
  }

  if (model.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", PAGE_MARGIN, sectionY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const notesLines = doc.splitTextToSize(model.notes, PAGE_CONTENT_RIGHT - PAGE_MARGIN);
    doc.text(notesLines, PAGE_MARGIN, sectionY + 5);
    sectionY += 10 + notesLines.length * 4;
  }

  if (model.termsAndConditions) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Terms & Conditions", PAGE_MARGIN, sectionY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const termsLines = doc.splitTextToSize(model.termsAndConditions, PAGE_CONTENT_RIGHT - PAGE_MARGIN);
    doc.text(termsLines, PAGE_MARGIN, sectionY + 5);
    sectionY += 10 + termsLines.length * 4;
  }

  if (model.authorisation?.length) {
    sectionY += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Authorisation", PAGE_MARGIN, sectionY);
    const authColumnWidth = (PAGE_CONTENT_RIGHT - PAGE_MARGIN) / model.authorisation.length;
    model.authorisation.forEach((line, index) => {
      const x = PAGE_MARGIN + index * authColumnWidth;
      const lineY = sectionY + 14;
      doc.setDrawColor(148, 163, 184);
      doc.line(x, lineY, x + authColumnWidth - 8, lineY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(fitText(doc, line.value || "-", authColumnWidth - 10), x, lineY - 3);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(line.label.toUpperCase(), x, lineY + 5);
      doc.setTextColor(15, 23, 42);
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(PAGE_MARGIN, 286, PAGE_CONTENT_RIGHT, 286);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`${displayCompanyName(model.branding)} | ${model.docTitle} ${model.docNumber}`, PAGE_MARGIN, 291);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_CONTENT_RIGHT, 291, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
