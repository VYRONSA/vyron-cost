import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowedDocumentMime, VYRON_DOCUMENTS_BUCKET } from "@/lib/vyron-documents";

export type ExtractedLineItem = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatAmount: string;
  lineTotal: string;
  skuOrProductCode: string;
  confidenceScore: number;
  fieldConfidence: {
    description: number;
    quantity: number;
    unit: number;
    unitPrice: number;
    vatAmount: number;
    lineTotal: number;
    skuOrProductCode: number;
  };
};

export type ExtractedInvoice = {
  supplier: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerVatNo: string;
  supplierVatNo: string;
  orderNo: string;
  accountNumber: string;
  customerReference: string;
  salesRepresentative: string;
  subtotal: string;
  vat: string;
  total: string;
  currency: string;
  confidence: number;
  fieldConfidence: {
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
  documentType: string;
  lineItems: ExtractedLineItem[];
  warnings: string[];
  validation: {
    subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review";
    lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review";
    duplicateRisk: "Low" | "Medium" | "High";
    missingFields: string[];
  };
  rawDetectedText: string;
};

export type ExtractionRunLog = {
  fileName: string;
  mime: string;
  byteSize: number;
  modelUsed: string | null;
  modelsAttempted: string[];
  rawOpenAiResponsePreview: string | null;
};

const MISSING = "Needs Review";
const DEFAULT_FIELD_CONFIDENCE = 0;

function parseConfidence(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : DEFAULT_FIELD_CONFIDENCE;
}

function confidenceFrom(raw: Record<string, unknown>, key: string, fallback?: number) {
  const fields = raw.fieldConfidence as Record<string, unknown> | undefined;
  if (fields && key in fields) return parseConfidence(fields[key]);
  if (typeof fallback === "number") return parseConfidence(fallback);
  return DEFAULT_FIELD_CONFIDENCE;
}

function fieldString(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  const text = String(value).trim();
  return text || MISSING;
}

export function numberFromMoney(value: string) {
  if (!value || value === MISSING) return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}` : cleaned;
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

function money(value: unknown) {
  const text = fieldString(value);
  if (text === MISSING) return text;
  const num = numberFromMoney(text);
  if (num === null) return text;
  return `R${num.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseDate(value: unknown) {
  const text = fieldString(value);
  if (text === MISSING) return text;

  const iso = text.match(/(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const local = text.match(/(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})/);
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return text;
}

function getOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks: string[] = [];
  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const text = (block as { text?: string; content?: string }).text;
        const nested = (block as { content?: string }).content;
        if (typeof text === "string") chunks.push(text);
        if (typeof nested === "string") chunks.push(nested);
      }
    }
  }
  return chunks.join("\n").trim();
}

function parseJsonBlock(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(`The AI did not return JSON. Raw response: ${cleaned.slice(0, 600)}`);
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function validateExtraction(extraction: ExtractedInvoice): ExtractedInvoice {
  const subtotal = numberFromMoney(extraction.subtotal);
  const vat = numberFromMoney(extraction.vat);
  const total = numberFromMoney(extraction.total);

  let subtotalVatTotalCheck: "Pass" | "Fail" | "Needs Review" = "Needs Review";
  if (subtotal !== null && vat !== null && total !== null) {
    subtotalVatTotalCheck = Math.abs(subtotal + vat - total) <= 1 ? "Pass" : "Fail";
  }

  let lineItemsTotalCheck: "Pass" | "Fail" | "Needs Review" = "Needs Review";
  const lineTotals = extraction.lineItems
    .map((line) => numberFromMoney(line.lineTotal))
    .filter((value): value is number => value !== null);

  if (lineTotals.length && subtotal !== null) {
    const sum = lineTotals.reduce((acc, value) => acc + value, 0);
    lineItemsTotalCheck = Math.abs(sum - subtotal) <= Math.max(1, subtotal * 0.02) ? "Pass" : "Fail";
  }

  const missingFields = [
    ["supplier", extraction.supplier],
    ["invoiceNo", extraction.invoiceNo],
    ["invoiceDate", extraction.invoiceDate],
    ["total", extraction.total],
  ]
    .filter(([, value]) => value === MISSING)
    .map(([field]) => field as string);

  const warnings = [...(extraction.warnings || [])];
  if (subtotalVatTotalCheck === "Fail") warnings.push("Subtotal + VAT does not match invoice total.");
  if (lineItemsTotalCheck === "Fail") warnings.push("Line item totals do not match subtotal.");
  if (missingFields.length) warnings.push(`Missing required fields: ${missingFields.join(", ")}.`);

  let confidence = Number(extraction.confidence || 0);
  if (confidence > 0) {
    confidence = Math.max(
      0,
      Math.min(
        100,
        confidence -
          missingFields.length * 10 -
          (subtotalVatTotalCheck === "Fail" ? 15 : 0) -
          (lineItemsTotalCheck === "Fail" ? 10 : 0)
      )
    );
  }

  return {
    ...extraction,
    confidence,
    warnings: Array.from(new Set(warnings)),
    validation: {
      subtotalVatTotalCheck,
      lineItemsTotalCheck,
      duplicateRisk: extraction.validation?.duplicateRisk || "Low",
      missingFields,
    },
  };
}

/** Never uses filename or document id as invoice number. */
export function normaliseExtraction(raw: Record<string, unknown>, rawText: string): ExtractedInvoice {
  const lineItems = Array.isArray(raw.lineItems)
    ? raw.lineItems.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          description: fieldString(row.description || row.productDescription || row.item),
          quantity: fieldString(row.quantity || row.qty),
          unit: fieldString(row.unit || row.uom || row.measurement),
          unitPrice: money(row.unitPrice || row.price || row.rate),
          vatAmount: money(row.vatAmount || row.vat || row.taxAmount),
          lineTotal: money(row.lineTotal || row.total || row.netPrice || row.amount),
          skuOrProductCode: fieldString(row.skuOrProductCode || row.sku || row.productCode || row.code),
          confidenceScore: Number(row.confidenceScore || row.lineConfidence || row.confidence || 0),
          fieldConfidence: {
            description: confidenceFrom(row, "description", Number(row.confidenceScore || row.confidence || 0)),
            quantity: confidenceFrom(row, "quantity", Number(row.confidenceScore || row.confidence || 0)),
            unit: confidenceFrom(row, "unit", Number(row.confidenceScore || row.confidence || 0)),
            unitPrice: confidenceFrom(row, "unitPrice", Number(row.confidenceScore || row.confidence || 0)),
            vatAmount: confidenceFrom(row, "vatAmount", Number(row.confidenceScore || row.confidence || 0)),
            lineTotal: confidenceFrom(row, "lineTotal", Number(row.confidenceScore || row.confidence || 0)),
            skuOrProductCode: confidenceFrom(row, "skuOrProductCode", Number(row.confidenceScore || row.confidence || 0)),
          },
        };
      })
    : [];

  const extraction: ExtractedInvoice = {
    supplier: fieldString(raw.supplier || raw.supplierName || raw.vendor || raw.vendorName),
    invoiceNo: fieldString(raw.invoiceNo || raw.invoiceNumber || raw.documentNumber),
    invoiceDate: parseDate(raw.invoiceDate || raw.date),
    customerName: fieldString(raw.customerName || raw.customer || raw.billTo),
    customerVatNo: fieldString(raw.customerVatNo || raw.customerVATNumber || raw.customerVatNumber),
    supplierVatNo: fieldString(raw.supplierVatNo || raw.supplierVATNumber || raw.vatNo || raw.vatNumber),
    orderNo: fieldString(raw.orderNo || raw.orderNumber || raw.purchaseOrderNo || raw.poNumber),
    accountNumber: fieldString(raw.accountNumber || raw.accountNo || raw.customerAccountNumber),
    customerReference: fieldString(raw.customerReference || raw.reference || raw.customerRef),
    salesRepresentative: fieldString(raw.salesRepresentative || raw.representative || raw.salesRep),
    subtotal: money(raw.subtotal || raw.subTotal || raw.netAmount || raw.excludingVat),
    vat: money(raw.vat || raw.vatAmount || raw.tax),
    total: money(raw.total || raw.totalAmount || raw.grossAmount || raw.includingVat),
    currency: fieldString(raw.currency) === MISSING ? "ZAR" : fieldString(raw.currency),
    confidence: Number(raw.confidence || 0),
    fieldConfidence: {
      supplier: confidenceFrom(raw, "supplier", Number(raw.confidence || 0)),
      invoiceNo: confidenceFrom(raw, "invoiceNo", Number(raw.confidence || 0)),
      invoiceDate: confidenceFrom(raw, "invoiceDate", Number(raw.confidence || 0)),
      customerName: confidenceFrom(raw, "customerName", Number(raw.confidence || 0)),
      customerVatNo: confidenceFrom(raw, "customerVatNo", Number(raw.confidence || 0)),
      supplierVatNo: confidenceFrom(raw, "supplierVatNo", Number(raw.confidence || 0)),
      accountNumber: confidenceFrom(raw, "accountNumber", Number(raw.confidence || 0)),
      orderNo: confidenceFrom(raw, "orderNo", Number(raw.confidence || 0)),
      customerReference: confidenceFrom(raw, "customerReference", Number(raw.confidence || 0)),
      salesRepresentative: confidenceFrom(raw, "salesRepresentative", Number(raw.confidence || 0)),
      subtotal: confidenceFrom(raw, "subtotal", Number(raw.confidence || 0)),
      vat: confidenceFrom(raw, "vat", Number(raw.confidence || 0)),
      total: confidenceFrom(raw, "total", Number(raw.confidence || 0)),
    },
    documentType: fieldString(raw.documentType) === MISSING ? "Supplier Invoice" : fieldString(raw.documentType),
    lineItems,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map((warning) => String(warning)) : [],
    validation: {
      subtotalVatTotalCheck: "Needs Review",
      lineItemsTotalCheck: "Needs Review",
      duplicateRisk: (raw.duplicateRisk as ExtractedInvoice["validation"]["duplicateRisk"]) || "Low",
      missingFields: [],
    },
    rawDetectedText: String(raw.rawDetectedText || rawText || ""),
  };

  return validateExtraction(extraction);
}

function extractionIsUsable(extraction: ExtractedInvoice) {
  const core = [extraction.supplier, extraction.invoiceNo, extraction.invoiceDate, extraction.total];
  const populated = core.filter((value) => value !== MISSING).length;
  return populated >= 2 || extraction.confidence >= 50;
}

async function callOpenAI({
  apiKey,
  model,
  fileName,
  mime,
  dataUrl,
}: {
  apiKey: string;
  model: string;
  fileName: string;
  mime: string;
  dataUrl: string;
}) {
  const isPdf = mime === "application/pdf";

  const filePart = isPdf
    ? { type: "input_file", filename: fileName, file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl };

  const prompt = `You are VYRON COST Document AI Engine.
Extract supplier invoice fields from the document image/PDF.
Read the visual document only — never use filename.
Return ONLY valid JSON matching this schema:
{
  "supplier": "string",
  "invoiceNo": "string",
  "invoiceDate": "YYYY-MM-DD",
  "customerName": "string",
  "customerVatNo": "string",
  "supplierVatNo": "string",
  "orderNo": "string",
  "accountNumber": "string",
  "customerReference": "string",
  "salesRepresentative": "string",
  "subtotal": "numeric amount excluding VAT",
  "vat": "VAT amount",
  "total": "invoice total including VAT",
  "currency": "ZAR",
  "confidence": 0-100,
  "fieldConfidence": {
    "supplier": 0-100,
    "invoiceNo": 0-100,
    "invoiceDate": 0-100,
    "customerName": 0-100,
    "customerVatNo": 0-100,
    "supplierVatNo": 0-100,
    "accountNumber": 0-100,
    "orderNo": 0-100,
    "customerReference": 0-100,
    "salesRepresentative": 0-100,
    "subtotal": 0-100,
    "vat": 0-100,
    "total": 0-100
  },
  "documentType": "Supplier Invoice | Purchase Order | Supplier Statement | Delivery Note | Other",
  "lineItems": [{ "description": "", "quantity": "", "unit": "", "unitPrice": "", "vatAmount": "", "lineTotal": "", "skuOrProductCode": "", "confidenceScore": 0, "fieldConfidence": { "description": 0, "quantity": 0, "unit": 0, "unitPrice": 0, "vatAmount": 0, "lineTotal": 0, "skuOrProductCode": 0 } }],
  "warnings": [],
  "rawDetectedText": "brief summary"
}
Use "${MISSING}" only for fields not visible on the document.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }, filePart] }],
      temperature: 0,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const err = data.error as { message?: string } | undefined;
    throw new Error(`${model} failed: ${err?.message || JSON.stringify(data).slice(0, 800)}`);
  }

  const outputText = getOutputText(data);
  if (!outputText) {
    throw new Error(`${model} returned no extraction text.`);
  }

  return { extraction: normaliseExtraction(parseJsonBlock(outputText), outputText), rawOpenAi: data, outputText };
}

export async function runDocumentExtraction(input: {
  fileName: string;
  mime: string;
  bytes: Buffer;
}): Promise<{ extraction: ExtractedInvoice; modelUsed: string; log: ExtractionRunLog }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.includes("PASTE_YOUR")) {
    throw new Error(
      "OPENAI_API_KEY is missing or still contains the placeholder. Add your real OpenAI API key to .env.local and restart Next.js."
    );
  }

  if (!isAllowedDocumentMime(input.mime)) {
    throw new Error(`Unsupported MIME type for extraction: ${input.mime}`);
  }

  const models = [
    process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o",
    process.env.OPENAI_DOCUMENT_FALLBACK_MODEL || "gpt-4o-mini",
  ].filter((value, index, array) => value && array.indexOf(value) === index);

  const dataUrl = `data:${input.mime};base64,${input.bytes.toString("base64")}`;
  const errors: string[] = [];
  const log: ExtractionRunLog = {
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.bytes.length,
    modelUsed: null,
    modelsAttempted: [],
    rawOpenAiResponsePreview: null,
  };

  console.log("[document-extraction] request", {
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.bytes.length,
    models,
  });

  for (const model of models) {
    log.modelsAttempted.push(model);
    try {
      const result = await callOpenAI({
        apiKey,
        model,
        fileName: input.fileName,
        mime: input.mime,
        dataUrl,
      });

      log.rawOpenAiResponsePreview = result.outputText.slice(0, 2000);
      console.log("[document-extraction] raw OpenAI output preview", log.rawOpenAiResponsePreview);

      if (!extractionIsUsable(result.extraction)) {
        errors.push(`${model} returned insufficient fields.`);
        continue;
      }

      log.modelUsed = model;
      console.log("[document-extraction] success", { model, supplier: result.extraction.supplier, invoiceNo: result.extraction.invoiceNo });

      return { extraction: result.extraction, modelUsed: model, log };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${model} failed.`;
      errors.push(message);
      console.error("[document-extraction] model error", { model, message });
    }
  }

  throw new Error(`Extraction failed. ${errors.join(" | ")}`);
}

export async function logExtractionEvent(
  supabase: SupabaseClient,
  documentId: string,
  status: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("vyron_document_extraction_logs").insert({
    document_id: documentId,
    stage: "extraction",
    status,
    model: typeof metadata.model === "string" ? metadata.model : null,
    message,
    metadata,
  });
}

export async function persistExtractionToDocument(
  supabase: SupabaseClient,
  documentId: string,
  extraction: ExtractedInvoice,
  modelUsed: string
) {
  const invoiceDate =
    extraction.invoiceDate && extraction.invoiceDate !== MISSING ? extraction.invoiceDate : null;

  const { error: updateError } = await supabase
    .from("vyron_documents")
    .update({
      document_type: extraction.documentType,
      supplier_name: extraction.supplier !== MISSING ? extraction.supplier : null,
      supplier_vat_number: extraction.supplierVatNo !== MISSING ? extraction.supplierVatNo : null,
      customer_name: extraction.customerName !== MISSING ? extraction.customerName : null,
      customer_vat_number: extraction.customerVatNo !== MISSING ? extraction.customerVatNo : null,
      invoice_number: extraction.invoiceNo !== MISSING ? extraction.invoiceNo : null,
      invoice_date: invoiceDate,
      purchase_order_number: extraction.orderNo !== MISSING ? extraction.orderNo : null,
      account_number: extraction.accountNumber !== MISSING ? extraction.accountNumber : null,
      customer_reference: extraction.customerReference !== MISSING ? extraction.customerReference : null,
      sales_representative: extraction.salesRepresentative !== MISSING ? extraction.salesRepresentative : null,
      subtotal: numberFromMoney(extraction.subtotal),
      vat: numberFromMoney(extraction.vat),
      total: numberFromMoney(extraction.total),
      currency: extraction.currency,
      confidence: extraction.confidence,
      field_confidence: extraction.fieldConfidence,
      status: "extracted",
    })
    .eq("id", documentId);
  if (updateError) {
    throw new Error(`Could not persist extracted header fields: ${updateError.message}`);
  }

  const { error: deleteLinesError } = await supabase
    .from("vyron_document_line_items")
    .delete()
    .eq("document_id", documentId);
  if (deleteLinesError) {
    throw new Error(`Could not reset extracted line items: ${deleteLinesError.message}`);
  }

  if (extraction.lineItems.length) {
    const rows = extraction.lineItems.map((line) => ({
      document_id: documentId,
      description: line.description !== MISSING ? line.description : "",
      quantity: numberFromMoney(line.quantity),
      unit: line.unit !== MISSING ? line.unit : null,
      unit_price: numberFromMoney(line.unitPrice),
      vat: numberFromMoney(line.vatAmount),
      line_total: numberFromMoney(line.lineTotal),
      sku_product_code: line.skuOrProductCode !== MISSING ? line.skuOrProductCode : null,
      confidence_score: line.confidenceScore || null,
      field_confidence: line.fieldConfidence,
    }));

    const { error: insertLinesError } = await supabase.from("vyron_document_line_items").insert(rows);
    if (insertLinesError) {
      throw new Error(`Could not persist extracted line items: ${insertLinesError.message}`);
    }
  }

  await logExtractionEvent(supabase, documentId, "success", "Extraction persisted to vyron_documents.", {
    model: modelUsed,
    invoiceNo: extraction.invoiceNo,
    supplier: extraction.supplier,
  });
}

export async function loadDocumentBytes(
  supabase: SupabaseClient,
  document: {
    storage_bucket: string | null;
    storage_path: string | null;
    original_filename: string | null;
    file_mime: string | null;
  }
) {
  const bucket = document.storage_bucket || VYRON_DOCUMENTS_BUCKET;
  const path = document.storage_path;
  if (!path) {
    throw new Error("Document has no storage_path — cannot download for extraction.");
  }

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || "unknown error"}`);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const mime = document.file_mime || "application/octet-stream";
  const fileName = document.original_filename || path.split("/").pop() || "document";

  return { bytes, mime, fileName, bucket, path };
}

export async function extractStoredDocumentById(supabase: SupabaseClient, documentId: string) {
  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select("id, status, storage_bucket, storage_path, original_filename, file_mime, deleted_at")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) throw new Error(docError.message);
  if (!document) throw new Error(`Document ${documentId} not found.`);
  if (document.deleted_at) throw new Error(`Document ${documentId} was deleted.`);

  await supabase.from("vyron_documents").update({ status: "extracting" }).eq("id", documentId);

  const { bytes, mime, fileName, bucket, path } = await loadDocumentBytes(supabase, document);

  await logExtractionEvent(supabase, documentId, "started", "Bulk/queued extraction started.", {
    fileName,
    mime,
    byteSize: bytes.length,
    bucket,
    path,
  });

  const { extraction, modelUsed, log } = await runDocumentExtraction({ fileName, mime, bytes });
  await persistExtractionToDocument(supabase, documentId, extraction, modelUsed);

  return { documentId, modelUsed, extraction, log };
}
