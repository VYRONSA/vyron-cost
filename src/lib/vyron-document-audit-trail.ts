import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadDocumentAuditTrail(supabase: SupabaseClient, documentId: string) {
  const [
    costAudit,
    approvalAudit,
    overrideAudit,
    fieldCorrections,
    rollbacks,
    extractionLogs,
    riskAlerts,
    priceHistory,
  ] = await Promise.all([
    supabase.from("vyron_document_cost_audit").select("*").eq("document_id", documentId).order("created_at", { ascending: false }),
    supabase.from("vyron_document_approval_audit").select("*").eq("document_id", documentId).order("approved_at", { ascending: false }),
    supabase
      .from("vyron_document_approval_override_audit")
      .select("*")
      .eq("document_id", documentId)
      .order("overridden_at", { ascending: false }),
    supabase.from("vyron_document_field_corrections").select("*").eq("document_id", documentId).order("corrected_at", { ascending: false }),
    supabase.from("vyron_document_cost_rollback_audit").select("*").eq("document_id", documentId).order("rolled_back_at", { ascending: false }),
    supabase.from("vyron_document_extraction_logs").select("*").eq("document_id", documentId).order("created_at", { ascending: false }).limit(20),
    supabase
      .from("vyron_procurement_risk_alerts")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
    supabase
      .from("vyron_supplier_price_history")
      .select("id, entity_name, previous_price, new_price, price_movement, approved_at, created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    costAudit: costAudit.data || [],
    approvalAudit: approvalAudit.data || [],
    overrideAudit: overrideAudit.data || [],
    fieldCorrections: fieldCorrections.data || [],
    rollbacks: rollbacks.data || [],
    extractionLogs: extractionLogs.data || [],
    riskAlerts: riskAlerts.data || [],
    priceHistory: priceHistory.data || [],
  };
}
