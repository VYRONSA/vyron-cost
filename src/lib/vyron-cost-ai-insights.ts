import type { SupabaseClient } from "@supabase/supabase-js";
import { computeProductDemandForecasts, computeProcurementDemandForecast } from "@/lib/vyron-demand-forecasting";
import { getPurchaseOrderEngineDashboardStats } from "@/lib/vyron-purchase-order-engine";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement-requisitions";
import { getProductionPlanningStats } from "@/lib/vyron-store-production-planning";
import { computeProductIntelligenceFromTenant } from "@/lib/vyron-tenant-intelligence";

export const INSIGHT_TYPES = [
  "Demand Increase",
  "Demand Decline",
  "Margin Risk",
  "Supplier Risk",
  "Stock Risk",
  "Procurement Opportunity",
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number];

export const INSIGHT_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
export type InsightPriority = (typeof INSIGHT_PRIORITIES)[number];

export type CostAiInsight = {
  insight_key: string;
  insight_type: InsightType;
  category: string;
  priority: InsightPriority;
  title: string;
  problem: string;
  impact: string;
  recommendation: string;
  href: string;
  entity_type?: string;
  entity_id?: string;
  entity_label?: string;
  data_used: Record<string, unknown>;
};

export type CostAiInsightDashboard = {
  topRisks: CostAiInsight[];
  topOpportunities: CostAiInsight[];
  marginWatchlist: CostAiInsight[];
  supplierWatchlist: CostAiInsight[];
  demandWatchlist: CostAiInsight[];
  allInsights: CostAiInsight[];
  stats: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalInsights: number;
  };
};

const PRIORITY_RANK: Record<InsightPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

const RISK_TYPES = new Set<InsightType>([
  "Demand Decline",
  "Margin Risk",
  "Supplier Risk",
  "Stock Risk",
]);

const OPPORTUNITY_TYPES = new Set<InsightType>(["Demand Increase", "Procurement Opportunity"]);

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function pct(value: number) {
  return `${Math.abs(round2(value))}%`;
}

function sortInsights(rows: CostAiInsight[]) {
  return [...rows].sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.title.localeCompare(b.title);
  });
}

function demandChangePct(demand30: number, demand90: number) {
  const weeklyRecent = demand30 / (30 / 7);
  const weeklyBaseline = demand90 / (90 / 7);
  if (weeklyBaseline <= 0) return weeklyRecent > 0 ? 100 : 0;
  return round2(((weeklyRecent - weeklyBaseline) / weeklyBaseline) * 100);
}

function priorityFromDemandChange(changePct: number, trend: string): InsightPriority {
  const abs = Math.abs(changePct);
  if (trend === "Declining" && abs >= 20) return "Critical";
  if (trend === "Growing" && abs >= 25) return "High";
  if (abs >= 15) return "High";
  if (abs >= 8) return "Medium";
  return "Low";
}

function priorityFromGpGap(gpGap: number): InsightPriority {
  if (gpGap <= -10) return "Critical";
  if (gpGap <= -5) return "High";
  if (gpGap < 0) return "Medium";
  return "Low";
}

function priorityFromStockDays(days: number): InsightPriority {
  if (days <= 5) return "Critical";
  if (days <= 8) return "High";
  if (days <= 14) return "Medium";
  return "Low";
}

function buildDemandInsights(forecasts: Awaited<ReturnType<typeof computeProductDemandForecasts>>): CostAiInsight[] {
  const insights: CostAiInsight[] = [];

  for (const row of forecasts) {
    const change = demandChangePct(row.demand_30d, row.demand_90d);
    if (row.trend === "Growing" && change >= 5) {
      insights.push({
        insight_key: `demand-increase-${row.product_id}`,
        insight_type: "Demand Increase",
        category: "Demand",
        priority: priorityFromDemandChange(change, "Growing"),
        title: `${row.product_name} demand is growing`,
        problem: `${row.product_name} demand increased ${pct(change)} over the last 30 days versus the 90-day baseline.`,
        impact: `Forecast production of ${row.forecast_next_month} units next month may strain capacity and stock.`,
        recommendation: "Review production planning and finished goods cover for the next 2–4 weeks.",
        href: "/demand-forecast",
        entity_type: "product",
        entity_id: row.product_id,
        entity_label: row.product_name,
        data_used: {
          demand_30d: row.demand_30d,
          demand_90d: row.demand_90d,
          change_pct: change,
          forecast_next_month: row.forecast_next_month,
          trend: row.trend,
        },
      });
    }

    if (row.trend === "Declining" && change <= -5) {
      insights.push({
        insight_key: `demand-decline-${row.product_id}`,
        insight_type: "Demand Decline",
        category: "Demand",
        priority: priorityFromDemandChange(change, "Declining"),
        title: `${row.product_name} demand is declining`,
        problem: `${row.product_name} demand decreased ${pct(change)} versus the 90-day baseline.`,
        impact: "Excess production or write-offs may increase if ordering patterns continue.",
        recommendation: "Reduce production batches and review store allocation before the next planning cycle.",
        href: "/demand-forecast",
        entity_type: "product",
        entity_id: row.product_id,
        entity_label: row.product_name,
        data_used: {
          demand_30d: row.demand_30d,
          demand_90d: row.demand_90d,
          change_pct: change,
          forecast_next_month: row.forecast_next_month,
          trend: row.trend,
        },
      });
    }
  }

  return insights;
}

function buildMarginInsights(
  products: Awaited<ReturnType<typeof computeProductIntelligenceFromTenant>>
): CostAiInsight[] {
  const insights: CostAiInsight[] = [];

  for (const row of products) {
    const gpGap = Number(row.gp_gap || 0);
    const actualGp = Number(row.actual_gp || 0);
    const targetGp = Number(row.target_gp || 0);
    if (gpGap >= 0 || !Number(row.selling_price) || !Number(row.total_cost)) continue;

    const impliedPriorGp = round2(targetGp);
    insights.push({
      insight_key: `margin-risk-${row.product_id}`,
      insight_type: "Margin Risk",
      category: "Margin",
      priority: priorityFromGpGap(gpGap),
      title: `Margin pressure on ${row.product_name}`,
      problem: `Gross margin on ${row.product_name} is ${pct(actualGp)} against a ${pct(targetGp)} target (${pct(gpGap)} variance).`,
      impact: `Estimated monthly margin exposure of R${Number(row.monthly_risk_value || 0).toLocaleString("en-ZA")} if not corrected.`,
      recommendation:
        gpGap <= -5
          ? "Reprice or renegotiate ingredient costs within 7 days."
          : "Review BOM cost build-up and selling price discipline this week.",
      href: row.product_id ? `/products/${row.product_id}` : "/products",
      entity_type: "product",
      entity_id: row.product_id || undefined,
      entity_label: row.product_name || undefined,
      data_used: {
        actual_gp: actualGp,
        target_gp: targetGp,
        gp_gap: gpGap,
        implied_prior_gp: impliedPriorGp,
        selling_price: row.selling_price,
        total_cost: row.total_cost,
        monthly_risk_value: row.monthly_risk_value,
      },
    });
  }

  return insights;
}

async function buildSupplierInsights(supabase: SupabaseClient, companyId: string): Promise<CostAiInsight[]> {
  const { data: suppliers } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, supplier_name, lead_time_days, last_price_movement, risk_status")
    .eq("company_id", companyId);

  const { data: orders } = await supabase
    .from("vyron_cost_purchase_orders")
    .select("supplier_id, order_date, expected_date, status, created_at")
    .eq("company_id", companyId);

  const insights: CostAiInsight[] = [];
  const deliveryDaysBySupplier = new Map<string, number[]>();

  for (const order of orders || []) {
    if (!order.supplier_id || !order.order_date) continue;
    const received = ["Fully Received", "Partially Received", "Received", "Closed"].includes(
      String(order.status)
    );
    if (!received) continue;
    const start = new Date(String(order.order_date)).getTime();
    const end = new Date(String(order.created_at)).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const days = Math.max(1, Math.round((end - start) / 86400000));
    const bucket = deliveryDaysBySupplier.get(String(order.supplier_id)) || [];
    bucket.push(days);
    deliveryDaysBySupplier.set(String(order.supplier_id), bucket);
  }

  for (const supplier of suppliers || []) {
    const supplierId = String(supplier.id);
    const supplierName = String(supplier.supplier_name);
    const masterLead = Number(supplier.lead_time_days || 0);
    const deliveries = deliveryDaysBySupplier.get(supplierId) || [];
    const avgDelivery = deliveries.length
      ? round2(deliveries.reduce((sum, value) => sum + value, 0) / deliveries.length)
      : masterLead;
    const movement = Math.abs(Number(supplier.last_price_movement || 0));
    const baselineLead = masterLead > 0 ? masterLead : avgDelivery || 3;
    const effectiveLead = avgDelivery > 0 ? avgDelivery : baselineLead;

    if (effectiveLead > baselineLead * 1.4 && deliveries.length >= 2) {
      insights.push({
        insight_key: `supplier-leadtime-${supplierId}`,
        insight_type: "Supplier Risk",
        category: "Supplier",
        priority: effectiveLead >= baselineLead * 2 ? "Critical" : "High",
        title: `${supplierName} lead time has increased`,
        problem: `${supplierName} lead time increased from ${baselineLead} to ${effectiveLead} days based on recent purchase orders.`,
        impact: "Procurement and production schedules may slip if replenishment is not brought forward.",
        recommendation: "Confirm delivery commitments with the supplier and adjust safety stock or alternate sourcing.",
        href: `/suppliers/${supplierId}`,
        entity_type: "supplier",
        entity_id: supplierId,
        entity_label: supplierName,
        data_used: {
          master_lead_time_days: baselineLead,
          actual_lead_time_days: effectiveLead,
          order_count: deliveries.length,
        },
      });
    } else if (masterLead > 14) {
      insights.push({
        insight_key: `supplier-long-lead-${supplierId}`,
        insight_type: "Supplier Risk",
        category: "Supplier",
        priority: masterLead > 21 ? "High" : "Medium",
        title: `${supplierName} has extended lead time`,
        problem: `${supplierName} is configured with a ${masterLead}-day lead time.`,
        impact: "Late replenishment can delay production and store fulfilment.",
        recommendation: "Place procurement orders earlier or qualify a backup supplier.",
        href: `/suppliers/${supplierId}`,
        entity_type: "supplier",
        entity_id: supplierId,
        entity_label: supplierName,
        data_used: { lead_time_days: masterLead },
      });
    }

    if (movement >= 8) {
      insights.push({
        insight_key: `supplier-price-${supplierId}`,
        insight_type: "Supplier Risk",
        category: "Supplier",
        priority: movement >= 15 ? "High" : "Medium",
        title: `${supplierName} price movement detected`,
        problem: `${supplierName} shows ${pct(movement)} recorded price movement.`,
        impact: "Ingredient and finished product margins may erode on the next procurement cycle.",
        recommendation: "Review latest invoices, renegotiate pricing, or switch volume to an alternate supplier.",
        href: "/document-intelligence/price-history/supplier",
        entity_type: "supplier",
        entity_id: supplierId,
        entity_label: supplierName,
        data_used: { price_movement_pct: movement, risk_status: supplier.risk_status },
      });
    }
  }

  return insights;
}

async function buildStockInsights(
  supabase: SupabaseClient,
  companyId: string,
  forecasts: Awaited<ReturnType<typeof computeProductDemandForecasts>>,
  procurementForecast: Awaited<ReturnType<typeof computeProcurementDemandForecast>>
): Promise<CostAiInsight[]> {
  const insights: CostAiInsight[] = [];

  const [{ data: fgStock }, { data: rmStock }, { data: ingredients }] = await Promise.all([
    supabase
      .from("vyron_cost_stock_items")
      .select("entity_id, description, qty_on_hand, reorder_level, unit")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods"),
    supabase
      .from("vyron_cost_stock_items")
      .select("entity_id, description, qty_on_hand, reorder_level, unit")
      .eq("company_id", companyId)
      .eq("entity_type", "raw_material"),
    supabase
      .from("vyron_cost_ingredients")
      .select("id, ingredient_name")
      .eq("company_id", companyId),
  ]);

  const ingredientNames = new Map(
    (ingredients || []).map((row) => [String(row.id), String(row.ingredient_name)])
  );

  const forecastByProduct = new Map(forecasts.map((row) => [row.product_id, row]));
  for (const item of fgStock || []) {
    const productId = String(item.entity_id || "");
    const forecast = forecastByProduct.get(productId);
    if (!forecast || forecast.forecast_next_month <= 0) continue;
    const dailyDemand = forecast.forecast_next_month / 30;
    const onHand = Number(item.qty_on_hand || 0);
    if (dailyDemand <= 0) continue;
    const daysLeft = round2(onHand / dailyDemand);
    if (daysLeft > 14) continue;

    insights.push({
      insight_key: `stock-fg-${productId}`,
      insight_type: "Stock Risk",
      category: "Inventory",
      priority: priorityFromStockDays(daysLeft),
      title: `${forecast.product_name} stock cover is low`,
      problem: `${forecast.product_name} will run out in approximately ${daysLeft} days at current demand.`,
      impact: "Store orders may go unfulfilled if production does not catch up.",
      recommendation: "Release a production run and verify dispatch capacity within 48 hours.",
      href: "/inventory/stock",
      entity_type: "product",
      entity_id: productId,
      entity_label: forecast.product_name,
      data_used: {
        qty_on_hand: onHand,
        daily_demand: round4(dailyDemand),
        days_remaining: daysLeft,
        forecast_next_month: forecast.forecast_next_month,
      },
    });
  }

  const ingredientDemand = new Map(
    procurementForecast.ingredients.map((row) => [row.ingredient_id || row.ingredient_name, row])
  );

  for (const item of rmStock || []) {
    const ingredientId = item.entity_id ? String(item.entity_id) : "";
    const ingredientName =
      ingredientNames.get(ingredientId) || String(item.description || "Ingredient");
    const requirement =
      ingredientDemand.get(ingredientId) || ingredientDemand.get(ingredientName);
    if (!requirement || requirement.required_qty <= 0) continue;

    const onHand = Number(item.qty_on_hand || 0);
    const monthlyNeed = requirement.required_qty;
    const dailyNeed = monthlyNeed / 30;
    if (dailyNeed <= 0) continue;
    const daysLeft = round2(onHand / dailyNeed);
    if (daysLeft > 14) continue;

    insights.push({
      insight_key: `stock-rm-${ingredientId || ingredientName}`,
      insight_type: "Stock Risk",
      category: "Inventory",
      priority: priorityFromStockDays(daysLeft),
      title: `${ingredientName} will run out soon`,
      problem: `${ingredientName} will run out in ${daysLeft} days at current demand.`,
      impact: "Production disruption within the planning horizon if not replenished.",
      recommendation: "Place a procurement order within 48 hours.",
      href: "/procurement",
      entity_type: "ingredient",
      entity_id: ingredientId || undefined,
      entity_label: ingredientName,
      data_used: {
        qty_on_hand: onHand,
        required_qty_month: monthlyNeed,
        days_remaining: daysLeft,
        unit: requirement.unit,
      },
    });
  }

  return insights;
}

function buildProcurementOpportunityInsights(
  procurementForecast: Awaited<ReturnType<typeof computeProcurementDemandForecast>>
): CostAiInsight[] {
  const insights: CostAiInsight[] = [];

  for (const row of procurementForecast.ingredients) {
    if (row.required_qty < 50 || row.unit_cost <= 0) continue;
    const standardQty = round2(row.required_qty);
    const bulkQty = round2(standardQty * 2);
    const savingsPct = 7;
    const savingsValue = round2(row.estimated_cost * (savingsPct / 100));

    insights.push({
      insight_key: `procurement-bulk-${row.ingredient_id || row.ingredient_name}`,
      insight_type: "Procurement Opportunity",
      category: "Procurement",
      priority: savingsValue >= 5000 ? "High" : savingsValue >= 1000 ? "Medium" : "Low",
      title: `Bulk buy opportunity for ${row.ingredient_name}`,
      problem: `Current monthly requirement is ${standardQty}${row.unit} for ${row.ingredient_name}.`,
      impact: `Buying ${bulkQty}${row.unit} instead of ${standardQty}${row.unit} could reduce cost by ${savingsPct}% (approx. R${savingsValue.toLocaleString("en-ZA")}).`,
      recommendation: "Consolidate the next two procurement cycles into one bulk order if storage allows.",
      href: "/procurement",
      entity_type: "ingredient",
      entity_id: row.ingredient_id || undefined,
      entity_label: row.ingredient_name,
      data_used: {
        standard_qty: standardQty,
        bulk_qty: bulkQty,
        savings_pct: savingsPct,
        savings_value: savingsValue,
        unit_cost: row.unit_cost,
      },
    });
  }

  return insights.slice(0, 8);
}

async function buildOperationsInsights(
  supabase: SupabaseClient,
  companyId: string
): Promise<CostAiInsight[]> {
  const [procurementStats, poStats, productionStats] = await Promise.all([
    getProcurementDashboardStats(supabase, companyId),
    getPurchaseOrderEngineDashboardStats(supabase, companyId),
    getProductionPlanningStats(supabase, companyId),
  ]);

  const insights: CostAiInsight[] = [];

  if (procurementStats.ingredientsAtRisk > 0) {
    insights.push({
      insight_key: "procurement-ingredients-at-risk",
      insight_type: "Stock Risk",
      category: "Procurement",
      priority: procurementStats.ingredientsAtRisk >= 5 ? "Critical" : "High",
      title: "Ingredients at risk from planning shortages",
      problem: `${procurementStats.ingredientsAtRisk} ingredient(s) are below required production levels.`,
      impact: `Shortage exposure of R${procurementStats.shortageValue.toLocaleString("en-ZA")} across open planning demand.`,
      recommendation: "Generate procurement requisitions from shortages and approve within 24 hours.",
      href: "/procurement",
      data_used: {
        ingredients_at_risk: procurementStats.ingredientsAtRisk,
        shortage_value: procurementStats.shortageValue,
      },
    });
  }

  if (poStats.lateDeliveries > 0) {
    insights.push({
      insight_key: "purchase-orders-late",
      insight_type: "Supplier Risk",
      category: "Procurement",
      priority: poStats.lateDeliveries >= 3 ? "High" : "Medium",
      title: "Late purchase order deliveries",
      problem: `${poStats.lateDeliveries} purchase order(s) are past the expected delivery date.`,
      impact: "Raw material availability and production schedules may be disrupted.",
      recommendation: "Follow up with suppliers and reforecast production for affected ingredients.",
      href: "/purchase-orders",
      data_used: {
        late_deliveries: poStats.lateDeliveries,
        open_purchase_orders: poStats.openPurchaseOrders,
      },
    });
  }

  if (productionStats.rawMaterialShortages > 0) {
    insights.push({
      insight_key: "production-raw-shortages",
      insight_type: "Stock Risk",
      category: "Production",
      priority: productionStats.productionRequiredToday > 0 ? "Critical" : "High",
      title: "Raw material shortages in production planning",
      problem: `${productionStats.rawMaterialShortages} BOM ingredient(s) are short against today's production requirement.`,
      impact: `${productionStats.productionRequiredToday} unit(s) of finished goods may not be produced on schedule.`,
      recommendation: "Prioritise procurement for shortage lines before releasing production runs.",
      href: "/production-planning",
      data_used: {
        raw_material_shortages: productionStats.rawMaterialShortages,
        production_required_today: productionStats.productionRequiredToday,
      },
    });
  }

  return insights;
}

export async function computeCostAiInsights(
  supabase: SupabaseClient,
  companyId: string
): Promise<CostAiInsight[]> {
  const [forecasts, products, procurementForecast, supplierInsights, operationsInsights] =
    await Promise.all([
      computeProductDemandForecasts(supabase, companyId),
      computeProductIntelligenceFromTenant(supabase, companyId),
      computeProcurementDemandForecast(supabase, companyId),
      buildSupplierInsights(supabase, companyId),
      buildOperationsInsights(supabase, companyId),
    ]);

  const stockInsights = await buildStockInsights(supabase, companyId, forecasts, procurementForecast);

  const all = sortInsights([
    ...buildDemandInsights(forecasts),
    ...buildMarginInsights(products),
    ...supplierInsights,
    ...stockInsights,
    ...buildProcurementOpportunityInsights(procurementForecast),
    ...operationsInsights,
  ]);

  const seen = new Set<string>();
  return all.filter((row) => {
    if (seen.has(row.insight_key)) return false;
    seen.add(row.insight_key);
    return true;
  });
}

export async function persistCostAiInsights(
  supabase: SupabaseClient,
  companyId: string,
  insights: CostAiInsight[]
) {
  const now = new Date().toISOString();
  await supabase.from("vyron_cost_ai_insights").delete().eq("company_id", companyId).eq("status", "active");

  if (!insights.length) return;

  const rows = insights.map((insight) => ({
    company_id: companyId,
    insight_key: insight.insight_key,
    insight_type: insight.insight_type,
    category: insight.category,
    priority: insight.priority,
    title: insight.title,
    problem: insight.problem,
    impact: insight.impact,
    recommendation: insight.recommendation,
    href: insight.href,
    entity_type: insight.entity_type || null,
    entity_id: insight.entity_id || null,
    entity_label: insight.entity_label || null,
    data_used: insight.data_used,
    status: "active",
    created_at: now,
    updated_at: now,
  }));

  const { error } = await supabase.from("vyron_cost_ai_insights").insert(rows);
  if (error) throw new Error(error.message);
}

export function buildCostAiInsightDashboard(insights: CostAiInsight[]): CostAiInsightDashboard {
  const sorted = sortInsights(insights);

  const topRisks = sorted.filter((row) => RISK_TYPES.has(row.insight_type)).slice(0, 6);
  const topOpportunities = sorted.filter((row) => OPPORTUNITY_TYPES.has(row.insight_type)).slice(0, 6);
  const marginWatchlist = sorted.filter((row) => row.insight_type === "Margin Risk").slice(0, 8);
  const supplierWatchlist = sorted.filter((row) => row.insight_type === "Supplier Risk").slice(0, 8);
  const demandWatchlist = sorted
    .filter((row) => row.insight_type === "Demand Increase" || row.insight_type === "Demand Decline")
    .slice(0, 8);

  const stats = {
    criticalCount: sorted.filter((row) => row.priority === "Critical").length,
    highCount: sorted.filter((row) => row.priority === "High").length,
    mediumCount: sorted.filter((row) => row.priority === "Medium").length,
    lowCount: sorted.filter((row) => row.priority === "Low").length,
    totalInsights: sorted.length,
  };

  return {
    topRisks,
    topOpportunities,
    marginWatchlist,
    supplierWatchlist,
    demandWatchlist,
    allInsights: sorted,
    stats,
  };
}

export async function getCostAiInsightDashboard(
  supabase: SupabaseClient,
  companyId: string
): Promise<CostAiInsightDashboard> {
  const insights = await computeCostAiInsights(supabase, companyId);
  return buildCostAiInsightDashboard(insights);
}

export type CostAiInsightDashboardStats = {
  criticalInsights: number;
  highInsights: number;
  totalInsights: number;
  topRiskTitle: string | null;
  topOpportunityTitle: string | null;
};

export async function getCostAiInsightDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<CostAiInsightDashboardStats> {
  const dashboard = await getCostAiInsightDashboard(supabase, companyId);
  return {
    criticalInsights: dashboard.stats.criticalCount,
    highInsights: dashboard.stats.highCount,
    totalInsights: dashboard.stats.totalInsights,
    topRiskTitle: dashboard.topRisks[0]?.title || null,
    topOpportunityTitle: dashboard.topOpportunities[0]?.title || null,
  };
}
