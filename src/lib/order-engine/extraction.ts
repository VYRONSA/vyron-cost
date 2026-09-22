import type { SupabaseClient } from "@supabase/supabase-js";
import { OrderEngineError, raiseDbError } from "@/lib/order-engine/errors";
import { cleanText, toIsoDateOrNull, toNumberOrNull } from "@/lib/order-engine/normalize";
import { receiveOrderCandidate, type ReceiveResult } from "@/lib/order-engine/service";
import type {
  ExtractedFieldMeta,
  ExtractionConfidence,
  ExtractionMethod,
  OrderCandidate,
  OrderCandidateLine,
  OrderContext,
  OrderEngineActor,
} from "@/lib/order-engine/types";

/**
 * The canonical order-extraction contract.
 *
 * Any extractor — a future document/AI service reading a PDF, an OCR step, a
 * human keying from a scan — hands the Order Engine exactly this shape. It is
 * converted into the same OrderCandidate every other source produces, so there
 * is one pipeline: matching, validation, exceptions and approval never know
 * which extractor read the document.
 *
 * Rules:
 *  - What the document says is kept as written (source_*): a value the
 *    extractor normalised never replaces the original.
 *  - Confidence is the extractor's own statement. LOW anywhere blocks
 *    approval; MEDIUM must be reviewed; automatic methods are always reviewed.
 *  - Nothing is inferred: a date that is not unambiguous ISO is kept as source
 *    text and marked LOW, a quantity that is not a number is refused.
 *
 * No extractor is connected today (docs/order-engine/FOOD_SOCK_OPEN_DECISIONS.md).
 */

export type ExtractedValue = { confidence?: ExtractionConfidence; source?: string | null };

export type CanonicalOrderLine = {
  sku?: string | null;
  product_name?: string | null;
  quantity: number | string;
  unit?: string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  tax?: number | string | null;
  line_total?: number | string | null;
  /** Exactly as written in the document, when the extractor normalised the value above. */
  source_sku?: string | null;
  source_product_name?: string | null;
  source_quantity?: string | number | null;
  source_price?: string | number | null;
  /** Per-field confidence, keyed by the field names above. */
  confidence?: Record<string, ExtractedValue>;
};

export type CanonicalOrderExtraction = {
  version: 1;
  extractor: { name: string; version?: string | null; method: Extract<ExtractionMethod, "ai" | "ocr" | "manual" | "rule"> };
  /** The extractor's overall confidence for the document. */
  confidence: ExtractionConfidence;
  document?: { fileName?: string | null; contentType?: string | null; sha256?: string | null; pages?: number | null } | null;
  customer?: string | null;
  customer_reference?: string | null;
  po_number?: string | null;
  requested_delivery_date?: string | null;
  delivery_address?: string | null;
  currency?: string | null;
  source_order_reference?: string | null;
  context?: OrderContext | null;
  prices_include_tax?: boolean | null;
  /** Per-field confidence for the header fields above. */
  confidence_by_field?: Record<string, ExtractedValue>;
  order_lines: CanonicalOrderLine[];
};

const CONFIDENCES: ExtractionConfidence[] = ["HIGH", "MEDIUM", "LOW"];
const MAX_LINES = 500;

function fieldMeta(method: ExtractionMethod, value: ExtractedValue | undefined, fallback: ExtractionConfidence): ExtractedFieldMeta {
  const confidence = value?.confidence && CONFIDENCES.includes(value.confidence) ? value.confidence : fallback;
  return { confidence, method, source: cleanText(value?.source, 200) };
}

/** Reject a malformed extraction before anything is stored. */
export function assertExtraction(extraction: CanonicalOrderExtraction): void {
  if (!extraction || typeof extraction !== "object" || extraction.version !== 1) {
    throw new OrderEngineError("INVALID_INPUT", "An extraction must follow the canonical contract (version 1).");
  }
  if (!cleanText(extraction.extractor?.name)) throw new OrderEngineError("INVALID_INPUT", "The extraction must name its extractor.");
  if (!["ai", "ocr", "manual", "rule"].includes(String(extraction.extractor?.method))) {
    throw new OrderEngineError("INVALID_INPUT", "The extraction must state its method (ai, ocr, manual or rule).");
  }
  if (!CONFIDENCES.includes(extraction.confidence)) throw new OrderEngineError("INVALID_INPUT", "The extraction must state its confidence (HIGH, MEDIUM or LOW).");
  if (!Array.isArray(extraction.order_lines) || !extraction.order_lines.length) {
    throw new OrderEngineError("INVALID_INPUT", "The extraction found no order lines. Handle the document manually.");
  }
  if (extraction.order_lines.length > MAX_LINES) throw new OrderEngineError("INVALID_INPUT", `An extraction may have at most ${MAX_LINES} lines.`);
  extraction.order_lines.forEach((line, i) => {
    if (toNumberOrNull(line.quantity) === null) throw new OrderEngineError("INVALID_INPUT", `Extracted line ${i + 1}: quantity "${String(line.quantity)}" is not a number.`);
    if (!cleanText(line.sku) && !cleanText(line.product_name)) throw new OrderEngineError("INVALID_INPUT", `Extracted line ${i + 1} has neither a SKU nor a product name.`);
  });
}

/**
 * Canonical extraction → OrderCandidate. `sourceKey` must identify the
 * document (e.g. "<message id>#<file name>"), so the same document is one order.
 */
export function extractionToCandidate(
  extraction: CanonicalOrderExtraction,
  options: { source: "pdf" | "email"; sourceKey: string; sourceChannel?: string | null; senderEmail?: string | null }
): OrderCandidate {
  assertExtraction(extraction);
  const method = extraction.extractor.method;
  const overall = extraction.confidence;
  const headerFields: Record<string, ExtractedFieldMeta> = {};
  for (const [field, value] of Object.entries(extraction.confidence_by_field || {})) headerFields[field] = fieldMeta(method, value, overall);

  // A date that is not unambiguous ISO is never interpreted: it is kept as
  // written (in the notes) and marked uncertain.
  const rawDate = cleanText(extraction.requested_delivery_date, 60);
  const isoDate = toIsoDateOrNull(rawDate);
  if (rawDate && !isoDate) headerFields.requested_delivery_date = { confidence: "LOW", method, source: `written as "${rawDate}"` };

  const lines: OrderCandidateLine[] = extraction.order_lines.map((line, index) => {
    const fields: Record<string, ExtractedFieldMeta> = {};
    for (const [field, value] of Object.entries(line.confidence || {})) fields[field] = fieldMeta(method, value, overall);
    return {
      sourceLineReference: `line ${index + 1}`,
      sku: cleanText(line.sku, 200),
      description: cleanText(line.product_name, 500),
      unit: cleanText(line.unit, 40),
      quantity: Number(toNumberOrNull(line.quantity)),
      unitPrice: toNumberOrNull(line.unit_price),
      discountAmount: toNumberOrNull(line.discount),
      taxAmount: toNumberOrNull(line.tax),
      lineTotal: toNumberOrNull(line.line_total),
      sourceValues: {
        sku: line.source_sku !== undefined ? cleanText(line.source_sku, 200) : undefined,
        productName: line.source_product_name !== undefined ? cleanText(line.source_product_name, 500) : undefined,
        quantity: line.source_quantity !== undefined && line.source_quantity !== null ? String(line.source_quantity) : undefined,
        price: line.source_price !== undefined && line.source_price !== null ? String(line.source_price) : undefined,
      },
      extraction: { method, fields },
    };
  });

  return {
    source: options.source,
    sourceKey: options.sourceKey,
    sourceChannel: options.sourceChannel ?? (options.source === "email" ? "email" : "document"),
    sourceReference: cleanText(extraction.source_order_reference, 300) ?? cleanText(extraction.document?.fileName, 300),
    externalOrderNumber: cleanText(extraction.source_order_reference, 120),
    customerPoNumber: cleanText(extraction.po_number, 120),
    customerName: cleanText(extraction.customer, 300),
    customerReference: cleanText(extraction.customer_reference, 300),
    senderEmail: options.senderEmail ?? null,
    requestedDeliveryDate: isoDate,
    currency: cleanText(extraction.currency, 10),
    deliveryAddress: cleanText(extraction.delivery_address, 1000),
    notes: rawDate && !isoDate ? `Requested delivery date as written: "${rawDate}" (not interpreted).` : null,
    context: extraction.context ?? null,
    pricesIncludeTax: typeof extraction.prices_include_tax === "boolean" ? extraction.prices_include_tax : null,
    extraction: {
      method,
      confidence: overall,
      extractor: { name: String(extraction.extractor.name), version: extraction.extractor.version ?? null },
      fields: headerFields,
    },
    lines,
  };
}

/**
 * Receive an extracted document as an order. When the document came in an
 * e-mail, `messageRowId` links the order to that message and the message moves
 * from NEEDS_EXTRACTION to PARSED. Idempotent on the document's source key.
 */
export async function receiveExtractedOrder(
  supabase: SupabaseClient,
  companyId: string,
  input: { extraction: CanonicalOrderExtraction; sourceKey: string; messageRowId?: string | null; senderEmail?: string | null },
  actor: OrderEngineActor
): Promise<ReceiveResult> {
  const candidate = extractionToCandidate(input.extraction, {
    source: input.messageRowId ? "email" : "pdf",
    sourceKey: input.sourceKey,
    senderEmail: input.senderEmail ?? null,
  });
  if (input.messageRowId) {
    const { data, error } = await supabase
      .from("vyron_order_source_messages")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", input.messageRowId)
      .maybeSingle();
    if (error) raiseDbError(error, "Message lookup failed");
    if (!data) throw new OrderEngineError("NOT_FOUND", "The source message does not exist in this company.");
  }
  const result = await receiveOrderCandidate(supabase, companyId, candidate, actor, { sourceMessageId: input.messageRowId ?? null });
  if (input.messageRowId) {
    const { error } = await supabase
      .from("vyron_order_source_messages")
      .update({ processing_status: "PARSED", processing_error: null, intake_id: result.intake.id, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", input.messageRowId);
    if (error) raiseDbError(error, "Update message failed");
  }
  return result;
}
