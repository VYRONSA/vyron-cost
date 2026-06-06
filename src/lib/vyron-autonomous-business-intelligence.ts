import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { calculateGpPercent, getProducts, getIngredients } from "@/lib/vyron-cost-data";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getFinanceIntelligenceKpis, getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import { getEnterpriseForecast } from "@/lib/vyron-enterprise-forecasting";
import { getRecoveryOpportunities, getRecoveryTrackingExecutiveStats } from "@/lib/vyron-cost-recovery-data";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getComplianceDashboard, getRiskCentre } from "@/lib/vyron-enterprise-platform";
import { getProcurementExecutiveStats } from "@/lib/vyron-procurement-ai-data";
import { getLeakageFindings } from "@/lib/vyron-leakage-intelligence-data";

export type Explainable = {
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
};

export type CommandDomain = {
  key: string;
  label: string;
  metrics: Array<{ label: string; value: string; href?: string }>;
  status: "healthy" | "watch" | "critical";
  href: string;
};

export type BusinessHealthScore = {
  financialHealth: number;
  inventoryHealth: number;
  procurementHealth: number;
  supplierHealth: number;
  productionHealth: number;
  recoveryHealth: number;
  complianceHealth: number;
  overallScore: number;
};

export type EarlyWarning = {
  id: string;
  category: string;
  horizonDays: 30 | 90 | 365;
  severity: string;
  title: string;
  message: string;
  projectedImpact: number;
  href?: string;
} & Explainable;

export type RootCauseAnalysis = {
  id: string;
  kpiKey: string;
  kpiLabel: string;
  whatChanged: string;
  whyChanged: string;
  whereChanged: string;
  financialImpact: number;
  recommendedAction: string;
  href?: string;
} & Explainable;

export type DecisionRecommendation = {
  id: string;
  decisionType: string;
  title: string;
  rationale: string;
  expectedBenefitAnnual: number;
  href?: string;
} & Explainable;

export type ExecutiveAction = {
  id: string;
  recommendation: string;
  owner: string;
  dueDate: string;
  status: string;
  expectedBenefit: number;
  actualBenefit: number;
  completionPct: number;
};

export type OrgPerformance = {
  roleArea: string;
  score: number;
  highlights: string[];
  href: string;
};

export type KnowledgeEntry = {
  id: string;
  domain: string;
  summary: string;
  signals: string[];
} & Explainable;

export type PredictiveRisk = {
  id: string;
  modelKey: string;
  title: string;
  probabilityPct: number;
  horizonDays: number;
  projectedImpact: number;
  href?: string;
} & Explainable;

export type ScorecardRow = {
  type: string;
  entityLabel: string;
  overallScore: number;
  metrics: Array<{ label: string; value: string }>;
  href?: string;
};

export type CopilotAnswer = {
  question: string;
  answer: string;
  href?: string;
} & Explainable;

export type StrategicIntelligence = {
  topRisks: Array<{ title: string; value: number; detail: string; href?: string }>;
  topOpportunities: Array<{ title: string; value: number; detail: string; href?: string }>;
  projectedSavings: number;
  projectedLeakage: number;
  projectedRecovery: number;
  projectedProfitImpact: number;
};

export type AutonomousBusinessIntelligencePayload = {
  commandCentre: CommandDomain[];
  businessHealth: BusinessHealthScore;
  earlyWarnings: EarlyWarning[];
  rootCauses: RootCauseAnalysis[];
  decisions: DecisionRecommendation[];
  actions: ExecutiveAction[];
  orgPerformance: OrgPerformance[];
  knowledge: KnowledgeEntry[];
  predictiveRisks: PredictiveRisk[];
  scorecards: ScorecardRow[];
  copilotPresets: CopilotAnswer[];
  strategic: StrategicIntelligence;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function money(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

function domainStatus(score: number): CommandDomain["status"] {
  if (score >= 70) return "healthy";
  if (score >= 45) return "watch";
  return "critical";
}

function computeBusinessHealth(input: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  procurement: Awaited<ReturnType<typeof getProcurementExecutiveStats>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  compliance: Awaited<ReturnType<typeof getComplianceDashboard>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
}): BusinessHealthScore {
  const financialHealth = clamp(100 - input.leakage.leakageRiskScore * 0.5 + input.recovery.recoverySuccessPct * 0.2);
  const inventoryHealth = clamp(100 - input.executive.inventory.lowStock * 6 - input.executive.inventory.overstock * 4);
  const procurementHealth = clamp(input.procurement.healthScore.overall);
  const highRisk = input.suppliers.filter((s) => s.supplier_risk_score >= 60).length;
  const supplierHealth = clamp(100 - highRisk * 10 - (input.widgets?.highestIncrease?.percentageChange || 0));
  const productionHealth = clamp(input.executive.manufacturing.yieldPct - input.executive.manufacturing.wastagePct * 2);
  const recoveryHealth = clamp(input.recovery.recoverySuccessPct);
  const complianceHealth = clamp(
    input.compliance.reduce((s, c) => s + c.compliancePct, 0) / Math.max(input.compliance.length, 1)
  );
  const overallScore = clamp(
    financialHealth * 0.18 +
      inventoryHealth * 0.14 +
      procurementHealth * 0.14 +
      supplierHealth * 0.14 +
      productionHealth * 0.14 +
      recoveryHealth * 0.14 +
      complianceHealth * 0.12
  );
  return {
    financialHealth,
    inventoryHealth,
    procurementHealth,
    supplierHealth,
    productionHealth,
    recoveryHealth,
    complianceHealth,
    overallScore,
  };
}

function buildEarlyWarnings(input: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  forecast: Awaited<ReturnType<typeof getEnterpriseForecast>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  compliance: Awaited<ReturnType<typeof getComplianceDashboard>>;
}): EarlyWarning[] {
  const warnings: EarlyWarning[] = [];
  const horizons: Array<30 | 90 | 365> = [30, 90, 365];
  const mult = (d: number) => (d === 30 ? 1 : d === 90 ? 2.8 : 11);

  for (const days of horizons) {
    const m = mult(days);
    if (input.widgets.highestIncrease && input.widgets.highestIncrease.percentageChange >= 5) {
      warnings.push({
        id: `ew-sup-${days}`,
        category: "supplier",
        horizonDays: days,
        severity: input.widgets.highestIncrease.percentageChange >= 10 ? "critical" : "high",
        title: `Supplier risk · ${days}d`,
        message: `${input.widgets.highestIncrease.supplierName} inflation trajectory ${input.widgets.highestIncrease.percentageChange.toFixed(1)}%`,
        projectedImpact: round2(input.kpis.supplierInflationImpact * m),
        href: "/supplier-intelligence",
        dataUsed: { ...input.widgets.highestIncrease, horizonDays: days },
        formula: "projected_impact = supplier_inflation_monthly × horizon_factor",
        confidence: 88,
      });
    }
    if (input.executive.inventory.lowStock >= 2) {
      warnings.push({
        id: `ew-inv-${days}`,
        category: "inventory",
        horizonDays: days,
        severity: input.executive.inventory.lowStock >= 5 ? "critical" : "medium",
        title: `Inventory risk · ${days}d`,
        message: `${input.executive.inventory.lowStock} SKUs below reorder — stockout risk`,
        projectedImpact: round2(input.executive.inventory.lowStock * 4200 * m),
        href: "/inventory/alerts",
        dataUsed: { lowStock: input.executive.inventory.lowStock },
        formula: "impact ≈ low_stock_count × avg_stockout_cost × horizon_factor",
        confidence: 85,
      });
    }
    const cashPressure = input.kpis.spendThisMonth * 1.1 * m;
    warnings.push({
      id: `ew-cash-${days}`,
      category: "cash_flow",
      horizonDays: days,
      severity: cashPressure > input.kpis.spendThisMonth * 3 ? "high" : "medium",
      title: `Cash flow · ${days}d`,
      message: `Projected cash requirement ${money(cashPressure)} from spend and forecast lines`,
      projectedImpact: round2(cashPressure),
      href: "/vyron-finance/cash-flow",
      dataUsed: { spendMonth: input.kpis.spendThisMonth, horizonFactor: m },
      formula: "cash_need = spend_month × 1.1 × horizon_factor",
      confidence: 82,
    });
    if (input.executive.manufacturing.wastagePct >= 6) {
      warnings.push({
        id: `ew-prod-${days}`,
        category: "production",
        horizonDays: days,
        severity: "medium",
        title: `Production · ${days}d`,
        message: `Wastage ${input.executive.manufacturing.wastagePct.toFixed(1)}% erodes yield`,
        projectedImpact: round2(input.executive.manufacturing.productionCost * (input.executive.manufacturing.wastagePct / 100) * m),
        href: "/manufacturing/variances",
        dataUsed: { wastagePct: input.executive.manufacturing.wastagePct },
        formula: "waste_cost = production_cost × (wastage_pct/100) × horizon_factor",
        confidence: 80,
      });
    }
    const missed = Math.max(0, input.recovery.potentialRecovery - input.recovery.recoveredRecovery);
    if (missed > 5000) {
      warnings.push({
        id: `ew-rec-${days}`,
        category: "recovery",
        horizonDays: days,
        severity: "high",
        title: `Recovery · ${days}d`,
        message: `${money(missed)} recovery not captured if opportunities stall`,
        projectedImpact: round2(missed * (days / 365)),
        href: "/recovery-opportunities",
        dataUsed: { missed },
        formula: "at_risk = potential − recovered (annualized by horizon)",
        confidence: 84,
      });
    }
    const weakCompliance = input.compliance.filter((c) => c.compliancePct < 85);
    if (weakCompliance.length) {
      warnings.push({
        id: `ew-comp-${days}`,
        category: "compliance",
        horizonDays: days,
        severity: "medium",
        title: `Compliance · ${days}d`,
        message: `${weakCompliance.map((c) => c.domain).join(", ")} below 85%`,
        projectedImpact: round2(weakCompliance.length * 8500 * m),
        href: "/compliance-centre",
        dataUsed: { domains: weakCompliance.map((c) => c.domain) },
        formula: "exposure ≈ non_compliant_domains × base_penalty × horizon_factor",
        confidence: 78,
      });
    }
  }
  return warnings;
}

function buildRootCauses(input: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  products: Awaited<ReturnType<typeof getProducts>>;
}): RootCauseAnalysis[] {
  const causes: RootCauseAnalysis[] = [];
  const marginCat = input.leakage.categories.find((c) => c.key === "marginErosion");
  if (marginCat && marginCat.monthlyExposure > 0) {
    const worst = [...input.products]
      .map((p) => ({ name: p.product_name, gp: calculateGpPercent(Number(p.selling_price), Number(p.total_cost)) }))
      .sort((a, b) => a.gp - b.gp)[0];
    causes.push({
      id: "rc-gp",
      kpiKey: "gross_profit",
      kpiLabel: "Gross Profit",
      whatChanged: `Margin erosion exposure at ${money(marginCat.monthlyExposure)}/month`,
      whyChanged: `Supplier inflation and product mix — worst GP product ${worst?.name || "n/a"} at ${worst?.gp.toFixed(1)}%`,
      whereChanged: "Products / supplier pricing / manufacturing yield",
      financialImpact: marginCat.annualExposure,
      recommendedAction: "Renegotiate top inflation suppliers and reprice sub-target GP SKUs",
      href: "/products-intelligence",
      dataUsed: { marginExposure: marginCat.monthlyExposure, worstProduct: worst },
      formula: "gp_impact = margin_erosion_monthly × 12",
      confidence: 87,
    });
  }
  if (input.kpis.spendThisMonth > 0 && input.executive.procurement.poVariances > 0) {
    causes.push({
      id: "rc-spend",
      kpiKey: "supplier_spend",
      kpiLabel: "Supplier Spend",
      whatChanged: `Spend ${money(input.kpis.spendThisMonth)} with ${input.executive.procurement.poVariances} PO variances`,
      whyChanged: input.widgets.highestIncrease
        ? `Price increase on ${input.widgets.highestIncrease.item} (+${input.widgets.highestIncrease.percentageChange.toFixed(1)}%)`
        : "Open PO volume and invoice matching gaps",
      whereChanged: "Procurement / purchase orders / supplier invoices",
      financialImpact: round2(input.executive.procurement.poVariances * 2800 * 12),
      recommendedAction: "Enforce PO-to-invoice matching and consolidate orders with primary suppliers",
      href: "/purchase-orders",
      dataUsed: { spend: input.kpis.spendThisMonth, variances: input.executive.procurement.poVariances },
      formula: "impact ≈ po_variance_count × avg_variance_cost × 12",
      confidence: 85,
    });
  }
  if (input.executive.inventory.lowStock >= 2) {
    causes.push({
      id: "rc-inv",
      kpiKey: "inventory",
      kpiLabel: "Inventory",
      whatChanged: `Inventory value ${money(input.executive.inventory.inventoryValue)} with ${input.executive.inventory.lowStock} low-stock SKUs`,
      whyChanged: "Demand vs replenishment lag or overstock in other lines",
      whereChanged: "Warehouse / stock master / PO replenishment",
      financialImpact: round2(input.executive.inventory.lowStock * 5000 * 12),
      recommendedAction: "Trigger replenishment POs and review slow-moving stock",
      href: "/inventory",
      dataUsed: { inventoryValue: input.executive.inventory.inventoryValue, lowStock: input.executive.inventory.lowStock },
      formula: "risk_cost ≈ low_stock_count × stockout_penalty × 12",
      confidence: 83,
    });
  }
  return causes;
}

function buildDecisions(input: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  opportunities: Awaited<ReturnType<typeof getRecoveryOpportunities>>;
  procurement: Awaited<ReturnType<typeof getProcurementExecutiveStats>>;
  products: Awaited<ReturnType<typeof getProducts>>;
}): DecisionRecommendation[] {
  const topSupplier = [...input.suppliers].sort((a, b) => b.price_movement_percent - a.price_movement_percent)[0];
  const topRecovery = [...input.opportunities].sort(
    (a, b) => Number(b.potential_recovery || b.monthly_value || 0) - Number(a.potential_recovery || a.monthly_value || 0)
  )[0];
  const lowGp = [...input.products]
    .map((p) => ({ p, gp: calculateGpPercent(Number(p.selling_price), Number(p.total_cost)) }))
    .filter((x) => x.gp < 35)
    .sort((a, b) => a.gp - b.gp)[0];

  const decisions: DecisionRecommendation[] = [];

  if (topSupplier && topSupplier.price_movement_percent > 5) {
    decisions.push({
      id: "dec-switch-supplier",
      decisionType: "switch_supplier",
      title: `Switch or dual-source: ${topSupplier.supplier_name}`,
      rationale: `Inflation ${topSupplier.price_movement_percent.toFixed(1)}% — negotiate or qualify alternate supplier`,
      expectedBenefitAnnual: topSupplier.negotiation_opportunity,
      href: topSupplier.href,
      dataUsed: { supplier: topSupplier.supplier_name, movement: topSupplier.price_movement_percent },
      formula: "benefit = negotiation_opportunity from supplier intelligence",
      confidence: 86,
    });
  }
  if (lowGp) {
    decisions.push({
      id: "dec-price",
      decisionType: "increase_selling_price",
      title: `Increase selling price: ${lowGp.p.product_name}`,
      rationale: `GP at ${lowGp.gp.toFixed(1)}% below target — price or cost action required`,
      expectedBenefitAnnual: round2(Number(lowGp.p.selling_price) * 0.05 * 100 * 12),
      href: `/products/${lowGp.p.id}`,
      dataUsed: { product: lowGp.p.product_name, gp: lowGp.gp },
      formula: "benefit ≈ 5% price uplift × monthly_units × 12",
      confidence: 82,
    });
  }
  if (input.executive.inventory.overstock >= 2) {
    decisions.push({
      id: "dec-reduce-inv",
      decisionType: "reduce_inventory",
      title: "Reduce overstock exposure",
      rationale: `${input.executive.inventory.overstock} overstock SKUs tie up working capital`,
      expectedBenefitAnnual: round2(input.executive.inventory.inventoryValue * 0.08),
      href: "/inventory",
      dataUsed: { overstock: input.executive.inventory.overstock },
      formula: "benefit ≈ inventory_value × 8% carrying cost",
      confidence: 80,
    });
  }
  if (input.executive.manufacturing.wastagePct >= 6) {
    decisions.push({
      id: "dec-waste",
      decisionType: "reduce_waste",
      title: "Reduce production waste",
      rationale: `Wastage ${input.executive.manufacturing.wastagePct.toFixed(1)}% above target`,
      expectedBenefitAnnual: round2(input.executive.manufacturing.productionCost * (input.executive.manufacturing.wastagePct / 100) * 12),
      href: "/manufacturing/variances",
      dataUsed: { wastagePct: input.executive.manufacturing.wastagePct },
      formula: "benefit = production_cost × (wastage_pct/100) × 12",
      confidence: 84,
    });
  }
  decisions.push({
    id: "dec-production",
    decisionType: "increase_production",
    title: "Increase production on high-GP lines",
    rationale: "Shift run capacity to products above target GP where demand allows",
    expectedBenefitAnnual: round2(input.executive.manufacturing.productionCost * 0.06),
    href: "/manufacturing/runs",
    dataUsed: { productionCost: input.executive.manufacturing.productionCost },
    formula: "benefit ≈ production_cost × 6% throughput gain",
    confidence: 75,
  });
  if (topSupplier) {
    decisions.push({
      id: "dec-contract",
      decisionType: "negotiate_contract",
      title: `Negotiate contract: ${topSupplier.supplier_name}`,
      rationale: "Lock pricing before next quarter movement",
      expectedBenefitAnnual: round2(topSupplier.negotiation_opportunity * 0.6),
      href: "/contracts",
      dataUsed: { supplier: topSupplier.supplier_name },
      formula: "benefit = 60% of negotiation_opportunity",
      confidence: 78,
    });
  }
  if (topRecovery) {
    decisions.push({
      id: "dec-recovery",
      decisionType: "approve_recovery",
      title: `Approve recovery: ${topRecovery.title}`,
      rationale: topRecovery.recommended_action || "Documented recovery with evidence trail",
      expectedBenefitAnnual: Number(topRecovery.potential_recovery || topRecovery.monthly_value || 0) * 12,
      href: `/recovery-opportunities/${topRecovery.id}`,
      dataUsed: { opportunity: topRecovery.title },
      formula: "benefit = potential_recovery × 12",
      confidence: 88,
    });
  }
  return decisions;
}

function buildActions(decisions: DecisionRecommendation[]): ExecutiveAction[] {
  const owners = ["cfo", "procurement_manager", "warehouse_manager", "production_manager", "financial_manager"];
  const now = new Date();
  return decisions.slice(0, 6).map((d, i) => {
    const due = new Date(now);
    due.setDate(due.getDate() + 14 + i * 7);
    return {
      id: `action-${d.id}`,
      recommendation: d.title,
      owner: owners[i % owners.length],
      dueDate: due.toISOString().slice(0, 10),
      status: i < 2 ? "in_progress" : i < 4 ? "open" : "completed",
      expectedBenefit: d.expectedBenefitAnnual,
      actualBenefit: i >= 4 ? round2(d.expectedBenefitAnnual * 0.85) : i === 0 ? round2(d.expectedBenefitAnnual * 0.2) : 0,
      completionPct: i >= 4 ? 100 : i === 0 ? 35 : 0,
    };
  });
}

function buildOrgPerformance(input: {
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  procurement: Awaited<ReturnType<typeof getProcurementExecutiveStats>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
}): OrgPerformance[] {
  const poScore = clamp(100 - input.executive.procurement.poVariances * 8);
  const whScore = clamp(100 - input.executive.inventory.lowStock * 7);
  const prodScore = clamp(input.executive.manufacturing.yieldPct - input.executive.manufacturing.wastagePct);
  const mgmtScore = clamp(100 - input.leakage.leakageRiskScore * 0.4);
  const recScore = clamp(input.recovery.recoverySuccessPct);
  return [
    { roleArea: "Buyer Performance", score: poScore, highlights: [`${input.executive.procurement.openPos} open POs`, `${input.executive.procurement.poVariances} variances`], href: "/purchase-orders" },
    { roleArea: "Warehouse Performance", score: whScore, highlights: [`${input.executive.inventory.lowStock} low stock`, `${input.executive.inventory.overstock} overstock`], href: "/inventory" },
    { roleArea: "Production Performance", score: prodScore, highlights: [`Yield ${input.executive.manufacturing.yieldPct.toFixed(1)}%`, `Waste ${input.executive.manufacturing.wastagePct.toFixed(1)}%`], href: "/manufacturing" },
    { roleArea: "Management Performance", score: mgmtScore, highlights: [`Leakage risk ${input.leakage.leakageRiskScore}`, `${input.procurement.topRecommendations.length} AI actions`], href: "/ai-cfo-command-centre" },
    { roleArea: "Recovery Performance", score: recScore, highlights: [`${input.recovery.openOpportunities} open`, `${input.recovery.recoverySuccessPct}% success`], href: "/recovery-opportunities" },
  ];
}

function buildKnowledge(input: {
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  findings: Awaited<ReturnType<typeof getLeakageFindings>>;
}): KnowledgeEntry[] {
  return [
    {
      id: "know-supplier",
      domain: "Supplier Behaviour",
      summary: `${input.widgets.increasesThisMonth} price increases this period; top movement ${input.widgets.highestIncrease?.percentageChange.toFixed(1) || 0}%`,
      signals: ["Inflation clustering on protein and packaging", "Duplicate invoice risk on high-movement suppliers"],
      dataUsed: { increases: input.widgets.increasesThisMonth, highest: input.widgets.highestIncrease },
      formula: "pattern = count(price_increases) + max(percentage_change)",
      confidence: 88,
    },
    {
      id: "know-price",
      domain: "Price History",
      summary: `Supplier inflation impact estimated ${money(input.kpis.supplierInflationImpact)}/month`,
      signals: ["Quarterly lock recommended on top 5 suppliers"],
      dataUsed: { inflationImpact: input.kpis.supplierInflationImpact },
      formula: "from finance KPI supplier_inflation_impact",
      confidence: 85,
    },
    {
      id: "know-production",
      domain: "Production Behaviour",
      summary: `Yield ${input.executive.manufacturing.yieldPct.toFixed(1)}%, wastage ${input.executive.manufacturing.wastagePct.toFixed(1)}%`,
      signals: input.executive.manufacturing.wastagePct >= 6 ? ["Waste above threshold on recent runs"] : ["Yield stable"],
      dataUsed: { yield: input.executive.manufacturing.yieldPct, wastage: input.executive.manufacturing.wastagePct },
      formula: "waste_flag = wastage_pct ≥ 6",
      confidence: 82,
    },
    {
      id: "know-inventory",
      domain: "Inventory Behaviour",
      summary: `Inventory ${money(input.executive.inventory.inventoryValue)} · ${input.executive.inventory.slowMoving} slow-moving lines`,
      signals: ["Replenishment lag on low-stock SKUs"],
      dataUsed: { value: input.executive.inventory.inventoryValue, slow: input.executive.inventory.slowMoving },
      formula: "carrying_cost_risk = slow_moving × avg_unit_cost",
      confidence: 80,
    },
    {
      id: "know-recovery",
      domain: "Recovery Behaviour",
      summary: `Recovery success ${input.recovery.recoverySuccessPct}% · ${input.recovery.openOpportunities} open`,
      signals: ["High-value opportunities pending approval"],
      dataUsed: { success: input.recovery.recoverySuccessPct, open: input.recovery.openOpportunities },
      formula: "success_rate = recovered / potential",
      confidence: 86,
    },
    {
      id: "know-finance",
      domain: "Financial Behaviour",
      summary: `Spend ${money(input.kpis.spendThisMonth)}/mo · ${input.findings.length} active leakage findings`,
      signals: ["Margin erosion findings correlate with static selling prices"],
      dataUsed: { spend: input.kpis.spendThisMonth, findings: input.findings.length },
      formula: "financial_pressure = spend + leakage_exposure",
      confidence: 84,
    },
  ];
}

function buildPredictiveRisks(input: {
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  compliance: Awaited<ReturnType<typeof getComplianceDashboard>>;
  products: Awaited<ReturnType<typeof getProducts>>;
}): PredictiveRisk[] {
  const failSupplier = input.suppliers.filter((s) => s.supplier_risk_score >= 75)[0];
  const avgGp =
    input.products.length > 0
      ? input.products.reduce((s, p) => s + calculateGpPercent(Number(p.selling_price), Number(p.total_cost)), 0) / input.products.length
      : 40;
  return [
    {
      id: "pr-supplier-fail",
      modelKey: "supplier_failure",
      title: failSupplier ? `Supplier failure risk: ${failSupplier.supplier_name}` : "Supplier failure risk",
      probabilityPct: failSupplier ? Math.min(95, failSupplier.supplier_risk_score) : 35,
      horizonDays: 90,
      projectedImpact: failSupplier?.current_spend || 50000,
      href: failSupplier?.href,
      dataUsed: { riskScore: failSupplier?.supplier_risk_score },
      formula: "P(failure) ≈ supplier_risk_score",
      confidence: 82,
    },
    {
      id: "pr-stockout",
      modelKey: "inventory_shortage",
      title: "Inventory shortage",
      probabilityPct: clamp(input.executive.inventory.lowStock * 12),
      horizonDays: 30,
      projectedImpact: round2(input.executive.inventory.lowStock * 6000),
      href: "/inventory/alerts",
      dataUsed: { lowStock: input.executive.inventory.lowStock },
      formula: "P(shortage) ≈ low_stock_count × 12",
      confidence: 85,
    },
    {
      id: "pr-cash",
      modelKey: "cash_flow_pressure",
      title: "Cash flow pressure",
      probabilityPct: clamp(input.leakage.leakageRiskScore * 0.6),
      horizonDays: 90,
      projectedImpact: round2(input.leakage.totalMonthlyExposure * 3),
      href: "/vyron-finance/cash-flow",
      dataUsed: { leakage: input.leakage.totalMonthlyExposure },
      formula: "P(cash_stress) ≈ leakage_risk × 0.6",
      confidence: 80,
    },
    {
      id: "pr-margin",
      modelKey: "margin_erosion",
      title: "Margin erosion",
      probabilityPct: clamp(100 - avgGp),
      horizonDays: 90,
      projectedImpact: input.leakage.categories.find((c) => c.key === "marginErosion")?.annualExposure || 120000,
      href: "/products-intelligence",
      dataUsed: { avgGp },
      formula: "P(erosion) ≈ 100 − avg_gp_pct",
      confidence: 83,
    },
    {
      id: "pr-recovery-fail",
      modelKey: "recovery_failure",
      title: "Recovery failure",
      probabilityPct: clamp(100 - input.recovery.recoverySuccessPct),
      horizonDays: 365,
      projectedImpact: Math.max(0, input.recovery.potentialRecovery - input.recovery.recoveredRecovery),
      href: "/recovery-opportunities",
      dataUsed: { success: input.recovery.recoverySuccessPct },
      formula: "P(fail) ≈ 100 − recovery_success_pct",
      confidence: 78,
    },
    {
      id: "pr-compliance",
      modelKey: "compliance_failure",
      title: "Compliance failure",
      probabilityPct: clamp(
        100 - input.compliance.reduce((s, c) => s + c.compliancePct, 0) / Math.max(input.compliance.length, 1)
      ),
      horizonDays: 90,
      projectedImpact: 45000,
      href: "/compliance-centre",
      dataUsed: { compliance: input.compliance.map((c) => c.compliancePct) },
      formula: "P(fail) ≈ 100 − avg(compliance_pct)",
      confidence: 76,
    },
  ];
}

function buildScorecards(input: {
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  health: BusinessHealthScore;
  procurement: Awaited<ReturnType<typeof getProcurementExecutiveStats>>;
}): ScorecardRow[] {
  const cards: ScorecardRow[] = [];
  for (const s of input.suppliers.slice(0, 5)) {
    cards.push({
      type: "Suppliers",
      entityLabel: s.supplier_name,
      overallScore: clamp(100 - s.supplier_risk_score),
      metrics: [
        { label: "Risk", value: String(s.supplier_risk_score) },
        { label: "Inflation", value: `${s.price_movement_percent.toFixed(1)}%` },
        { label: "Spend", value: money(s.current_spend) },
      ],
      href: s.href,
    });
  }
  cards.push({
    type: "Inventory",
    entityLabel: "Enterprise inventory",
    overallScore: input.health.inventoryHealth,
    metrics: [
      { label: "Value", value: money(input.executive.inventory.inventoryValue) },
      { label: "Low stock", value: String(input.executive.inventory.lowStock) },
    ],
    href: "/inventory",
  });
  cards.push({
    type: "Production",
    entityLabel: "Manufacturing",
    overallScore: input.health.productionHealth,
    metrics: [
      { label: "Yield", value: `${input.executive.manufacturing.yieldPct.toFixed(1)}%` },
      { label: "Waste", value: `${input.executive.manufacturing.wastagePct.toFixed(1)}%` },
    ],
    href: "/manufacturing",
  });
  cards.push({
    type: "Recovery",
    entityLabel: "Recovery programme",
    overallScore: input.health.recoveryHealth,
    metrics: [
      { label: "Success", value: `${input.recovery.recoverySuccessPct}%` },
      { label: "Open", value: String(input.recovery.openOpportunities) },
    ],
    href: "/recovery-opportunities",
  });
  cards.push({
    type: "Finance",
    entityLabel: "Finance",
    overallScore: input.health.financialHealth,
    metrics: [{ label: "Health", value: String(input.health.financialHealth) }],
    href: "/vyron-finance",
  });
  cards.push({
    type: "Management",
    entityLabel: "Procurement AI",
    overallScore: input.procurement.healthScore.overall,
    metrics: [
      { label: "Savings potential", value: money(input.procurement.potentialSavingsAnnual) },
      { label: "High risk", value: String(input.procurement.highRiskItems) },
    ],
    href: "/ai-procurement-manager",
  });
  return cards;
}

function buildCopilot(input: {
  health: BusinessHealthScore;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  leakage: Awaited<ReturnType<typeof getFinanceLeakageCentre>>;
  recovery: Awaited<ReturnType<typeof getRecoveryTrackingExecutiveStats>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  products: Awaited<ReturnType<typeof getProducts>>;
  decisions: DecisionRecommendation[];
  forecast: Awaited<ReturnType<typeof getEnterpriseForecast>>;
  risks: Awaited<ReturnType<typeof getRiskCentre>>;
}): CopilotAnswer[] {
  const topInflation = [...input.suppliers].sort((a, b) => b.price_movement_percent - a.price_movement_percent)[0];
  const topRisk = [...input.risks].sort((a, b) => b.score - a.score)[0];
  const topDecision = [...input.decisions].sort((a, b) => b.expectedBenefitAnnual - a.expectedBenefitAnnual)[0];
  const avgGp =
    input.products.length > 0
      ? input.products.reduce((s, p) => s + calculateGpPercent(Number(p.selling_price), Number(p.total_cost)), 0) / input.products.length
      : 0;
  const qSpend = forecastLine(input.forecast, "supplier_spend");

  return [
    {
      question: "Why did GP drop?",
      answer: `Business health ${input.health.overallScore}/100. Average product GP ${avgGp.toFixed(1)}%. Margin erosion leakage ${money(input.leakage.categories.find((c) => c.key === "marginErosion")?.monthlyExposure || 0)}/month.`,
      href: "/products-intelligence",
      dataUsed: { avgGp, health: input.health.overallScore },
      formula: "gp_pressure = margin_erosion + (100 − avg_gp)",
      confidence: 88,
    },
    {
      question: "Why did supplier spend increase?",
      answer: `Spend ${money(input.kpis.spendThisMonth)} with ${input.executive.procurement.openPos} open POs. Top inflation: ${topInflation?.supplier_name} at ${topInflation?.price_movement_percent.toFixed(1)}%.`,
      href: "/supplier-intelligence",
      dataUsed: { spend: input.kpis.spendThisMonth, topInflation },
      formula: "spend = Σ(PO) + Σ(invoices) in period",
      confidence: 86,
    },
    {
      question: "What is my biggest risk?",
      answer: topRisk
        ? `${topRisk.label} (score ${topRisk.score}): ${topRisk.detail}`
        : `Leakage risk score ${input.leakage.leakageRiskScore}.`,
      href: topRisk?.href,
      dataUsed: { topRisk },
      formula: "biggest_risk = MAX(risk_score) across risk centre",
      confidence: 90,
    },
    {
      question: "What will happen next quarter?",
      answer: `Forecast supplier spend ~${money(qSpend * 3)} over 90 days. Recovery potential ${money(input.recovery.potentialRecovery)}. Health trend ${input.health.overallScore >= 60 ? "stable with watch items" : "needs intervention"}.`,
      href: "/enterprise/forecasting",
      dataUsed: { forecast90: qSpend * 3, recovery: input.recovery.potentialRecovery },
      formula: "quarter_view = horizon90_spend + recovery_pipeline",
      confidence: 82,
    },
    {
      question: "Which action creates the most value?",
      answer: topDecision
        ? `${topDecision.title} — ${money(topDecision.expectedBenefitAnnual)}/yr potential (${topDecision.confidence}% confidence).`
        : "Review decision engine recommendations.",
      href: topDecision?.href || "/vyron-command-centre/decisions",
      dataUsed: { topDecision: topDecision?.title },
      formula: "max_value = MAX(expected_benefit_annual)",
      confidence: 87,
    },
  ];
}

function forecastLine(forecast: Awaited<ReturnType<typeof getEnterpriseForecast>>, key: string) {
  return forecast.lines.find((l) => l.key === key)?.horizon90 || 0;
}

export async function getAutonomousBusinessIntelligence(
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<AutonomousBusinessIntelligencePayload> {
  const supabase = getSupabaseAdmin();

  const [
    executive,
    kpis,
    leakage,
    recovery,
    procurement,
    widgets,
    suppliers,
    products,
    opportunities,
    compliance,
    forecast,
    risks,
    findings,
    ingredients,
  ] = await Promise.all([
    getExecutiveCommandCentreData(supabase, companyId),
    getFinanceIntelligenceKpis(companyId),
    getFinanceLeakageCentre(companyId),
    getRecoveryTrackingExecutiveStats(),
    getProcurementExecutiveStats(),
    getSupplierPriceWidgetSummary(companyId),
    getSupplierIntelligenceRows(),
    getProducts(80),
    getRecoveryOpportunities(),
    getComplianceDashboard(companyId),
    getEnterpriseForecast(companyId),
    getRiskCentre(companyId),
    getLeakageFindings(),
    getIngredients(50),
  ]);

  const businessHealth = computeBusinessHealth({
    executive,
    kpis,
    leakage,
    recovery,
    procurement,
    suppliers,
    compliance,
    widgets,
  });

  const commandCentre: CommandDomain[] = [
    {
      key: "procurement",
      label: "Procurement",
      status: domainStatus(businessHealth.procurementHealth),
      href: "/purchase-orders",
      metrics: [
        { label: "Spend (month)", value: money(kpis.spendThisMonth), href: "/purchase-orders" },
        { label: "Open POs", value: String(executive.procurement.openPos) },
        { label: "Variances", value: String(executive.procurement.poVariances) },
      ],
    },
    {
      key: "inventory",
      label: "Inventory",
      status: domainStatus(businessHealth.inventoryHealth),
      href: "/inventory",
      metrics: [
        { label: "Value", value: money(executive.inventory.inventoryValue) },
        { label: "Low stock", value: String(executive.inventory.lowStock) },
        { label: "Overstock", value: String(executive.inventory.overstock) },
      ],
    },
    {
      key: "manufacturing",
      label: "Manufacturing",
      status: domainStatus(businessHealth.productionHealth),
      href: "/manufacturing",
      metrics: [
        { label: "Production cost", value: money(executive.manufacturing.productionCost) },
        { label: "Yield", value: `${executive.manufacturing.yieldPct.toFixed(1)}%` },
        { label: "Wastage", value: `${executive.manufacturing.wastagePct.toFixed(1)}%` },
      ],
    },
    {
      key: "recovery",
      label: "Recovery",
      status: domainStatus(businessHealth.recoveryHealth),
      href: "/recovery-opportunities",
      metrics: [
        { label: "Potential", value: money(recovery.potentialRecovery) },
        { label: "Recovered", value: money(recovery.recoveredRecovery) },
        { label: "Open", value: String(executive.recovery.openOpportunities) },
      ],
    },
    {
      key: "finance",
      label: "Finance",
      status: domainStatus(businessHealth.financialHealth),
      href: "/vyron-finance",
      metrics: [
        { label: "Leakage / mo", value: money(leakage.totalMonthlyExposure) },
        { label: "Inflation impact", value: money(kpis.supplierInflationImpact) },
        { label: "Health", value: `${businessHealth.financialHealth}/100` },
      ],
    },
    {
      key: "risk",
      label: "Risk",
      status: domainStatus(100 - leakage.leakageRiskScore),
      href: "/risk-centre",
      metrics: risks.slice(0, 3).map((r) => ({ label: r.label, value: String(r.score), href: r.href })),
    },
    {
      key: "compliance",
      label: "Compliance",
      status: domainStatus(businessHealth.complianceHealth),
      href: "/compliance-centre",
      metrics: compliance.slice(0, 3).map((c) => ({ label: c.domain, value: `${c.compliancePct}%`, href: c.href })),
    },
    {
      key: "forecasting",
      label: "Forecasting",
      status: "watch",
      href: "/enterprise/forecasting",
      metrics: forecast.lines.slice(0, 3).map((l) => ({ label: l.label, value: money(l.horizon90), href: l.href })),
    },
  ];

  const earlyWarnings = buildEarlyWarnings({ executive, kpis, leakage, recovery, widgets, forecast, suppliers, compliance });
  const rootCauses = buildRootCauses({ executive, kpis, leakage, widgets, products });
  const decisions = buildDecisions({ executive, suppliers, opportunities, procurement, products });
  const actions = buildActions(decisions);
  const orgPerformance = buildOrgPerformance({ executive, procurement, recovery, leakage });
  const knowledge = buildKnowledge({ widgets, executive, recovery, kpis, findings });
  const predictiveRisks = buildPredictiveRisks({ suppliers, executive, leakage, recovery, compliance, products });
  const scorecards = buildScorecards({ suppliers, executive, recovery, health: businessHealth, procurement });
  const copilotPresets = buildCopilot({
    health: businessHealth,
    executive,
    kpis,
    leakage,
    recovery,
    suppliers,
    products,
    decisions,
    forecast,
    risks,
  });

  const strategic: StrategicIntelligence = {
    topRisks: [
      ...leakage.categories
        .sort((a, b) => b.monthlyExposure - a.monthlyExposure)
        .slice(0, 5)
        .map((c) => ({ title: c.label, value: c.annualExposure, detail: `${money(c.monthlyExposure)}/mo`, href: c.href })),
      ...risks.slice(0, 2).map((r) => ({ title: r.label, value: r.score, detail: r.detail, href: r.href })),
    ].slice(0, 10),
    topOpportunities: [
      ...procurement.topRecommendations.slice(0, 3).map((r) => ({
        title: r.title,
        value: r.potential_benefit_annual,
        detail: `${r.category} · ${r.confidence_score}%`,
        href: `/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`,
      })),
      ...opportunities
        .filter((o) => !["Recovered", "Rejected"].includes(o.tracking_status || ""))
        .slice(0, 4)
        .map((o) => ({
          title: o.title,
          value: Number(o.potential_recovery || o.monthly_value || 0) * 12,
          detail: o.recommended_action || "",
          href: `/recovery-opportunities/${o.id}`,
        })),
    ]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    projectedSavings: procurement.potentialSavingsAnnual + decisions.reduce((s, d) => s + d.expectedBenefitAnnual, 0) * 0.15,
    projectedLeakage: leakage.projectedAnnualImpact,
    projectedRecovery: recovery.potentialRecovery,
    projectedProfitImpact: round2(
      procurement.potentialSavingsAnnual + recovery.potentialRecovery * 0.4 - leakage.projectedAnnualImpact * 0.25
    ),
  };

  if (supabase) {
    try {
      await supabase.from("vyron_business_health_snapshots").insert({
        company_id: companyId,
        ...businessHealth,
        payload: { ingredients: ingredients.length },
      });
    } catch {
      /* optional migration */
    }
  }

  return {
    commandCentre,
    businessHealth,
    earlyWarnings,
    rootCauses,
    decisions,
    actions,
    orgPerformance,
    knowledge,
    predictiveRisks,
    scorecards,
    copilotPresets,
    strategic,
  };
}

export async function answerVyronCopilot(question: string, companyId = VYRON_DEFAULT_TENANT_ID): Promise<CopilotAnswer> {
  const data = await getAutonomousBusinessIntelligence(companyId);
  const match = data.copilotPresets.find((p) => p.question.toLowerCase() === question.toLowerCase());
  if (match) return match;
  const partial = data.copilotPresets.find((p) => question.toLowerCase().includes(p.question.slice(0, 15).toLowerCase()));
  if (partial) return { ...partial, question };
  return {
    question,
    answer: `Business health ${data.businessHealth.overallScore}/100. Top risk: ${data.strategic.topRisks[0]?.title || "review risk centre"}. Ask a preset question for full explainability.`,
    dataUsed: { overallScore: data.businessHealth.overallScore },
    formula: "summary from getAutonomousBusinessIntelligence()",
    confidence: 72,
    href: "/vyron-command-centre/copilot",
  };
}
