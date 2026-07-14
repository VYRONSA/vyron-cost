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
  subtotal: number | null;
  vat: number | null;
  total: number | null;
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

export type ExtractionTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ExtractionTraceEvent = {
  timestamp: string;
  step: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  durationMs: number;
};

export type ExtractionTraceHook = (event: ExtractionTraceEvent) => void;

type ExtractionRuntimeContext = {
  documentId?: string;
  workspaceId?: string | null;
  companyId?: string | null;
};

type ExtractionRuntimeOptions = {
  onTrace?: ExtractionTraceHook;
  context?: ExtractionRuntimeContext;
};

function first100Hex(bytes: Buffer) {
  return bytes.subarray(0, 100).toString("hex");
}

function first100Readable(bytes: Buffer) {
  return bytes
    .subarray(0, 100)
    .toString("utf8")
    .replace(/[^\x20-\x7E]/g, ".");
}

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

export function numberFromMoney(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  if (!value || value === MISSING) return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".");
  if (!/[0-9]/.test(cleaned)) return null;
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}` : cleaned;
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

function parseDate(value: unknown) {
  const text = fieldString(value);
  if (text === MISSING) return text;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const iso = text.match(/^(20\d{2})[-/](0?[1-9]|1[0-2])[-/]([12]\d|3[01]|0?[1-9])$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const local = text.match(/^([12]\d|3[01]|0?[1-9])[-/](0?[1-9]|1[0-2])[-/](20\d{2})$/);
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

function emitTrace(
  options: ExtractionRuntimeOptions | undefined,
  step: string,
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
  durationMs: number
) {
  options?.onTrace?.({
    timestamp: new Date().toISOString(),
    step,
    input,
    output,
    durationMs,
  });
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
    .filter(([, value]) => value === MISSING || value === null || value === "")
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
          unitPrice: fieldString(row.unitPrice || row.price || row.rate),
          vatAmount: fieldString(row.vatAmount || row.vat || row.taxAmount),
          lineTotal: fieldString(row.lineTotal || row.total || row.netPrice || row.amount),
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
    subtotal: numberFromMoney(raw.subtotal || raw.subTotal || raw.netAmount || raw.excludingVat),
    vat: numberFromMoney(raw.vat || raw.vatAmount || raw.tax),
    total: numberFromMoney(raw.total || raw.totalAmount || raw.grossAmount || raw.includingVat),
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
  const populated = core.filter((value) => value !== MISSING && value !== null && value !== "").length;
  return populated >= 2 || extraction.confidence >= 50;
}

async function callOpenAI({
  apiKey,
  model,
  fileName,
  mime,
  dataUrl,
  runtime,
}: {
  apiKey: string;
  model: string;
  fileName: string;
  mime: string;
  dataUrl: string;
  runtime?: ExtractionRuntimeOptions;
}) {
  const callStartedAt = Date.now();
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

  const requestBody = {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }, filePart] }],
    temperature: 0,
  };

  emitTrace(
    runtime,
    "OpenAI request body built",
    {
      executed: "YES",
      model,
      mimeType: mime,
      fileName,
      byteSize: Buffer.byteLength(dataUrl, "utf8"),
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    {
      requestBody,
    },
    0
  );

  const specCheck = isPdf
    ? {
        expectedFileType: "input_file",
        actualFileType: (filePart as { type: string }).type,
        hasFileData: typeof (filePart as { file_data?: unknown }).file_data === "string",
        fileDataPrefixOk: String((filePart as { file_data?: unknown }).file_data || "").startsWith(`data:${mime};base64,`),
      }
    : {
        expectedFileType: "input_image",
        actualFileType: (filePart as { type: string }).type,
        hasImageUrl: typeof (filePart as { image_url?: unknown }).image_url === "string",
        imageUrlPrefixOk: String((filePart as { image_url?: unknown }).image_url || "").startsWith(`data:${mime};base64,`),
      };
  const specConforms = isPdf
    ? specCheck.actualFileType === "input_file" && specCheck.hasFileData && specCheck.fileDataPrefixOk
    : specCheck.actualFileType === "input_image" && specCheck.hasImageUrl && specCheck.imageUrlPrefixOk;

  emitTrace(
    runtime,
    "OpenAI payload spec verification",
    {
      executed: "YES",
      mimeType: mime,
      model,
    },
    {
      conforms: specConforms ? "YES" : "NO",
      checks: specCheck,
      mismatch: specConforms ? null : "Request body file object does not match expected Responses API input shape.",
    },
    0
  );

  emitTrace(
    runtime,
    "Prompt built",
    {
      executed: "YES",
      model,
      fileName,
      mime,
      isPdf,
      promptLength: prompt.length,
      documentId: runtime?.context?.documentId || null,
      first100Bytes: Buffer.from(prompt, "utf8").subarray(0, 100).toString("utf8"),
    },
    {
      promptPreview: prompt.slice(0, 500),
    },
    0
  );

  const requestStartedAt = Date.now();
  emitTrace(
    runtime,
    "OpenAI request started",
    {
      executed: "YES",
      model,
      endpoint: "https://api.openai.com/v1/responses",
      fileName,
      mime,
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    null,
    0
  );

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...requestBody,
    }),
  });

  const data = (await response.json()) as Record<string, unknown>;

  emitTrace(
    runtime,
    "OpenAI response received",
    {
      executed: "YES",
      model,
      status: response.status,
      ok: response.ok,
    },
    {
      responseKeys: Object.keys(data),
      outputTextLength: getOutputText(data).length,
    },
    Date.now() - requestStartedAt
  );

  if (!response.ok) {
    console.error("[documents/extract/runtime] OpenAI error", {
      timestamp: new Date().toISOString(),
      step: "OpenAI response received",
      httpStatus: response.status,
      responseBody: data,
      documentId: runtime?.context?.documentId || null,
      workspaceId: runtime?.context?.workspaceId || null,
      companyId: runtime?.context?.companyId || null,
    });
    const err = data.error as { message?: string } | undefined;
    throw new Error(`${model} failed: ${err?.message || JSON.stringify(data).slice(0, 800)}`);
  }

  const outputText = getOutputText(data);
  if (!outputText) {
    throw new Error(`${model} returned no extraction text.`);
  }

  const parsedStartedAt = Date.now();
  let parsedJson: Record<string, unknown>;
  try {
    parsedJson = parseJsonBlock(outputText);
  } catch (error) {
    console.error("[documents/extract/runtime] JSON parse failed", {
      timestamp: new Date().toISOString(),
      step: "JSON parsed",
      rawAiResponse: outputText,
      documentId: runtime?.context?.documentId || null,
      workspaceId: runtime?.context?.workspaceId || null,
      companyId: runtime?.context?.companyId || null,
    });
    throw error;
  }

  emitTrace(
    runtime,
    "JSON parsed",
    {
      model,
      rawResponseLength: outputText.length,
    },
    {
      parsedKeys: Object.keys(parsedJson),
    },
    Date.now() - parsedStartedAt
  );

  const validationStartedAt = Date.now();
  const extraction = normaliseExtraction(parsedJson, outputText);
  emitTrace(
    runtime,
    "Validation completed",
    {
      model,
      invoiceNo: extraction.invoiceNo,
      supplier: extraction.supplier,
    },
    {
      confidence: extraction.confidence,
      warningsCount: extraction.warnings.length,
      lineItems: extraction.lineItems.length,
      usable: extractionIsUsable(extraction),
    },
    Date.now() - validationStartedAt
  );

  const usageRaw = (data as { usage?: Record<string, unknown> }).usage;
  const usage: ExtractionTokenUsage | null = usageRaw
    ? {
        promptTokens: Number(usageRaw.input_tokens || 0),
        completionTokens: Number(usageRaw.output_tokens || 0),
        totalTokens: Number(usageRaw.total_tokens || 0),
      }
    : null;

  return { extraction, rawOpenAi: data, outputText, usage, apiExecutionTimeMs: Date.now() - callStartedAt };
}

export async function runDocumentExtraction(input: {
  fileName: string;
  mime: string;
  bytes: Buffer;
}, options?: ExtractionRuntimeOptions): Promise<{
  extraction: ExtractedInvoice;
  modelUsed: string;
  log: ExtractionRunLog;
  usage: ExtractionTokenUsage | null;
  executionTimeMs: number;
}> {
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

  emitTrace(
    options,
    "Buffer prepared",
    {
      executed: "YES",
      fileName: input.fileName,
      mimeType: input.mime,
      byteSize: input.bytes.length,
      first100Bytes: first100Hex(input.bytes),
      first100Readable: first100Readable(input.bytes),
    },
    {
      bufferLength: input.bytes.length,
    },
    0
  );

  const base64StartedAt = Date.now();
  const base64 = input.bytes.toString("base64");
  emitTrace(
    options,
    "Base64 conversion completed",
    {
      executed: "YES",
      mimeType: input.mime,
      byteSize: input.bytes.length,
      first100Bytes: first100Hex(input.bytes),
    },
    {
      base64Length: base64.length,
      first100Bytes: base64.slice(0, 100),
    },
    Date.now() - base64StartedAt
  );

  const dataUrlStartedAt = Date.now();
  const dataUrl = `data:${input.mime};base64,${base64}`;
  emitTrace(
    options,
    "Data URL constructed",
    {
      executed: "YES",
      mimeType: input.mime,
      base64Length: base64.length,
      first100Bytes: base64.slice(0, 100),
    },
    {
      dataUrlLength: dataUrl.length,
      first100Bytes: dataUrl.slice(0, 100),
    },
    Date.now() - dataUrlStartedAt
  );

  const errors: string[] = [];
  const log: ExtractionRunLog = {
    fileName: input.fileName,
    mime: input.mime,
    byteSize: input.bytes.length,
    modelUsed: null,
    modelsAttempted: [],
    rawOpenAiResponsePreview: null,
  };

  for (const model of models) {
    log.modelsAttempted.push(model);
    try {
      const result = await callOpenAI({
        apiKey,
        model,
        fileName: input.fileName,
        mime: input.mime,
        dataUrl,
        runtime: options,
      });

      log.rawOpenAiResponsePreview = result.outputText.slice(0, 2000);

      if (!extractionIsUsable(result.extraction)) {
        errors.push(`${model} returned insufficient fields.`);
        continue;
      }

      log.modelUsed = model;

      return {
        extraction: result.extraction,
        modelUsed: model,
        log,
        usage: result.usage,
        executionTimeMs: result.apiExecutionTimeMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${model} failed.`;
      errors.push(message);
      console.error("[document-extraction] model error", {
        model,
        message,
        documentId: options?.context?.documentId || null,
        workspaceId: options?.context?.workspaceId || null,
        companyId: options?.context?.companyId || null,
        stack: error instanceof Error ? error.stack || null : null,
      });
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
  modelUsed: string,
  options?: ExtractionRuntimeOptions
) {
  const invoiceDate =
    extraction.invoiceDate && extraction.invoiceDate !== MISSING ? extraction.invoiceDate : null;

  const headerWhere = { id: documentId };
  const headerUpdateStartedAt = Date.now();
  const { data: updatedHeaders, error: updateError } = await supabase
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
    .eq("id", documentId)
    .select("id");

  emitTrace(
    options,
    "Database update completed",
    {
      table: "vyron_documents",
      where: headerWhere,
      documentId,
    },
    {
      affectedRows: Array.isArray(updatedHeaders) ? updatedHeaders.length : 0,
    },
    Date.now() - headerUpdateStartedAt
  );

  if (updateError) {
    throw new Error(`Could not persist extracted header fields: ${updateError.message}`);
  }
  if (!updatedHeaders?.length) {
    console.error("[documents/extract/runtime] Database update affected 0 rows", {
      timestamp: new Date().toISOString(),
      sql: "update vyron_documents set ... where id = :documentId",
      where: headerWhere,
      workspaceId: options?.context?.workspaceId || null,
      companyId: options?.context?.companyId || null,
      documentId,
    });
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
