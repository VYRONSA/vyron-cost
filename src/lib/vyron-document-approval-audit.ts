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

export function isSupervisorAuthorized(supervisorPin: string | null | undefined) {
  const expected = process.env.VYRON_DOCUMENT_SUPERVISOR_PIN || "vyron-supervisor";
  const pin = supervisorPin?.trim() || "";
  return pin.length > 0 && pin === expected;
}
