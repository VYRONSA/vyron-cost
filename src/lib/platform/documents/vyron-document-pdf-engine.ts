import jsPDF, { GState } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BrandingPalette, LogoPosition, LogoSizePreset } from "@/lib/platform/branding/BrandingTypes";

/**
 * Shared VYRON platform document engine — every document type (Purchase Order, Goods
 * Receipt Note, Customer Invoice, Sales Order, Stock Count Sheet, Production Run, and
 * future document types) supplies only header/lines/totals/footer data through this
 * contract. This module owns the actual PDF layout so no document type duplicates it.
 *
 * Branding (palette, logo placement/size, footer/terms/authorisation defaults) comes from
 * the Branding Designer via resolveDocumentBranding() — this file only *consumes* it.
 */

export type DocumentPdfBranding = {
  companyName: string;
  tradingName: string | null;
  logoDataUrl: string | null;
  logoPosition: LogoPosition;
  logoPositionX: number | null;
  logoPositionY: number | null;
  logoSizePreset: LogoSizePreset;
  logoWidth: number | null;
  logoHeight: number | null;
  logoMaintainAspectRatio: boolean;
  palette: BrandingPalette;
  vatNumber: string | null;
  registrationNumber: string | null;
  address: string | null;
  postalAddress: string | null;
  telephone: string | null;
  email: string | null;
  website: string | null;
  footerText: string | null;
  termsAndConditions: string | null;
  authorisationFooterText: string | null;
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
  align?: "left" | "right" | "center";
  /** Fixed column width in mm. Omit to let the table size the column. */
  width?: number;
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

/**
 * A banner immediately under the header. Used to state something about the
 * document's own standing — for example that a reprint was produced from live
 * master data because the invoice predates snapshotting.
 */
export type DocumentPdfNotice = {
  heading: string;
  body: string;
  tone: "info" | "warning";
};

/** Bank account details, rendered as a payment block above the footer. */
export type DocumentPdfPaymentDetails = {
  heading: string;
  fields: { label: string; value: string }[];
  reference?: string | null;
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
  notice?: DocumentPdfNotice | null;
  paymentDetails?: DocumentPdfPaymentDetails | null;
  /** Shown beside the document title, e.g. "Full Tax Invoice". */
  docClassLabel?: string | null;
  generatedAtIso?: string;
  /**
   * "tax-invoice" — the customer tax invoice layout: charcoal header carrying the logo, title,
   * document class, number and generation time with the supplier address on the right; accent
   * section labels; open (unboxed) meta and banking blocks; a prominent total; page footer.
   * Presentation only — every figure is still exactly what the model supplies.
   * Omitted / "standard" — the shared layout every other document uses, unchanged.
   */
  layout?: "standard" | "tax-invoice";
};

/* Tax invoice layout palette. */
const INV_HEADER: [number, number, number] = [45, 47, 51];
const INV_ACCENT: [number, number, number] = [47, 94, 166];
const INV_TEXT: [number, number, number] = [17, 24, 39];
const INV_MUTED: [number, number, number] = [71, 85, 105];
const INV_GRID: [number, number, number] = [203, 213, 225];
const INV_FOOTER: [number, number, number] = [71, 98, 140];
const INV_HEADER_HEIGHT = 40;

/** "2026-10-16 10:03:07" in South African time, as on the printed invoice. */
function saDateTime(date: Date) {
  return date.toLocaleString("sv-SE", { timeZone: "Africa/Johannesburg", hour12: false }).replace("T", " ");
}

const PAGE_MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_CONTENT_RIGHT = PAGE_WIDTH - PAGE_MARGIN;
/** The footer rule sits at 286, so nothing may be drawn below this. */
const PAGE_CONTENT_BOTTOM = 280;
/** Where content restarts on a continuation page (no header band is repeated). */
const PAGE_CONTENT_TOP = 20;

/**
 * Start a new page when `needed` mm of content would not fit.
 *
 * Without this the totals block was drawn wherever the line table happened to
 * end. A table finishing near the bottom of a page pushed the subtotal, VAT and
 * total past the footer rule, where they were clipped off the document entirely —
 * on an invoice, the three figures that matter most.
 */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= PAGE_CONTENT_BOTTOM) return y;
  doc.addPage();
  return PAGE_CONTENT_TOP;
}

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function displayCompanyName(branding: DocumentPdfBranding) {
  return branding.tradingName || branding.companyName || "VOLORA";
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

function hexToRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  const match = hex ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null;
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const LOGO_SIZE_MM: Record<"small" | "medium" | "large", number> = { small: 12, medium: 18, large: 26 };

/** Resolves the configured logo box (before aspect-ratio fitting) from the Branding Designer's size setting. */
function resolveLogoBox(branding: DocumentPdfBranding): { width: number; height: number } {
  if (branding.logoSizePreset === "custom") {
    return {
      width: branding.logoWidth && branding.logoWidth > 0 ? branding.logoWidth : LOGO_SIZE_MM.medium,
      height: branding.logoHeight && branding.logoHeight > 0 ? branding.logoHeight : LOGO_SIZE_MM.medium,
    };
  }
  const size = LOGO_SIZE_MM[branding.logoSizePreset] ?? LOGO_SIZE_MM.medium;
  return { width: size, height: size };
}

/** Fits the logo box to the image's natural aspect ratio ("Maintain Aspect Ratio"), or returns the box unchanged ("Stretch"). */
function resolveLogoDrawSize(
  doc: jsPDF,
  branding: DocumentPdfBranding,
  box: { width: number; height: number }
): { width: number; height: number } {
  if (!branding.logoMaintainAspectRatio || !branding.logoDataUrl) return box;
  try {
    const props = doc.getImageProperties(branding.logoDataUrl);
    const naturalRatio = props.width / props.height;
    if (!Number.isFinite(naturalRatio) || naturalRatio <= 0) return box;
    const boxRatio = box.width / box.height;
    if (naturalRatio > boxRatio) return { width: box.width, height: box.width / naturalRatio };
    return { width: box.height * naturalRatio, height: box.height };
  } catch {
    return box;
  }
}

function drawLogoImage(doc: jsPDF, dataUrl: string, x: number, y: number, width: number, height: number) {
  try {
    doc.addImage(dataUrl, x, y, width, height);
  } catch {
    // Non-blocking: skip the logo if the embedded image data can't be decoded.
  }
}

/**
 * The customer tax invoice layout. Lays out the figures the model carries; calculates nothing.
 */
function renderTaxInvoicePdf(model: DocumentPdfModel): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = model.totals?.currency || "ZAR";
  const generatedAt = new Date(model.generatedAtIso || new Date().toISOString());
  const branding = model.branding;
  const hasLogo = Boolean(branding.logoDataUrl);
  const width = PAGE_CONTENT_RIGHT - PAGE_MARGIN;

  /* Header band: logo, title, class, number + generated; supplier address on the right. */
  doc.setFillColor(...INV_HEADER);
  doc.rect(0, 0, PAGE_WIDTH, INV_HEADER_HEIGHT, "F");
  let textX = PAGE_MARGIN;
  if (hasLogo) {
    const box = resolveLogoDrawSize(doc, branding, { width: 30, height: 18 });
    drawLogoImage(doc, branding.logoDataUrl as string, PAGE_MARGIN, 4, box.width, box.height);
    textX = PAGE_MARGIN + 34;
  }
  const addressLines = String(branding.address || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 7);
  const rightWidth = 62;
  const leftWidth = PAGE_CONTENT_RIGHT - rightWidth - textX - 4;
  doc.setTextColor(255, 255, 255);
  if (!hasLogo) {
    // Without a logo the header names the company; with one, the logo does (as on the printed invoice).
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(fitText(doc, displayCompanyName(branding), leftWidth), textX, 11);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(model.docTitle.toUpperCase(), textX, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(214, 218, 224);
  if (model.docClassLabel) doc.text(model.docClassLabel, textX, 30);
  doc.text(fitText(doc, `${model.docNumber} / Generated ${saDateTime(generatedAt)}`, leftWidth), textX, model.docClassLabel ? 35 : 30);
  doc.setFontSize(8);
  addressLines.forEach((line, index) => doc.text(fitText(doc, line, rightWidth), PAGE_CONTENT_RIGHT, 9 + index * 4, { align: "right" }));

  let y = INV_HEADER_HEIGHT + 10;

  /* From / Bill To (and any further party, e.g. Branch / Site). */
  const columnWidth = width / Math.max(1, model.parties.length);
  const partyTextWidth = columnWidth - 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const partyWrapped = model.parties.map((party) => party.lines.flatMap((line) => doc.splitTextToSize(line, partyTextWidth) as string[]));
  model.parties.forEach((party, index) => {
    const x = PAGE_MARGIN + index * columnWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INV_ACCENT);
    doc.text(party.heading.toUpperCase(), x, y);
    doc.setTextColor(...INV_TEXT);
    doc.setFontSize(11);
    doc.text(fitText(doc, party.name, partyTextWidth), x, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    partyWrapped[index].forEach((line, lineIndex) => doc.text(line, x, y + 11.5 + lineIndex * 4.3));
  });
  y += Math.max(...partyWrapped.map((lines) => 11.5 + lines.length * 4.3), 18) + 8;

  /* Invoice information: four columns, no box. */
  if (model.meta.length) {
    const metaColumnWidth = width / 4;
    model.meta.forEach((field, index) => {
      const x = PAGE_MARGIN + (index % 4) * metaColumnWidth;
      const fieldY = y + Math.floor(index / 4) * 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...INV_ACCENT);
      doc.text(fitText(doc, field.label.toUpperCase(), metaColumnWidth - 4), x, fieldY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...INV_TEXT);
      doc.text(fitText(doc, field.value || "-", metaColumnWidth - 4), x, fieldY + 5);
    });
    y += Math.ceil(model.meta.length / 4) * 12 + 4;
  }

  /* Lines: header repeats on every page; a row is never split across pages; descriptions wrap. */
  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: INV_HEADER, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, halign: "center", valign: "middle", lineColor: INV_HEADER },
    styles: { fontSize: 8.5, cellPadding: 2.4, overflow: "linebreak", valign: "middle", textColor: INV_TEXT, lineColor: INV_GRID, lineWidth: 0.2 },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_CONTENT_TOP, bottom: PAGE_HEIGHT - PAGE_CONTENT_BOTTOM },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    head: [model.lineColumns.map((column) => column.label)],
    body: model.lineRows.map((row) => model.lineColumns.map((column) => row[column.key] ?? "")),
    columnStyles: Object.fromEntries(model.lineColumns.map((column, index) => [index, { halign: column.align || "left", cellWidth: column.width ?? "auto" }])),
  });
  let sectionY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 10) + 10;

  /* Totals, kept together; the total is the most prominent figure on the page. */
  if (model.totals) {
    const totalsX = 118;
    const vatRowCount = model.totals.vatSummary?.length || 1;
    sectionY = ensureSpace(doc, sectionY, 7 + (model.totals.discountTotal ? 7 : 0) + vatRowCount * 7 + 16);
    let totalsY = sectionY;
    doc.setTextColor(...INV_TEXT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Subtotal (excl VAT)", totalsX, totalsY);
    doc.text(money(model.totals.subtotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    if (model.totals.discountTotal) {
      totalsY += 7;
      doc.text("Discount", totalsX, totalsY);
      doc.text(money(model.totals.discountTotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    }
    if (model.totals.vatSummary?.length) {
      for (const row of model.totals.vatSummary) {
        totalsY += 7;
        doc.text(fitText(doc, `${row.rate} on ${money(row.base, currency)}`, PAGE_CONTENT_RIGHT - totalsX - 30), totalsX, totalsY);
        doc.text(money(row.vat, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
      }
    } else {
      totalsY += 7;
      doc.text("VAT", totalsX, totalsY);
      doc.text(money(model.totals.vatAmount, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    }
    totalsY += 4.5;
    doc.setDrawColor(...INV_MUTED);
    doc.setLineWidth(0.3);
    doc.line(totalsX, totalsY, PAGE_CONTENT_RIGHT, totalsY);
    totalsY += 8.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.text(`Total (incl VAT) ${currency}`, totalsX, totalsY);
    doc.text(money(model.totals.grandTotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
    sectionY = totalsY + 12;
  }

  /* Banking details: open block, three columns, payment reference. */
  if (model.paymentDetails?.fields.length) {
    const rows = Math.ceil(model.paymentDetails.fields.length / 3);
    const blockHeight = 7 + rows * 10 + (model.paymentDetails.reference ? 5 : 0);
    sectionY = ensureSpace(doc, sectionY, blockHeight + 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INV_TEXT);
    doc.text(model.paymentDetails.heading, PAGE_MARGIN, sectionY);
    const payColumnWidth = width / 3;
    model.paymentDetails.fields.forEach((field, index) => {
      const x = PAGE_MARGIN + (index % 3) * payColumnWidth;
      const fieldY = sectionY + 7 + Math.floor(index / 3) * 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...INV_ACCENT);
      doc.text(fitText(doc, field.label.toUpperCase(), payColumnWidth - 4), x, fieldY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INV_TEXT);
      doc.text(fitText(doc, field.value || "-", payColumnWidth - 4), x, fieldY + 4.6);
    });
    if (model.paymentDetails.reference) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(model.paymentDetails.reference, PAGE_MARGIN, sectionY + 7 + rows * 10 + 1.5);
    }
    sectionY += blockHeight + 8;
  }

  /* Notes and terms, wrapped; a block that would cross the footer moves to the next page. */
  const termsAndConditions = model.termsAndConditions ?? branding.termsAndConditions ?? null;
  for (const [heading, body] of [["Notes", model.notes], ["Terms & Conditions", termsAndConditions]] as const) {
    if (!body) continue;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(body, width) as string[];
    let remaining = lines;
    sectionY = ensureSpace(doc, sectionY, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INV_TEXT);
    doc.text(heading, PAGE_MARGIN, sectionY);
    sectionY += 5;
    while (remaining.length) {
      const fit = Math.max(1, Math.floor((PAGE_CONTENT_BOTTOM - sectionY) / 4));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(remaining.slice(0, fit), PAGE_MARGIN, sectionY);
      sectionY += Math.min(fit, remaining.length) * 4;
      remaining = remaining.slice(fit);
      if (remaining.length) {
        doc.addPage();
        sectionY = PAGE_CONTENT_TOP;
      }
    }
    sectionY += 6;
  }

  /* Footer on every page: company | Tax Invoice number, and Page n of N. */
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...INV_FOOTER);
    doc.text(fitText(doc, `${branding.companyName || displayCompanyName(branding)} | ${model.docTitle} ${model.docNumber}`, width - 30), PAGE_MARGIN, 290);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_CONTENT_RIGHT, 290, { align: "right" });
    if (branding.footerText) {
      doc.setFontSize(7);
      doc.text(fitText(doc, branding.footerText, width), PAGE_WIDTH / 2, 294.5, { align: "center" });
    }
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

export function renderDocumentPdf(model: DocumentPdfModel): Uint8Array {
  if (model.layout === "tax-invoice") return renderTaxInvoicePdf(model);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = model.totals?.currency || "ZAR";
  const generatedAt = new Date(model.generatedAtIso || new Date().toISOString());
  const palette = model.branding.palette;
  const headerRgb = hexToRgb(palette?.headerBackground, [7, 17, 31]);
  const headerTextRgb = hexToRgb(palette?.lightTextColor, [255, 255, 255]);
  const darkTextRgb = hexToRgb(palette?.darkTextColor, [15, 23, 42]);
  const logoPosition = model.branding.logoPosition || "top_left";
  const hasLogo = Boolean(model.branding.logoDataUrl);
  const logoBox = hasLogo ? resolveLogoDrawSize(doc, model.branding, resolveLogoBox(model.branding)) : null;

  // Header band
  doc.setFillColor(...headerRgb);
  doc.rect(0, 0, PAGE_WIDTH, 34, "F");
  doc.setTextColor(...headerTextRgb);

  let headerTextX = PAGE_MARGIN;
  let headerTextTop = 15;
  let headerMetaRightLimit = PAGE_CONTENT_RIGHT;

  if (hasLogo && logoBox && logoPosition !== "watermark" && logoPosition !== "footer") {
    if (logoPosition === "top_center") {
      drawLogoImage(doc, model.branding.logoDataUrl as string, (PAGE_WIDTH - logoBox.width) / 2, (34 - logoBox.height) / 2, logoBox.width, logoBox.height);
    } else if (logoPosition === "top_right") {
      drawLogoImage(doc, model.branding.logoDataUrl as string, PAGE_CONTENT_RIGHT - logoBox.width, (34 - logoBox.height) / 2, logoBox.width, logoBox.height);
      headerMetaRightLimit = PAGE_CONTENT_RIGHT - logoBox.width - 4;
    } else if (logoPosition === "full_width_header") {
      const fullWidth = PAGE_CONTENT_RIGHT - PAGE_MARGIN;
      const fullHeight = Math.min(14, logoBox.height);
      drawLogoImage(doc, model.branding.logoDataUrl as string, PAGE_MARGIN, 3, fullWidth, fullHeight);
      headerTextTop = fullHeight + 10;
    } else if (logoPosition === "custom") {
      const x = model.branding.logoPositionX ?? PAGE_MARGIN;
      const y = model.branding.logoPositionY ?? 6;
      drawLogoImage(doc, model.branding.logoDataUrl as string, x, y, logoBox.width, logoBox.height);
      headerTextX = x + logoBox.width + 4;
    } else {
      // top_left (default)
      drawLogoImage(doc, model.branding.logoDataUrl as string, PAGE_MARGIN, 6, logoBox.width, logoBox.height);
      headerTextX = PAGE_MARGIN + logoBox.width + 4;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(displayCompanyName(model.branding), headerTextX, headerTextTop);
  doc.setFontSize(13);
  doc.text(model.docTitle.toUpperCase(), headerTextX, headerTextTop + 9.5);
  if (model.docClassLabel) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(model.docClassLabel, headerTextX, headerTextTop + 14);
    doc.setFont("helvetica", "bold");
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    `${model.docNumber} · Generated ${generatedAt.toLocaleString("en-ZA")}`,
    headerTextX,
    headerTextTop + (model.docClassLabel ? 19 : 15)
  );

  const companyMetaLines = [
    model.branding.address,
    [model.branding.telephone, model.branding.email].filter(Boolean).join(" | "),
    model.branding.website,
    model.branding.vatNumber ? `VAT: ${model.branding.vatNumber}` : null,
    model.branding.registrationNumber ? `Reg: ${model.branding.registrationNumber}` : null,
  ].filter(Boolean) as string[];
  doc.setFontSize(7);
  doc.setTextColor(203, 213, 225);
  const headerMetaMaxWidth = headerMetaRightLimit - headerTextX - 4;
  companyMetaLines.forEach((line, index) =>
    doc.text(fitText(doc, line, headerMetaMaxWidth), headerMetaRightLimit, 10 + index * 4, { align: "right" })
  );

  if (hasLogo && logoBox && logoPosition === "footer") {
    drawLogoImage(doc, model.branding.logoDataUrl as string, PAGE_MARGIN, 288 - logoBox.height, logoBox.width, logoBox.height);
  }

  if (hasLogo && logoBox && logoPosition === "watermark") {
    const watermarkWidth = Math.min(120, PAGE_WIDTH * 0.55);
    const watermarkHeight = watermarkWidth * (logoBox.height / logoBox.width || 1);
    doc.saveGraphicsState();
    doc.setGState(new GState({ opacity: 0.06 }));
    drawLogoImage(
      doc,
      model.branding.logoDataUrl as string,
      (PAGE_WIDTH - watermarkWidth) / 2,
      120,
      watermarkWidth,
      watermarkHeight
    );
    doc.restoreGraphicsState();
  }

  // Notice banner (document provenance, e.g. a reprint from live data)
  let y = 40;
  if (model.notice) {
    const noticeRgb: [number, number, number] = model.notice.tone === "warning" ? [254, 243, 199] : [239, 246, 255];
    const noticeBorder: [number, number, number] = model.notice.tone === "warning" ? [217, 119, 6] : [59, 130, 246];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const noticeWidth = PAGE_CONTENT_RIGHT - PAGE_MARGIN - 6;
    const bodyLines = doc.splitTextToSize(model.notice.body, noticeWidth) as string[];
    const noticeHeight = 9 + bodyLines.length * 3.6;
    doc.setFillColor(...noticeRgb);
    doc.setDrawColor(...noticeBorder);
    doc.roundedRect(PAGE_MARGIN, y, PAGE_CONTENT_RIGHT - PAGE_MARGIN, noticeHeight, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...darkTextRgb);
    doc.text(model.notice.heading, PAGE_MARGIN + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(bodyLines, PAGE_MARGIN + 3, y + 9.5);
    y += noticeHeight + 6;
  }

  // Party blocks (company / counterparty)
  y += 4;
  doc.setTextColor(...darkTextRgb);
  const columnWidth = (PAGE_CONTENT_RIGHT - PAGE_MARGIN) / Math.max(1, model.parties.length);
  const partyTextWidth = columnWidth - 6;

  /*
   * Party detail lines wrap rather than truncate. They used to run through
   * fitText, which cut a long street address off with an ellipsis — on a full
   * tax invoice the recipient's address is a legal requirement, so losing half
   * of it to a fixed column width is not an acceptable way to make it fit.
   * The heading and name still fit on one line each by design.
   */
  const partyWrapped = model.parties.map((party) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    return party.lines.flatMap((line) => doc.splitTextToSize(line, partyTextWidth) as string[]);
  });

  model.parties.forEach((party, index) => {
    const x = PAGE_MARGIN + index * columnWidth;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(party.heading.toUpperCase(), x, y);
    doc.setTextColor(...darkTextRgb);
    doc.setFontSize(10);
    doc.text(fitText(doc, party.name, partyTextWidth), x, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    partyWrapped[index].forEach((line, lineIndex) => doc.text(line, x, y + 11 + lineIndex * 4));
  });

  const partyBlockHeight = Math.max(...partyWrapped.map((lines) => 11 + lines.length * 4), 16);
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
      doc.setTextColor(...darkTextRgb);
      doc.text(fitText(doc, field.value || "-", metaTextWidth), x, fieldY + 5);
    });
    y += metaBoxHeight + 8;
  }

  // Line items table. The header row repeats on every page and rows are never
  // split, so a long description stays with its own figures.
  autoTable(doc, {
    startY: y,
    theme: "grid",
    headStyles: { fillColor: headerRgb, textColor: headerTextRgb, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_HEIGHT - PAGE_CONTENT_BOTTOM },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    head: [model.lineColumns.map((column) => column.label)],
    body: model.lineRows.map((row) => model.lineColumns.map((column) => row[column.key] ?? "")),
    columnStyles: Object.fromEntries(
      model.lineColumns.map((column, index) => [
        index,
        { halign: column.align === "right" ? "right" : "left", cellWidth: column.width ?? "auto" },
      ])
    ),
  });

  const tableEndY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || y + 10) + 8;
  const totalsX = 120;
  let sectionY = tableEndY;

  if (model.totals) {
    // Measure the whole block first and move it to a fresh page as a unit. The
    // subtotal, VAT lines and total must be read together; splitting them across
    // a page break, or clipping the total off the bottom, makes the document
    // unusable as an invoice.
    const vatRowCount = model.totals.vatSummary?.length || 1;
    const totalsHeight = 6 + (model.totals.discountTotal ? 6 : 0) + vatRowCount * 6 + 11 + 6;
    sectionY = ensureSpace(doc, tableEndY, totalsHeight);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...darkTextRgb);
    let totalsY = sectionY;
    doc.text("Subtotal (excl VAT)", totalsX, totalsY);
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
        doc.setFontSize(8.5);
        doc.text(`${row.rate} on ${money(row.base, currency)}`, totalsX, totalsY);
        doc.text(money(row.vat, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
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
    doc.text(`Total (incl VAT) ${currency}`, totalsX, totalsY);
    doc.text(money(model.totals.grandTotal, currency), PAGE_CONTENT_RIGHT, totalsY, { align: "right" });

    sectionY = totalsY + 12;
  }

  if (model.paymentDetails?.fields.length) {
    const rows = Math.ceil(model.paymentDetails.fields.length / 3);
    const blockHeight = 8 + rows * 10 + (model.paymentDetails.reference ? 6 : 0);
    sectionY = ensureSpace(doc, sectionY, blockHeight + 4);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(PAGE_MARGIN, sectionY, PAGE_CONTENT_RIGHT - PAGE_MARGIN, blockHeight, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...darkTextRgb);
    doc.text(model.paymentDetails.heading, PAGE_MARGIN + 4, sectionY + 6);

    const payColumnWidth = (PAGE_CONTENT_RIGHT - PAGE_MARGIN - 8) / 3;
    model.paymentDetails.fields.forEach((field, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = PAGE_MARGIN + 4 + col * payColumnWidth;
      const fieldY = sectionY + 13 + row * 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(fitText(doc, field.label.toUpperCase(), payColumnWidth - 4), x, fieldY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...darkTextRgb);
      doc.text(fitText(doc, field.value || "-", payColumnWidth - 4), x, fieldY + 4.5);
    });

    if (model.paymentDetails.reference) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(model.paymentDetails.reference, PAGE_MARGIN + 4, sectionY + blockHeight - 3);
    }
    sectionY += blockHeight + 8;
  }

  if (model.notes) {
    sectionY = ensureSpace(doc, sectionY, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", PAGE_MARGIN, sectionY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const notesLines = doc.splitTextToSize(model.notes, PAGE_CONTENT_RIGHT - PAGE_MARGIN);
    doc.text(notesLines, PAGE_MARGIN, sectionY + 5);
    sectionY += 10 + notesLines.length * 4;
  }

  const termsAndConditions = model.termsAndConditions ?? model.branding.termsAndConditions ?? null;
  if (termsAndConditions) {
    sectionY = ensureSpace(doc, sectionY, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Terms & Conditions", PAGE_MARGIN, sectionY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const termsLines = doc.splitTextToSize(termsAndConditions, PAGE_CONTENT_RIGHT - PAGE_MARGIN);
    doc.text(termsLines, PAGE_MARGIN, sectionY + 5);
    sectionY += 10 + termsLines.length * 4;
  }

  if (model.authorisation?.length) {
    sectionY = ensureSpace(doc, sectionY + 4, 30);
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
      doc.setTextColor(...darkTextRgb);
    });

    if (model.branding.authorisationFooterText) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const authNoteLines = doc.splitTextToSize(model.branding.authorisationFooterText, PAGE_CONTENT_RIGHT - PAGE_MARGIN);
      doc.text(authNoteLines, PAGE_MARGIN, sectionY + 24);
      doc.setTextColor(...darkTextRgb);
    }
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
    if (model.branding.footerText) {
      doc.setFontSize(7);
      doc.text(fitText(doc, model.branding.footerText, PAGE_CONTENT_RIGHT - PAGE_MARGIN), PAGE_WIDTH / 2, 295, { align: "center" });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
