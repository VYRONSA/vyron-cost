import { formatMoney } from "@/lib/vyron-cost-data";
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

export type LeakageKpis = CommandKpis;
export type AiFinancialFeedItem = AiFeedItem;

async function getIntel() {
  return buildHandcraftedIntelligence();
}

export async function getLeakageKpis(): Promise<LeakageKpis> {
  const intel = await getIntel();
  return intel?.kpis ?? HANDCRAFTED_DEMO_FALLBACK_KPIS;
}

export async function getAiFinancialFeed(): Promise<AiFinancialFeedItem[]> {
  const intel = await getIntel();
  if (intel?.aiFeed?.length) return intel.aiFeed;
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

export async function getSupplierInflationImpact(): Promise<SupplierInflationRow[]> {
  const intel = await getIntel();
  return intel?.supplierInflation ?? [];
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
  if (!intel) return getDemoWhatIf();
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
