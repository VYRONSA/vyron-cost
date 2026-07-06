import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type PdfCompany = {
  name: string;
  tradingName: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

type PdfSupplier = {
  name: string;
  email: string | null;
  phone: string | null;
};

type PdfLine = {
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  lineTotal: number;
};

type PdfPo = {
  poNumber: string;
  status: string;
  requiredDate: string | null;
  expectedDelivery: string | null;
  notes: string | null;
  terms: string | null;
  subtotal: number;
  vatAmount: number;
  discountTotal: number;
  total: number;
  currency: string;
  lineItems: PdfLine[];
};

export type PurchaseOrderPdfModel = {
  company: PdfCompany;
  supplier: PdfSupplier;
  po: PdfPo;
  generatedAtIso?: string;
};

function money(value: number, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function buildPurchaseOrderPdf(model: PurchaseOrderPdfModel): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date(model.generatedAtIso || new Date().toISOString());

  doc.setFillColor(7, 17, 31);
  doc.rect(0, 0, 210, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(model.company.tradingName || model.company.name || "VYRON COST", 14, 15);
  doc.setFontSize(11);
  doc.text("Purchase Order", 14, 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt.toLocaleString("en-ZA")}`, 14, 30);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Company", 14, 44);
  doc.text("Supplier", 108, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const companyBlock = [
    model.company.name,
    model.company.address || "Address not configured",
    [model.company.email, model.company.phone].filter(Boolean).join(" | "),
    model.company.vatNumber ? `VAT: ${model.company.vatNumber}` : "",
  ].filter(Boolean);
  const supplierBlock = [
    model.supplier.name,
    [model.supplier.email, model.supplier.phone].filter(Boolean).join(" | "),
  ].filter(Boolean);

  companyBlock.forEach((line, index) => doc.text(String(line), 14, 49 + index * 5));
  supplierBlock.forEach((line, index) => doc.text(String(line), 108, 49 + index * 5));

  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 70, 182, 26, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PO Number", 18, 78);
  doc.text("Status", 72, 78);
  doc.text("Required Date", 108, 78);
  doc.text("Expected Delivery", 152, 78);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(model.po.poNumber, 18, 84);
  doc.text(model.po.status, 72, 84);
  doc.text(model.po.requiredDate || "-", 108, 84);
  doc.text(model.po.expectedDelivery || "-", 152, 84);

  autoTable(doc, {
    startY: 104,
    theme: "grid",
    headStyles: { fillColor: [7, 17, 31], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    head: [["Line Item", "Qty", "Unit", "Unit Price", "VAT %", "VAT", "Line Total"]],
    body: model.po.lineItems.map((line) => [
      line.itemName,
      String(Number(line.quantity || 0).toFixed(4)),
      line.unit,
      money(line.unitPrice, model.po.currency),
      Number(line.vatRate || 0).toFixed(2),
      money(line.vatAmount, model.po.currency),
      money(line.lineTotal, model.po.currency),
    ]),
  });

  const tableEndY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 110) + 8;
  const rightX = 128;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Subtotal", rightX, tableEndY);
  doc.text(money(model.po.subtotal, model.po.currency), 196, tableEndY, { align: "right" });

  doc.text("VAT", rightX, tableEndY + 6);
  doc.text(money(model.po.vatAmount, model.po.currency), 196, tableEndY + 6, { align: "right" });

  doc.text("Discount", rightX, tableEndY + 12);
  doc.text(money(model.po.discountTotal, model.po.currency), 196, tableEndY + 12, { align: "right" });

  doc.setDrawColor(148, 163, 184);
  doc.line(rightX, tableEndY + 14, 196, tableEndY + 14);

  doc.setFontSize(11);
  doc.text("Total", rightX, tableEndY + 21);
  doc.text(money(model.po.total, model.po.currency), 196, tableEndY + 21, { align: "right" });

  const notesStartY = tableEndY + 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Notes", 14, notesStartY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const notesLines = doc.splitTextToSize(model.po.notes || "No notes", 182);
  doc.text(notesLines, 14, notesStartY + 5);

  const termsStartY = Math.max(notesStartY + 22, notesStartY + notesLines.length * 4 + 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Terms & Conditions", 14, termsStartY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const terms = model.po.terms || "Standard supplier terms apply. All deliveries must reference PO number. Variances require approval.";
  const termsLines = doc.splitTextToSize(terms, 182);
  doc.text(termsLines, 14, termsStartY + 5);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, 286, 196, 286);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`${model.company.name} | Purchase Order ${model.po.poNumber}`, 14, 291);
    doc.text(`Page ${page} of ${pages}`, 196, 291, { align: "right" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
