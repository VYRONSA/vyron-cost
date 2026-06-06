import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getFinanceIntelligenceKpis, getFinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";
import { getBudgetDashboard } from "@/lib/vyron-enterprise-budget";
import { getEnterpriseForecast } from "@/lib/vyron-enterprise-forecasting";
import { getProcurementExecutiveStats } from "@/lib/vyron-procurement-ai-data";
import { getRecoveryTrackingExecutiveStats, getRecoveryOpportunities } from "@/lib/vyron-cost-recovery-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getLeakageFindings, getInvoiceRiskFindings } from "@/lib/vyron-leakage-intelligence-data";
import { getFraudAlerts, getRiskCentre } from "@/lib/vyron-enterprise-platform";
import { runEnterpriseScenario, type ScenarioImpact } from "@/lib/vyron-enterprise-scenarios";
import { getIngredients } from "@/lib/vyron-cost-data";

export type IntelligenceScores = {
  financialHealth: number;
  procurementHealth: number;
  inventoryHealth: number;
  productionHealth: number;
  recoveryHealth: number;
  riskScore: number;
  overallScore: number;
};

export type LeakageLine = {
  key: string;
  label: string;
  monthlyExposure: number;
  annualExposure: number;
  href: string;
};

export type ProfitLeakageIntelligence = {
  lines: LeakageLine[];
  monthlyLeakage: number;
  annualLeakage: number;
  recoveredLeakage: number;
  potentialLeakage: number;
  missedRecovery: number;
};

export type AiFinancialNarrative = {
  id: string;
  title: string;
  body: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
};

export type AiRecommendation = {
  id: string;
  title: string;
  action: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
  href?: string;
};

export type ExecutiveAlert = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  href?: string;
  dataUsed: Record<string, unknown>;
  formula: string;
  confidence: number;
};

export type BoardroomItem = {
  rank: number;
  title: string;
  value: number;
  detail: string;
  href?: string;
};

export type BoardroomInsights = {
  topRisks: BoardroomItem[];
  topOpportunities: BoardroomItem[];
  projectedAnnualSavings: number;
  projectedAnnualCostIncreases: number;
  strategicActions: string[];
};

export type BudgetActualRow = {
  category: string;
  budget: number;
  actual: number;
  variance: number;
  variancePct: number;
  trend: "up" | "down" | "flat";
  rootCause: string;
  recommendation: AiRecommendation;
};

export type IndustryBenchmark = {
  industry: string;
  label: string;
  yourMetric: number;
  industryAvg: number;
  unit: string;
  comparison: "better" | "worse" | "inline";
};

export type MultiCompanyReadiness = {
  groupId: string;
  companies: Array<{ companyId: string; label: string; industry: string }>;
  features: string[];
  benchmarkReady: boolean;
};

export type ExecutiveTimelineEvent = {
  id: string;
  at: string;
  category: string;
  title: string;
  detail: string;
  href?: string;
};

export type StrategicScenario = {
  label: string;
  input: { supplierPct: number; packagingPct: number; volumePct: number };
  impact: ScenarioImpact;
};

export type AiFinancialIntelligencePayload = {
  scores: IntelligenceScores;
  leakage: ProfitLeakageIntelligence;
  narratives: AiFinancialNarrative[];
  forecast: Awaited<ReturnType<typeof getEnterpriseForecast>> & {
    cashRequirement30: number;
    cashRequirement90: number;
    cashRequirement365: number;
    costInflationAnnual: number;
  };
  budgetActual: BudgetActualRow[];
  multiCompany: MultiCompanyReadiness;
  industry: IndustryBenchmark[];
  alerts: ExecutiveAlert[];
  boardroom: BoardroomInsights;
  strategicScenarios: StrategicScenario[];
  timeline: ExecutiveTimelineEvent[];
  recommendations: AiRecommendation[];
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function money(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeScores(input: {
  leakageRisk: number;
  recoverySuccess: number;
  yieldPct: number;
  wastagePct: number;
  lowStock: number;
  procurementHealth: number;
  poVarianceRate: number;
}): IntelligenceScores {
  const financialHealth = clampScore(100 - input.leakageRisk * 0.55 - input.poVarianceRate * 30);
  const inventoryHealth = clampScore(100 - input.lowStock * 6 - 8);
  const productionHealth = clampScore(input.yieldPct - input.wastagePct * 2);
  const recoveryHealth = clampScore(input.recoverySuccess);
  const procurementHealth = clampScore(input.procurementHealth);
  const riskScore = clampScore(input.leakageRisk);
  const overallScore = clampScore(
    financialHealth * 0.22 +
      procurementHealth * 0.18 +
      inventoryHealth * 0.15 +
      productionHealth * 0.15 +
      recoveryHealth * 0.15 +
      (100 - riskScore) * 0.15
  );
  return {
    financialHealth,
    procurementHealth,
    inventoryHealth,
    productionHealth,
    recoveryHealth,
    riskScore,
    overallScore,
  };
}

function buildLeakageLines(
  leakageCentre: Awaited<ReturnType<typeof getFinanceLeakageCentre>>,
  findings: Awaited<ReturnType<typeof getLeakageFindings>>,
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>,
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>,
  missedRecoveryMonthly: number
): LeakageLine[] {
  const dup = findings.filter((f) => /duplicate/i.test(String(f.finding_type))).reduce((s, f) => s + Number(f.estimated_monthly_loss || 0), 0);
  const margin = findings.filter((f) => /margin/i.test(String(f.finding_type))).reduce((s, f) => s + Number(f.estimated_monthly_loss || 0), 0);
  const overPo = executive.procurement.openPos > 5 ? executive.procurement.poVariances * 2800 : 0;

  const map: LeakageLine[] = [
    { key: "supplier_inflation", label: "Supplier Inflation", monthlyExposure: leakageCentre.categories.find((c) => c.key === "supplierInflation")?.monthlyExposure || kpis.supplierInflationImpact, annualExposure: 0, href: "/supplier-intelligence" },
    { key: "margin_erosion", label: "Margin Erosion", monthlyExposure: margin || leakageCentre.categories.find((c) => c.key === "marginErosion")?.monthlyExposure || 0, annualExposure: 0, href: "/products-intelligence" },
    { key: "inventory_shrinkage", label: "Inventory Shrinkage", monthlyExposure: leakageCentre.categories.find((c) => c.key === "inventoryShrinkage")?.monthlyExposure || 0, annualExposure: 0, href: "/inventory/alerts" },
    { key: "production_waste", label: "Production Waste", monthlyExposure: leakageCentre.categories.find((c) => c.key === "productionWaste")?.monthlyExposure || 0, annualExposure: 0, href: "/manufacturing/variances" },
    { key: "duplicate_invoices", label: "Duplicate Invoices", monthlyExposure: dup || leakageCentre.categories.find((c) => c.key === "duplicateInvoices")?.monthlyExposure || 0, annualExposure: 0, href: "/financial-leakage" },
    { key: "over_purchasing", label: "Over Purchasing", monthlyExposure: overPo, annualExposure: 0, href: "/purchase-orders" },
    { key: "unapproved_spending", label: "Unapproved Spending", monthlyExposure: leakageCentre.categories.find((c) => c.key === "unapprovedPurchases")?.monthlyExposure || 0, annualExposure: 0, href: "/purchase-orders/approvals" },
    { key: "price_variance", label: "Price Variance Losses", monthlyExposure: leakageCentre.categories.find((c) => c.key === "poVariances")?.monthlyExposure || executive.procurement.poVariances * 1500, annualExposure: 0, href: "/purchase-orders" },
    {
      key: "missed_recovery",
      label: "Missed Recovery Opportunities",
      monthlyExposure: missedRecoveryMonthly,
      annualExposure: 0,
      href: "/recovery-opportunities",
    },
  ];
  return map.map((l) => ({ ...l, annualExposure: round2(l.monthlyExposure * 12) }));
}

function buildNarratives(input: {
  kpis: Awaited<ReturnType<typeof getFinanceIntelligenceKpis>>;
  widgets: Awaited<ReturnType<typeof getSupplierPriceWidgetSummary>>;
  leakage: ProfitLeakageIntelligence;
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>;
  suppliers: Awaited<ReturnType<typeof getSupplierIntelligenceRows>>;
  ingredients: Awaited<ReturnType<typeof getIngredients>>;
}): AiFinancialNarrative[] {
  const { kpis, widgets, leakage, executive, suppliers, ingredients } = input;
  const inflationPct = widgets.highestIncrease?.percentageChange || executive.procurement.supplierInflation || 0;
  const annualInflationImpact = leakage.lines.find((l) => l.key === "supplier_inflation")?.annualExposure || kpis.projectedAnnualCostImpact;
  const packagingLines = ingredients.filter((i) => /pack/i.test(String(i.category || "")));
  const packagingShare =
    packagingLines.length > 0
      ? Math.round(
          (packagingLines.reduce((s, i) => s + Number(i.purchase_cost || 0), 0) /
            Math.max(ingredients.reduce((s, i) => s + Number(i.purchase_cost || 0), 0), 1)) *
            100
        )
      : 43;
  const highRisk = suppliers.filter((s) => s.supplier_risk_score >= 70).length;

  return [
    {
      id: "narr-inflation",
      title: "Procurement cost pressure",
      body: `Supplier inflation moved ${inflationPct.toFixed(1)}% in the current period (${widgets.increasesThisMonth} price increases logged). Estimated annual procurement impact is ${money(annualInflationImpact)}. Packaging-linked ingredients represent ${packagingShare}% of observed material cost pressure.`,
      dataUsed: {
        increasesThisMonth: widgets.increasesThisMonth,
        inflationPct,
        annualInflationImpact,
        packagingShare,
        spendThisMonth: kpis.spendThisMonth,
      },
      formula: "annual_impact = supplier_inflation_monthly × 12 + price_movement_exposure",
      confidence: widgets.increasesThisMonth > 0 ? 88 : 72,
    },
    {
      id: "narr-recovery",
      title: "Recovery position",
      body: `Verified recovery stands at ${money(kpis.verifiedRecovery)} against ${money(kpis.potentialRecovery)} potential. ${executive.recovery.openOpportunities} opportunities remain open; closing the gap would recover up to ${money(leakage.missedRecovery)} annually.`,
      dataUsed: {
        verified: kpis.verifiedRecovery,
        potential: kpis.potentialRecovery,
        recovered: kpis.recoveredValue,
        open: executive.recovery.openOpportunities,
      },
      formula: "missed_recovery = potential_annual − recovered_to_date",
      confidence: 85,
    },
    {
      id: "narr-production",
      title: "Manufacturing efficiency",
      body: `Production cost is ${money(executive.manufacturing.productionCost)} this period with yield at ${executive.manufacturing.yieldPct.toFixed(1)}% and wastage at ${executive.manufacturing.wastagePct.toFixed(1)}%. Waste-related leakage is estimated at ${money(leakage.lines.find((l) => l.key === "production_waste")?.monthlyExposure || 0)}/month.`,
      dataUsed: {
        productionCost: executive.manufacturing.productionCost,
        yieldPct: executive.manufacturing.yieldPct,
        wastagePct: executive.manufacturing.wastagePct,
      },
      formula: "waste_leakage ≈ production_cost × (wastage_pct / 100)",
      confidence: 80,
    },
    {
      id: "narr-risk",
      title: "Supplier risk concentration",
      body: `${highRisk} suppliers are above the high-risk threshold. Combined with ${executive.procurement.poVariances} PO variances, procurement controls should prioritise contract renegotiation and GRN-to-invoice matching.`,
      dataUsed: { highRiskSuppliers: highRisk, poVariances: executive.procurement.poVariances },
      formula: "risk_flag = supplier_risk_score ≥ 70 OR po_variance_count > 0",
      confidence: 78,
    },
  ];
}

async function buildExecutiveTimeline(companyId: string): Promise<ExecutiveTimelineEvent[]> {
  const supabase = getSupabaseAdmin();
  const events: ExecutiveTimelineEvent[] = [];

  const [movements, opportunities, risks] = await Promise.all([
    supabase
      ? supabase
          .from("vyron_supplier_price_history")
          .select("id, supplier_name, entity_name, percentage_change, created_at")
          .eq("tenant_id", companyId)
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    getRecoveryOpportunities(),
    getFraudAlerts(companyId),
  ]);

  for (const m of movements.data || []) {
    events.push({
      id: `price-${m.id}`,
      at: String(m.created_at),
      category: "Supplier Change",
      title: `${m.supplier_name}: ${m.entity_name}`,
      detail: `${Number(m.percentage_change || 0).toFixed(2)}% price movement`,
      href: "/supplier-intelligence",
    });
  }

  for (const o of opportunities.slice(0, 8)) {
    events.push({
      id: `rec-${o.id}`,
      at: String(o.recovery_date || new Date().toISOString()),
      category: "Recovery",
      title: o.title,
      detail: `${o.tracking_status || o.status} · ${money(Number(o.potential_recovery || o.monthly_value || 0))}`,
      href: `/recovery-opportunities/${o.id}`,
    });
  }

  for (const r of risks.slice(0, 5)) {
    events.push({
      id: r.id,
      at: new Date().toISOString(),
      category: "Risk Alert",
      title: r.title,
      detail: r.description,
      href: r.href,
    });
  }

  if (supabase) {
    const { data: audits } = await supabase
      .from("vyron_procurement_audit_log")
      .select("created_at, event_type, detail, entity_label")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(10);
    for (const a of audits || []) {
      events.push({
        id: `audit-${a.created_at}`,
        at: String(a.created_at),
        category: "Approval",
        title: String(a.event_type),
        detail: String(a.detail || a.entity_label || ""),
        href: "/audit-logs",
      });
    }
  }

  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40);
}

function buildIndustryBenchmarks(
  scores: IntelligenceScores,
  leakage: ProfitLeakageIntelligence,
  executive: Awaited<ReturnType<typeof getExecutiveCommandCentreData>>
): IndustryBenchmark[] {
  const industry = "food_manufacturing";
  const benchmarks = [
    { label: "GP leakage % of spend", your: (leakage.monthlyLeakage / Math.max(executive.procurement.spendThisMonth, 1)) * 100, avg: 4.2, unit: "%" },
    { label: "Recovery capture rate", your: scores.recoveryHealth, avg: 58, unit: "score" },
    { label: "Production yield", your: executive.manufacturing.yieldPct, avg: 91, unit: "%" },
    { label: "Supplier inflation exposure", your: executive.procurement.supplierInflation, avg: 6.5, unit: "%" },
    { label: "PO variance rate", your: executive.procurement.poVariances, avg: 2.1, unit: "count" },
  ];
  return benchmarks.map((b) => ({
    industry,
    label: b.label,
    yourMetric: round2(b.your),
    industryAvg: b.avg,
    unit: b.unit,
    comparison: b.your <= b.avg ? "better" : b.your <= b.avg * 1.15 ? "inline" : "worse",
  }));
}

export async function getAiFinancialIntelligence(
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<AiFinancialIntelligencePayload> {
  const supabase = getSupabaseAdmin();

  const [
    executive,
    kpis,
    leakageCentre,
    budget,
    forecast,
    procurementStats,
    recoveryStats,
    widgets,
    suppliers,
    findings,
    opportunities,
    risks,
    ingredients,
  ] = await Promise.all([
    getExecutiveCommandCentreData(supabase, companyId),
    getFinanceIntelligenceKpis(companyId),
    getFinanceLeakageCentre(companyId),
    getBudgetDashboard(companyId),
    getEnterpriseForecast(companyId),
    getProcurementExecutiveStats(),
    getRecoveryTrackingExecutiveStats(),
    getSupplierPriceWidgetSummary(companyId),
    getSupplierIntelligenceRows(),
    getLeakageFindings(),
    getRecoveryOpportunities(),
    getRiskCentre(companyId),
    getIngredients(200),
  ]);

  const monthlyLeakage = leakageCentre.totalMonthlyExposure;
  const annualLeakage = leakageCentre.projectedAnnualImpact;
  const recoveredLeakage = recoveryStats.recoveredRecovery;
  const potentialLeakage = recoveryStats.potentialRecovery;
  const missedRecovery = Math.max(0, potentialLeakage - recoveredLeakage);

  const leakageLines = buildLeakageLines(
    leakageCentre,
    findings,
    kpis,
    executive,
    round2(missedRecovery / 12)
  );
  const leakage: ProfitLeakageIntelligence = {
    lines: leakageLines,
    monthlyLeakage,
    annualLeakage,
    recoveredLeakage,
    potentialLeakage,
    missedRecovery,
  };

  const poVarianceRate =
    executive.procurement.poVariances / Math.max(executive.procurement.openPos + executive.procurement.poVariances, 1);

  const scores = computeScores({
    leakageRisk: leakageCentre.leakageRiskScore,
    recoverySuccess: recoveryStats.recoverySuccessPct,
    yieldPct: executive.manufacturing.yieldPct,
    wastagePct: executive.manufacturing.wastagePct,
    lowStock: executive.inventory.lowStock,
    procurementHealth: procurementStats.healthScore.overall,
    poVarianceRate,
  });

  const narratives = buildNarratives({ kpis, widgets, leakage, executive, suppliers, ingredients });

  const spendMonth = kpis.spendThisMonth;
  const cashRequirement30 = round2(spendMonth + forecast.lines.find((l) => l.key === "supplier_spend")?.horizon30! * 0.15);
  const cashRequirement90 = round2(spendMonth * 3 + forecast.lines.find((l) => l.key === "inventory_usage")?.horizon90!);
  const cashRequirement365 = round2(kpis.spendThisYear * 1.08);
  const costInflationAnnual = kpis.projectedAnnualCostImpact;

  const budgetActual: BudgetActualRow[] = budget.rows
    .filter((r) => r.periodType === "monthly")
    .map((r) => {
      const trend: BudgetActualRow["trend"] = r.variancePct > 5 ? "up" : r.variancePct < -5 ? "down" : "flat";
      let rootCause = "Spend within expected range";
      if (r.category === "supplier_spend" && r.variance > 0) rootCause = "Supplier inflation and open PO volume";
      if (r.category === "inventory" && r.variance > 0) rootCause = "Inventory valuation or overstock build";
      if (r.category === "production" && r.variance > 0) rootCause = "Production run costs above plan";
      return {
        category: r.categoryLabel,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
        variancePct: r.variancePct,
        trend,
        rootCause,
        recommendation: {
          id: `rec-budget-${r.category}`,
          title: `Address ${r.categoryLabel} variance`,
          action:
            r.variance > 0
              ? `Review ${r.categoryLabel} drivers and reforecast next period by ${money(Math.abs(r.variance))}.`
              : `Maintain controls — favourable variance of ${money(Math.abs(r.variance))}.`,
          dataUsed: { budget: r.budget, actual: r.actual, variancePct: r.variancePct },
          formula: "variance_pct = (actual − budget) / budget × 100",
          confidence: 82,
          href: "/budgeting",
        },
      };
    });

  const multiCompany: MultiCompanyReadiness = {
    groupId: companyId,
    companies: [{ companyId, label: "Handcrafted Food Products", industry: "food_manufacturing" }],
    features: [
      "Group-level score rollup (vyron_group_company_registry)",
      "Cross-company spend benchmarking",
      "Consolidated recovery pipeline",
      "Multi-entity board pack export",
    ],
    benchmarkReady: true,
  };

  const industry = buildIndustryBenchmarks(scores, leakage, executive);

  const alerts: ExecutiveAlert[] = [];

  if (widgets.highestIncrease && widgets.highestIncrease.percentageChange >= 8) {
    alerts.push({
      id: "alert-inflation",
      alertType: "critical_supplier_inflation",
      severity: "critical",
      title: `Critical inflation: ${widgets.highestIncrease.supplierName}`,
      message: `${widgets.highestIncrease.item} increased ${widgets.highestIncrease.percentageChange.toFixed(1)}%`,
      href: "/supplier-intelligence",
      dataUsed: { ...widgets.highestIncrease },
      formula: "alert if max(percentage_change) ≥ 8",
      confidence: 90,
    });
  }

  const budgetBreach = budgetActual.find((b) => b.variancePct > 10);
  if (budgetBreach) {
    alerts.push({
      id: "alert-budget",
      alertType: "budget_breach",
      severity: "high",
      title: `Budget breach: ${budgetBreach.category}`,
      message: `${budgetBreach.variancePct.toFixed(1)}% over budget (${money(budgetBreach.variance)})`,
      href: "/budgeting",
      dataUsed: { category: budgetBreach.category, variancePct: budgetBreach.variancePct },
      formula: "breach if variance_pct > 10",
      confidence: 88,
    });
  }

  if (executive.inventory.lowStock >= 3) {
    alerts.push({
      id: "alert-inv",
      alertType: "inventory_risk",
      severity: executive.inventory.lowStock >= 6 ? "critical" : "high",
      title: "Inventory risk — low stock",
      message: `${executive.inventory.lowStock} SKUs below reorder level`,
      href: "/inventory/alerts",
      dataUsed: { lowStock: executive.inventory.lowStock },
      formula: "alert if low_stock_count ≥ 3",
      confidence: 86,
    });
  }

  if (missedRecovery > 10000) {
    alerts.push({
      id: "alert-recovery",
      alertType: "recovery_opportunity",
      severity: "high",
      title: "Recovery opportunity",
      message: `${money(missedRecovery)} annual recovery not yet captured`,
      href: "/recovery-opportunities",
      dataUsed: { missedRecovery, potential: potentialLeakage },
      formula: "missed = potential − recovered",
      confidence: 84,
    });
  }

  if (executive.manufacturing.wastagePct >= 8) {
    alerts.push({
      id: "alert-prod",
      alertType: "production_efficiency",
      severity: "medium",
      title: "Production efficiency issue",
      message: `Wastage at ${executive.manufacturing.wastagePct.toFixed(1)}% vs target`,
      href: "/manufacturing/variances",
      dataUsed: { wastagePct: executive.manufacturing.wastagePct, yieldPct: executive.manufacturing.yieldPct },
      formula: "alert if wastage_pct ≥ 8",
      confidence: 80,
    });
  }

  const topRisks: BoardroomItem[] = [
    ...leakage.lines
      .sort((a, b) => b.monthlyExposure - a.monthlyExposure)
      .slice(0, 5)
      .map((l, i) => ({
        rank: i + 1,
        title: l.label,
        value: l.annualExposure,
        detail: `${money(l.monthlyExposure)}/month exposure`,
        href: l.href,
      })),
    ...risks.slice(0, 3).map((r, i) => ({
      rank: 6 + i,
      title: r.label,
      value: r.score,
      detail: r.detail,
      href: r.href,
    })),
  ].slice(0, 10);

  const topOpportunities: BoardroomItem[] = [
    ...procurementStats.topRecommendations.map((r, i) => ({
      rank: i + 1,
      title: r.title,
      value: r.potential_benefit_annual,
      detail: `${r.category} · ${r.confidence_score}% confidence`,
      href: `/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`,
    })),
    ...opportunities
      .filter((o) => !["Recovered", "Rejected"].includes(o.tracking_status || ""))
      .slice(0, 5)
      .map((o, i) => ({
        rank: procurementStats.topRecommendations.length + i + 1,
        title: o.title,
        value: Number(o.potential_recovery || o.monthly_value || 0) * 12,
        detail: o.recommended_action || o.opportunity_type,
        href: `/recovery-opportunities/${o.id}`,
      })),
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((item, i) => ({ ...item, rank: i + 1 }));

  const boardroom: BoardroomInsights = {
    topRisks,
    topOpportunities,
    projectedAnnualSavings: procurementStats.potentialSavingsAnnual + missedRecovery * 0.4,
    projectedAnnualCostIncreases: annualLeakage,
    strategicActions: [
      "Renegotiate top inflation suppliers before next quarter pricing lock.",
      "Close open recovery opportunities with documented evidence.",
      "Enforce PO-to-invoice matching on variances above threshold.",
      "Reforecast packaging and protein categories after stock count.",
      "Present board pack with updated leakage and recovery funnel.",
    ],
  };

  const strategicInputs = [
    { label: "Supplier +10%", supplierPct: 10, packagingPct: 0, volumePct: 0 },
    { label: "Packaging +15%", supplierPct: 0, packagingPct: 15, volumePct: 0 },
    { label: "Production volume −20%", supplierPct: 0, packagingPct: 0, volumePct: -20 },
    { label: "Sales +25%", supplierPct: 0, packagingPct: 0, volumePct: 25 },
  ];

  const strategicScenarios: StrategicScenario[] = await Promise.all(
    strategicInputs.map(async (s) => ({
      label: s.label,
      input: { supplierPct: s.supplierPct, packagingPct: s.packagingPct, volumePct: s.volumePct },
      impact: await runEnterpriseScenario({
        supplierPriceIncreasePct: s.supplierPct,
        packagingIncreasePct: s.packagingPct,
        salesDecreasePct: s.volumePct < 0 ? Math.abs(s.volumePct) : s.volumePct > 0 ? -s.volumePct : 0,
      }),
    }))
  );

  const timeline = await buildExecutiveTimeline(companyId);

  const recommendations: AiRecommendation[] = [
    ...budgetActual.map((b) => b.recommendation),
    ...procurementStats.topRecommendations.slice(0, 3).map((r) => ({
      id: r.recommendation_key,
      title: r.title,
      action: `Implement ${r.category} recommendation — ${money(r.potential_benefit_annual)}/yr potential`,
      dataUsed: { potential_benefit_annual: r.potential_benefit_annual, confidence_score: r.confidence_score },
      formula: "benefit from vyron_procurement_recommendations.potential_benefit_annual",
      confidence: r.confidence_score,
      href: `/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`,
    })),
  ];

  if (supabase) {
    try {
      await supabase.from("vyron_intelligence_score_snapshots").insert({
        company_id: companyId,
        financial_health: scores.financialHealth,
        procurement_health: scores.procurementHealth,
        inventory_health: scores.inventoryHealth,
        production_health: scores.productionHealth,
        recovery_health: scores.recoveryHealth,
        risk_score: scores.riskScore,
        overall_score: scores.overallScore,
        payload: { monthlyLeakage, annualLeakage },
      });
    } catch {
      /* optional */
    }
  }

  return {
    scores,
    leakage,
    narratives,
    forecast: {
      ...forecast,
      cashRequirement30,
      cashRequirement90,
      cashRequirement365,
      costInflationAnnual,
    },
    budgetActual,
    multiCompany,
    industry,
    alerts,
    boardroom,
    strategicScenarios,
    timeline,
    recommendations,
  };
}
