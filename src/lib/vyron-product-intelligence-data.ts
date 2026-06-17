import { buildHandcraftedIntelligence } from "@/lib/vyron-handcrafted-intelligence";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type ProductIntelligenceRow = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  category: string | null;
  selling_price: number | null;
  total_cost: number | null;
  target_gp: number | null;
  actual_gp: number | null;
  gp_gap: number | null;
  suggested_price: number | null;
  monthly_units_estimate: number | null;
  monthly_risk_value: number | null;
  risk_level: string | null;
  action_required: string | null;
};

export async function getProductIntelligence() {
  const scope = await workspaceScope();
  if (scope.useDemo) {
    const intel = await buildHandcraftedIntelligence();
    return intel?.productIntel ?? [];
  }
  if (!scope.companyId) return [];
  const { getSupabaseAdmin, isSupabaseServiceRoleConfigured } = await import("@/lib/supabase-server");
  const { computeProductIntelligenceFromTenant } = await import("@/lib/vyron-tenant-intelligence");
  if (!isSupabaseServiceRoleConfigured()) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  return computeProductIntelligenceFromTenant(supabase, scope.companyId);
}
