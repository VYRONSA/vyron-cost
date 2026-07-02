import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getExecutiveCommandCentreData } from "@/lib/vyron-executive-command-centre";
import { getFinancialLeakageDashboard, getLeakageFindings } from "@/lib/vyron-leakage-intelligence-data";
import {
  getRecoveryAuditSummary,
  getRecoveryExecutiveSummary,
  getRecoveryOpportunities,
  getRecoveryTrackingExecutiveStats,
} from "@/lib/vyron-cost-recovery-data";
import { getProcurementExecutiveStats, getProcurementRecommendations } from "@/lib/vyron-procurement-ai-data";
import { getSupplierIntelligenceExecutiveSummary } from "@/lib/vyron-supplier-intelligence-centre";
import { getSupplierIntelligenceRows } from "@/lib/vyron-supplier-intelligence-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement";
import { getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { unstable_noStore as noStore } from "next/cache";

export type FinanceRiskLevel = "Low" | "Medium" | "High" | "Critical";

export type LeakageCategoryRow = {
  key: string;
  label: string;
  monthlyExposure: number;
  annualExposure: number;
  itemCount: number;
  riskLevel: FinanceRiskLevel;
  href: string;
};

export type FinanceIntelligenceKpis = {
  spendThisMonth: number;
  spendThisYear: number;
  inventoryValue: number;
  productionCost: number;
  potentialRecovery: number;
  verifiedRecovery: number;
  recoveredValue: number;
  supplierInflationImpact: number;
  projectedAnnualCostImpact: number;
};

export type FinanceLeakageCentre = {
  leakageRiskScore: number;
  riskLevel: FinanceRiskLevel;
  totalMonthlyExposure: number;
  projectedAnnualImpact: number;
  categories: LeakageCategoryRow[];
};

export type BoardPackMeta = {
  companyName: string;
  dateRangeLabel: string;
  generatedAt: string;
};

export type BoardPackData = {
  meta: BoardPackMeta;
  executiveSummary: FinanceIntelligenceKpis & { openRecoveryOpportunities: number; recoverySuccessPct: number };
  procurement: {
    spendThisMonth: number;
    spendThisYear: number;
    supplierInflation: number;
    poVariances: number;
    openPos: number;
    grnPartial: number;
    invoiceLinked: number;
    supplierSpendTop: Array<{ name: string; spend: number }>;
  };
  inventory: {
    inventoryValue: number;
    lowStock: number;
    slowMoving: number;
    overstock: number;
    inventoryVariance: number;
    stockCountsOpen: number;
  };
  manufacturing: {
    productionCost: number;
    yieldPct: number;
    wastagePct: number;
    finishedGoodsValue: number;
    productionVariances: number;
  };
  supplier: {
    topInflation: Array<{ name: string; pct: number; href: string }>;
    topRisk: Array<{ name: string; score: number; level: string; href: string }>;
    topSavings: Array<{ name: string; amount: number; href: string }>;
    benchmarkCount: number;
  };
  recovery: {
    potentialRecovery: number;
    verifiedRecovery: number;
    recoveredValue: number;
    openOpportunities: number;
    recoverySuccessPct: number;
    funnel: Array<{ status: string; count: number }>;
    topOpportunities: Array<{ title: string; value: number; status: string }>;
  };
  ai: {
    topRecommendations: Array<{ title: string; category: string; annual: number; confidence: number; href: string }>;
    highRiskAlerts: number;
    projectedSavings: number;
    projectedCostIncreases: number;
    recommendedActions: string[];
  };
  audit: {
    costChanges: number;
    approvals: number;
    overrides: number;
    poVariances: number;
    inventoryAdjustments: number;
    productionVariances: number;
    recentEvents: Array<{ when: string; type: string; detail: string }>;
  };
};

export type ExecutiveReportCategory = {
  id: string;
  title: string;
  description: string;
  href: string;
  exportFormats: Array<"pdf" | "excel" | "csv">;
};

const COMPANY_NAME = "Handcrafted Food Products";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function safeNum(v: unknown) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

export function financeRiskLevelFromScore(score: number): FinanceRiskLevel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

export function computeLeakageRiskScore(categories: Array<{ monthlyExposure: number; weight: number }>): number {
  const totalWeighted = categories.reduce((s, c) => s + c.monthlyExposure * c.weight, 0);
  const maxWeighted = categories.reduce((s, c) => s + 50000 * c.weight, 0) || 1;
  return Math.min(100, Math.round((totalWeighted / maxWeighted) * 100));
}

const CATEGORY_WEIGHTS: Record<string, number> = {
  supplierInflation: 1.2,
  duplicateInvoices: 1.4,
  poVariances: 1.0,
  invoiceVariances: 1.1,
  inventoryShrinkage: 0.9,
  productionWaste: 0.85,
  marginErosion: 1.15,
  unapprovedPurchases: 1.25,
};

export async function computeSpendTotals(supabase: SupabaseClient, companyId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  const yearStart = new Date(monthStart.getFullYear(), 0, 1);

  let spendMonth = 0;
  let spendYear = 0;

  const { data: pos } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("total, created_at, order_date, status")
    .eq("company_id", companyId)
    .neq("status", "Cancelled");

  for (const po of pos || []) {
    const total = safeNum(po.total);
    const raw = (po.order_date || po.created_at) as string;
    if (!raw) continue;
    const dt = new Date(raw);
    if (dt >= monthStart) spendMonth += total;
    if (dt >= yearStart) spendYear += total;
  }

  const { data: docs } = await supabase
    .from("vyron_documents")
    .select("total, invoice_date, created_at")
    .eq("tenant_id", companyId)
    .is("deleted_at", null)
    .not("status", "eq", "deleted");

  for (const doc of docs || []) {
    const total = safeNum(doc.total);
    const raw = (doc.invoice_date || doc.created_at) as string;
    if (!raw) continue;
    const dt = new Date(raw);
    if (dt >= monthStart) spendMonth += total;
    if (dt >= yearStart) spendYear += total;
  }

  return { spendThisMonth: round2(spendMonth), spendThisYear: round2(spendYear) };
}

export async function getFinanceLeakageCentre(companyId = VYRON_DEFAULT_TENANT_ID): Promise<FinanceLeakageCentre> {
  const [dashboard, findings, commandCentre, supabase] = await Promise.all([
    getFinancialLeakageDashboard(),
    getLeakageFindings(),
    getExecutiveCommandCentreData(getSupabaseAdmin(), companyId),
    Promise.resolve(getSupabaseAdmin()),
  ]);

  let poVarianceExposure = 0;
  let invoiceVarianceCount = 0;
  if (supabase) {
    const { data: pos } = await supabase
      .from("vyron_cost_purchase_orders")
      .select("variance")
      .eq("company_id", companyId);
    poVarianceExposure = (pos || []).reduce((s, p) => s + Math.abs(safeNum(p.variance)), 0);
    const { count } = await supabase
      .from("vyron_documents")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", companyId)
      .ilike("match_status", "%mismatch%");
    invoiceVarianceCount = count || 0;
  }

  const categories: LeakageCategoryRow[] = [
    {
      key: "supplierInflation",
      label: "Supplier Inflation",
      monthlyExposure: dashboard.supplierInflationExposure,
      annualExposure: dashboard.supplierInflationExposure * 12,
      itemCount: findings.filter((f) => /inflation/i.test(String(f.finding_type))).length,
      riskLevel: financeRiskLevelFromScore(Math.min(100, dashboard.supplierInflationExposure / 500)),
      href: "/supplier-intelligence",
    },
    {
      key: "duplicateInvoices",
      label: "Duplicate Invoices",
      monthlyExposure: dashboard.duplicateInvoiceRisk,
      annualExposure: dashboard.duplicateInvoiceRisk * 12,
      itemCount: findings.filter((f) => /duplicate/i.test(String(f.finding_type))).length,
      riskLevel: financeRiskLevelFromScore(Math.min(100, dashboard.duplicateInvoiceRisk / 400)),
      href: "/financial-leakage",
    },
    {
      key: "poVariances",
      label: "PO Variances",
      monthlyExposure: Math.max(poVarianceExposure, commandCentre.procurement.poVariances * 2500),
      annualExposure: Math.max(poVarianceExposure, commandCentre.procurement.poVariances * 2500) * 12,
      itemCount: commandCentre.procurement.poVariances,
      riskLevel: financeRiskLevelFromScore(commandCentre.procurement.poVariances * 12),
      href: "/purchase-orders",
    },
    {
      key: "invoiceVariances",
      label: "Invoice Variances",
      monthlyExposure: invoiceVarianceCount * 3200,
      annualExposure: invoiceVarianceCount * 3200 * 12,
      itemCount: invoiceVarianceCount,
      riskLevel: financeRiskLevelFromScore(invoiceVarianceCount * 15),
      href: "/document-intelligence",
    },
    {
      key: "inventoryShrinkage",
      label: "Inventory Shrinkage",
      monthlyExposure: commandCentre.inventory.slowMoving * 1800 + commandCentre.inventory.lowStock * 900,
      annualExposure: (commandCentre.inventory.slowMoving * 1800 + commandCentre.inventory.lowStock * 900) * 12,
      itemCount: commandCentre.inventory.lowStock + commandCentre.inventory.overstock,
      riskLevel: financeRiskLevelFromScore(commandCentre.inventory.lowStock * 8),
      href: "/inventory/alerts",
    },
    {
      key: "productionWaste",
      label: "Production Waste",
      monthlyExposure: commandCentre.manufacturing.productionCost * (commandCentre.manufacturing.wastagePct / 100),
      annualExposure: commandCentre.manufacturing.productionCost * (commandCentre.manufacturing.wastagePct / 100) * 12,
      itemCount: Math.round(commandCentre.manufacturing.wastagePct),
      riskLevel: financeRiskLevelFromScore(commandCentre.manufacturing.wastagePct * 6),
      href: "/manufacturing/variances",
    },
    {
      key: "marginErosion",
      label: "Margin Erosion",
      monthlyExposure: dashboard.categoryMarginErosion,
      annualExposure: dashboard.categoryMarginErosion * 12,
      itemCount: findings.filter((f) => /margin/i.test(String(f.finding_type))).length,
      riskLevel: financeRiskLevelFromScore(dashboard.categoryMarginErosion / 450),
      href: "/products-intelligence",
    },
    {
      key: "unapprovedPurchases",
      label: "Unapproved Purchases",
      monthlyExposure: dashboard.procurementAnomalies,
      annualExposure: dashboard.procurementAnomalies * 12,
      itemCount: dashboard.activeInvestigations,
      riskLevel: financeRiskLevelFromScore(dashboard.procurementAnomalies / 350),
      href: "/purchase-orders/approvals",
    },
  ];

  const scoreInput = categories.map((c) => ({
    monthlyExposure: c.monthlyExposure,
    weight: CATEGORY_WEIGHTS[c.key] || 1,
  }));
  const leakageRiskScore = computeLeakageRiskScore(scoreInput);
  const totalMonthlyExposure = categories.reduce((s, c) => s + c.monthlyExposure, 0);

  const supabaseAdmin = getSupabaseAdmin();
  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from("vyron_finance_leakage_snapshots").insert({
        company_id: companyId,
        leakage_risk_score: leakageRiskScore,
        risk_level: financeRiskLevelFromScore(leakageRiskScore),
        category_scores: Object.fromEntries(categories.map((c) => [c.key, c.monthlyExposure])),
        total_monthly_exposure: round2(totalMonthlyExposure),
        projected_annual_impact: round2(totalMonthlyExposure * 12),
      });
    } catch {
      /* migration 20 optional */
    }
  }

  return {
    leakageRiskScore,
    riskLevel: financeRiskLevelFromScore(leakageRiskScore),
    totalMonthlyExposure: round2(totalMonthlyExposure),
    projectedAnnualImpact: round2(totalMonthlyExposure * 12),
    categories,
  };
}

export async function getFinanceIntelligenceKpis(companyId = VYRON_DEFAULT_TENANT_ID): Promise<FinanceIntelligenceKpis> {
  noStore();
  const supabase = getSupabaseAdmin();
  const [leakage, recoveryStats, recoverySummary, spend, commandCentre, supplierWidgets] = await Promise.all([
    getFinanceLeakageCentre(companyId),
    getRecoveryTrackingExecutiveStats(),
    getRecoveryExecutiveSummary(),
    supabase ? computeSpendTotals(supabase, companyId) : Promise.resolve({ spendThisMonth: 0, spendThisYear: 0 }),
    getExecutiveCommandCentreData(supabase, companyId),
    getSupplierPriceWidgetSummary(companyId),
  ]);

  const inflationImpact =
    leakage.categories.find((c) => c.key === "supplierInflation")?.monthlyExposure ||
    commandCentre.procurement.supplierInflation * 1000;

  return {
    spendThisMonth: spend.spendThisMonth || commandCentre.procurement.spendThisMonth,
    spendThisYear: spend.spendThisYear,
    inventoryValue: commandCentre.inventory.inventoryValue,
    productionCost: commandCentre.manufacturing.productionCost,
    potentialRecovery: recoveryStats.potentialRecovery,
    verifiedRecovery: recoverySummary.verifiedRecovery,
    recoveredValue: recoveryStats.recoveredRecovery,
    supplierInflationImpact: round2(inflationImpact),
    projectedAnnualCostImpact: round2(
      leakage.projectedAnnualImpact +
        (supplierWidgets.highestIncrease?.percentageChange || 0) * spend.spendThisMonth * 0.01
    ),
  };
}

export async function buildBoardPackData(
  dateRangeLabel = "Current month to date",
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<BoardPackData> {
  const supabase = getSupabaseAdmin();
  const [
    kpis,
    leakage,
    commandCentre,
    recoveryStats,
    recoverySummary,
    opportunities,
    supplierIntel,
    supplierRows,
    procurementAi,
    procurementRecs,
    auditSummary,
  ] = await Promise.all([
    getFinanceIntelligenceKpis(companyId),
    getFinanceLeakageCentre(companyId),
    getExecutiveCommandCentreData(supabase, companyId),
    getRecoveryTrackingExecutiveStats(),
    getRecoveryExecutiveSummary(),
    getRecoveryOpportunities(),
    getSupplierIntelligenceExecutiveSummary(companyId),
    getSupplierIntelligenceRows(),
    getProcurementExecutiveStats(),
    getProcurementRecommendations(),
    getRecoveryAuditSummary(30),
  ]);

  let grnPartial = 0;
  let stockCountsOpen = 0;
  let auditEvents: BoardPackData["audit"]["recentEvents"] = [];
  let invLive = {
    totalInventoryValue: commandCentre.inventory.inventoryValue,
    lowStockItems: commandCentre.inventory.lowStock,
    overstockItems: commandCentre.inventory.overstock,
    slowMovingItems: commandCentre.inventory.slowMoving,
    inventoryVarianceValue: 0,
  };
  let mfgLive = {
    productionCost: commandCentre.manufacturing.productionCost,
    yieldPct: commandCentre.manufacturing.yieldPct,
    wastagePct: commandCentre.manufacturing.wastagePct,
    finishedGoodsValue: 0,
    productionVariances: 0,
  };

  if (supabase) {
    const [procStats, invStats, mfgStats, grns, counts, procAudit, invAudit, prodAudit] = await Promise.all([
      getProcurementDashboardStats(supabase, companyId),
      getInventoryDashboardStats(supabase, companyId),
      getManufacturingDashboardStats(supabase, companyId),
      supabase
        .from("vyron_cost_goods_receipts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("receipt_type", "partial"),
      supabase
        .from("vyron_cost_stock_counts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "Open"),
      supabase.from("vyron_procurement_audit_log").select("created_at, event_type, detail").eq("company_id", companyId).order("created_at", { ascending: false }).limit(15),
      supabase.from("vyron_inventory_audit_log").select("created_at, event_type, detail").eq("company_id", companyId).order("created_at", { ascending: false }).limit(15),
      supabase.from("vyron_cost_production_audit_log").select("created_at, event_type, detail").eq("company_id", companyId).order("created_at", { ascending: false }).limit(15),
    ]);
    grnPartial = grns.count || procStats.partiallyReceived;
    stockCountsOpen = counts.count || 0;
    invLive = invStats;
    mfgLive = mfgStats;

    for (const row of [...(procAudit.data || []), ...(invAudit.data || []), ...(prodAudit.data || [])]) {
      auditEvents.push({
        when: String(row.created_at),
        type: String(row.event_type),
        detail: String(row.detail || ""),
      });
    }
    auditEvents.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
    auditEvents = auditEvents.slice(0, 20);
  }

  const supplierSpendTop = supplierRows
    .sort((a, b) => b.current_spend - a.current_spend)
    .slice(0, 8)
    .map((r) => ({ name: r.supplier_name, spend: r.current_spend }));

  const openRecs = procurementRecs.filter((r) => !["Implemented", "Rejected"].includes(r.status));
  const projectedSavings = procurementAi.potentialSavingsAnnual;
  const projectedIncreases = leakage.categories.find((c) => c.key === "supplierInflation")?.annualExposure || 0;

  if (supabase) {
    try {
      await supabase.from("vyron_board_pack_audit").insert({
        company_id: companyId,
        format: "data-build",
        date_range_label: dateRangeLabel,
        generated_by: "system",
        detail: "Board pack data assembled",
      });
    } catch {
      /* optional */
    }
  }

  return {
    meta: {
      companyName: COMPANY_NAME,
      dateRangeLabel,
      generatedAt: new Date().toISOString(),
    },
    executiveSummary: {
      ...kpis,
      openRecoveryOpportunities: recoveryStats.openOpportunities,
      recoverySuccessPct: recoveryStats.recoverySuccessPct,
    },
    procurement: {
      spendThisMonth: kpis.spendThisMonth,
      spendThisYear: kpis.spendThisYear,
      supplierInflation: commandCentre.procurement.supplierInflation,
      poVariances: commandCentre.procurement.poVariances,
      openPos: commandCentre.procurement.openPos,
      grnPartial,
      invoiceLinked: opportunities.length,
      supplierSpendTop,
    },
    inventory: {
      inventoryValue: invLive.totalInventoryValue,
      lowStock: invLive.lowStockItems,
      slowMoving: invLive.slowMovingItems,
      overstock: invLive.overstockItems,
      inventoryVariance: invLive.inventoryVarianceValue || 0,
      stockCountsOpen,
    },
    manufacturing: {
      productionCost: mfgLive.productionCost,
      yieldPct: mfgLive.yieldPct,
      wastagePct: mfgLive.wastagePct,
      finishedGoodsValue: mfgLive.finishedGoodsValue || 0,
      productionVariances: mfgLive.productionVariances || 0,
    },
    supplier: {
      topInflation: supplierIntel.topInflationSuppliers.map((s) => ({
        name: s.supplierName,
        pct: s.inflationPct,
        href: s.href,
      })),
      topRisk: supplierIntel.topRiskSuppliers.map((s) => ({
        name: s.supplierName,
        score: s.riskScore,
        level: s.riskLevel,
        href: s.href,
      })),
      topSavings: supplierIntel.topSavingsOpportunities.map((s) => ({
        name: s.supplierName,
        amount: s.amount,
        href: s.href,
      })),
      benchmarkCount: supplierRows.filter((r) => r.negotiation_opportunity > 0).length,
    },
    recovery: {
      potentialRecovery: recoveryStats.potentialRecovery,
      verifiedRecovery: recoverySummary.verifiedRecovery,
      recoveredValue: recoveryStats.recoveredRecovery,
      openOpportunities: recoveryStats.openOpportunities,
      recoverySuccessPct: recoveryStats.recoverySuccessPct,
      funnel: recoveryStats.funnel,
      topOpportunities: opportunities.slice(0, 10).map((o) => ({
        title: o.title,
        value: Number(o.potential_recovery || o.monthly_value || 0),
        status: o.tracking_status || o.status || "New",
      })),
    },
    ai: {
      topRecommendations: procurementAi.topRecommendations.map((r) => ({
        title: r.title,
        category: r.category,
        annual: r.potential_benefit_annual,
        confidence: r.confidence_score,
        href: `/ai-procurement-manager/${encodeURIComponent(r.recommendation_key)}`,
      })),
      highRiskAlerts: commandCentre.ai.highRiskAlerts,
      projectedSavings,
      projectedCostIncreases: projectedIncreases,
      recommendedActions: openRecs.slice(0, 6).map((r) => r.recommended_action || r.title),
    },
    audit: {
      costChanges: auditSummary.filter((a) => /cost|price/i.test(a.field_name)).length,
      approvals: auditSummary.filter((a) => /status|approve/i.test(a.field_name)).length,
      overrides: auditSummary.filter((a) => /override/i.test(a.field_name)).length,
      poVariances: commandCentre.procurement.poVariances,
      inventoryAdjustments: auditEvents.filter((e) => /adjust|variance/i.test(e.type)).length,
      productionVariances: mfgLive.productionVariances || 0,
      recentEvents: auditEvents.length
        ? auditEvents
        : auditSummary.map((a) => ({
            when: a.changed_at,
            type: a.field_name,
            detail: `${a.opportunity_key}: ${a.old_value || "—"} → ${a.new_value || "—"}`,
          })),
    },
  };
}

export const executiveReportCategories: ExecutiveReportCategory[] = [
  { id: "procurement", title: "Procurement Reports", description: "PO performance, GRN matching, supplier spend.", href: "/purchase-orders", exportFormats: ["pdf", "excel", "csv"] },
  { id: "inventory", title: "Inventory Reports", description: "Stock valuation, variances, counts.", href: "/inventory", exportFormats: ["pdf", "excel", "csv"] },
  { id: "manufacturing", title: "Manufacturing Reports", description: "Yield, wastage, production variances.", href: "/manufacturing", exportFormats: ["pdf", "excel", "csv"] },
  { id: "supplier", title: "Supplier Reports", description: "Inflation, risk, benchmarks.", href: "/supplier-intelligence", exportFormats: ["pdf", "excel", "csv"] },
  { id: "recovery", title: "Recovery Reports", description: "Opportunities, funnel, recovered value.", href: "/recovery-opportunities", exportFormats: ["pdf", "excel", "csv"] },
  { id: "financial", title: "Financial Reports", description: "Finance KPIs and leakage exposure.", href: "/finance-intelligence", exportFormats: ["pdf", "excel", "csv"] },
  { id: "audit", title: "Audit Reports", description: "Approvals, overrides, cost changes.", href: "/audit-logs", exportFormats: ["pdf", "csv"] },
];
