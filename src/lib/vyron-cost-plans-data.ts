import { supabase } from "@/lib/supabase";
import { calculateGpPercent, calculateSuggestedPrice, formatMoney, getProducts } from "@/lib/vyron-cost-data";
import { HANDCRAFTED_COMPANY_ID } from "@/lib/vyron-handcrafted-intelligence";

export type CostPlan = {
  id: string;
  scenario_name: string;
  product_id?: string | null;
  product_name: string;
  category: string;
  planned_cost: number;
  current_cost: number;
  variance: number;
  target_gp: number;
  current_selling_price: number;
  suggested_selling_price: number;
  supplier_increase_pct: number;
  labour_increase_pct: number;
  packaging_increase_pct: number;
  status: string;
};

function buildPlanFromProduct(
  product: {
    id: string;
    product_name: string;
    category: string;
    total_cost: number;
    selling_price: number;
    target_gp: number;
  },
  overrides?: Partial<CostPlan>
): CostPlan {
  const supplierPct = overrides?.supplier_increase_pct ?? 4;
  const labourPct = overrides?.labour_increase_pct ?? 2;
  const packagingPct = overrides?.packaging_increase_pct ?? 3;
  const current = Number(product.total_cost || 0);
  const planned = current * (1 + (supplierPct + labourPct + packagingPct) / 100);
  const targetGp = Number(product.target_gp || 40);
  const selling = Number(product.selling_price || 0);

  return {
    id: overrides?.id || `plan-${product.id}`,
    scenario_name: overrides?.scenario_name || `${product.product_name} Q3 scenario`,
    product_id: product.id,
    product_name: product.product_name,
    category: product.category,
    planned_cost: Number(planned.toFixed(2)),
    current_cost: current,
    variance: Number((planned - current).toFixed(2)),
    target_gp: targetGp,
    current_selling_price: selling,
    suggested_selling_price: Number(calculateSuggestedPrice(planned, targetGp).toFixed(2)),
    supplier_increase_pct: supplierPct,
    labour_increase_pct: labourPct,
    packaging_increase_pct: packagingPct,
    status: calculateGpPercent(selling, planned) < targetGp ? "Review" : "Healthy",
  };
}

const demoPlans: CostPlan[] = [
  {
    id: "plan-demo-1",
    scenario_name: "Chicken Pie inflation scenario",
    product_name: "Chicken Pie",
    category: "Pies",
    planned_cost: 18.4,
    current_cost: 16.2,
    variance: 2.2,
    target_gp: 40,
    current_selling_price: 32,
    suggested_selling_price: 30.67,
    supplier_increase_pct: 6,
    labour_increase_pct: 2,
    packaging_increase_pct: 4,
    status: "Review",
  },
  {
    id: "plan-demo-2",
    scenario_name: "Pepper Steak packaging uplift",
    product_name: "Pepper Steak Pie",
    category: "Pies",
    planned_cost: 15.8,
    current_cost: 14.1,
    variance: 1.7,
    target_gp: 42,
    current_selling_price: 29.5,
    suggested_selling_price: 27.24,
    supplier_increase_pct: 3,
    labour_increase_pct: 1.5,
    packaging_increase_pct: 5,
    status: "Healthy",
  },
];

export async function getCostPlans(): Promise<CostPlan[]> {
  const products = await getProducts(120);
  if (products.length) {
    return products.slice(0, 24).map((product, index) =>
      buildPlanFromProduct(product, {
        id: `plan-${product.id}`,
        scenario_name: index % 2 === 0 ? `${product.product_name} supplier uplift` : `${product.product_name} labour review`,
        supplier_increase_pct: 3 + (index % 5),
        labour_increase_pct: 1 + (index % 3),
        packaging_increase_pct: 2 + (index % 4),
      })
    );
  }
  return demoPlans;
}

export async function getCostPlanById(id: string): Promise<CostPlan | null> {
  const plans = await getCostPlans();
  return plans.find((plan) => plan.id === id) || null;
}

export function recalculateCostPlan(plan: CostPlan): CostPlan {
  const planned =
    plan.current_cost *
    (1 + (plan.supplier_increase_pct + plan.labour_increase_pct + plan.packaging_increase_pct) / 100);
  const suggested = calculateSuggestedPrice(planned, plan.target_gp);
  const gp = calculateGpPercent(plan.current_selling_price, planned);

  return {
    ...plan,
    planned_cost: Number(planned.toFixed(2)),
    variance: Number((planned - plan.current_cost).toFixed(2)),
    suggested_selling_price: Number(suggested.toFixed(2)),
    status: gp < plan.target_gp ? "Review" : "Healthy",
  };
}

export async function persistCostPlan(plan: CostPlan, companyId: string) {
  if (!supabase || companyId === "demo-company") return plan;
  return plan;
}

export function formatPlanImpact(plan: CostPlan) {
  const gap = plan.suggested_selling_price - plan.current_selling_price;
  if (gap > 0) return `Increase price by ${formatMoney(gap)}`;
  if (gap < 0) return `Price headroom ${formatMoney(Math.abs(gap))}`;
  return "On target";
}

export { HANDCRAFTED_COMPANY_ID };
