import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getPoApprovalRules, approvalTierForTotal } from "@/lib/vyron-procurement";

export type ApprovalEntityType =
  | "purchase_order"
  | "supplier_invoice"
  | "inventory_adjustment"
  | "production_run"
  | "recovery_action";

export type ApprovalMatrixRule = {
  id: string;
  entityType: ApprovalEntityType;
  ruleName: string;
  thresholdType: "amount" | "risk" | "variance";
  thresholdValue: number;
  approvalLevel: number;
  approverRole: string;
  isActive: boolean;
};

export type ApprovalMatrixPayload = {
  rules: ApprovalMatrixRule[];
  poRules: { autoApproveBelow: number; supervisorApproveBelow: number; requirePoBeforeInvoice: boolean };
  summary: Array<{ entityType: string; ruleCount: number; maxLevel: number }>;
};

const DEFAULT_RULES: ApprovalMatrixRule[] = [
  { id: "po-1", entityType: "purchase_order", ruleName: "Auto approve below threshold", thresholdType: "amount", thresholdValue: 5000, approvalLevel: 1, approverRole: "supervisor", isActive: true },
  { id: "po-2", entityType: "purchase_order", ruleName: "Manager approval high value", thresholdType: "amount", thresholdValue: 25000, approvalLevel: 2, approverRole: "procurement_manager", isActive: true },
  { id: "po-3", entityType: "purchase_order", ruleName: "CFO approval critical spend", thresholdType: "amount", thresholdValue: 100000, approvalLevel: 3, approverRole: "cfo", isActive: true },
  { id: "inv-1", entityType: "supplier_invoice", ruleName: "Supervisor invoice review", thresholdType: "amount", thresholdValue: 10000, approvalLevel: 1, approverRole: "financial_manager", isActive: true },
  { id: "inv-2", entityType: "supplier_invoice", ruleName: "High risk invoice", thresholdType: "risk", thresholdValue: 75, approvalLevel: 2, approverRole: "cfo", isActive: true },
  { id: "inv-3", entityType: "supplier_invoice", ruleName: "PO variance escalation", thresholdType: "variance", thresholdValue: 5, approvalLevel: 2, approverRole: "procurement_manager", isActive: true },
  { id: "stk-1", entityType: "inventory_adjustment", ruleName: "Adjustment value review", thresholdType: "amount", thresholdValue: 2500, approvalLevel: 1, approverRole: "warehouse_manager", isActive: true },
  { id: "stk-2", entityType: "inventory_adjustment", ruleName: "Large shrinkage", thresholdType: "variance", thresholdValue: 10, approvalLevel: 2, approverRole: "cfo", isActive: true },
  { id: "prd-1", entityType: "production_run", ruleName: "Production cost overrun", thresholdType: "variance", thresholdValue: 8, approvalLevel: 1, approverRole: "production_manager", isActive: true },
  { id: "prd-2", entityType: "production_run", ruleName: "High cost production run", thresholdType: "amount", thresholdValue: 50000, approvalLevel: 2, approverRole: "cfo", isActive: true },
  { id: "rec-1", entityType: "recovery_action", ruleName: "Recovery acceptance", thresholdType: "amount", thresholdValue: 5000, approvalLevel: 1, approverRole: "financial_manager", isActive: true },
  { id: "rec-2", entityType: "recovery_action", ruleName: "Large recovery claim", thresholdType: "amount", thresholdValue: 25000, approvalLevel: 2, approverRole: "cfo", isActive: true },
];

export function resolveApprovalLevels(
  entityType: ApprovalEntityType,
  input: { amount?: number; riskScore?: number; variancePct?: number },
  rules: ApprovalMatrixRule[]
): ApprovalMatrixRule[] {
  const active = rules.filter((r) => r.entityType === entityType && r.isActive);
  const matched: ApprovalMatrixRule[] = [];
  for (const rule of active) {
    if (rule.thresholdType === "amount" && (input.amount ?? 0) >= rule.thresholdValue) matched.push(rule);
    if (rule.thresholdType === "risk" && (input.riskScore ?? 0) >= rule.thresholdValue) matched.push(rule);
    if (rule.thresholdType === "variance" && (input.variancePct ?? 0) >= rule.thresholdValue) matched.push(rule);
  }
  return matched.sort((a, b) => b.approvalLevel - a.approvalLevel);
}

export async function getApprovalMatrix(companyId = VYRON_DEFAULT_TENANT_ID): Promise<ApprovalMatrixPayload> {
  const supabase = getSupabaseAdmin();
  let rules = DEFAULT_RULES;
  let poRules = { autoApproveBelow: 5000, supervisorApproveBelow: 25000, requirePoBeforeInvoice: true };

  if (supabase) {
    const [{ data: rows }, po] = await Promise.all([
      supabase.from("vyron_enterprise_approval_rules").select("*").eq("company_id", companyId).eq("is_active", true),
      getPoApprovalRules(supabase, companyId),
    ]);
    poRules = {
      autoApproveBelow: po.autoApproveBelow,
      supervisorApproveBelow: po.supervisorApproveBelow,
      requirePoBeforeInvoice: po.requirePoBeforeInvoiceApproval,
    };
    if (rows?.length) {
      rules = rows.map((r) => ({
        id: String(r.id),
        entityType: r.entity_type as ApprovalEntityType,
        ruleName: String(r.rule_name),
        thresholdType: r.threshold_type as ApprovalMatrixRule["thresholdType"],
        thresholdValue: Number(r.threshold_value),
        approvalLevel: Number(r.approval_level),
        approverRole: String(r.approver_role),
        isActive: Boolean(r.is_active),
      }));
    }
  }

  const entityTypes = [...new Set(rules.map((r) => r.entityType))];
  const summary = entityTypes.map((entityType) => ({
    entityType,
    ruleCount: rules.filter((r) => r.entityType === entityType).length,
    maxLevel: Math.max(0, ...rules.filter((r) => r.entityType === entityType).map((r) => r.approvalLevel)),
  }));

  return { rules, poRules, summary };
}

export function poTierLabel(total: number, poRules: ApprovalMatrixPayload["poRules"]) {
  const tier = approvalTierForTotal(total, {
    autoApproveBelow: poRules.autoApproveBelow,
    supervisorApproveBelow: poRules.supervisorApproveBelow,
    requirePoBeforeInvoiceApproval: poRules.requirePoBeforeInvoice,
  });
  if (tier === "auto") return "Level 0 — Auto";
  if (tier === "supervisor") return "Level 1 — Supervisor";
  return "Level 2 — Manager / CFO";
}
