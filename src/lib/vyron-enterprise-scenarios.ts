import { calculateGpPercent, getIngredients, getProducts } from "@/lib/vyron-cost-data";
import { getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import { getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";

export type ScenarioInput = {
  supplierPriceIncreasePct: number;
  packagingIncreasePct: number;
  salesDecreasePct: number;
};

export type ScenarioImpact = {
  currentGpPct: number;
  projectedGpPct: number;
  gpChangePts: number;
  recoveryImpact: number;
  inventoryImpact: number;
  productionCostImpact: number;
  annualProfitImpact: number;
  narrative: string[];
};

export async function runEnterpriseScenario(input: ScenarioInput): Promise<ScenarioImpact> {
  const [products, ingredients, leakage, opportunities] = await Promise.all([
    getProducts(120),
    getIngredients(200),
    getFinanceLeakageCentre(),
    getRecoveryOpportunities(),
  ]);

  const monthlyRevenue = products.reduce((s, p) => s + Number(p.selling_price || 0) * 100, 0);
  const monthlyCogs = products.reduce((s, p) => s + Number(p.total_cost || 0) * 100, 0);
  const currentGp = monthlyRevenue > 0 ? ((monthlyRevenue - monthlyCogs) / monthlyRevenue) * 100 : 63;

  const supplierDrag = input.supplierPriceIncreasePct / 100;
  const packagingDrag = input.packagingIncreasePct / 100;
  const salesDrag = input.salesDecreasePct / 100;

  const packagingCost = ingredients
    .filter((i) => /pack/i.test(String(i.category || "")))
    .reduce((s, i) => s + Number(i.purchase_cost || 0) * 70, 0);
  const ingredientCost = monthlyCogs - packagingCost;

  const newCogs =
    ingredientCost * (1 + supplierDrag) + packagingCost * (1 + packagingDrag) + monthlyCogs * 0.15 * supplierDrag * 0.3;
  const newRevenue = monthlyRevenue * (1 - salesDrag);
  const projectedGp = newRevenue > 0 ? ((newRevenue - newCogs) / newRevenue) * 100 : currentGp - 5;

  const recoveryBase = opportunities.reduce((s, o) => s + Number(o.potential_recovery || o.monthly_value || 0), 0);
  const recoveryImpact = Math.round(recoveryBase * (1 + supplierDrag * 0.4) - recoveryBase);
  const inventoryImpact = Math.round(leakage.categories.find((c) => c.key === "inventoryShrinkage")?.monthlyExposure! * (1 + salesDrag) || 5000);
  const productionCostImpact = Math.round(monthlyCogs * 0.35 * (supplierDrag + packagingDrag * 0.5));
  const annualProfitImpact = Math.round((currentGp - projectedGp) / 100 * monthlyRevenue * 12 + productionCostImpact * 12);

  const narrative = [
    `Supplier prices +${input.supplierPriceIncreasePct}% shifts ingredient COGS.`,
    `Packaging +${input.packagingIncreasePct}% adds ${packagingDrag > 0 ? "material" : "no material"} pressure.`,
    `Sales −${input.salesDecreasePct}% reduces revenue absorption of fixed costs.`,
    `GP moves ${(projectedGp - currentGp).toFixed(1)} points; review recovery pipeline for offset.`,
  ];

  return {
    currentGpPct: Math.round(currentGp * 10) / 10,
    projectedGpPct: Math.round(projectedGp * 10) / 10,
    gpChangePts: Math.round((projectedGp - currentGp) * 10) / 10,
    recoveryImpact,
    inventoryImpact,
    productionCostImpact,
    annualProfitImpact,
    narrative,
  };
}

export const SCENARIO_PRESETS: Array<{ label: string; input: ScenarioInput }> = [
  { label: "Supplier +10%", input: { supplierPriceIncreasePct: 10, packagingIncreasePct: 0, salesDecreasePct: 0 } },
  { label: "Packaging +15%", input: { supplierPriceIncreasePct: 0, packagingIncreasePct: 15, salesDecreasePct: 0 } },
  { label: "Sales −20%", input: { supplierPriceIncreasePct: 0, packagingIncreasePct: 0, salesDecreasePct: 20 } },
  { label: "Combined stress", input: { supplierPriceIncreasePct: 8, packagingIncreasePct: 12, salesDecreasePct: 10 } },
];
