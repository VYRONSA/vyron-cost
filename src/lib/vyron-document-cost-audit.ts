import type { SupabaseClient } from "@supabase/supabase-js";

export type CostAuditInsert = {
  tenantId: string;
  documentId: string;
  lineItemId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  entityType: string;
  entityId: string;
  entityName: string;
  previousCost: number;
  newCost: number;
  changePercent?: number | null;
  currency?: string;
  approvedBy?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertDocumentCostAudit(supabase: SupabaseClient, row: CostAuditInsert) {
  const changeAmount = row.newCost - row.previousCost;
  const { error } = await supabase.from("vyron_document_cost_audit").insert({
    tenant_id: row.tenantId,
    document_id: row.documentId,
    line_item_id: row.lineItemId ?? null,
    supplier_name: row.supplierName ?? null,
    invoice_number: row.invoiceNumber ?? null,
    entity_type: row.entityType,
    entity_id: row.entityId,
    entity_name: row.entityName,
    previous_cost: row.previousCost,
    new_cost: row.newCost,
    change_amount: changeAmount,
    change_percent: row.changePercent ?? null,
    currency: row.currency || "ZAR",
    approved_by: row.approvedBy ?? "system",
    metadata: row.metadata || {},
  });
  if (error) throw new Error(error.message);
}

export async function listDocumentCostAudit(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from("vyron_document_cost_audit")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listRecentCostAudit(supabase: SupabaseClient, tenantId: string, limit = 50) {
  const { data, error } = await supabase
    .from("vyron_document_cost_audit")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}
