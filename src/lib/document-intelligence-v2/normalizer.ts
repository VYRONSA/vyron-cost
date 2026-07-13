import type { SupplierInvoiceExtraction, SupplierInvoiceLineItem } from "@/lib/document-intelligence-v2/types";

function normalizeText(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeDate(value: string | null | undefined) {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return trimmed;
}

function normalizeMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function normalizeLineItem(lineItem: SupplierInvoiceLineItem): SupplierInvoiceLineItem {
  return {
    description: normalizeText(lineItem.description),
    quantity: normalizeText(lineItem.quantity),
    unit: normalizeText(lineItem.unit),
    unitPrice: normalizeText(lineItem.unitPrice),
    vatAmount: normalizeText(lineItem.vatAmount),
    lineTotal: normalizeText(lineItem.lineTotal),
    skuOrProductCode: normalizeText(lineItem.skuOrProductCode),
    confidenceScore: normalizeConfidence(lineItem.confidenceScore),
    fieldConfidence: {
      description: normalizeConfidence(lineItem.fieldConfidence.description),
      quantity: normalizeConfidence(lineItem.fieldConfidence.quantity),
      unit: normalizeConfidence(lineItem.fieldConfidence.unit),
      unitPrice: normalizeConfidence(lineItem.fieldConfidence.unitPrice),
      vatAmount: normalizeConfidence(lineItem.fieldConfidence.vatAmount),
      lineTotal: normalizeConfidence(lineItem.fieldConfidence.lineTotal),
      skuOrProductCode: normalizeConfidence(lineItem.fieldConfidence.skuOrProductCode),
    },
  };
}

export function normalizeSupplierInvoiceExtraction(extraction: SupplierInvoiceExtraction): SupplierInvoiceExtraction {
  return {
    supplier: normalizeText(extraction.supplier),
    invoiceNo: normalizeText(extraction.invoiceNo),
    invoiceDate: normalizeDate(extraction.invoiceDate),
    customerName: normalizeText(extraction.customerName),
    customerVatNo: normalizeText(extraction.customerVatNo),
    supplierVatNo: normalizeText(extraction.supplierVatNo),
    orderNo: normalizeText(extraction.orderNo),
    accountNumber: normalizeText(extraction.accountNumber),
    customerReference: normalizeText(extraction.customerReference),
    salesRepresentative: normalizeText(extraction.salesRepresentative),
    subtotal: normalizeMoney(extraction.subtotal),
    vat: normalizeMoney(extraction.vat),
    total: normalizeMoney(extraction.total),
    currency: normalizeText(extraction.currency),
    confidence: normalizeConfidence(extraction.confidence),
    fieldConfidence: {
      supplier: normalizeConfidence(extraction.fieldConfidence.supplier),
      invoiceNo: normalizeConfidence(extraction.fieldConfidence.invoiceNo),
      invoiceDate: normalizeConfidence(extraction.fieldConfidence.invoiceDate),
      customerName: normalizeConfidence(extraction.fieldConfidence.customerName),
      customerVatNo: normalizeConfidence(extraction.fieldConfidence.customerVatNo),
      supplierVatNo: normalizeConfidence(extraction.fieldConfidence.supplierVatNo),
      accountNumber: normalizeConfidence(extraction.fieldConfidence.accountNumber),
      orderNo: normalizeConfidence(extraction.fieldConfidence.orderNo),
      customerReference: normalizeConfidence(extraction.fieldConfidence.customerReference),
      salesRepresentative: normalizeConfidence(extraction.fieldConfidence.salesRepresentative),
      subtotal: normalizeConfidence(extraction.fieldConfidence.subtotal),
      vat: normalizeConfidence(extraction.fieldConfidence.vat),
      total: normalizeConfidence(extraction.fieldConfidence.total),
    },
    documentType: normalizeText(extraction.documentType),
    lineItems: extraction.lineItems.map(normalizeLineItem),
    warnings: extraction.warnings.map((warning) => String(warning).trim()).filter(Boolean),
    validation: {
      subtotalVatTotalCheck: extraction.validation.subtotalVatTotalCheck,
      lineItemsTotalCheck: extraction.validation.lineItemsTotalCheck,
      duplicateRisk: extraction.validation.duplicateRisk,
      missingFields: extraction.validation.missingFields.map((field) => String(field).trim()).filter(Boolean),
    },
    rawDetectedText: normalizeText(extraction.rawDetectedText),
  };
}
