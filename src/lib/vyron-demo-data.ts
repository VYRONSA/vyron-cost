/**
 * Enterprise intelligence — uses Handcrafted imported tenant when available.
 * Generic pie demo is disabled when NEXT_PUBLIC_VYRON_TENANT is active.
 */

import type { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import {
  getHandcraftedAiFeed,
  getHandcraftedCommandKpis,
  getHandcraftedProductIntelligence,
  getHandcraftedRecoveryOpportunities,
  getHandcraftedRoi,
  isHandcraftedDataReady,
  isHandcraftedTenantEnabled,
  loadHandcraftedTenant,
} from "@/lib/handcrafted-tenant";

export type CommandKpis = {
  moneyAtRisk: number;
  estimatedMonthlyLeakage: number;
  estimatedAnnualLeakage: number;
  supplierInflationExposure: number;
  productsBelowGp: number;
  duplicateInvoiceRisks: number;
  wastageLosses: number;
  procurementAnomalies: number;
  recoverableMonthly: number;
  recoverableAnnual: number;
  recoveryRatePercent: number;
  pendingActions: number;
};

export type AiFeedItem = {
  id: string;
  headline: string;
  detail: string;
  lossAmount: number;
  recoverableAmount: number;
  severity: string;
  action: string;
  href: string;
  time: string;
};

export type RecoveryOpportunity = {
  id: string;
  opportunity: string;
  category: string;
  monthly_saving: number;
  annual_saving: number;
  difficulty: string;
  status: string;
  action: string;
};

export type SupplierInflationRow = {
  id: string;
  supplier_name: string;
  category: string;
  current_cost?: number;
  previous_cost?: number;
  price_movement_percent: number;
  monthly_impact: number;
  annual_impact: number;
  risk_level: string;
  risk_score?: number;
  recommended_action: string;
};

export type ProductionIntelSection = {
  id: string;
  title: string;
  items: { label: string; value: string; tone?: "red" | "amber" | "emerald" }[];
};

export type WhatIfScenario = {
  ingredient: string;
  increasePercent: number;
  currentGp: number;
  newGp: number;
  annualImpact: number;
  suggestedPrice: number;
  productsAffected: string[];
};

export type ActionItem = { id: string; title: string; detail: string; href: string };
export type ActionGroups = { urgent: ActionItem[]; review: ActionItem[]; healthy: ActionItem[] };

export async function shouldUseDemoData() {
  const { shouldUseWorkspaceDemoData, getServerActiveWorkspace } = await import("@/lib/vyron-workspace-server");
  if (isHandcraftedTenantEnabled()) {
    return shouldUseWorkspaceDemoData();
  }
  const client = await getServerActiveWorkspace();
  if (client) return false;
  return process.env.NEXT_PUBLIC_VYRON_DEMO !== "false";
}

export const demoSampleLabel = "Handcrafted Food Products · imported costing";

function buildProductionFromTenant(): ProductionIntelSection[] {
  const tenant = loadHandcraftedTenant();
  if (!tenant?.products?.length) return [];

  const sorted = [...tenant.product_intelligence].sort((a, b) => Number(b.actual_gp || 0) - Number(a.actual_gp || 0));
  const top = sorted.slice(0, 3);
  const pressure = sorted.filter((p) => Number(p.gp_gap || 0) > 0).slice(0, 3);

  return [
    {
      id: "margin-top",
      title: "Top Margin Products",
      items: top.map((p) => ({
        label: String(p.product_name),
        value: `${Number(p.actual_gp || 0).toFixed(1)}% GP`,
        tone: "emerald" as const,
      })),
    },
    {
      id: "pressure",
      title: "Products Under Pressure",
      items: pressure.length
        ? pressure.map((p) => ({
            label: String(p.product_name),
            value: `${Number(p.actual_gp || 0).toFixed(1)}% · gap ${Number(p.gp_gap || 0).toFixed(1)}%`,
            tone: "red" as const,
          }))
        : [{ label: "All imported SKUs", value: "Within target band", tone: "emerald" as const }],
    },
    {
      id: "wastage",
      title: "Highest Wastage Areas",
      items: tenant.batch_runs
        .filter((b) => b.status === "Variance")
        .slice(0, 3)
        .map((b) => ({
          label: b.recipe_name_snapshot,
          value: `Batch ${b.batch_number}`,
          tone: "amber" as const,
        })),
    },
    {
      id: "volatile",
      title: "Most Volatile Ingredients",
      items: tenant.ingredients
        .filter((i) => i.previous_cost && i.purchase_cost > i.previous_cost)
        .slice(0, 3)
        .map((i) => ({
          label: i.ingredient_name,
          value: `+${(((i.purchase_cost - i.previous_cost) / i.previous_cost) * 100).toFixed(1)}%`,
          tone: "red" as const,
        })),
    },
    {
      id: "yield",
      title: "Batch Yield Warnings",
      items: tenant.batch_runs.slice(0, 3).map((b) => ({
        label: b.batch_number,
        value: b.status,
        tone: b.status === "Variance" ? ("red" as const) : ("emerald" as const),
      })),
    },
    {
      id: "packaging",
      title: "Packaging Cost Movement",
      items: tenant.product_cost_lines
        .filter((l) => String(l.line_type).toLowerCase().includes("pack"))
        .slice(0, 3)
        .map((l) => ({
          label: l.line_name,
          value: `R${Number(l.line_cost || 0).toFixed(2)}`,
          tone: "amber" as const,
        })),
    },
  ];
}

function buildActionCentreFromTenant(): ActionGroups {
  const intel = getHandcraftedProductIntelligence();
  const below = intel.filter((p) => Number(p.gp_gap || 0) > 0);

  return {
    urgent: [
      ...below.slice(0, 2).map((p, i) => ({
        id: `u-gp-${i}`,
        title: `${p.product_name} below target GP`,
        detail: `GP ${Number(p.actual_gp || 0).toFixed(1)}% vs ${Number(p.target_gp || 0)}% target`,
        href: "/product-profitability",
      })),
      {
        id: "u-inv",
        title: "Duplicate invoice review",
        detail: "Finance queue — imported risk flag",
        href: "/invoice-forensics",
      },
    ],
    review: [
      { id: "r1", title: "Supplier inflation review", detail: "Review protein and packaging movement", href: "/supplier-inflation-impact" },
      { id: "r2", title: "Production wastage", detail: "Batch variance on production lines", href: "/production-intelligence" },
    ],
    healthy: intel
      .filter((p) => Number(p.gp_gap || 0) === 0)
      .slice(0, 3)
      .map((p, i) => ({
        id: `h-${i}`,
        title: `${p.product_name} margin stable`,
        detail: `${Number(p.actual_gp || 0).toFixed(1)}% GP`,
        href: "/product-profitability",
      })),
  };
}

function buildSupplierInflationFromTenant(): SupplierInflationRow[] {
  const tenant = loadHandcraftedTenant();
  if (!tenant) return [];

  const byCategory = new Map<string, { movement: number; cost: number }>();
  for (const ing of tenant.ingredients) {
    const cat = ing.category || "General";
    const prev = Number(ing.previous_cost || ing.purchase_cost);
    const move = prev > 0 ? ((ing.purchase_cost - prev) / prev) * 100 : 0;
    const cur = byCategory.get(cat) || { movement: 0, cost: 0 };
    cur.movement = Math.max(cur.movement, move);
    cur.cost += ing.purchase_cost;
    byCategory.set(cat, cur);
  }

  return [...byCategory.entries()].map(([category, data], i) => ({
    id: `si-${i}`,
    supplier_name: `${category} supply`,
    category,
    price_movement_percent: Number(data.movement.toFixed(1)),
    monthly_impact: Math.round(data.cost * (data.movement / 100)),
    annual_impact: Math.round(data.cost * (data.movement / 100) * 12),
    risk_level: data.movement > 10 ? "Critical" : data.movement > 5 ? "High" : "Low",
    recommended_action: data.movement > 8 ? "Negotiate" : "Monitor",
  }));
}

function buildWhatIfFromTenant(): WhatIfScenario {
  const beef = loadHandcraftedTenant()?.products.find((p) => /beef/i.test(p.product_name));
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
    productsAffected: loadHandcraftedTenant()
      ?.products.filter((p) => /beef|steak|kidney/i.test(p.product_name))
      .map((p) => p.product_name) ?? ["Beef lines"],
  };
}

const emptyKpis: CommandKpis = {
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

export function getDemoCommandKpis(): CommandKpis {
  return getHandcraftedCommandKpis() ?? emptyKpis;
}

export function getDemoAiFeed(): AiFeedItem[] {
  return getHandcraftedAiFeed();
}

export function getDemoProductProfitability(): ProductIntelligenceRow[] {
  return getHandcraftedProductIntelligence();
}

export function getDemoSupplierInflation(): SupplierInflationRow[] {
  if (!isHandcraftedDataReady()) return [];
  return buildSupplierInflationFromTenant();
}

export function getDemoProductionIntel(): ProductionIntelSection[] {
  if (!isHandcraftedDataReady()) return [];
  return buildProductionFromTenant();
}

export function getDemoActionCentre(): ActionGroups {
  if (!isHandcraftedDataReady()) return { urgent: [], review: [], healthy: [] };
  return buildActionCentreFromTenant();
}

export function getDemoWhatIf(): WhatIfScenario {
  if (!isHandcraftedDataReady()) {
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
  return buildWhatIfFromTenant();
}

export function getDemoRecoveryList(): RecoveryOpportunity[] {
  return getHandcraftedRecoveryOpportunities();
}

export function getDemoRoiValues() {
  return getHandcraftedRoi();
}
