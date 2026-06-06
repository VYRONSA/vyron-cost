import type { SupabaseClient } from "@supabase/supabase-js";
import { ROUNDING_DIFFERENCE_LIMIT, TOTALS_MATCH_TOLERANCE } from "@/lib/vyron-invoice-line-math";

export type DocumentApprovalRules = {
  minHeaderConfidence: number;
  blockUnmappedLines: boolean;
  roundingTolerance: number;
  majorMismatchThreshold: number;
  maxManualOverridesBeforeAlert: number;
  requireReconciliationNoteAbove: number;
  requirePurchaseOrder: boolean;
  requireSupplier: boolean;
  requireInvoiceNumber: boolean;
  requireInvoiceDate: boolean;
  requireVat: boolean;
  requireMatchedLineItems: boolean;
  allowIgnoredLines: boolean;
  allowRoundingDifference: boolean;
  maxAllowedVariancePercent: number;
  supervisorOverrideRequiredAboveVariance: boolean;
};

export const DEFAULT_APPROVAL_RULES: DocumentApprovalRules = {
  minHeaderConfidence: 70,
  blockUnmappedLines: true,
  roundingTolerance: TOTALS_MATCH_TOLERANCE,
  majorMismatchThreshold: ROUNDING_DIFFERENCE_LIMIT,
  maxManualOverridesBeforeAlert: 5,
  requireReconciliationNoteAbove: ROUNDING_DIFFERENCE_LIMIT,
  requirePurchaseOrder: false,
  requireSupplier: true,
  requireInvoiceNumber: true,
  requireInvoiceDate: true,
  requireVat: false,
  requireMatchedLineItems: true,
  allowIgnoredLines: true,
  allowRoundingDifference: true,
  maxAllowedVariancePercent: 5,
  supervisorOverrideRequiredAboveVariance: true,
};

function mapRulesRow(data: Record<string, unknown>): DocumentApprovalRules {
  return {
    minHeaderConfidence: Number(data.min_header_confidence ?? DEFAULT_APPROVAL_RULES.minHeaderConfidence),
    blockUnmappedLines: Boolean(data.block_unmapped_lines ?? DEFAULT_APPROVAL_RULES.blockUnmappedLines),
    roundingTolerance: Number(data.rounding_tolerance ?? DEFAULT_APPROVAL_RULES.roundingTolerance),
    majorMismatchThreshold: Number(data.major_mismatch_threshold ?? DEFAULT_APPROVAL_RULES.majorMismatchThreshold),
    maxManualOverridesBeforeAlert: Number(
      data.max_manual_overrides_before_alert ?? DEFAULT_APPROVAL_RULES.maxManualOverridesBeforeAlert
    ),
    requireReconciliationNoteAbove: Number(
      data.require_reconciliation_note_above ?? DEFAULT_APPROVAL_RULES.requireReconciliationNoteAbove
    ),
    requirePurchaseOrder: Boolean(data.require_purchase_order ?? DEFAULT_APPROVAL_RULES.requirePurchaseOrder),
    requireSupplier: Boolean(data.require_supplier ?? DEFAULT_APPROVAL_RULES.requireSupplier),
    requireInvoiceNumber: Boolean(data.require_invoice_number ?? DEFAULT_APPROVAL_RULES.requireInvoiceNumber),
    requireInvoiceDate: Boolean(data.require_invoice_date ?? DEFAULT_APPROVAL_RULES.requireInvoiceDate),
    requireVat: Boolean(data.require_vat ?? DEFAULT_APPROVAL_RULES.requireVat),
    requireMatchedLineItems: Boolean(
      data.require_matched_line_items ?? data.block_unmapped_lines ?? DEFAULT_APPROVAL_RULES.requireMatchedLineItems
    ),
    allowIgnoredLines: Boolean(data.allow_ignored_lines ?? DEFAULT_APPROVAL_RULES.allowIgnoredLines),
    allowRoundingDifference: Boolean(data.allow_rounding_difference ?? DEFAULT_APPROVAL_RULES.allowRoundingDifference),
    maxAllowedVariancePercent: Number(data.max_allowed_variance_percent ?? DEFAULT_APPROVAL_RULES.maxAllowedVariancePercent),
    supervisorOverrideRequiredAboveVariance: Boolean(
      data.supervisor_override_required_above_variance ?? DEFAULT_APPROVAL_RULES.supervisorOverrideRequiredAboveVariance
    ),
  };
}

export async function getDocumentApprovalRules(
  supabase: SupabaseClient,
  tenantId: string
): Promise<DocumentApprovalRules> {
  const { data } = await supabase.from("vyron_document_approval_rules").select("*").eq("tenant_id", tenantId).maybeSingle();

  if (!data) return DEFAULT_APPROVAL_RULES;
  return mapRulesRow(data as Record<string, unknown>);
}

export async function upsertDocumentApprovalRules(
  supabase: SupabaseClient,
  tenantId: string,
  rules: Partial<DocumentApprovalRules>
) {
  const merged = { ...DEFAULT_APPROVAL_RULES, ...rules };
  const { error } = await supabase.from("vyron_document_approval_rules").upsert(
    {
      tenant_id: tenantId,
      min_header_confidence: merged.minHeaderConfidence,
      block_unmapped_lines: merged.blockUnmappedLines || merged.requireMatchedLineItems,
      rounding_tolerance: merged.roundingTolerance,
      major_mismatch_threshold: merged.majorMismatchThreshold,
      max_manual_overrides_before_alert: merged.maxManualOverridesBeforeAlert,
      require_reconciliation_note_above: merged.requireReconciliationNoteAbove,
      require_purchase_order: merged.requirePurchaseOrder,
      require_supplier: merged.requireSupplier,
      require_invoice_number: merged.requireInvoiceNumber,
      require_invoice_date: merged.requireInvoiceDate,
      require_vat: merged.requireVat,
      require_matched_line_items: merged.requireMatchedLineItems,
      allow_ignored_lines: merged.allowIgnoredLines,
      allow_rounding_difference: merged.allowRoundingDifference,
      max_allowed_variance_percent: merged.maxAllowedVariancePercent,
      supervisor_override_required_above_variance: merged.supervisorOverrideRequiredAboveVariance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" }
  );
  if (error) throw new Error(error.message);
  return merged;
}
