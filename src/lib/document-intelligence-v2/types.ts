export type SupplierInvoiceFieldConfidence = {
  supplier: number;
  invoiceNo: number;
  invoiceDate: number;
  customerName: number;
  customerVatNo: number;
  supplierVatNo: number;
  accountNumber: number;
  orderNo: number;
  customerReference: number;
  salesRepresentative: number;
  subtotal: number;
  vat: number;
  total: number;
};

export type SupplierInvoiceLineItemFieldConfidence = {
  description: number;
  quantity: number;
  unit: number;
  unitPrice: number;
  vatAmount: number;
  lineTotal: number;
  skuOrProductCode: number;
};

export type SupplierInvoiceLineItem = {
  description: string | null;
  quantity: string | null;
  unit: string | null;
  unitPrice: string | null;
  vatAmount: string | null;
  lineTotal: string | null;
  skuOrProductCode: string | null;
  confidenceScore: number;
  fieldConfidence: SupplierInvoiceLineItemFieldConfidence;
};

export type SupplierInvoiceExtractionValidation = {
  subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review";
  lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review";
  duplicateRisk: "Low" | "Medium" | "High";
  missingFields: string[];
};

export type SupplierInvoiceExtraction = {
  supplier: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  customerName: string | null;
  customerVatNo: string | null;
  supplierVatNo: string | null;
  orderNo: string | null;
  accountNumber: string | null;
  customerReference: string | null;
  salesRepresentative: string | null;
  subtotal: number | null;
  vat: number | null;
  total: number | null;
  currency: string | null;
  confidence: number;
  fieldConfidence: SupplierInvoiceFieldConfidence;
  documentType: string | null;
  lineItems: SupplierInvoiceLineItem[];
  warnings: string[];
  validation: SupplierInvoiceExtractionValidation;
  rawDetectedText: string | null;
};

export type SupplierInvoicePdfDocument = {
  documentId: string;
  tenantId: string;
  workspaceId: string | null;
  fileName: string;
  mime: "application/pdf";
  bucket: string;
  path: string;
  bytes: Buffer;
};

export type SupplierInvoiceUploadDocument = {
  fileName: string;
  mime: "application/pdf";
  bytes: Buffer;
};

export type SupplierInvoiceExtractionDebugResult = {
  modelUsed: string;
  executionTimeMs: number;
  rawOpenAiJson: Record<string, unknown>;
  rawModelJson: unknown;
  validatedJson: SupplierInvoiceExtraction;
  normalizedJson: SupplierInvoiceExtraction;
  normalizationChanged: boolean;
};

export type SupplierInvoiceExtractionSchema = {
  type: "object";
  additionalProperties: false;
  properties: Record<string, unknown>;
  required: string[];
};

export const SUPPLIER_INVOICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "supplier",
    "invoiceNo",
    "invoiceDate",
    "customerName",
    "customerVatNo",
    "supplierVatNo",
    "orderNo",
    "accountNumber",
    "customerReference",
    "salesRepresentative",
    "subtotal",
    "vat",
    "total",
    "currency",
    "confidence",
    "fieldConfidence",
    "documentType",
    "lineItems",
    "warnings",
    "validation",
    "rawDetectedText",
  ],
  properties: {
    supplier: { anyOf: [{ type: "string" }, { type: "null" }] },
    invoiceNo: { anyOf: [{ type: "string" }, { type: "null" }] },
    invoiceDate: { anyOf: [{ type: "string" }, { type: "null" }] },
    customerName: { anyOf: [{ type: "string" }, { type: "null" }] },
    customerVatNo: { anyOf: [{ type: "string" }, { type: "null" }] },
    supplierVatNo: { anyOf: [{ type: "string" }, { type: "null" }] },
    orderNo: { anyOf: [{ type: "string" }, { type: "null" }] },
    accountNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
    customerReference: { anyOf: [{ type: "string" }, { type: "null" }] },
    salesRepresentative: { anyOf: [{ type: "string" }, { type: "null" }] },
    subtotal: { anyOf: [{ type: "number" }, { type: "null" }] },
    vat: { anyOf: [{ type: "number" }, { type: "null" }] },
    total: { anyOf: [{ type: "number" }, { type: "null" }] },
    currency: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number" },
    fieldConfidence: {
      type: "object",
      additionalProperties: false,
      required: [
        "supplier",
        "invoiceNo",
        "invoiceDate",
        "customerName",
        "customerVatNo",
        "supplierVatNo",
        "accountNumber",
        "orderNo",
        "customerReference",
        "salesRepresentative",
        "subtotal",
        "vat",
        "total",
      ],
      properties: {
        supplier: { type: "number" },
        invoiceNo: { type: "number" },
        invoiceDate: { type: "number" },
        customerName: { type: "number" },
        customerVatNo: { type: "number" },
        supplierVatNo: { type: "number" },
        accountNumber: { type: "number" },
        orderNo: { type: "number" },
        customerReference: { type: "number" },
        salesRepresentative: { type: "number" },
        subtotal: { type: "number" },
        vat: { type: "number" },
        total: { type: "number" },
      },
    },
    documentType: { anyOf: [{ type: "string" }, { type: "null" }] },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "quantity",
          "unit",
          "unitPrice",
          "vatAmount",
          "lineTotal",
          "skuOrProductCode",
          "confidenceScore",
          "fieldConfidence",
        ],
        properties: {
          description: { anyOf: [{ type: "string" }, { type: "null" }] },
          quantity: { anyOf: [{ type: "string" }, { type: "null" }] },
          unit: { anyOf: [{ type: "string" }, { type: "null" }] },
          unitPrice: { anyOf: [{ type: "string" }, { type: "null" }] },
          vatAmount: { anyOf: [{ type: "string" }, { type: "null" }] },
          lineTotal: { anyOf: [{ type: "string" }, { type: "null" }] },
          skuOrProductCode: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidenceScore: { type: "number" },
          fieldConfidence: {
            type: "object",
            additionalProperties: false,
            required: ["description", "quantity", "unit", "unitPrice", "vatAmount", "lineTotal", "skuOrProductCode"],
            properties: {
              description: { type: "number" },
              quantity: { type: "number" },
              unit: { type: "number" },
              unitPrice: { type: "number" },
              vatAmount: { type: "number" },
              lineTotal: { type: "number" },
              skuOrProductCode: { type: "number" },
            },
          },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    validation: {
      type: "object",
      additionalProperties: false,
      required: ["subtotalVatTotalCheck", "lineItemsTotalCheck", "duplicateRisk", "missingFields"],
      properties: {
        subtotalVatTotalCheck: { enum: ["Pass", "Fail", "Needs Review"] },
        lineItemsTotalCheck: { enum: ["Pass", "Fail", "Needs Review"] },
        duplicateRisk: { enum: ["Low", "Medium", "High"] },
        missingFields: { type: "array", items: { type: "string" } },
      },
    },
    rawDetectedText: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const satisfies SupplierInvoiceExtractionSchema;

export type SupplierInvoiceExtractionSchemaType = typeof SUPPLIER_INVOICE_EXTRACTION_SCHEMA;
