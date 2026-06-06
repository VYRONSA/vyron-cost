import type { SupabaseClient } from "@supabase/supabase-js";
import { insertDocumentCostAudit } from "@/lib/vyron-document-cost-audit";

export async function rollbackDocumentCostUpdates(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    documentId: string;
    rolledBackBy: string;
    notes?: string | null;
  }
) {
  const { data: auditRows, error } = await supabase
    .from("vyron_document_cost_audit")
    .select("*")
    .eq("document_id", params.documentId)
    .is("rolled_back_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const pending = auditRows || [];
  if (!pending.length) {
    throw new Error("No cost updates found to roll back for this document.");
  }

  const { data: rollbackAudit, error: rollbackAuditError } = await supabase
    .from("vyron_document_cost_rollback_audit")
    .insert({
      tenant_id: params.tenantId,
      document_id: params.documentId,
      rolled_back_by: params.rolledBackBy,
      reversal_count: pending.length,
      approval_notes: params.notes ?? null,
      metadata: { source: "supervisor_rollback" },
    })
    .select("id")
    .single();
  if (rollbackAuditError) throw new Error(rollbackAuditError.message);

  const rollbackId = rollbackAudit.id as string;
  const now = new Date().toISOString();
  let reversed = 0;

  for (const row of pending) {
    const entityType = String(row.entity_type || "");
    const entityId = row.entity_id as string | null;
    const previousCost = Number(row.previous_cost || 0);
    const newCost = Number(row.new_cost || 0);
    if (!entityId) continue;

    if (entityType === "ingredient" || entityType === "packaging") {
      const { error: updateError } = await supabase
        .from("vyron_cost_ingredients")
        .update({
          purchase_cost: previousCost,
          true_unit_cost: previousCost,
          current_alert: `Cost rollback from invoice approval (${params.rolledBackBy})`,
        })
        .eq("id", entityId);
      if (updateError) throw new Error(updateError.message);
    } else if (entityType === "product") {
      const { error: updateError } = await supabase
        .from("vyron_cost_products")
        .update({ total_cost: previousCost })
        .eq("id", entityId);
      if (updateError) throw new Error(updateError.message);
    }

    await supabase
      .from("vyron_document_cost_audit")
      .update({ rolled_back_at: now, rollback_audit_id: rollbackId })
      .eq("id", row.id);

    await insertDocumentCostAudit(supabase, {
      tenantId: params.tenantId,
      documentId: params.documentId,
      lineItemId: (row.line_item_id as string | null) ?? null,
      supplierName: (row.supplier_name as string | null) ?? null,
      invoiceNumber: (row.invoice_number as string | null) ?? null,
      entityType,
      entityId,
      entityName: String(row.entity_name || "Item"),
      previousCost: newCost,
      newCost: previousCost,
      changePercent: previousCost > 0 ? ((previousCost - newCost) / newCost) * 100 : null,
      currency: String(row.currency || "ZAR"),
      approvedBy: params.rolledBackBy,
      metadata: { rollback: true, rollbackAuditId: rollbackId, reversesAuditId: row.id },
    });

    reversed += 1;
  }

  return { rollbackId, reversed };
}
