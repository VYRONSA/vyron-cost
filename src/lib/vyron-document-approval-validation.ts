import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentApprovalRules } from "@/lib/vyron-document-approval-rules";
import { classifyTotalsDiffs, roundMoney } from "@/lib/vyron-invoice-line-math";

export type ApprovalViolation = {
  rule: string;
  message: string;
  severity: "error" | "warning";
};

export type ApprovalValidationInput = {
  document: {
    supplier_name?: string | null;
    invoice_number?: string | null;
    invoice_date?: string | null;
    purchase_order_number?: string | null;
    purchase_order_id?: string | null;
    supplier_vat_number?: string | null;
    vat?: number | null;
    subtotal?: number | null;
    total?: number | null;
    field_confidence?: Record<string, number> | null;
  };
  lines: Array<{
    ignored?: boolean;
    matched_entity_id?: string | null;
    matched_entity_type?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    vat?: number | null;
    line_total?: number | null;
  }>;
  rules: DocumentApprovalRules;
  options?: {
    forceApproval?: boolean;
    forceTotalsMismatch?: boolean;
    hasSupervisorOverride?: boolean;
  };
};

export type ApprovalValidationResult = {
  ok: boolean;
  blocked: boolean;
  violations: ApprovalViolation[];
  requiresSupervisorOverride: boolean;
  canSupervisorOverride: boolean;
  variancePercent: number | null;
  totalsMismatch: boolean;
  unmappedLineCount: number;
  lowConfidenceFields: string[];
};

function hasText(value: string | null | undefined) {
  return Boolean(String(value || "").trim());
}

export function validateDocumentApproval(input: ApprovalValidationInput): ApprovalValidationResult {
  const { document, lines, rules, options } = input;
  const violations: ApprovalViolation[] = [];
  const activeLines = (lines || []).filter((line) => !line.ignored);
  const ignoredCount = (lines || []).filter((line) => line.ignored).length;

  if (rules.requirePurchaseOrder && !hasText(document.purchase_order_number) && !document.purchase_order_id) {
    violations.push({
      rule: "require_purchase_order",
      message: "Purchase order number is required before approval.",
      severity: "error",
    });
  }
  if (rules.requireSupplier && !hasText(document.supplier_name)) {
    violations.push({ rule: "require_supplier", message: "Supplier name is required.", severity: "error" });
  }
  if (rules.requireInvoiceNumber && !hasText(document.invoice_number)) {
    violations.push({ rule: "require_invoice_number", message: "Invoice number is required.", severity: "error" });
  }
  if (rules.requireInvoiceDate && !hasText(document.invoice_date)) {
    violations.push({ rule: "require_invoice_date", message: "Invoice date is required.", severity: "error" });
  }
  if (rules.requireVat && (document.vat === null || document.vat === undefined)) {
    violations.push({ rule: "require_vat", message: "VAT amount is required.", severity: "error" });
  }
  if (!rules.allowIgnoredLines && ignoredCount > 0) {
    violations.push({
      rule: "allow_ignored_lines",
      message: `${ignoredCount} ignored line(s) are not allowed by policy.`,
      severity: "error",
    });
  }

  const unmappedLines = activeLines.filter((line) => !line.matched_entity_id || !line.matched_entity_type);
  if (rules.requireMatchedLineItems && unmappedLines.length && !options?.forceApproval) {
    violations.push({
      rule: "require_matched_line_items",
      message: `${unmappedLines.length} active line(s) must be matched or ignored.`,
      severity: "error",
    });
  }

  const headerConfidence = (document.field_confidence || {}) as Record<string, number>;
  const keyFields: Array<keyof typeof headerConfidence> = ["supplier", "invoiceNo", "invoiceDate", "total"];
  const lowConfidenceFields = keyFields.filter((key) => Number(headerConfidence[key] || 0) < rules.minHeaderConfidence);
  if (lowConfidenceFields.length && !options?.forceApproval && !options?.hasSupervisorOverride) {
    violations.push({
      rule: "min_header_confidence",
      message: `Low confidence on: ${lowConfidenceFields.join(", ")}.`,
      severity: "warning",
    });
  }

  const sumExcl = roundMoney(
    activeLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0)
  );
  const sumVat = roundMoney(activeLines.reduce((sum, line) => sum + Number(line.vat || 0), 0));
  const sumIncl = roundMoney(activeLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0));
  const extractedSubtotal = document.subtotal !== null && document.subtotal !== undefined ? Number(document.subtotal) : null;
  const extractedVat = document.vat !== null && document.vat !== undefined ? Number(document.vat) : null;
  const extractedTotal = document.total !== null && document.total !== undefined ? Number(document.total) : null;
  const diffExcl = extractedSubtotal !== null ? roundMoney(sumExcl - extractedSubtotal) : null;
  const diffVat = extractedVat !== null ? roundMoney(sumVat - extractedVat) : null;
  const diffIncl = extractedTotal !== null ? roundMoney(sumIncl - extractedTotal) : null;
  const totalsClass = classifyTotalsDiffs([diffExcl, diffVat, diffIncl]);
  const hasMajorMismatch =
    totalsClass.hasTotalsDifference && totalsClass.maxAbsDiff > rules.majorMismatchThreshold;
  const hasRoundingDifference =
    totalsClass.hasTotalsDifference &&
    totalsClass.maxAbsDiff > rules.roundingTolerance &&
    totalsClass.maxAbsDiff <= rules.majorMismatchThreshold;

  let variancePercent: number | null = null;
  if (extractedTotal && extractedTotal > 0 && diffIncl !== null) {
    variancePercent = roundMoney((Math.abs(diffIncl) / extractedTotal) * 100);
  }

  if (!rules.allowRoundingDifference && totalsClass.hasTotalsDifference && !options?.forceTotalsMismatch) {
    violations.push({
      rule: "allow_rounding_difference",
      message: "Totals difference is not allowed by company policy.",
      severity: "error",
    });
  }

  if (hasMajorMismatch && !options?.forceTotalsMismatch && !options?.hasSupervisorOverride) {
    violations.push({
      rule: "major_totals_mismatch",
      message: `Invoice totals differ from line totals by more than R${rules.majorMismatchThreshold.toFixed(2)}.`,
      severity: "error",
    });
  } else if (hasRoundingDifference && !options?.forceTotalsMismatch) {
    violations.push({
      rule: "rounding_difference",
      message: `Rounding difference detected (max R${totalsClass.maxAbsDiff.toFixed(2)}).`,
      severity: "warning",
    });
  }

  if (
    variancePercent !== null &&
    variancePercent > rules.maxAllowedVariancePercent &&
    rules.supervisorOverrideRequiredAboveVariance &&
    !options?.hasSupervisorOverride &&
    !options?.forceTotalsMismatch
  ) {
    violations.push({
      rule: "max_allowed_variance_percent",
      message: `Variance ${variancePercent.toFixed(2)}% exceeds allowed ${rules.maxAllowedVariancePercent.toFixed(2)}%.`,
      severity: "error",
    });
  }

  const errors = violations.filter((v) => v.severity === "error");
  const requiresSupervisorOverride =
    errors.some((v) =>
      ["max_allowed_variance_percent", "major_totals_mismatch", "require_matched_line_items", "require_purchase_order"].includes(
        v.rule
      )
    ) || (errors.length > 0 && rules.supervisorOverrideRequiredAboveVariance);

  const blocked = errors.length > 0 && !options?.hasSupervisorOverride && !options?.forceApproval;

  return {
    ok: violations.length === 0 || Boolean(options?.hasSupervisorOverride) || Boolean(options?.forceApproval),
    blocked,
    violations,
    requiresSupervisorOverride,
    canSupervisorOverride: true,
    variancePercent,
    totalsMismatch: hasMajorMismatch || hasRoundingDifference,
    unmappedLineCount: unmappedLines.length,
    lowConfidenceFields,
  };
}

export async function recordApprovalOverride(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    documentId: string;
    overriddenBy: string;
    overrideReason: string;
    rulesBypassed: string[];
    violations: ApprovalViolation[];
  }
) {
  const { error } = await supabase.from("vyron_document_approval_override_audit").insert({
    tenant_id: params.tenantId,
    document_id: params.documentId,
    overridden_by: params.overriddenBy,
    override_reason: params.overrideReason,
    rules_bypassed: params.rulesBypassed,
    violations_snapshot: params.violations,
    metadata: { source: "invoice_approval" },
  });
  if (error) throw new Error(error.message);
}

export async function recordPoLinkOverride(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    documentId: string;
    overriddenBy: string;
    overrideReason: string;
  }
) {
  const { error } = await supabase.from("vyron_document_po_link_override_audit").insert({
    tenant_id: params.tenantId,
    document_id: params.documentId,
    overridden_by: params.overriddenBy,
    override_reason: params.overrideReason,
    metadata: { source: "invoice_approval_po_requirement" },
  });
  if (error) throw new Error(error.message);
}

export function validatePoLinkRequired(
  purchaseOrderId: string | null | undefined,
  requirePoLinked: boolean,
  hasSupervisorOverride: boolean
): ApprovalViolation | null {
  if (!requirePoLinked || purchaseOrderId || hasSupervisorOverride) return null;
  return {
    rule: "require_po_linked",
    message: "A purchase order must be linked before invoice approval.",
    severity: "error",
  };
}

export async function getNextReviewDocumentId(supabase: SupabaseClient, tenantId: string, afterDocumentId?: string) {
  const statuses = ["reviewed", "extracted", "extraction_failed", "upload_failed"];
  let query = supabase
    .from("vyron_documents")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(50);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (!rows.length) return null;
  if (!afterDocumentId) return rows[0].id as string;
  const idx = rows.findIndex((row) => row.id === afterDocumentId);
  if (idx >= 0 && idx < rows.length - 1) return rows[idx + 1].id as string;
  return rows[0].id as string;
}
