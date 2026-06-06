import type { SupabaseClient } from "@supabase/supabase-js";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import { getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getManufacturingDashboardStats, generateProductionInsights } from "@/lib/vyron-manufacturing";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement";
import { getRecoveryTrackingExecutiveStats, getRecoveryOpportunities, getRecoveryExecutiveSummary } from "@/lib/vyron-cost-recovery-data";
import { getProcurementExecutiveStats, getProcurementRecommendations } from "@/lib/vyron-procurement-ai-data";
import { getSupplierPriceWidgetSummary } from "@/lib/vyron-supplier-intelligence-engine";
import { getSupplierIntelligenceExecutiveSummary } from "@/lib/vyron-supplier-intelligence-centre";
import { getFinancialLeakageDashboard } from "@/lib/vyron-leakage-intelligence-data";

export type TrendPoint = { label: string; value: number };

export type HeatmapCell = {
  area: string;
  metric: string;
  value: number;
  level: "low" | "medium" | "high" | "critical";
  href?: string;
};

export type AiFeedItem = {
  id: string;
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  message: string;
  href?: string;
};

export type ExecutiveCommandCentrePayload = {
  headline: {
    manufacturingToday: number;
    finishedGoodsProduced: number;
    salesToday: number;
    inventoryValue: number;
    recoveryOpportunities: number;
    supplierInflation: number;
  };
  procurement: {
    spendToday: number;
    spendThisMonth: number;
    poVariances: number;
    supplierInflation: number;
    openPos: number;
  };
  inventory: {
    inventoryValue: number;
    lowStock: number;
    overstock: number;
    slowMoving: number;
    negativeStockRisks: number;
  };
  manufacturing: {
    productionCost: number;
    yieldPct: number;
    wastagePct: number;
    productionToday: number;
    finishedGoodsProduced: number;
  };
  recovery: {
    potentialRecovery: number;
    verifiedRecovery: number;
    recoveredValue: number;
    openOpportunities: number;
  };
  ai: {
    openRecommendations: number;
    highRiskAlerts: number;
    opportunities: number;
  };
  procurementAi: {
    topRecommendations: Array<{
      recommendation_key: string;
      title: string;
      category: string;
      potential_benefit_annual: number;
      confidence_score: number;
    }>;
    potentialSavings: number;
    realizedSavings: number;
    healthScore: number;
    highRiskItems: number;
  };
  trends: {
    spendTrend: TrendPoint[];
    supplierInflationTrend: TrendPoint[];
    recoveryTrend: TrendPoint[];
    inventoryValueTrend: TrendPoint[];
    productionPerformanceTrend: TrendPoint[];
  };
  heatmap: HeatmapCell[];
  aiFeed: AiFeedItem[];
  supplierIntelligence: {
    topInflationSuppliers: Array<{ supplierId: string; supplierName: string; inflationPct: number; href: string }>;
    topRiskSuppliers: Array<{ supplierId: string; supplierName: string; riskScore: number; riskLevel: string; href: string }>;
    topSavingsOpportunities: Array<{ supplierId: string; supplierName: string; amount: number; href: string }>;
    scoreTrend: TrendPoint[];
  };
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastNDaysLabels(n: number) {
  const out: TrendPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      label: d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }),
      value: 0,
    });
  }
  return out;
}

function lastNWeeksLabels(n: number) {
  const out: TrendPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    out.push({
      label: `W${d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })}`,
      value: 0,
    });
  }
  return out;
}

function heatLevel(value: number, thresholds: [number, number, number]): HeatmapCell["level"] {
  if (value >= thresholds[2]) return "critical";
  if (value >= thresholds[1]) return "high";
  if (value >= thresholds[0]) return "medium";
  return "low";
}

async function buildSpendTrends(supabase: SupabaseClient, companyId: string) {
  const spendTrend = lastNDaysLabels(14);
  const dayStart = startOfDay();
  const monthStart = startOfMonth();

  const { data: pos } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("total, created_at, order_date, status")
    .eq("company_id", companyId)
    .neq("status", "Cancelled");

  let spendToday = 0;
  let spendThisMonth = 0;

  for (const po of pos || []) {
    const total = Number(po.total || 0);
    const raw = (po.order_date || po.created_at) as string;
    if (!raw) continue;
    const dt = new Date(raw);
    if (dt >= dayStart) spendToday += total;
    if (dt >= monthStart) spendThisMonth += total;

    const label = dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
    const idx = spendTrend.findIndex((p) => p.label === label);
    if (idx >= 0) spendTrend[idx].value = round2(spendTrend[idx].value + total);
  }

  const { data: docs } = await supabase
    .from("vyron_documents")
    .select("total, invoice_date, created_at, status")
    .eq("tenant_id", companyId)
    .in("status", ["Approved", "Posted"]);

  for (const doc of docs || []) {
    const total = Number(doc.total || 0);
    const raw = (doc.invoice_date || doc.created_at) as string;
    if (!raw) continue;
    const dt = new Date(raw);
    if (dt >= dayStart) spendToday += total;
    if (dt >= monthStart) spendThisMonth += total;
    const label = dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
    const idx = spendTrend.findIndex((p) => p.label === label);
    if (idx >= 0) spendTrend[idx].value = round2(spendTrend[idx].value + total);
  }

  return { spendToday: round2(spendToday), spendThisMonth: round2(spendThisMonth), spendTrend };
}

async function buildSupplierInflationTrend(supabase: SupabaseClient, tenantId: string) {
  const trend = lastNWeeksLabels(8);
  const since = new Date();
  since.setDate(since.getDate() - 56);

  const { data } = await supabase
    .from("vyron_supplier_price_history")
    .select("percentage_change, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", since.toISOString());

  for (const row of data || []) {
    const dt = new Date(row.created_at as string);
    const weekIdx = Math.min(7, Math.floor((Date.now() - dt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const idx = 7 - weekIdx;
    if (idx >= 0 && idx < trend.length) {
      trend[idx].value = round2(trend[idx].value + Math.abs(Number(row.percentage_change || 0)));
    }
  }
  return trend;
}

async function buildRecoveryTrend(supabase: SupabaseClient | null) {
  const trend = lastNWeeksLabels(8);
  const opportunities = await getRecoveryOpportunities();
  for (const opp of opportunities) {
    if ((opp.tracking_status || opp.status) !== "Recovered") continue;
    const raw = opp.recovery_date;
    if (!raw) continue;
    const dt = new Date(raw);
    const weekIdx = Math.min(7, Math.floor((Date.now() - dt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const idx = 7 - weekIdx;
    if (idx >= 0 && idx < trend.length) {
      trend[idx].value = round2(trend[idx].value + Number(opp.actual_recovery || opp.recovered_to_date || 0));
    }
  }
  return trend;
}

async function buildInventoryValueTrend(supabase: SupabaseClient, companyId: string) {
  const trend = lastNWeeksLabels(8);
  const { data: ledger } = await supabase
    .from("vyron_cost_stock_ledger")
    .select("movement_date, value, quantity_in, quantity_out")
    .eq("company_id", companyId)
    .gte("movement_date", new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString())
    .order("movement_date", { ascending: true });

  for (const row of ledger || []) {
    const dt = new Date(row.movement_date as string);
    const weekIdx = Math.min(7, Math.floor((Date.now() - dt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const idx = 7 - weekIdx;
    if (idx >= 0 && idx < trend.length) {
      const delta = Number(row.quantity_in || 0) > 0 ? Math.abs(Number(row.value || 0)) : -Math.abs(Number(row.value || 0));
      trend[idx].value = round2(Math.max(0, trend[idx].value + delta));
    }
  }

  const dash = await getInventoryDashboardStats(supabase, companyId);
  if (trend.every((t) => t.value === 0) && dash.totalInventoryValue > 0) {
    for (let i = 0; i < trend.length; i++) {
      trend[i].value = round2(dash.totalInventoryValue * (0.85 + (i / trend.length) * 0.15));
    }
  } else {
    let running = dash.totalInventoryValue;
    for (let i = trend.length - 1; i >= 0; i--) {
      if (trend[i].value === 0) trend[i].value = running;
      else running = trend[i].value;
    }
  }
  return trend;
}

async function buildProductionTrend(supabase: SupabaseClient, companyId: string) {
  const trend = lastNWeeksLabels(8);
  const since = new Date();
  since.setDate(since.getDate() - 56);

  const { data: runs } = await supabase
    .from("vyron_cost_production_runs")
    .select("actual_cost, yield_pct, completed_at")
    .eq("company_id", companyId)
    .eq("status", "Completed")
    .gte("completed_at", since.toISOString());

  for (const run of runs || []) {
    if (!run.completed_at) continue;
    const dt = new Date(run.completed_at as string);
    const weekIdx = Math.min(7, Math.floor((Date.now() - dt.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    const idx = 7 - weekIdx;
    if (idx >= 0 && idx < trend.length) {
      trend[idx].value = round2(trend[idx].value + Number(run.yield_pct || 0));
    }
  }

  const mfg = await getManufacturingDashboardStats(supabase, companyId);
  if (trend.every((t) => t.value === 0) && mfg.yieldPct > 0) {
    trend.forEach((p) => {
      p.value = mfg.yieldPct;
    });
  }
  return trend;
}

export async function getExecutiveCommandCentreData(
  supabase: SupabaseClient | null,
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<ExecutiveCommandCentrePayload> {
  const [recoveryStats, recoverySummary, procurementStats, procurementRecs, supplierWidgets, leakage, opportunities, supplierIntel] =
    await Promise.all([
      getRecoveryTrackingExecutiveStats(),
      getRecoveryExecutiveSummary(),
      getProcurementExecutiveStats(),
      getProcurementRecommendations(),
      getSupplierPriceWidgetSummary(companyId),
      getFinancialLeakageDashboard(),
      getRecoveryOpportunities(),
      getSupplierIntelligenceExecutiveSummary(companyId),
    ]);

  let procurementLive = { spendToday: 0, spendThisMonth: 0, poVariances: 0, openPos: 0 };
  let inventoryLive = { inventoryValue: 0, lowStock: 0, overstock: 0, slowMoving: 0, negativeStockRisks: 0 };
  let manufacturingLive = { productionCost: 0, yieldPct: 0, wastagePct: 0, productionToday: 0, finishedGoodsProduced: 0 };
  let salesToday = 0;
  let spendTrend = lastNDaysLabels(14);
  let supplierInflationTrend = lastNWeeksLabels(8);
  let inventoryValueTrend = lastNWeeksLabels(8);
  let productionPerformanceTrend = lastNWeeksLabels(8);
  const productionInsights = supabase ? await generateProductionInsights(supabase, companyId).catch(() => []) : [];

  if (supabase) {
    const [procStats, invStats, mfgStats, spend, inflTrend, invTrend, prodTrend] = await Promise.all([
      getProcurementDashboardStats(supabase, companyId),
      getInventoryDashboardStats(supabase, companyId),
      getManufacturingDashboardStats(supabase, companyId),
      buildSpendTrends(supabase, companyId),
      buildSupplierInflationTrend(supabase, companyId),
      buildInventoryValueTrend(supabase, companyId),
      buildProductionTrend(supabase, companyId),
    ]);
    procurementLive = {
      spendToday: spend.spendToday,
      spendThisMonth: spend.spendThisMonth,
      poVariances: procStats.poVariances,
      openPos: procStats.openPos,
    };
    spendTrend = spend.spendTrend;
    inventoryLive = {
      inventoryValue: invStats.totalInventoryValue,
      lowStock: invStats.lowStockItems,
      overstock: invStats.overstockItems,
      slowMoving: invStats.slowMovingItems,
      negativeStockRisks: invStats.negativeStockRisks,
    };
    manufacturingLive = {
      productionCost: mfgStats.productionCost,
      yieldPct: mfgStats.yieldPct,
      wastagePct: mfgStats.wastagePct,
      productionToday: mfgStats.productionToday,
      finishedGoodsProduced: mfgStats.finishedGoodsProduced,
    };

    const todayIso = startOfDay().toISOString().slice(0, 10);
    const { data: todayInvoices } = await supabase
      .from("vyron_customer_invoices")
      .select("sales_value, invoice_date, status, stock_posted")
      .eq("company_id", companyId)
      .gte("invoice_date", todayIso);
    salesToday = round2(
      (todayInvoices || [])
        .filter((inv) => inv.stock_posted || ["Posted", "Sent", "Paid"].includes(String(inv.status)))
        .reduce((sum, inv) => sum + Number(inv.sales_value || 0), 0)
    );
    supplierInflationTrend = inflTrend;
    inventoryValueTrend = invTrend;
    productionPerformanceTrend = prodTrend;
  }

  const supplierInflation =
    supplierWidgets.highestIncrease?.percentageChange ||
    round2(leakage.supplierInflationExposure / Math.max(1, leakage.estimatedMonthlyLeakage) * 10) ||
    supplierWidgets.increasesThisMonth;

  const highRiskRecovery = opportunities.filter(
    (o) =>
      !["Recovered", "Rejected", "Ignored"].includes(o.tracking_status || o.status || "New") &&
      (Number(o.confidence || 0) < 65 || Number(o.monthly_value || 0) >= 5000)
  ).length;

  const highRiskProcurement = procurementRecs.filter(
    (r) =>
      !["Implemented", "Rejected"].includes(r.status) &&
      (r.confidence_level === "Low" || Number(r.confidence_score || 0) < 65)
  ).length;

  const aiFeed: AiFeedItem[] = [];

  for (const insight of productionInsights.slice(0, 4)) {
    aiFeed.push({
      id: `prod-${insight.category}-${aiFeed.length}`,
      severity: insight.severity,
      category: insight.category,
      title: insight.category,
      message: insight.message,
      href: insight.href,
    });
  }

  for (const rec of procurementRecs.filter((r) => !["Implemented", "Rejected"].includes(r.status)).slice(0, 4)) {
    aiFeed.push({
      id: `proc-${rec.recommendation_key}`,
      severity: rec.confidence_level === "Low" || Number(rec.confidence_score || 0) < 65 ? "high" : "medium",
      category: "Procurement",
      title: rec.title,
      message: rec.recommended_action || rec.why_exists || rec.title,
      href: `/ai-procurement-manager/${rec.recommendation_key}`,
    });
  }

  for (const opp of opportunities
    .filter((o) => !["Recovered", "Rejected", "Ignored"].includes(o.tracking_status || o.status || "New"))
    .slice(0, 4)) {
    aiFeed.push({
      id: `rec-${opp.id}`,
      severity: Number(opp.confidence || 0) < 65 ? "high" : "medium",
      category: "Recovery",
      title: opp.title,
      message: opp.recommended_action || opp.description || opp.title,
      href: `/recovery-opportunities/${opp.id}`,
    });
  }

  if (inventoryLive.lowStock > 0) {
    aiFeed.push({
      id: "inv-low-stock",
      severity: inventoryLive.lowStock >= 5 ? "high" : "medium",
      category: "Inventory",
      title: "Low stock alert",
      message: `${inventoryLive.lowStock} SKU(s) below reorder level.`,
      href: "/inventory/alerts",
    });
  }

  const heatmap: HeatmapCell[] = [
    {
      area: "Procurement",
      metric: "PO variances",
      value: procurementLive.poVariances,
      level: heatLevel(procurementLive.poVariances, [1, 3, 6]),
      href: "/purchase-orders",
    },
    {
      area: "Procurement",
      metric: "Supplier inflation",
      value: supplierInflation,
      level: heatLevel(supplierInflation, [3, 8, 15]),
      href: "/document-intelligence/price-history/supplier",
    },
    {
      area: "Inventory",
      metric: "Low stock",
      value: inventoryLive.lowStock,
      level: heatLevel(inventoryLive.lowStock, [2, 5, 10]),
      href: "/inventory/alerts",
    },
    {
      area: "Inventory",
      metric: "Overstock",
      value: inventoryLive.overstock,
      level: heatLevel(inventoryLive.overstock, [1, 3, 8]),
      href: "/inventory/stock?status=Overstock",
    },
    {
      area: "Manufacturing",
      metric: "Wastage %",
      value: manufacturingLive.wastagePct,
      level: heatLevel(manufacturingLive.wastagePct, [5, 8, 12]),
      href: "/manufacturing/variances",
    },
    {
      area: "Manufacturing",
      metric: "Yield %",
      value: 100 - manufacturingLive.yieldPct,
      level: heatLevel(100 - manufacturingLive.yieldPct, [5, 10, 20]),
      href: "/manufacturing",
    },
    {
      area: "Recovery",
      metric: "Open opportunities",
      value: recoveryStats.openOpportunities,
      level: heatLevel(recoveryStats.openOpportunities, [3, 8, 15]),
      href: "/financial-leakage",
    },
    {
      area: "Recovery",
      metric: "Unrealized potential",
      value: round2(recoveryStats.potentialRecovery - recoveryStats.recoveredRecovery),
      level: heatLevel(recoveryStats.potentialRecovery - recoveryStats.recoveredRecovery, [50000, 150000, 300000]),
      href: "/recovery-opportunities",
    },
  ];

  const recoveryTrend = await buildRecoveryTrend(supabase);

  return {
    headline: {
      manufacturingToday: manufacturingLive.productionToday,
      finishedGoodsProduced: manufacturingLive.finishedGoodsProduced,
      salesToday,
      inventoryValue: inventoryLive.inventoryValue,
      recoveryOpportunities: recoveryStats.openOpportunities,
      supplierInflation: round2(supplierInflation),
    },
    procurement: {
      spendToday: procurementLive.spendToday,
      spendThisMonth: procurementLive.spendThisMonth,
      poVariances: procurementLive.poVariances,
      supplierInflation: round2(supplierInflation),
      openPos: procurementLive.openPos,
    },
    inventory: inventoryLive,
    manufacturing: manufacturingLive,
    recovery: {
      potentialRecovery: recoveryStats.potentialRecovery,
      verifiedRecovery: recoverySummary.verifiedRecovery,
      recoveredValue: recoveryStats.recoveredRecovery,
      openOpportunities: recoveryStats.openOpportunities,
    },
    ai: {
      openRecommendations: procurementStats.openRecommendations,
      highRiskAlerts: highRiskRecovery + highRiskProcurement + supplierWidgets.increasesThisMonth,
      opportunities: opportunities.filter((o) => !["Recovered", "Rejected", "Ignored"].includes(o.tracking_status || o.status || "New")).length,
    },
    procurementAi: {
      topRecommendations: procurementStats.topRecommendations,
      potentialSavings: procurementStats.potentialSavingsAnnual,
      realizedSavings: procurementStats.realizedSavingsAnnual,
      healthScore: procurementStats.healthScore.overall,
      highRiskItems: procurementStats.highRiskItems,
    },
    trends: {
      spendTrend,
      supplierInflationTrend,
      recoveryTrend,
      inventoryValueTrend,
      productionPerformanceTrend,
    },
    heatmap,
    aiFeed: aiFeed.slice(0, 12),
    supplierIntelligence: supplierIntel,
  };
}
