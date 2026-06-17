import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";

export type DocumentListView = "inbox" | "needs-review" | "approved-today" | "archive" | "deleted";

export type DocumentListFilters = {
  search?: string;
  month?: string;
  year?: string;
  supplier?: string;
  status?: string;
};

const NEEDS_REVIEW_STATUSES = ["needs_review", "reviewed", "extracted", "extraction_failed", "upload_failed"] as const;
const INBOX_STATUSES = ["uploaded", "uploading", "extracting", "matched", "needs_review", "extraction_failed"] as const;
const ARCHIVED_STATUSES = ["approved", "archived"] as const;

export function mapUiStatus(dbStatus: string, confidence: number | null, hasDuplicateRisk = false) {
  if (hasDuplicateRisk && !ARCHIVED_STATUSES.includes(dbStatus as (typeof ARCHIVED_STATUSES)[number])) {
    return "Duplicate Risk";
  }
  const score = Number(confidence || 0);
  if (dbStatus === "uploading") return "Uploading";
  if (dbStatus === "extracting") return "Extracting";
  if (dbStatus === "uploaded") return "Uploaded";
  if (dbStatus === "needs_review") return "Needs Review";
  if (dbStatus === "extraction_failed" || dbStatus === "upload_failed") return "Needs Review";
  if (dbStatus === "archived" || dbStatus === "approved") return "Archived";
  if (dbStatus === "reviewed") return "Needs Review";
  if (dbStatus === "extracted") return score >= 75 ? "Captured" : "Needs Review";
  if (dbStatus === "matched") return "Matched";
  return "Needs Review";
}

export function mapRisk(dbStatus: string, confidence: number | null, hasDuplicateRisk = false) {
  if (hasDuplicateRisk) return "High";
  const score = Number(confidence || 0);
  if (dbStatus === "extraction_failed" || dbStatus === "upload_failed") return "High";
  if (score >= 85) return "Low";
  if (score >= 65) return "Medium";
  return "Medium";
}

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function applyArchiveFilters<T extends { supplier_name?: string | null; invoice_number?: string | null; status?: string | null; invoice_date?: string | null; approved_at?: string | null; created_at?: string | null }>(
  rows: T[],
  filters?: DocumentListFilters
) {
  if (!filters) return rows;
  let result = rows;
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    result = result.filter((row) =>
      [row.supplier_name, row.invoice_number, row.status, row.invoice_date]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }
  if (filters.supplier?.trim()) {
    const supplier = filters.supplier.trim().toLowerCase();
    result = result.filter((row) => String(row.supplier_name || "").toLowerCase().includes(supplier));
  }
  if (filters.status?.trim()) {
    const status = filters.status.trim().toLowerCase();
    result = result.filter((row) => String(row.status || "").toLowerCase() === status);
  }
  if (filters.year?.trim()) {
    result = result.filter((row) => {
      const date = String(row.invoice_date || row.approved_at || row.created_at || "").slice(0, 4);
      return date === filters.year;
    });
  }
  if (filters.month?.trim()) {
    result = result.filter((row) => {
      const date = String(row.invoice_date || row.approved_at || row.created_at || "").slice(0, 7);
      return date.endsWith(`-${filters.month!.padStart(2, "0")}`) || date === `${filters.year}-${filters.month!.padStart(2, "0")}`;
    });
  }
  return result;
}

export async function listDocumentsForView(
  supabase: SupabaseClient,
  view: DocumentListView,
  tenantId = VYRON_DEFAULT_TENANT_ID,
  filters?: DocumentListFilters
) {
  let query = supabase
    .from("vyron_documents")
    .select(
      "id, document_type, supplier_name, invoice_number, invoice_date, total, currency, confidence, status, storage_bucket, storage_path, original_filename, file_mime, created_at, deleted_at, archived_at, approved_at, approved_by, processing_notes"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (view === "deleted") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (view === "archive") {
      query = query.in("status", [...ARCHIVED_STATUSES]);
    } else if (view === "approved-today") {
      query = query.in("status", [...ARCHIVED_STATUSES]).gte("approved_at", startOfTodayIso());
    } else if (view === "needs-review") {
      query = query.in("status", [...NEEDS_REVIEW_STATUSES]);
    } else {
      query = query.in("status", [...INBOX_STATUSES]);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filtered = applyArchiveFilters(data || [], filters);

  const docIds = filtered.map((row) => row.id as string);
  const duplicateDocIds = new Set<string>();
  if (docIds.length && (view === "inbox" || view === "needs-review")) {
    const { data: risks } = await supabase
      .from("vyron_procurement_risk_alerts")
      .select("document_id")
      .eq("tenant_id", tenantId)
      .eq("risk_type", "duplicate_invoice")
      .in("document_id", docIds);
    for (const risk of risks || []) {
      if (risk.document_id) duplicateDocIds.add(String(risk.document_id));
    }
  }

  return filtered.map((row) => {
    const totalNum = row.total != null ? Number(row.total) : null;
    const total =
      totalNum != null && Number.isFinite(totalNum)
        ? `R${totalNum.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "—";
    const dbStatus = String(row.status || "uploaded");
    const hasDuplicateRisk = duplicateDocIds.has(String(row.id));

    return {
      storageDocumentId: row.id as string,
      displayId: (row.invoice_number as string) || String(row.id).slice(0, 8).toUpperCase(),
      supplier: (row.supplier_name as string) || "—",
      type: (row.document_type as string) || "Supplier Document",
      date: (row.invoice_date as string) || String(row.created_at || "").slice(0, 10),
      total,
      status: mapUiStatus(dbStatus, row.confidence as number | null, hasDuplicateRisk),
      risk: mapRisk(dbStatus, row.confidence as number | null, hasDuplicateRisk),
      fileName: (row.original_filename as string) || undefined,
      fileMime: (row.file_mime as string) || undefined,
      storagePath: (row.storage_path as string) || undefined,
      storageBucket: (row.storage_bucket as string) || undefined,
      confidence: row.confidence != null ? Number(row.confidence) : null,
      dbStatus,
      archivedAt: (row.archived_at as string) || null,
      approvedAt: (row.approved_at as string) || null,
      approvedBy: (row.approved_by as string) || null,
    };
  });
}

export type DocumentQueueStats = {
  totalUploaded: number;
  extracting: number;
  captured: number;
  needsReview: number;
  approved: number;
  failed: number;
};

export type DocumentIntelligenceStats = {
  inboxCount: number;
  needsReviewCount: number;
  approvedTodayCount: number;
  archiveCount: number;
  deletedCount: number;
  mappingCount: number;
  priceHistoryCount: number;
  costAuditCount: number;
  openRiskCount: number;
  approvedValue: number;
  uploadedToday: number;
  awaitingReview: number;
  failedExtractions: number;
  supplierPriceIncreases: number;
  potentialRecoveryIdentified: number;
};

export function emptyDocumentIntelligenceStats(): DocumentIntelligenceStats {
  return {
    inboxCount: 0,
    needsReviewCount: 0,
    approvedTodayCount: 0,
    archiveCount: 0,
    deletedCount: 0,
    mappingCount: 0,
    priceHistoryCount: 0,
    costAuditCount: 0,
    openRiskCount: 0,
    approvedValue: 0,
    uploadedToday: 0,
    awaitingReview: 0,
    failedExtractions: 0,
    supplierPriceIncreases: 0,
    potentialRecoveryIdentified: 0,
  };
}

export async function getDocumentQueueStats(supabase: SupabaseClient, tenantId = VYRON_DEFAULT_TENANT_ID): Promise<DocumentQueueStats> {
  const { data, error } = await supabase
    .from("vyron_documents")
    .select("id, status, confidence, deleted_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .limit(1000);
  if (error) throw new Error(error.message);

  const stats: DocumentQueueStats = {
    totalUploaded: 0,
    extracting: 0,
    captured: 0,
    needsReview: 0,
    approved: 0,
    failed: 0,
  };

  for (const row of data || []) {
    stats.totalUploaded += 1;
    const status = String(row.status || "uploaded");
    const confidence = Number(row.confidence || 0);
    if (status === "uploading" || status === "extracting") {
      stats.extracting += 1;
      continue;
    }
    if (status === "extraction_failed" || status === "upload_failed") {
      stats.failed += 1;
      stats.needsReview += 1;
      continue;
    }
    if (status === "archived" || status === "approved") {
      stats.approved += 1;
      continue;
    }
    if (status === "extracted" && confidence >= 75) {
      stats.captured += 1;
      continue;
    }
    if (NEEDS_REVIEW_STATUSES.includes(status as (typeof NEEDS_REVIEW_STATUSES)[number])) {
      stats.needsReview += 1;
    }
  }

  return stats;
}

export async function getDocumentIntelligenceStats(
  supabase: SupabaseClient,
  tenantId?: string | null
): Promise<DocumentIntelligenceStats> {
  if (!tenantId) return emptyDocumentIntelligenceStats();

  const todayStart = startOfTodayIso();
  const [inboxRes, needsReviewRes, approvedTodayRes, archiveRes, deletedRes, learningRes, historyRes, auditRes, riskRes, uploadedTodayRes, failedRes, priceIncreaseRes] =
    await Promise.all([
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", [...INBOX_STATUSES]),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", [...NEEDS_REVIEW_STATUSES]),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", [...ARCHIVED_STATUSES])
        .gte("approved_at", todayStart),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", [...ARCHIVED_STATUSES]),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .not("deleted_at", "is", null),
      supabase.from("vyron_supplier_line_item_mappings").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("vyron_supplier_price_history").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("vyron_document_cost_audit").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase
        .from("vyron_procurement_risk_alerts")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "open"),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .gte("created_at", todayStart),
      supabase
        .from("vyron_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .in("status", ["extraction_failed", "upload_failed"]),
      supabase
        .from("vyron_supplier_price_history")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .or("movement_type.eq.increase,percentage_change.gt.0,change_percent.gt.0")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

  const recoveryRes = await supabase
    .from("vyron_cost_recovery_opportunities")
    .select("id", { count: "exact", head: true })
    .eq("company_id", tenantId)
    .in("status", ["Open", "New", "Investigating", "In Progress"]);

  const { data: approvedTotals } = await supabase
    .from("vyron_documents")
    .select("total")
    .eq("tenant_id", tenantId)
    .in("status", [...ARCHIVED_STATUSES])
    .is("deleted_at", null)
    .limit(500);

  const approvedValue = (approvedTotals || []).reduce((sum, row) => sum + Number(row.total || 0), 0);

  return {
    inboxCount: inboxRes.count || 0,
    needsReviewCount: needsReviewRes.count || 0,
    approvedTodayCount: approvedTodayRes.count || 0,
    archiveCount: archiveRes.count || 0,
    deletedCount: deletedRes.count || 0,
    mappingCount: learningRes.count || 0,
    priceHistoryCount: historyRes.count || 0,
    costAuditCount: auditRes.count || 0,
    openRiskCount: riskRes.count || 0,
    approvedValue,
    uploadedToday: uploadedTodayRes.count || 0,
    awaitingReview: needsReviewRes.count || 0,
    failedExtractions: failedRes.count || 0,
    supplierPriceIncreases: priceIncreaseRes.count || 0,
    potentialRecoveryIdentified: recoveryRes.error ? 0 : recoveryRes.count || 0,
  };
}

export async function getSupplierLearningSummary(supabase: SupabaseClient, tenantId = VYRON_DEFAULT_TENANT_ID) {
  const { data: suppliers, error } = await supabase
    .from("vyron_supplier_invoice_learning")
    .select("supplier_name, confidence_score, last_used_at, common_line_item_descriptions")
    .eq("tenant_id", tenantId)
    .order("last_used_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const { data: topMappings } = await supabase
    .from("vyron_supplier_line_item_mappings")
    .select(
      "supplier_name, source_description, source_sku, unit, entity_name, entity_type, usage_count, confidence_score, last_seen_at, last_approved_price, disabled"
    )
    .eq("tenant_id", tenantId)
    .eq("disabled", false)
    .order("usage_count", { ascending: false })
    .limit(25);

  return {
    suppliers: suppliers || [],
    topMappings: topMappings || [],
  };
}

export async function getRecentPriceHistory(supabase: SupabaseClient, tenantId = VYRON_DEFAULT_TENANT_ID, limit = 30) {
  const { data, error } = await supabase
    .from("vyron_supplier_price_history")
    .select(
      "id, supplier_name, supplier_id, invoice_number, invoice_date, entity_type, entity_name, item_description, previous_price, new_price, price_difference, percentage_change, price_movement, movement_type, currency, document_id, approved_by, approved_at, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getArchivedDocumentDetail(supabase: SupabaseClient, documentId: string) {
  const { data: document, error: docError } = await supabase
    .from("vyron_documents")
    .select(
      "id, tenant_id, supplier_name, supplier_vat_number, customer_name, invoice_number, invoice_date, purchase_order_number, subtotal, vat, total, currency, status, approved_at, approved_by, archived_at, processing_notes, reconciliation_note, field_confidence"
    )
    .eq("id", documentId)
    .maybeSingle();
  if (docError) throw new Error(docError.message);
  if (!document) return null;
  if (!ARCHIVED_STATUSES.includes(String(document.status) as (typeof ARCHIVED_STATUSES)[number])) {
    return null;
  }

  const [
    { data: lines },
    { data: costAudit },
    { data: priceHistory },
    { data: approvalAudit },
    { data: fieldCorrections },
    { data: rollbacks },
    { data: overrideAudit },
    { data: extractionLogs },
    { data: riskAlerts },
  ] = await Promise.all([
    supabase
      .from("vyron_document_line_items")
      .select(
        "id, description, quantity, unit, unit_price, vat, line_total, sku_product_code, matched_entity_type, matched_entity_id, matched_entity_name, ignored"
      )
      .eq("document_id", documentId)
      .order("created_at", { ascending: true }),
    supabase.from("vyron_document_cost_audit").select("*").eq("document_id", documentId).order("created_at", { ascending: false }),
    supabase
      .from("vyron_supplier_price_history")
      .select(
        "id, entity_type, entity_name, item_description, previous_price, new_price, price_difference, percentage_change, price_movement, approved_by, approved_at"
      )
      .eq("document_id", documentId)
      .order("created_at", { ascending: true }),
    supabase.from("vyron_document_approval_audit").select("*").eq("document_id", documentId).order("approved_at", { ascending: false }),
    supabase.from("vyron_document_field_corrections").select("*").eq("document_id", documentId).order("corrected_at", { ascending: false }),
    supabase.from("vyron_document_cost_rollback_audit").select("*").eq("document_id", documentId).order("rolled_back_at", { ascending: false }),
    supabase
      .from("vyron_document_approval_override_audit")
      .select("*")
      .eq("document_id", documentId)
      .order("overridden_at", { ascending: false }),
    supabase
      .from("vyron_document_extraction_logs")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("vyron_procurement_risk_alerts")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    document,
    lines: lines || [],
    costAudit: costAudit || [],
    priceHistory: priceHistory || [],
    approvalAudit: approvalAudit || [],
    fieldCorrections: fieldCorrections || [],
    rollbacks: rollbacks || [],
    overrideAudit: overrideAudit || [],
    extractionLogs: extractionLogs || [],
    riskAlerts: riskAlerts || [],
  };
}
