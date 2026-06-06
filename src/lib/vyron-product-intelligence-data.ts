import { buildHandcraftedIntelligence } from "@/lib/vyron-handcrafted-intelligence";

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
  const intel = await buildHandcraftedIntelligence();
  return intel?.productIntel ?? [];
}
