import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovalAuditInsert = {
  tenantId: string;
  documentId: string;
  approvedBy: string;
  approvedAt: string;
  approvalNotes?: string | null;
  reconciliationNote?: string | null;
  previousStatus: string;
  newStatus?: string;
  headerSnapshot: Record<string, unknown>;
  linesSnapshot: Array<Record<string, unknown>>;
  costUpdatesCount: number;
  priceHistoryCount: number;
  metadata?: Record<string, unknown>;
};

export async function insertDocumentApprovalAudit(supabase: SupabaseClient, row: ApprovalAuditInsert) {
  const { data, error } = await supabase
    .from("vyron_document_approval_audit")
    .insert({
      tenant_id: row.tenantId,
      document_id: row.documentId,
      approved_by: row.approvedBy,
      approved_at: row.approvedAt,
      approval_notes: row.approvalNotes ?? null,
      reconciliation_note: row.reconciliationNote ?? null,
      previous_status: row.previousStatus,
      new_status: row.newStatus || "archived",
      header_snapshot: row.headerSnapshot,
      lines_snapshot: row.linesSnapshot,
      cost_updates_count: row.costUpdatesCount,
      price_history_count: row.priceHistoryCount,
      metadata: row.metadata || {},
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listDocumentApprovalAudit(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from("vyron_document_approval_audit")
    .select("*")
    .eq("document_id", documentId)
    .order("approved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

/*
 * Supervisor authority over supplier invoices is a workspace permission held by
 * the signed-in member, checked server-side on each request. There is no shared
 * PIN: the former VYRON_DOCUMENT_SUPERVISOR_PIN was one secret for every tenant
 * and recorded nothing about who used it.
 */
export const SUPPLIER_INVOICE_OVERRIDE_PERMISSION = "supplier_invoices.override";
export const SUPPLIER_INVOICE_COST_ROLLBACK_PERMISSION = "supplier_invoices.rollback_cost";
