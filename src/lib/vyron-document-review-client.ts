import {
  type DocumentFieldRegion,
  type DocumentViewerRegions,
  type NormalizedBBox,
  estimateLineBBox,
  parseSourceBBox,
} from "@/lib/vyron-document-viewer-types";
import { computeLineAmounts, withLineAmounts } from "@/lib/vyron-invoice-line-math";
import { hydrateReviewDraft } from "@/lib/vyron-review-draft-hydrate";

export type Extraction = {
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
  fieldConfidence?: Record<string, number>;
  documentType: string;
  lineItems: Array<Record<string, unknown>>;
  warnings: string[];
  validation?: Record<string, unknown>;
  rawDetectedText?: string;
};

export type MatchOption = {
  id: string;
  name: string;
  entityType: "ingredient" | "packaging" | "product";
  currentPrice: number;
};

export type ReviewDraftLine = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  /** Line amount exclusive of VAT (qty × unit price). */
  lineExclVat?: number | null;
  vat: number | null;
  /** Line amount inclusive of VAT. */
  lineTotal: number | null;
  skuOrProductCode: string;
  confidenceScore: number | null;
  fieldConfidence: {
    description: number | null;
    quantity: number | null;
    unit: number | null;
    unitPrice: number | null;
    vatAmount: number | null;
    lineTotal: number | null;
    skuOrProductCode: number | null;
  };
  matchedEntityType: "ingredient" | "packaging" | "product" | null;
  matchedEntityId: string | null;
  matchedEntityName: string | null;
  ignored: boolean;
  suggestedMatch?: {
    entityType: string;
    entityId: string | null;
    entityName: string | null;
    confidence: number;
    matchReason?: "sku" | "description_exact" | "description_similar" | "remembered";
    mappingId?: string | null;
  } | null;
  /** OCR-ready: page index (1-based) on source document */
  sourcePage?: number | null;
  /** OCR-ready: normalized bbox on source page */
  sourceBbox?: { x: number; y: number; width: number; height: number } | null;
};

export type ReviewDraft = {
  documentId: string;
  status: string;
  viewerRegions?: DocumentViewerRegions;
  fields: {
    supplierName: string;
    supplierVatNumber: string;
    customerName: string;
    customerVatNumber: string;
    invoiceNumber: string;
    invoiceDate: string;
    purchaseOrderNumber: string;
    accountNumber: string;
    customerReference: string;
    salesRepresentative: string;
    subtotal: number | null;
    vat: number | null;
    total: number | null;
    currency: string;
    fieldConfidence: Record<string, number | null>;
  };
  lines: ReviewDraftLine[];
  matchOptions: MatchOption[];
  reconciliationNote?: string | null;
};

export function parseMoneyNumber(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(/,/g, ".");
  if (!/[0-9]/.test(cleaned)) return null;
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? `${parts.slice(0, -1).join("")}.${parts.at(-1)}` : cleaned;
  const num = Number(normalised);
  return Number.isFinite(num) ? num : null;
}

function asNullableConfidence(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function nonEmptyText(...values: Array<unknown>): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text || text === "Needs Review") continue;
    return text;
  }
  return "";
}

export async function loadReviewDraft(
  documentId: string,
  fallbackExtraction?: Extraction,
  options?: { signal?: AbortSignal }
): Promise<ReviewDraft> {
  const response = await fetch(`/api/documents/${documentId}/review`, { signal: options?.signal });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not load review draft.");
  }

  const payload = data.payload as {
    document: Record<string, unknown>;
    lines: Array<Record<string, unknown>>;
    matchOptions: MatchOption[];
  };

  const fc = (payload.document.field_confidence || {}) as Record<string, unknown>;

  const draft: ReviewDraft = {
    documentId,
    status: String(payload.document.status || ""),
    fields: {
      supplierName: nonEmptyText(payload.document.supplier_name, fallbackExtraction?.supplier),
      supplierVatNumber: nonEmptyText(payload.document.supplier_vat_number, fallbackExtraction?.supplierVatNo),
      customerName: nonEmptyText(payload.document.customer_name, fallbackExtraction?.customerName),
      customerVatNumber: nonEmptyText(payload.document.customer_vat_number, fallbackExtraction?.customerVatNo),
      invoiceNumber: nonEmptyText(payload.document.invoice_number, fallbackExtraction?.invoiceNo),
      invoiceDate: nonEmptyText(payload.document.invoice_date, fallbackExtraction?.invoiceDate),
      purchaseOrderNumber: nonEmptyText(payload.document.purchase_order_number, fallbackExtraction?.orderNo),
      accountNumber: nonEmptyText(payload.document.account_number, fallbackExtraction?.accountNumber),
      customerReference: nonEmptyText(payload.document.customer_reference, fallbackExtraction?.customerReference),
      salesRepresentative: nonEmptyText(payload.document.sales_representative, fallbackExtraction?.salesRepresentative),
      subtotal: (payload.document.subtotal as number | null) ?? parseMoneyNumber(String(fallbackExtraction?.subtotal || "")),
      vat: (payload.document.vat as number | null) ?? parseMoneyNumber(String(fallbackExtraction?.vat || "")),
      total: (payload.document.total as number | null) ?? parseMoneyNumber(String(fallbackExtraction?.total || "")),
      currency: nonEmptyText(payload.document.currency, fallbackExtraction?.currency, "ZAR") || "ZAR",
      fieldConfidence: {
        supplierName: asNullableConfidence(fc.supplier ?? fallbackExtraction?.fieldConfidence?.supplier),
        invoiceNumber: asNullableConfidence(fc.invoiceNo ?? fallbackExtraction?.fieldConfidence?.invoiceNo),
        invoiceDate: asNullableConfidence(fc.invoiceDate ?? fallbackExtraction?.fieldConfidence?.invoiceDate),
        customerName: asNullableConfidence(fc.customerName ?? fallbackExtraction?.fieldConfidence?.customerName),
        customerVatNumber: asNullableConfidence(fc.customerVatNo ?? fallbackExtraction?.fieldConfidence?.customerVatNo),
        supplierVatNumber: asNullableConfidence(fc.supplierVatNo ?? fallbackExtraction?.fieldConfidence?.supplierVatNo),
        accountNumber: asNullableConfidence(fc.accountNumber ?? fallbackExtraction?.fieldConfidence?.accountNumber),
        purchaseOrderNumber: asNullableConfidence(fc.orderNo ?? fallbackExtraction?.fieldConfidence?.orderNo),
        customerReference: asNullableConfidence(fc.customerReference ?? fallbackExtraction?.fieldConfidence?.customerReference),
        salesRepresentative: asNullableConfidence(fc.salesRepresentative ?? fallbackExtraction?.fieldConfidence?.salesRepresentative),
        subtotal: asNullableConfidence(fc.subtotal ?? fallbackExtraction?.fieldConfidence?.subtotal),
        vat: asNullableConfidence(fc.vat ?? fallbackExtraction?.fieldConfidence?.vat),
        total: asNullableConfidence(fc.total ?? fallbackExtraction?.fieldConfidence?.total),
      },
    },
    lines: (payload.lines || []).map((line) => {
      const base: ReviewDraftLine = {
      id: String(line.id),
      description: String(line.description || ""),
      quantity: (line.quantity as number | null) ?? null,
      unit: String(line.unit || ""),
      unitPrice: (line.unit_price as number | null) ?? null,
      vat: (line.vat as number | null) ?? null,
      lineTotal: (line.line_total as number | null) ?? null,
      skuOrProductCode: String(line.sku_product_code || ""),
      confidenceScore: asNullableConfidence(line.confidence_score),
      fieldConfidence: {
        description: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.description ?? line.confidence_score),
        quantity: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.quantity ?? line.confidence_score),
        unit: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.unit ?? line.confidence_score),
        unitPrice: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.unitPrice ?? line.confidence_score),
        vatAmount: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.vatAmount ?? line.confidence_score),
        lineTotal: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.lineTotal ?? line.confidence_score),
        skuOrProductCode: asNullableConfidence((line.field_confidence as Record<string, unknown>)?.skuOrProductCode ?? line.confidence_score),
      },
      matchedEntityType: (line.matched_entity_type as ReviewDraftLine["matchedEntityType"]) ?? null,
      matchedEntityId: (line.matched_entity_id as string | null) ?? null,
      matchedEntityName: (line.matched_entity_name as string | null) ?? null,
      ignored: Boolean(line.ignored),
      suggestedMatch: (line.suggested_match as ReviewDraftLine["suggestedMatch"]) ?? null,
      sourcePage: (line.source_page as number | null) ?? null,
      sourceBbox: parseSourceBBox(line.source_bbox),
      };
      const qty = base.quantity ?? 0;
      const price = base.unitPrice ?? 0;
      base.lineExclVat =
        qty && price ? Math.round(qty * price * 100) / 100 : base.lineTotal !== null && base.vat !== null ? Math.round((base.lineTotal - base.vat) * 100) / 100 : null;
      return withLineAmounts(base);
    }),
    matchOptions: payload.matchOptions || [],
    viewerRegions: buildViewerRegionsFromPayload(payload.document, payload.lines || []),
    reconciliationNote: (payload.document.reconciliation_note as string | null) ?? null,
  };

  return hydrateReviewDraft(draft);
}

function buildViewerRegionsFromPayload(
  document: Record<string, unknown>,
  lines: Array<Record<string, unknown>>
): DocumentViewerRegions {
  const rawFields = Array.isArray(document.field_regions) ? document.field_regions : [];
  const fields = rawFields
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const bbox = parseSourceBBox(row.bbox);
      if (!bbox) return null;
      return {
        id: String(row.id || row.kind || "field"),
        kind: (row.kind as DocumentFieldRegion["kind"]) || "custom",
        label: String(row.label || row.kind || "Field"),
        page: Number(row.page) || 1,
        bbox,
        targetId: row.targetId ? String(row.targetId) : undefined,
      } satisfies DocumentFieldRegion;
    })
    .filter(Boolean) as DocumentFieldRegion[];

  const lineRegions = lines
    .map((line) => {
      const bbox = parseSourceBBox(line.source_bbox);
      if (!bbox) return null;
      return {
        lineId: String(line.id),
        page: Number(line.source_page) || 1,
        bbox,
      };
    })
    .filter(Boolean) as DocumentViewerRegions["lines"];

  return {
    pageCount: typeof document.page_count === "number" ? document.page_count : undefined,
    fields,
    lines: lineRegions,
  };
}

export function buildLineFocusTarget(line: ReviewDraftLine, lineIndex: number, lineCount: number) {
  if (line.sourceBbox) {
    return {
      lineId: line.id,
      page: line.sourcePage || 1,
      bbox: line.sourceBbox as NormalizedBBox,
    };
  }
  return {
    lineId: line.id,
    page: line.sourcePage || 1,
    bbox: estimateLineBBox(lineIndex, lineCount),
  };
}

export async function saveReviewCorrections(draft: ReviewDraft) {
  const response = await fetch(`/api/documents/${draft.documentId}/review/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        supplierName: draft.fields.supplierName,
        supplierVatNumber: draft.fields.supplierVatNumber,
        customerName: draft.fields.customerName,
        customerVatNumber: draft.fields.customerVatNumber,
        invoiceNumber: draft.fields.invoiceNumber,
        invoiceDate: draft.fields.invoiceDate,
        purchaseOrderNumber: draft.fields.purchaseOrderNumber,
        accountNumber: draft.fields.accountNumber,
        customerReference: draft.fields.customerReference,
        salesRepresentative: draft.fields.salesRepresentative,
        subtotal: draft.fields.subtotal,
        vat: draft.fields.vat,
        total: draft.fields.total,
        currency: draft.fields.currency,
        fieldConfidence: {
          supplier: draft.fields.fieldConfidence.supplierName,
          invoiceNo: draft.fields.fieldConfidence.invoiceNumber,
          invoiceDate: draft.fields.fieldConfidence.invoiceDate,
          customerName: draft.fields.fieldConfidence.customerName,
          customerVatNo: draft.fields.fieldConfidence.customerVatNumber,
          supplierVatNo: draft.fields.fieldConfidence.supplierVatNumber,
          accountNumber: draft.fields.fieldConfidence.accountNumber,
          orderNo: draft.fields.fieldConfidence.purchaseOrderNumber,
          customerReference: draft.fields.fieldConfidence.customerReference,
          salesRepresentative: draft.fields.fieldConfidence.salesRepresentative,
          subtotal: draft.fields.fieldConfidence.subtotal,
          vat: draft.fields.fieldConfidence.vat,
          total: draft.fields.fieldConfidence.total,
        },
      },
      lines: draft.lines.map((line) => ({
        ...line,
        lineExclVat: line.lineExclVat ?? computeLineAmounts(line).lineExclVat,
      })),
      reconciliationNote: draft.reconciliationNote ?? null,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to save corrections.");
  }
  return data as { correctedFieldCount: number; mappedLines: number; message: string };
}

export type ApprovalViolation = {
  rule: string;
  message: string;
  severity: "error" | "warning";
};

export async function validateDocumentApproval(
  documentId: string,
  options?: { force?: boolean; forceTotalsMismatch?: boolean; hasSupervisorOverride?: boolean }
) {
  const response = await fetch(`/api/documents/${documentId}/review/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Validation failed.");
  }
  return data as {
    policyBlocked: boolean;
    validation: {
      blocked: boolean;
      violations: ApprovalViolation[];
      requiresSupervisorOverride: boolean;
    };
    message: string;
  };
}

export async function approveAndUpdateCosts(
  documentId: string,
  options?: {
    force?: boolean;
    forceTotalsMismatch?: boolean;
    reconciliationNote?: string;
    supervisorOverride?: { pin: string; reason: string; overriddenBy?: string };
  }
) {
  const response = await fetch(`/api/documents/${documentId}/review/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      force: Boolean(options?.force),
      forceTotalsMismatch: Boolean(options?.forceTotalsMismatch),
      reconciliationNote: options?.reconciliationNote ?? null,
      supervisorOverride: options?.supervisorOverride
        ? {
            pin: options.supervisorOverride.pin,
            reason: options.supervisorOverride.reason,
            overriddenBy: options.supervisorOverride.overriddenBy || "supervisor",
          }
        : undefined,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const err = new Error(data.error || "Failed to approve document.") as Error & {
      lowConfidenceFields?: string[];
      minRequiredConfidence?: number;
      totalsMismatch?: boolean;
      policyBlocked?: boolean;
      violations?: ApprovalViolation[];
      requiresSupervisorOverride?: boolean;
    };
    err.lowConfidenceFields = data.lowConfidenceFields;
    err.minRequiredConfidence = data.minRequiredConfidence;
    err.totalsMismatch = data.totalsMismatch;
    err.policyBlocked = data.policyBlocked;
    err.violations = data.violations;
    err.requiresSupervisorOverride = data.requiresSupervisorOverride;
    throw err;
  }
  return data;
}

export async function fetchNextReviewDocumentId(afterDocumentId?: string) {
  const params = afterDocumentId ? `?after=${encodeURIComponent(afterDocumentId)}` : "";
  const response = await fetch(`/api/documents/next-review${params}`);
  const data = await response.json();
  if (!response.ok || !data.ok) return null;
  return (data.documentId as string | null) ?? null;
}

export async function fetchDocumentPreview(documentId: string, options?: { signal?: AbortSignal }) {
  const response = await fetch(`/api/documents/${documentId}/preview`, { signal: options?.signal });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not load stored document preview");
  }
  return {
    previewUrl: data.previewUrl as string,
    fileName: data.fileName as string,
    fileMime: data.fileMime as string,
  };
}

export async function bulkExtractDocuments(documentIds: string[]) {
  const response = await fetch("/api/documents/bulk-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not extract selected documents.");
  }
  return data as { successCount: number; failedCount: number; message: string };
}

export async function bulkApproveDocuments(documentIds: string[], options?: { force?: boolean }) {
  const response = await fetch("/api/documents/bulk-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds, force: Boolean(options?.force) }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not approve selected documents.");
  }
  return data as { successCount: number; failedCount: number; message: string };
}

export async function bulkMarkReviewed(documentIds: string[]) {
  const response = await fetch("/api/documents/bulk-mark-reviewed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not mark documents reviewed.");
  return data as { count: number; message: string };
}

export async function bulkArchiveDocuments(documentIds: string[]) {
  const response = await fetch("/api/documents/bulk-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not archive documents.");
  return data as { count: number; message: string };
}

export async function fetchDocumentQueueStats() {
  const response = await fetch("/api/documents/queue");
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not load queue.");
  return data.queue as {
    totalUploaded: number;
    extracting: number;
    captured: number;
    needsReview: number;
    approved: number;
    failed: number;
  };
}

export async function bulkDeleteDocuments(documentIds: string[]) {
  const response = await fetch("/api/documents/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not delete selected documents.");
  }
  return data as {
    deletedCount: number;
    softDeletedCount?: number;
    permanentlyDeletedCount?: number;
    message: string;
  };
}

export async function bulkRestoreDocuments(documentIds: string[]) {
  const response = await fetch("/api/documents/bulk-restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentIds }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not restore selected documents.");
  }
  return data as { count: number; message: string };
}

export async function updateIngredientName(ingredientId: string, ingredientName: string) {
  const response = await fetch(`/api/ingredients/${ingredientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredientName }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not update ingredient.");
  }
  return data as { ingredientId: string; ingredientName: string };
}

export async function deleteDocument(documentId: string) {
  const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not delete document.");
  }
  return data;
}

export async function createEntityFromLine(
  documentId: string,
  input: {
    lineId: string;
    entityType: "ingredient" | "packaging";
    name: string;
    unit: string;
    purchaseCost: number;
    supplierName?: string;
  }
) {
  const response = await fetch(`/api/documents/${documentId}/review/create-entity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not create ingredient/packaging.");
  }
  return data as {
    entityId: string;
    entityName: string;
    entityType: "ingredient" | "packaging";
    matchOption: MatchOption;
  };
}
