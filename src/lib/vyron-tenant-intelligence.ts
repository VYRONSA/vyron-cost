import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { unstable_noStore as noStore } from "next/cache";

export type TenantCostIntelligence = {
  companyId: string;
  products: ProductIntelligenceRow[];
  marginErosion: ProductIntelligenceRow[];
  supplierInflation: Array<{
    supplierName: string;
    category: string;
    movementPct: number;
    monthlyExposure: number;
    riskLevel: string;
  }>;
  bomCostMovement: Array<{
    productName: string;
    previousCost: number;
    currentCost: number;
    movementPct: number;
    impact: string;
  }>;
  repricingSuggestions: Array<{
    productName: string;
    currentPrice: number;
    suggestedPrice: number;
    targetGp: number;
    monthlyRecovery: number;
  }>;
  recoveryOpportunities: Array<{
    title: string;
    category: string;
    monthlyValue: number;
    severity: string;
    action: string;
  }>;
  summary: {
    erosionCount: number;
    inflationSuppliers: number;
    recoveryMonthly: number;
    repricingCount: number;
  };
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function computeProductIntelligenceFromTenant(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProductIntelligenceRow[]> {
  const { data: products } = await supabase
    .from("vyron_cost_products")
    .select("*")
    .eq("company_id", companyId)
    .order("product_name");

  return (products || []).map((product) => {
    const selling = Number(product.selling_price || 0);
    const cost = Number(product.total_cost || 0);
    const targetGp = Number(product.target_gp || 0);
    const actualGp = selling > 0 ? round2(((selling - cost) / selling) * 100) : 0;
    const gpGap = round2(actualGp - targetGp);
    const suggested =
      targetGp > 0 && cost > 0 ? round2(cost / (1 - targetGp / 100)) : selling;
    const monthlyUnits = 500;
    const monthlyRisk = gpGap < 0 ? round2(Math.abs(gpGap / 100) * selling * monthlyUnits) : 0;
    return {
      id: String(product.id),
      product_id: String(product.id),
      product_name: String(product.product_name),
      category: product.category ? String(product.category) : null,
      selling_price: selling,
      total_cost: cost,
      target_gp: targetGp,
      actual_gp: actualGp,
      gp_gap: gpGap,
      suggested_price: suggested,
      monthly_units_estimate: monthlyUnits,
      monthly_risk_value: monthlyRisk,
      risk_level: gpGap < -5 ? "Critical" : gpGap < 0 ? "High" : "Stable",
      action_required: gpGap < 0 ? "Reprice or recover cost" : "Monitor",
    };
  });
}

export async function getTenantCostIntelligence(companyId?: string | null): Promise<TenantCostIntelligence | null> {
  noStore();
  const resolvedCompanyId = companyId || (await resolveApiCompanyId());
  if (!resolvedCompanyId || !isSupabaseServiceRoleConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [products, suppliers, ingredients] = await Promise.all([
    computeProductIntelligenceFromTenant(supabase, resolvedCompanyId),
    supabase
      .from("vyron_cost_suppliers")
      .select("supplier_name, category, last_price_movement")
      .eq("company_id", resolvedCompanyId),
    supabase
      .from("vyron_cost_ingredients")
      .select("ingredient_name, purchase_cost, previous_cost, category")
      .eq("company_id", resolvedCompanyId),
  ]);

  const marginErosion = products.filter((row) => Number(row.gp_gap || 0) < 0);

  const supplierInflation = (suppliers.data || [])
    .map((supplier) => {
      const movementPct = Number(supplier.last_price_movement || 0);
      return {
        supplierName: String(supplier.supplier_name),
        category: String(supplier.category || "General"),
        movementPct,
        monthlyExposure: round2(movementPct * 1200),
        riskLevel: movementPct >= 10 ? "Critical" : movementPct >= 5 ? "High" : "Monitor",
      };
    })
    .filter((row) => row.movementPct > 0)
    .sort((a, b) => b.movementPct - a.movementPct);

  const bomCostMovement = (ingredients.data || [])
    .map((ingredient) => {
      const current = Number(ingredient.purchase_cost || 0);
      const previous = Number(ingredient.previous_cost || current);
      const movementPct = previous > 0 ? round2(((current - previous) / previous) * 100) : 0;
      return {
        productName: String(ingredient.ingredient_name),
        previousCost: previous,
        currentCost: current,
        movementPct,
        impact: movementPct > 0 ? "BOM cost increase" : "Stable",
      };
    })
    .filter((row) => row.movementPct !== 0)
    .sort((a, b) => b.movementPct - a.movementPct)
    .slice(0, 12);

  const repricingSuggestions = marginErosion
    .map((row) => ({
      productName: String(row.product_name),
      currentPrice: Number(row.selling_price || 0),
      suggestedPrice: Number(row.suggested_price || 0),
      targetGp: Number(row.target_gp || 0),
      monthlyRecovery: Number(row.monthly_risk_value || 0),
    }))
    .slice(0, 10);

  const recoveryOpportunities = [
    ...marginErosion.slice(0, 5).map((row) => ({
      title: `${row.product_name} below target GP`,
      category: "Margin Erosion",
      monthlyValue: Number(row.monthly_risk_value || 0),
      severity: row.risk_level || "High",
      action: "Review selling price or supplier cost",
    })),
    ...supplierInflation.slice(0, 3).map((row) => ({
      title: `${row.supplierName} inflation ${row.movementPct}%`,
      category: "Supplier Inflation",
      monthlyValue: row.monthlyExposure,
      severity: row.riskLevel,
      action: "Renegotiate or switch supplier",
    })),
  ];

  return {
    companyId: resolvedCompanyId,
    products,
    marginErosion,
    supplierInflation,
    bomCostMovement,
    repricingSuggestions,
    recoveryOpportunities,
    summary: {
      erosionCount: marginErosion.length,
      inflationSuppliers: supplierInflation.length,
      recoveryMonthly: round2(recoveryOpportunities.reduce((sum, row) => sum + row.monthlyValue, 0)),
      repricingCount: repricingSuggestions.length,
    },
  };
}
