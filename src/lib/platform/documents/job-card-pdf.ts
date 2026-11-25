import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DocumentPdfBranding } from "@/lib/platform/documents/vyron-document-pdf-engine";
import type { JobCardDocument } from "@/lib/vyron-job-cards";

/**
 * Production Job Card PDF. Several cards may be rendered into one file; each
 * card starts on a new page. Lays out what the model carries — no quantity is
 * calculated here.
 */

const M = 14;
const W = 210;
const RIGHT = W - M;
const BOTTOM = 280;
const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [71, 85, 105];
const GRID: [number, number, number] = [203, 213, 225];
const HEADER: [number, number, number] = [30, 41, 59];

const STATUS_TONE: Record<string, [number, number, number]> = {
  "Awaiting Production": [217, 119, 6],
  "In Production": [37, 99, 235],
  Completed: [5, 150, 105],
  "On Hold": [190, 18, 60],
};

function saDate(value: string | null | undefined) {
  if (!value) return "Not specified";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "short", year: "numeric" });
}

function qty(n: number) {
  return Number(n || 0).toLocaleString("en-ZA", { maximumFractionDigits: 4 });
}

function ensure(doc: jsPDF, y: number, needed: number) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage();
  return 20;
}

function drawHeader(doc: jsPDF, card: JobCardDocument, branding: DocumentPdfBranding) {
  doc.setFillColor(...HEADER);
  doc.rect(0, 0, W, 34, "F");
  let textX = M;
  if (branding.logoDataUrl) {
    try {
      const props = doc.getImageProperties(branding.logoDataUrl);
      const h = 18;
      const w = Math.min(40, (props.width / props.height) * h);
      doc.addImage(branding.logoDataUrl, M, 8, w, h);
      textX = M + w + 5;
    } catch {
      /* the logo is optional */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(branding.tradingName || branding.companyName || "", textX, 12);
  doc.setFontSize(18);
  doc.text("PRODUCTION JOB CARD", textX, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Linked to ${card.sourceType === "customer_sales_order" ? "Sales Order" : "Store Order"} ${card.orderNumber}`, textX, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(card.card.jobCardNumber, RIGHT, 15, { align: "right" });
  const tone = STATUS_TONE[card.card.status] ?? MUTED;
  const label = card.card.status.toUpperCase();
  doc.setFontSize(8.5);
  const bw = doc.getTextWidth(label) + 6;
  doc.setFillColor(...tone);
  doc.roundedRect(RIGHT - bw, 19, bw, 6.5, 1.5, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(label, RIGHT - bw / 2, 23.4, { align: "center" });
}

export function renderJobCardsPdf(cards: JobCardDocument[], branding: DocumentPdfBranding, printedBy: string): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const printedAt = new Date().toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" });
  const firstPageOf: number[] = [];

  cards.forEach((card, index) => {
    if (index > 0) doc.addPage();
    firstPageOf.push(doc.getNumberOfPages());
    drawHeader(doc, card, branding);

    // Order facts
    autoTable(doc, {
      startY: 40,
      margin: { left: M, right: M },
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: GRID, lineWidth: 0.2 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 34, textColor: MUTED }, 2: { fontStyle: "bold", cellWidth: 34, textColor: MUTED } },
      body: [
        ["Job Card No.", card.card.jobCardNumber, "Original Order No.", card.orderNumber],
        [card.customerLabel, card.customerName || "—", "Order Status", card.orderStatus],
        ["Order Received", saDate(card.orderReceivedDate), "Required Date", saDate(card.requiredDate)],
        ["Production Status", card.card.status, "Printed", `${printedAt} by ${printedBy}`],
      ],
    });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

    // Products
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("Products to produce", M, y);
    autoTable(doc, {
      startY: y + 2,
      margin: { left: M, right: M },
      theme: "striped",
      headStyles: { fillColor: HEADER, textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK },
      columnStyles: { 2: { halign: "right" } },
      head: [["Product", "Item Code", "Qty Required", "Unit", "BOM / Recipe Reference"]],
      body: card.items.map((i) => [i.productName, i.itemCode || "—", qty(i.quantity), i.unit, i.bomReference || "No usable BOM"]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

    // Ingredients per product
    for (const item of card.items) {
      y = ensure(doc, y, 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(`Required ingredients — ${item.productName} × ${qty(item.quantity)} ${item.unit}`, M, y);
      y += 1.5;
      if (item.bomWarning) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const warn = doc.splitTextToSize(`WARNING: ${item.bomWarning}`, RIGHT - M - 4);
        const h = warn.length * 3.6 + 3;
        y = ensure(doc, y, h + 2);
        doc.setFillColor(254, 243, 199);
        doc.rect(M, y + 1, RIGHT - M, h, "F");
        doc.setTextColor(120, 53, 15);
        doc.text(warn, M + 2, y + 4.5);
        y += h + 2;
      }
      if (item.ingredients && item.ingredients.length) {
        autoTable(doc, {
          startY: y + 1,
          margin: { left: M, right: M },
          theme: "grid",
          headStyles: { fillColor: [241, 245, 249], textColor: INK, fontSize: 7.5 },
          styles: { fontSize: 8, cellPadding: 1.4, textColor: INK, lineColor: GRID, lineWidth: 0.15 },
          columnStyles: { 2: { halign: "right" }, 4: { cellWidth: 22 } },
          head: [["Ingredient / Packaging", "Type", "Required Qty", "Unit", "Issued"]],
          body: item.ingredients.map((g) => [g.name, g.lineType, qty(g.quantity), g.unit, ""]),
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
      } else if (!item.bomWarning) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text("The BOM has no ingredient or packaging lines.", M, y + 4);
        y += 7;
      } else {
        y += 2;
      }
    }

    // Special instructions
    y = ensure(doc, y, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text("Special instructions", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const instr = doc.splitTextToSize(card.specialInstructions?.trim() || "None recorded on the order.", RIGHT - M - 4);
    const ih = Math.max(8, instr.length * 3.8 + 3);
    y = ensure(doc, y + 1.5, ih);
    doc.setDrawColor(...GRID);
    doc.rect(M, y, RIGHT - M, ih);
    doc.text(instr, M + 2, y + 4.5);
    y += ih + 5;

    // Production notes
    y = ensure(doc, y, 34);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text("Production notes", M, y);
    doc.rect(M, y + 1.5, RIGHT - M, 26);
    for (let i = 1; i <= 4; i++) {
      doc.setDrawColor(226, 232, 240);
      doc.line(M + 2, y + 1.5 + i * 5.5, RIGHT - 2, y + 1.5 + i * 5.5);
    }
    doc.setDrawColor(...GRID);
    y += 33;

    // Sign-off
    y = ensure(doc, y, 26);
    const colW = (RIGHT - M - 8) / 3;
    const blocks = ["Prepared by", "Production sign-off", "Quality / Supervisor"];
    blocks.forEach((label, i) => {
      const x = M + i * (colW + 4);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...INK);
      doc.text(label, x, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.line(x, y + 9, x + colW, y + 9);
      doc.text("Name & signature", x, y + 12);
      doc.line(x, y + 19, x + colW, y + 19);
      doc.text("Date & time", x, y + 22);
    });
  });

  // Footers: per card page numbering.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    let cardIdx = 0;
    for (let i = 0; i < firstPageOf.length; i++) if (firstPageOf[i] <= p) cardIdx = i;
    const card = cards[cardIdx];
    const start = firstPageOf[cardIdx];
    const end = cardIdx + 1 < firstPageOf.length ? firstPageOf[cardIdx + 1] - 1 : total;
    doc.setDrawColor(...GRID);
    doc.line(M, 286, RIGHT, 286);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `${card.card.jobCardNumber} · Order ${card.orderNumber} · Printing this job card does not create or change an order.`,
      M,
      290
    );
    doc.text(`Page ${p - start + 1} of ${end - start + 1}`, RIGHT, 290, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
