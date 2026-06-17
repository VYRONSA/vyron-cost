import { formatMoney } from "@/lib/vyron-cost-data";
import {
  calculateMovementPercent,
  getIngredients,
  getSuppliers,
} from "@/lib/vyron-cost-core-data";
import {
  buildHandcraftedIntelligence,
  HANDCRAFTED_DEMO_FALLBACK_KPIS,
  isHandcraftedLiveDataReady,
} from "@/lib/vyron-handcrafted-intelligence";
import type {
  CommandKpis,
  AiFeedItem,
  RecoveryOpportunity,
  SupplierInflationRow,
  ActionGroups,
  ProductionIntelSection,
  WhatIfScenario,
} from "@/lib/vyron-demo-data";
import { getDemoWhatIf } from "@/lib/vyron-demo-data";
import { workspaceScope } from "@/lib/vyron-workspace-scope";

export type LeakageKpis = CommandKpis;
export type AiFinancialFeedItem = AiFeedItem;

const EMPTY_KPIS: LeakageKpis = {
  moneyAtRisk: 0,
  estimatedMonthlyLeakage: 0,
  estimatedAnnualLeakage: 0,
  supplierInflationExposure: 0,
  productsBelowGp: 0,
  duplicateInvoiceRisks: 0,
  wastageLosses: 0,
  procurementAnomalies: 0,
  recoverableMonthly: 0,
  recoverableAnnual: 0,
  recoveryRatePercent: 0,
  pendingActions: 0,
};

async function getIntel() {
  if (!(await workspaceScope()).useDemo) return null;
  return buildHandcraftedIntelligence();
}

export async function getLeakageKpis(): Promise<LeakageKpis> {
  const intel = await getIntel();
  if (!intel) return EMPTY_KPIS;
  return intel.kpis ?? HANDCRAFTED_DEMO_FALLBACK_KPIS;
}

export async function getAiFinancialFeed(): Promise<AiFinancialFeedItem[]> {
  const intel = await getIntel();
  if (!intel) return [];
  if (intel.aiFeed?.length) return intel.aiFeed;
  const kpis = intel?.kpis ?? HANDCRAFTED_DEMO_FALLBACK_KPIS;
  return [
    {
      id: "ai-demo-leakage",
      headline: "Monthly leakage exposure detected",
      detail: "GP gaps, supplier inflation and wastage drivers from imported costing data.",
      lossAmount: kpis.estimatedMonthlyLeakage,
      recoverableAmount: kpis.recoverableMonthly,
      severity: "Critical",
      action: "Financial Leakage",
      href: "/financial-leakage",
      time: "Demo",
    },
    {
      id: "ai-demo-supplier",
      headline: "Supplier inflation on imported materials",
      detail: "Protein, packaging and spice lines show cost pressure.",
      lossAmount: kpis.supplierInflationExposure,
      recoverableAmount: Math.round(kpis.supplierInflationExposure * 0.8),
      severity: "High",
      action: "Supplier Inflation",
      href: "/supplier-inflation",
      time: "Demo",
    },
    {
      id: "ai-demo-recovery",
      headline: "Recoverable value identified",
      detail: "Repricing, negotiation and yield improvements ready for approval.",
      lossAmount: 0,
      recoverableAmount: kpis.recoverableAnnual,
      severity: "High",
      action: "Recovery",
      href: "/recovery-opportunities",
      time: "Demo",
    },
  ];
}

export async function getLeakageFindingsForCommand() {
  const intel = await getIntel();
  return intel?.leakageFindings ?? [];
}

async function buildLiveSupplierInflationRows(): Promise<SupplierInflationRow[]> {
  const scope = await workspaceScope();
  if (scope.useDemo || !scope.companyId) return [];

  const [suppliers, ingredients] = await Promise.all([getSuppliers(), getIngredients()]);
  const rows: SupplierInflationRow[] = [];

  for (const supplier of suppliers) {
    const linked = ingredients.filter((i) => i.supplier_id === supplier.id);
    const currentCost = linked.reduce((sum, i) => sum + Number(i.purchase_cost || 0), 0);
    const previousCost = linked.reduce(
      (sum, i) => sum + Number(i.previous_cost ?? i.purchase_cost ?? 0),
      0
    );
    const movement =
      Number(supplier.last_price_movement || 0) > 0
        ? Number(supplier.last_price_movement)
        : calculateMovementPercent(previousCost, currentCost);
    const monthlyImpact = Math.round(Math.max(0, currentCost - previousCost));
    const annualImpact = monthlyImpact * 12;

    if (movement <= 0 && monthlyImpact <= 0) continue;

    const riskScore = Math.min(99, Math.round(40 + movement * 2));
    rows.push({
      id: `si-${supplier.id}`,
      supplier_name: supplier.supplier_name,
      category: supplier.category || "General",
      current_cost: currentCost,
      previous_cost: previousCost,
      price_movement_percent: Number(movement.toFixed(1)),
      monthly_impact: monthlyImpact,
      annual_impact: annualImpact,
      risk_level: riskScore >= 75 ? "Critical" : riskScore >= 55 ? "High" : "Medium",
      risk_score: riskScore,
      recommended_action: riskScore >= 75 ? "Negotiate" : "Monitor",
    });
  }

  return rows.sort((a, b) => b.price_movement_percent - a.price_movement_percent);
}

export async function getSupplierInflationImpact(): Promise<SupplierInflationRow[]> {
  const intel = await getIntel();
  if (intel?.supplierInflation?.length) return intel.supplierInflation;
  return buildLiveSupplierInflationRows();
}

export async function getRecoveryOpportunities(): Promise<RecoveryOpportunity[]> {
  const intel = await getIntel();
  return intel?.recovery ?? [];
}

export async function getDemoRoi() {
  const intel = await getIntel();
  return intel?.roi ?? { platformCostAnnual: 60000, recoverableAnnual: 0, roiMultiple: 0 };
}

export async function getActionCentre(): Promise<ActionGroups> {
  const intel = await getIntel();
  return intel?.actionCentre ?? { urgent: [], review: [], healthy: [] };
}

export async function getProductionIntelligence(): Promise<ProductionIntelSection[]> {
  const intel = await getIntel();
  return intel?.productionIntel ?? [];
}

export async function getWhatIfScenario(): Promise<WhatIfScenario> {
  const intel = await getIntel();
  if (!intel) {
    return {
      ingredient: "—",
      increasePercent: 0,
      currentGp: 0,
      newGp: 0,
      annualImpact: 0,
      suggestedPrice: 0,
      productsAffected: [],
    };
  }
  const beef = intel.productIntel.find((p) => /beef|steak|kidney/i.test(String(p.product_name)));
  const selling = Number(beef?.selling_price || 30);
  const cost = Number(beef?.total_cost || 17);
  const currentGp = selling > 0 ? ((selling - cost) / selling) * 100 : 40;
  const newCost = cost * 1.15;
  const newGp = selling > 0 ? ((selling - newCost) / selling) * 100 : 30;

  return {
    ingredient: "Beef",
    increasePercent: 15,
    currentGp,
    newGp,
    annualImpact: Math.round((selling - newCost) * 800 * 12),
    suggestedPrice: newCost / (1 - (Number(beef?.target_gp || 40) / 100)),
    productsAffected: intel.productIntel
      .filter((p) => /beef|steak|kidney/i.test(String(p.product_name)))
      .map((p) => String(p.product_name))
      .slice(0, 6),
  };
}

export async function getProductProfitabilityRows() {
  const intel = await getIntel();
  return intel?.productIntel ?? [];
}

export function formatRecoverySummary(kpis: LeakageKpis) {
  return {
    losing: formatMoney(kpis.moneyAtRisk),
    recoverable: formatMoney(kpis.recoverableMonthly),
    annual: formatMoney(kpis.recoverableAnnual),
  };
}

export { isHandcraftedLiveDataReady };
