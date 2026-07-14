import type { DocumentPdfBranding, DocumentPdfModel } from "@/lib/platform/documents/vyron-document-pdf-engine";

export type PreviewDocumentType =
  | "purchase_order"
  | "goods_receipt"
  | "customer_invoice"
  | "sales_order"
  | "quotation";

export const PREVIEW_DOCUMENT_TYPES: { value: PreviewDocumentType; label: string }[] = [
  { value: "purchase_order", label: "Purchase Order" },
  { value: "goods_receipt", label: "Goods Receipt" },
  { value: "customer_invoice", label: "Customer Invoice" },
  { value: "sales_order", label: "Sales Order" },
  { value: "quotation", label: "Quotation" },
];

const SAMPLE_COMPANY_PARTY = (branding: DocumentPdfBranding) => ({
  heading: "Company",
  name: branding.tradingName || branding.companyName,
  lines: [
    branding.address,
    branding.postalAddress ? `Postal: ${branding.postalAddress}` : null,
    [branding.telephone, branding.email].filter(Boolean).join(" | "),
    branding.website,
    branding.vatNumber ? `VAT: ${branding.vatNumber}` : null,
    branding.registrationNumber ? `Reg: ${branding.registrationNumber}` : null,
  ].filter(Boolean) as string[],
});

/**
 * Builds representative sample DocumentPdfModel data for the Branding Designer's live preview.
 * No real document record is required — this only exercises the Document Engine's rendering
 * with the branding under construction, exactly like the "template" preview in Sage/Business Central.
 */
export function buildPreviewDocumentModel(type: PreviewDocumentType, branding: DocumentPdfBranding): DocumentPdfModel {
  const company = SAMPLE_COMPANY_PARTY(branding);

  switch (type) {
    case "purchase_order":
      return {
        docTitle: "Purchase Order",
        docNumber: "PO-SAMPLE-001",
        branding,
        parties: [
          company,
          { heading: "Supplier", name: "Sample Supplier (Pty) Ltd", lines: ["orders@samplesupplier.co.za", "Terms: 30 Days"] },
        ],
        meta: [
          { label: "PO Number", value: "PO-SAMPLE-001" },
          { label: "Status", value: "Approved" },
          { label: "Order Date", value: new Date().toISOString().slice(0, 10) },
          { label: "Expected Delivery", value: "-" },
        ],
        lineColumns: [
          { key: "item", label: "Line Item" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "unit", label: "Unit" },
          { key: "unitPrice", label: "Unit Price", align: "right" },
          { key: "vatRate", label: "VAT %", align: "right" },
          { key: "vatAmount", label: "VAT", align: "right" },
          { key: "lineTotal", label: "Line Total", align: "right" },
        ],
        lineRows: [
          { item: "Sample Ingredient A", qty: "10.0000", unit: "kg", unitPrice: "45.00", vatRate: "15.00", vatAmount: "67.50", lineTotal: "517.50" },
          { item: "Sample Packaging B", qty: "500.0000", unit: "unit", unitPrice: "1.20", vatRate: "15.00", vatAmount: "90.00", lineTotal: "690.00" },
        ],
        totals: { subtotal: 1050, vatAmount: 157.5, grandTotal: 1207.5 },
        notes: "Sample purchase order for branding preview purposes only.",
        termsAndConditions: branding.termsAndConditions || "Standard supplier terms apply. All deliveries must reference PO number.",
        authorisation: [
          { label: "Prepared By", value: "" },
          { label: "Approved By", value: "" },
        ],
      };

    case "goods_receipt":
      return {
        docTitle: "Goods Receipt Note",
        docNumber: "GRN-SAMPLE-001",
        branding,
        parties: [company, { heading: "Supplier", name: "Sample Supplier (Pty) Ltd", lines: [] }],
        meta: [
          { label: "GRN Number", value: "GRN-SAMPLE-001" },
          { label: "Purchase Order", value: "PO-SAMPLE-001" },
          { label: "Status", value: "Posted" },
          { label: "Received By", value: "Warehouse A" },
        ],
        lineColumns: [
          { key: "item", label: "Line Item" },
          { key: "unit", label: "Unit" },
          { key: "ordered", label: "Ordered", align: "right" },
          { key: "received", label: "Received", align: "right" },
          { key: "damaged", label: "Damaged", align: "right" },
          { key: "rejected", label: "Rejected", align: "right" },
        ],
        lineRows: [
          { item: "Sample Ingredient A", unit: "kg", ordered: "10.0000", received: "10.0000", damaged: "0.0000", rejected: "0.0000" },
        ],
        notes: "Sample goods receipt for branding preview purposes only.",
        authorisation: [
          { label: "Received By", value: "" },
          { label: "Approved By", value: "" },
        ],
      };

    case "customer_invoice":
      return {
        docTitle: "Customer Invoice",
        docNumber: "SI-SAMPLE-001",
        branding,
        parties: [
          company,
          {
            heading: "Customer",
            name: "Sample Customer (Pty) Ltd",
            lines: ["accounts@samplecustomer.co.za", "VAT: 4123456789", "Terms: 30 Days"],
          },
        ],
        meta: [
          { label: "Invoice Number", value: "SI-SAMPLE-001" },
          { label: "Status", value: "Draft" },
          { label: "Invoice Date", value: new Date().toISOString().slice(0, 10) },
          { label: "Due Date", value: new Date().toISOString().slice(0, 10) },
        ],
        lineColumns: [
          { key: "code", label: "Product Code" },
          { key: "product", label: "Product" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "unitPrice", label: "Unit Price", align: "right" },
          { key: "lineTotal", label: "Line Total", align: "right" },
        ],
        lineRows: [
          { code: "FG-001", product: "Sample Finished Good", qty: "12.00", unitPrice: "89.90", lineTotal: "1078.80" },
        ],
        totals: { subtotal: 1078.8, vatAmount: 161.82, grandTotal: 1240.62 },
        authorisation: [
          { label: "Prepared By", value: "" },
          { label: "Approved By", value: "" },
        ],
      };

    case "sales_order":
      return {
        docTitle: "Sales Order",
        docNumber: "SO-SAMPLE-001",
        branding,
        parties: [
          company,
          {
            heading: "Customer",
            name: "Sample Customer (Pty) Ltd",
            lines: ["Billing: 1 Sample Street, Cape Town", "accounts@samplecustomer.co.za"],
          },
        ],
        meta: [
          { label: "Order Number", value: "SO-SAMPLE-001" },
          { label: "Status", value: "Approved" },
          { label: "Requested Delivery", value: new Date().toISOString().slice(0, 10) },
          { label: "Warehouse", value: "Main" },
        ],
        lineColumns: [
          { key: "code", label: "Product Code" },
          { key: "description", label: "Description" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "unit", label: "Unit" },
          { key: "price", label: "Unit Price", align: "right" },
          { key: "taxRate", label: "Tax %", align: "right" },
          { key: "lineTotal", label: "Line Total", align: "right" },
        ],
        lineRows: [
          { code: "FG-001", description: "Sample Finished Good", qty: "6.00", unit: "unit", price: "120.00", taxRate: "15.00", lineTotal: "828.00" },
        ],
        totals: {
          subtotal: 720,
          vatAmount: 108,
          vatSummary: [{ rate: "15.00%", base: 720, vat: 108 }],
          grandTotal: 828,
        },
        authorisation: [
          { label: "Prepared By", value: "" },
          { label: "Approved By", value: "" },
        ],
      };

    case "quotation":
      return {
        docTitle: "Quotation",
        docNumber: "QU-SAMPLE-001",
        branding,
        parties: [
          company,
          { heading: "Customer", name: "Sample Prospect (Pty) Ltd", lines: ["procurement@sampleprospect.co.za"] },
        ],
        meta: [
          { label: "Quotation Number", value: "QU-SAMPLE-001" },
          { label: "Status", value: "Draft" },
          { label: "Quotation Date", value: new Date().toISOString().slice(0, 10) },
          { label: "Valid Until", value: new Date().toISOString().slice(0, 10) },
        ],
        lineColumns: [
          { key: "description", label: "Description" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "unitPrice", label: "Unit Price", align: "right" },
          { key: "lineTotal", label: "Line Total", align: "right" },
        ],
        lineRows: [
          { description: "Sample Finished Good", qty: "10.00", unitPrice: "99.00", lineTotal: "990.00" },
        ],
        totals: { subtotal: 990, vatAmount: 148.5, grandTotal: 1138.5 },
        notes: "This quotation is valid for 30 days from the date above.",
        authorisation: [
          { label: "Prepared By", value: "" },
          { label: "Accepted By", value: "" },
        ],
      };
  }
}
