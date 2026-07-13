import {
  type SupplierInvoiceExtraction,
  type SupplierInvoiceFieldConfidence,
  type SupplierInvoiceLineItem,
  type SupplierInvoiceLineItemFieldConfidence,
  SUPPLIER_INVOICE_EXTRACTION_SCHEMA,
} from "@/lib/document-intelligence-v2/types";

export class SupplierInvoiceExtractionSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierInvoiceExtractionSchemaError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNumberOrNull(value: unknown): value is number | null {
  return typeof value === "number" || value === null;
}

type SupplierInvoiceValidationRecord = {
  subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review";
  lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review";
  duplicateRisk: "Low" | "Medium" | "High";
  missingFields: string[];
};

function ensureFiniteNumber(value: unknown, path: string, errors: string[]) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number.`);
    return false;
  }
  return true;
}

function ensureStringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be an array of strings.`);
    return false;
  }
  return true;
}

function validateFieldConfidence(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  const required: (keyof SupplierInvoiceFieldConfidence)[] = [
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
  ];
  for (const key of required) {
    ensureFiniteNumber(value[key], `${path}.${key}`, errors);
  }
  return value as SupplierInvoiceFieldConfidence;
}

function validateLineItemFieldConfidence(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  const required: (keyof SupplierInvoiceLineItemFieldConfidence)[] = [
    "description",
    "quantity",
    "unit",
    "unitPrice",
    "vatAmount",
    "lineTotal",
    "skuOrProductCode",
  ];
  for (const key of required) {
    ensureFiniteNumber(value[key], `${path}.${key}`, errors);
  }
  return value as SupplierInvoiceLineItemFieldConfidence;
}

function validateLineItem(value: unknown, index: number, errors: string[]) {
  const path = `lineItems[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }

  const stringFields: (keyof SupplierInvoiceLineItem)[] = [
    "description",
    "quantity",
    "unit",
    "unitPrice",
    "vatAmount",
    "lineTotal",
    "skuOrProductCode",
  ];
  for (const key of stringFields) {
    if (!isStringOrNull(value[key])) {
      errors.push(`${path}.${String(key)} must be a string or null.`);
    }
  }

  if (!ensureFiniteNumber(value.confidenceScore, `${path}.confidenceScore`, errors)) {
    return null;
  }

  const fieldConfidence = validateLineItemFieldConfidence(value.fieldConfidence, `${path}.fieldConfidence`, errors);
  if (!fieldConfidence) {
    return null;
  }

  return value as SupplierInvoiceLineItem;
}

export function validateSupplierInvoiceExtractionJson(value: unknown): SupplierInvoiceExtraction {
  const errors: string[] = [];

  if (!isRecord(value)) {
    throw new SupplierInvoiceExtractionSchemaError("Supplier invoice extraction must be a JSON object.");
  }

  const requiredKeys = SUPPLIER_INVOICE_EXTRACTION_SCHEMA.required;
  for (const key of requiredKeys) {
    if (!(key in value)) {
      errors.push(`Missing required field: ${key}.`);
    }
  }

  const stringFields: (keyof Pick<
    SupplierInvoiceExtraction,
    | "supplier"
    | "invoiceNo"
    | "invoiceDate"
    | "customerName"
    | "customerVatNo"
    | "supplierVatNo"
    | "orderNo"
    | "accountNumber"
    | "customerReference"
    | "salesRepresentative"
    | "currency"
    | "documentType"
    | "rawDetectedText"
  >)[] = [
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
    "currency",
    "documentType",
    "rawDetectedText",
  ];
  for (const key of stringFields) {
    if (!isStringOrNull(value[key])) {
      errors.push(`${String(key)} must be a string or null.`);
    }
  }

  const numericFields: (keyof Pick<SupplierInvoiceExtraction, "subtotal" | "vat" | "total">)[] = [
    "subtotal",
    "vat",
    "total",
  ];
  for (const key of numericFields) {
    if (!isNumberOrNull(value[key])) {
      errors.push(`${String(key)} must be a number or null.`);
    }
  }

  if (!ensureFiniteNumber(value.confidence, "confidence", errors)) {
    errors.push("confidence must be a finite number.");
  }

  const fieldConfidence = validateFieldConfidence(value.fieldConfidence, "fieldConfidence", errors);
  const validation = isRecord(value.validation) ? (value.validation as Partial<SupplierInvoiceValidationRecord>) : null;
  if (!validation) {
    errors.push("validation must be an object.");
  } else {
    if (validation.subtotalVatTotalCheck !== "Pass" && validation.subtotalVatTotalCheck !== "Fail" && validation.subtotalVatTotalCheck !== "Needs Review") {
      errors.push("validation.subtotalVatTotalCheck must be Pass, Fail, or Needs Review.");
    }
    if (validation.lineItemsTotalCheck !== "Pass" && validation.lineItemsTotalCheck !== "Fail" && validation.lineItemsTotalCheck !== "Needs Review") {
      errors.push("validation.lineItemsTotalCheck must be Pass, Fail, or Needs Review.");
    }
    if (validation.duplicateRisk !== "Low" && validation.duplicateRisk !== "Medium" && validation.duplicateRisk !== "High") {
      errors.push("validation.duplicateRisk must be Low, Medium, or High.");
    }
    ensureStringArray(validation.missingFields, "validation.missingFields", errors);
  }

  if (!Array.isArray(value.lineItems)) {
    errors.push("lineItems must be an array.");
  }
  const lineItems = Array.isArray(value.lineItems)
    ? value.lineItems.map((item, index) => validateLineItem(item, index, errors)).filter(Boolean)
    : [];

  if (!Array.isArray(value.warnings) || value.warnings.some((item) => typeof item !== "string")) {
    errors.push("warnings must be an array of strings.");
  }

  if (errors.length) {
    throw new SupplierInvoiceExtractionSchemaError(`Supplier invoice extraction schema validation failed: ${errors.join(" ")}`);
  }

  const normalizedValidation = {
    subtotalVatTotalCheck: validation!.subtotalVatTotalCheck as "Pass" | "Fail" | "Needs Review",
    lineItemsTotalCheck: validation!.lineItemsTotalCheck as "Pass" | "Fail" | "Needs Review",
    duplicateRisk: validation!.duplicateRisk as "Low" | "Medium" | "High",
    missingFields: validation!.missingFields as string[],
  };

  return {
    supplier: value.supplier as string | null,
    invoiceNo: value.invoiceNo as string | null,
    invoiceDate: value.invoiceDate as string | null,
    customerName: value.customerName as string | null,
    customerVatNo: value.customerVatNo as string | null,
    supplierVatNo: value.supplierVatNo as string | null,
    orderNo: value.orderNo as string | null,
    accountNumber: value.accountNumber as string | null,
    customerReference: value.customerReference as string | null,
    salesRepresentative: value.salesRepresentative as string | null,
    subtotal: value.subtotal as number | null,
    vat: value.vat as number | null,
    total: value.total as number | null,
    currency: value.currency as string | null,
    confidence: value.confidence as number,
    fieldConfidence: fieldConfidence as SupplierInvoiceFieldConfidence,
    documentType: value.documentType as string | null,
    lineItems: lineItems as SupplierInvoiceLineItem[],
    warnings: Array.isArray(value.warnings) ? (value.warnings as string[]) : [],
    validation: normalizedValidation,
    rawDetectedText: value.rawDetectedText as string | null,
  };
}
