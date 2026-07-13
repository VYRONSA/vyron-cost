import OpenAI from "openai";
import type { SupplierInvoiceExtraction, SupplierInvoiceExtractionDebugResult } from "@/lib/document-intelligence-v2/types";
import { SUPPLIER_INVOICE_EXTRACTION_SCHEMA } from "@/lib/document-intelligence-v2/types";
import { validateSupplierInvoiceExtractionJson } from "@/lib/document-intelligence-v2/schema-validator";
import { normalizeSupplierInvoiceExtraction } from "@/lib/document-intelligence-v2/normalizer";

let openAIClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.includes("PASTE_YOUR")) {
      throw new Error("OPENAI_API_KEY is missing or still contains the placeholder.");
    }

    openAIClient = new OpenAI({ apiKey });
  }

  return openAIClient;
}

function buildPrompt() {
  return [
    "You are VYRON CORE Supplier Invoice Extraction V2.",
    "Extract only supplier invoice data from the attached PDF.",
    "Use null for any field that is not visible or cannot be read confidently.",
    "Return only JSON that matches the supplied schema.",
    "Never format numeric values as currency strings.",
    "Never rewrite valid ISO dates.",
  ].join(" ");
}

function parseResponseText(outputText: string) {
  const cleaned = outputText.trim().replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as unknown;
}

export async function extractSupplierInvoiceWithOpenAI(input: {
  fileName: string;
  bytes: Buffer;
  mime?: string;
  model?: string;
}): Promise<SupplierInvoiceExtraction> {
  const debug = await extractSupplierInvoiceWithOpenAIDebug(input);
  return debug.normalizedJson;
}

export async function extractSupplierInvoiceWithOpenAIDebug(input: {
  fileName: string;
  bytes: Buffer;
  mime?: string;
  model?: string;
}): Promise<SupplierInvoiceExtractionDebugResult> {
  const client = getOpenAIClient();
  const model = input.model || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o";
  const mime = input.mime || "application/pdf";
  const dataUrl = `data:${mime};base64,${input.bytes.toString("base64")}`;
  const startedAt = Date.now();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildPrompt() },
          {
            type: "input_file",
            filename: input.fileName,
            file_data: dataUrl,
          },
        ],
      },
    ],
    store: false,
    temperature: 0,
    text: {
      format: {
        type: "json_schema",
        name: "supplier_invoice_extraction",
        strict: true,
        schema: SUPPLIER_INVOICE_EXTRACTION_SCHEMA,
      },
    },
  } as any);

  const outputText = typeof response.output_text === "string" ? response.output_text : "";
  if (!outputText) {
    throw new Error(`OpenAI returned no output text for ${model}.`);
  }

  const parsed = parseResponseText(outputText);
  const validated = validateSupplierInvoiceExtractionJson(parsed);
  const normalized = normalizeSupplierInvoiceExtraction(validated);
  const validationJson = JSON.stringify(validated);
  const normalizedJson = JSON.stringify(normalized);

  return {
    modelUsed: model,
    executionTimeMs: Date.now() - startedAt,
    rawOpenAiJson: response as unknown as Record<string, unknown>,
    rawModelJson: parsed,
    validatedJson: validated,
    normalizedJson: normalized,
    normalizationChanged: validationJson !== normalizedJson,
  };
}
