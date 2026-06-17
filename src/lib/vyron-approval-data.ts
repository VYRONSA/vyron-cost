import { supabase } from "@/lib/supabase";
import { getHandcraftedProductIntelligence } from "@/lib/handcrafted-tenant";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type VyronApproval = {
  id: string;
  company_id?: string | null;
  approval_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  detail: string | null;
  risk_level: string | null;
  current_value: number | null;
  proposed_value: number | null;
  financial_impact: number | null;
  status: string | null;
  requested_by: string | null;
  approved_by: string | null;
  decision_note: string | null;
  created_at?: string;
  decided_at?: string | null;
};

export const demoApprovals: VyronApproval[] = [
  {
    id: "approval-1",
    approval_type: "Supplier Increase",
    entity_type: "Ingredient",
    entity_id: "salmon",
    title: "Approve salmon price increase",
    detail: "Supplier invoice detected a higher salmon unit price.",
    risk_level: "High",
    current_value: 271.5,
    proposed_value: 309.78,
    financial_impact: 18450,
    status: "Pending",
    requested_by: "System AI",
    approved_by: null,
    decision_note: null,
  },
  {
    id: "approval-2",
    approval_type: "GP Override",
    entity_type: "Product",
    entity_id: "california-roll",
    title: "California Roll below target GP",
    detail: "Approve selling price increase or margin override.",
    risk_level: "Critical",
    current_value: 38,
    proposed_value: 31.2,
    financial_impact: 12840,
    status: "Pending",
    requested_by: "System AI",
    approved_by: null,
    decision_note: null,
  },
  {
    id: "approval-3",
    approval_type: "Yield Change",
    entity_type: "Ingredient",
    entity_id: "avocado",
    title: "Update avocado usable yield",
    detail: "Actual prep yield is lower than current master rule.",
    risk_level: "Medium",
    current_value: 65,
    proposed_value: 58,
    financial_impact: 6420,
    status: "Pending",
    requested_by: "System AI",
    approved_by: null,
    decision_note: null,
  },
];

function buildHandcraftedApprovals(): VyronApproval[] {
  return getHandcraftedProductIntelligence()
    .filter((p) => Number(p.gp_gap || 0) > 0)
    .slice(0, 6)
    .map((p, i) => ({
      id: `hfp-approval-${i}`,
      company_id: "handcrafted-fp",
      approval_type: "GP Override",
      entity_type: "Product",
      entity_id: String(p.product_id || p.id),
      title: `Reprice ${p.product_name}`,
      detail: `GP ${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}% target`,
      risk_level: String(p.risk_level || "High"),
      current_value: Number(p.selling_price || 0),
      proposed_value: Number(p.suggested_price || 0),
      financial_impact: Number(p.monthly_risk_value || 0),
      status: "Pending",
      requested_by: "VYRON COST",
      approved_by: null,
      decision_note: null,
    }));
}

export async function getApprovals() {
  const { useDemo, companyId } = await workspaceScope();
  if (useDemo) return buildHandcraftedApprovals();
  if (!companyId || !supabase) return [];

  const { data, error } = await supabase
    .from("vyron_cost_approvals")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) return [];

  return data as VyronApproval[];
}
