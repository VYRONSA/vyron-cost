import { calculateGpPercent, getIngredients, getProducts, getSuppliers } from "@/lib/vyron-cost-data";
import { computeSpendTotals } from "@/lib/vyron-finance-intelligence";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";
import { getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { unstable_noStore as noStore } from "next/cache";

export type ForecastHorizonKey = "30" | "90" | "365";

export type ForecastLine = {
  key: string;
  label: string;
  horizon30: number;
  horizon90: number;
  horizon365: number;
  unit: string;
  href?: string;
};

export type EnterpriseForecastPayload = {
  horizons: Array<{ key: ForecastHorizonKey; label: string }>;
  lines: ForecastLine[];
  supplierInflationPct: number;
  recoveryOpportunityAnnual: number;
};

function project(base: number, days: number, monthlyGrowth = 0.02, inflationDrag = 0) {
  const months = days / 30;
  return Math.round(base * months * (1 + monthlyGrowth * months + inflationDrag) * 100) / 100;
}

export async function getEnterpriseForecast(companyId = VYRON_DEFAULT_TENANT_ID): Promise<EnterpriseForecastPayload> {
  noStore();
  const supabase = getSupabaseAdmin();
  const [products, ingredients, suppliers, opportunities] = await Promise.all([
    getProducts(120),
    getIngredients(200),
    getSuppliers(80),
    getRecoveryOpportunities(),
  ]);

  const spend = supabase ? await computeSpendTotals(supabase, companyId) : { spendThisMonth: 0, spendThisYear: 0 };
  const supplierInflation =
    suppliers.length > 0
      ? suppliers.reduce((s, x) => s + Number(x.last_price_movement || 0), 0) / suppliers.length
      : 8;

  let inventoryValue = 0;
  let productionCost = 0;
  if (supabase) {
    const [inv, mfg] = await Promise.all([
      getInventoryDashboardStats(supabase, companyId),
      getManufacturingDashboardStats(supabase, companyId),
    ]);
    inventoryValue = inv.totalInventoryValue;
    productionCost = mfg.productionCost;
  }

  const monthlySupplierSpend = spend.spendThisMonth || 180000;
  const monthlyIngredientUsage = ingredients.reduce((s, i) => s + Number(i.purchase_cost || 0) * 90, 0);
  const monthlyPackaging = ingredients
    .filter((i) => /pack/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 70, 0);
  const monthlyProductionDemand = products.reduce((s, p) => s + Number(p.total_cost || 0) * 100, 0);
  const recoveryAnnual = opportunities.reduce(
    (s, o) => s + Number(o.potential_recovery || o.monthly_value || 0) * 12,
    0
  );

  const inflationDrag = supplierInflation / 100 / 12;

  const lines: ForecastLine[] = [
    {
      key: "supplier_spend",
      label: "Supplier Spend",
      horizon30: project(monthlySupplierSpend, 30, 0.01, inflationDrag),
      horizon90: project(monthlySupplierSpend, 90, 0.01, inflationDrag * 2),
      horizon365: spend.spendThisYear || project(monthlySupplierSpend, 365, 0.01, inflationDrag * 4),
      unit: "ZAR",
      href: "/supplier-intelligence",
    },
    {
      key: "inventory_usage",
      label: "Inventory Usage",
      horizon30: project(inventoryValue * 0.15, 30),
      horizon90: project(inventoryValue * 0.15, 90),
      horizon365: project(inventoryValue * 0.15, 365),
      unit: "ZAR",
      href: "/inventory",
    },
    {
      key: "production_demand",
      label: "Production Demand",
      horizon30: project(monthlyProductionDemand, 30, 0.015),
      horizon90: project(monthlyProductionDemand, 90, 0.015),
      horizon365: project(productionCost || monthlyProductionDemand, 365, 0.02),
      unit: "ZAR",
      href: "/manufacturing",
    },
    {
      key: "packaging_demand",
      label: "Packaging Demand",
      horizon30: project(monthlyPackaging, 30, 0.01, inflationDrag * 0.5),
      horizon90: project(monthlyPackaging, 90, 0.012, inflationDrag),
      horizon365: project(monthlyPackaging, 365, 0.01, inflationDrag * 2),
      unit: "ZAR",
      href: "/ingredients",
    },
    {
      key: "ingredient_demand",
      label: "Ingredient Demand",
      horizon30: project(monthlyIngredientUsage, 30, 0.01, inflationDrag),
      horizon90: project(monthlyIngredientUsage, 90, 0.01, inflationDrag * 1.5),
      horizon365: project(monthlyIngredientUsage, 365, 0.01, inflationDrag * 3),
      unit: "ZAR",
      href: "/ingredients",
    },
    {
      key: "recovery_opportunities",
      label: "Recovery Opportunities",
      horizon30: Math.round(recoveryAnnual / 12),
      horizon90: Math.round((recoveryAnnual / 12) * 3),
      horizon365: Math.round(recoveryAnnual),
      unit: "ZAR",
      href: "/recovery-opportunities",
    },
  ];

  return {
    horizons: [
      { key: "30", label: "30 Days" },
      { key: "90", label: "90 Days" },
      { key: "365", label: "12 Months" },
    ],
    lines,
    supplierInflationPct: Math.round(supplierInflation * 10) / 10,
    recoveryOpportunityAnnual: Math.round(recoveryAnnual),
  };
}

export function forecastGpImpact(products: Awaited<ReturnType<typeof getProducts>>, inflationPct: number) {
  const drag = 1 + inflationPct / 100;
  const impacted = products.filter((p) => {
    const current = calculateGpPercent(Number(p.selling_price), Number(p.total_cost));
    const forecast = calculateGpPercent(Number(p.selling_price), Number(p.total_cost) * drag);
    return forecast < Number(p.target_gp || 40);
  });
  return impacted.length;
}
