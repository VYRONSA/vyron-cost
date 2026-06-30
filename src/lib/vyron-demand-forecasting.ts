import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIngredientRequirements } from "@/lib/vyron-store-production-planning";

export const FORECAST_PERIOD_TYPES = ["Weekly", "Monthly"] as const;
export type ForecastPeriodType = (typeof FORECAST_PERIOD_TYPES)[number];

export const DEMAND_TRENDS = ["Growing", "Stable", "Declining"] as const;
export type DemandTrend = (typeof DEMAND_TRENDS)[number];

export type ForecastWarning = {
  code: "demand_spike" | "demand_decline" | "stock_risk";
  message: string;
  product_id?: string;
  product_name?: string;
};

export type ProductDemandForecastRow = {
  product_id: string;
  product_name: string;
  demand_30d: number;
  demand_90d: number;
  demand_180d: number;
  avg_weekly_demand: number;
  avg_monthly_demand: number;
  trend: DemandTrend;
  forecast_next_week: number;
  forecast_next_month: number;
  confidence_level: number;
  unit_revenue: number;
  warnings: ForecastWarning[];
};

export type StoreDemandForecastRow = {
  store_id: string;
  store_code: string;
  store_name: string;
  expected_orders: number;
  expected_revenue: number;
  expected_volume: number;
  orders_90d: number;
  revenue_90d: number;
  volume_90d: number;
};

export type ProcurementForecastIngredientRow = {
  ingredient_id: string | null;
  ingredient_name: string;
  required_qty: number;
  unit: string;
  unit_cost: number;
  estimated_cost: number;
};

export type DemandForecastDashboardStats = {
  forecastRevenue: number;
  forecastProduction: number;
  forecastProcurementValue: number;
  productsGrowingFastest: number;
  warnings: ForecastWarning[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

type DemandOrderLine = {
  order_id: string;
  order_date: string;
  store_id: string;
  store_code: string;
  store_name: string;
  status: string;
  order_value: number;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

async function loadDemandOrderLines(supabase: SupabaseClient, companyId: string, days = 180) {
  const fromDate = daysAgoIso(days);
  const { data: orders, error } = await supabase
    .from("vyron_cost_store_orders")
    .select("id, store_id, order_date, status, order_value, subtotal, vyron_cost_stores!inner(store_code, store_name)")
    .eq("company_id", companyId)
    .gte("order_date", fromDate)
    .not("status", "in", "(Draft,Cancelled)")
    .order("order_date", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);
  if (!orders?.length) return [] as DemandOrderLine[];

  const orderMeta = new Map<
    string,
    { order_date: string; store_id: string; store_code: string; store_name: string; status: string; order_value: number }
  >();
  for (const order of orders) {
    const store = order.vyron_cost_stores as { store_code?: string; store_name?: string } | null;
    orderMeta.set(String(order.id), {
      order_date: String(order.order_date),
      store_id: String(order.store_id),
      store_code: store?.store_code || "—",
      store_name: store?.store_name || "—",
      status: String(order.status),
      order_value: Number(order.order_value || order.subtotal || 0),
    });
  }

  const orderIds = orders.map((order) => String(order.id));
  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_store_order_lines")
    .select("store_order_id, product_id, product_name_snapshot, quantity, unit_price")
    .eq("company_id", companyId)
    .in("store_order_id", orderIds);
  if (lineError) throw new Error(lineError.message);

  const rows: DemandOrderLine[] = [];
  for (const line of lines || []) {
    const meta = orderMeta.get(String(line.store_order_id));
    if (!meta) continue;
    rows.push({
      order_id: String(line.store_order_id),
      order_date: meta.order_date,
      store_id: meta.store_id,
      store_code: meta.store_code,
      store_name: meta.store_name,
      status: meta.status,
      order_value: meta.order_value,
      product_id: String(line.product_id),
      product_name: String(line.product_name_snapshot || ""),
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unit_price || 0),
    });
  }
  return rows;
}

function qtyInWindow(lines: DemandOrderLine[], days: number, deliveredOnly = false) {
  const from = daysAgoIso(days);
  const byProduct = new Map<string, { product_name: string; qty: number; revenue: number; order_ids: Set<string> }>();

  for (const line of lines) {
    if (line.order_date < from) continue;
    if (deliveredOnly && line.status !== "Delivered") continue;

    const bucket = byProduct.get(line.product_id) || {
      product_name: line.product_name,
      qty: 0,
      revenue: 0,
      order_ids: new Set<string>(),
    };
    bucket.qty = round4(bucket.qty + line.quantity);
    bucket.revenue = round2(bucket.revenue + line.quantity * line.unit_price);
    bucket.order_ids.add(line.order_id);
    byProduct.set(line.product_id, bucket);
  }

  return byProduct;
}

function calcTrend(recentQty: number, priorQty: number): DemandTrend {
  if (priorQty <= 0 && recentQty > 0) return "Growing";
  if (recentQty <= 0 && priorQty > 0) return "Declining";
  if (priorQty <= 0) return "Stable";
  const ratio = recentQty / priorQty;
  if (ratio >= 1.1) return "Growing";
  if (ratio <= 0.9) return "Declining";
  return "Stable";
}

function calcConfidence(orderCount: number, totalQty: number): number {
  if (orderCount >= 10 && totalQty >= 20) return 85;
  if (orderCount >= 5 && totalQty >= 10) return 70;
  if (orderCount >= 2 || totalQty >= 5) return 55;
  if (totalQty > 0) return 40;
  return 20;
}

function priorWindowQty(lines: DemandOrderLine[], productId: string, startDaysAgo: number, endDaysAgo: number) {
  const start = daysAgoIso(startDaysAgo);
  const end = daysAgoIso(endDaysAgo);
  let qty = 0;
  for (const line of lines) {
    if (line.product_id !== productId) continue;
    if (line.order_date >= start && line.order_date < end) qty += line.quantity;
  }
  return round4(qty);
}

async function loadProductBomMap(supabase: SupabaseClient, companyId: string) {
  const [{ data: products }, { data: boms }, { data: bomLines }] = await Promise.all([
    supabase.from("vyron_cost_products").select("id, product_name, linked_bom_id").eq("company_id", companyId),
    supabase
      .from("vyron_cost_boms")
      .select("id, product_id, yield_qty, status")
      .eq("company_id", companyId)
      .neq("status", "Archived"),
    supabase.from("vyron_cost_bom_lines").select("*").eq("company_id", companyId),
  ]);

  const bomById = new Map<string, Record<string, unknown>>();
  const bomByProduct = new Map<string, Record<string, unknown>>();
  for (const bom of boms || []) {
    bomById.set(String(bom.id), bom as Record<string, unknown>);
    if (bom.product_id) bomByProduct.set(String(bom.product_id), bom as Record<string, unknown>);
  }

  const linesByBom = new Map<string, Record<string, unknown>[]>();
  for (const line of bomLines || []) {
    const bomId = String(line.bom_id);
    const bucket = linesByBom.get(bomId) || [];
    bucket.push(line as Record<string, unknown>);
    linesByBom.set(bomId, bucket);
  }

  const productBom = new Map<string, { bom: Record<string, unknown>; lines: Record<string, unknown>[] }>();
  for (const product of products || []) {
    const productId = String(product.id);
    const linkedBomId = product.linked_bom_id ? String(product.linked_bom_id) : "";
    const bom =
      (linkedBomId ? bomById.get(linkedBomId) : undefined) || bomByProduct.get(productId);
    if (!bom) continue;
    productBom.set(productId, { bom, lines: linesByBom.get(String(bom.id)) || [] });
  }
  return productBom;
}

export async function computeProductDemandForecasts(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProductDemandForecastRow[]> {
  const lines = await loadDemandOrderLines(supabase, companyId, 180);
  const deliveredLines = lines.filter((line) => line.status === "Delivered");
  const historicalLines = deliveredLines.length ? deliveredLines : lines;

  const w30 = qtyInWindow(historicalLines, 30);
  const w90 = qtyInWindow(historicalLines, 90);
  const w180 = qtyInWindow(historicalLines, 180);

  const productIds = new Set([...w180.keys(), ...w90.keys(), ...w30.keys()]);

  const { data: stockItems } = await supabase
    .from("vyron_cost_stock_items")
    .select("entity_id, qty_on_hand")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods");

  const fgStock = new Map<string, number>();
  for (const item of stockItems || []) {
    if (item.entity_id) fgStock.set(String(item.entity_id), Number(item.qty_on_hand || 0));
  }

  const forecasts: ProductDemandForecastRow[] = [];

  for (const productId of productIds) {
    const d30 = w30.get(productId)?.qty ?? 0;
    const d90 = w90.get(productId)?.qty ?? 0;
    const d180 = w180.get(productId)?.qty ?? 0;
    const product_name =
      w180.get(productId)?.product_name ||
      w90.get(productId)?.product_name ||
      w30.get(productId)?.product_name ||
      "Product";

    const avgWeekly = d90 > 0 ? round4(d90 / (90 / 7)) : round4(d30 / Math.max(1, 30 / 7));
    const avgMonthly = d90 > 0 ? round4(d90 / 3) : round4(d30);

    const recent45 = priorWindowQty(historicalLines, productId, 45, 0);
    const prior45 = priorWindowQty(historicalLines, productId, 90, 45);
    const trend = calcTrend(recent45, prior45);

    const orderCount = w90.get(productId)?.order_ids.size ?? w30.get(productId)?.order_ids.size ?? 0;
    const confidence = calcConfidence(orderCount, d90 || d30);

    const forecast_next_week = round4(avgWeekly);
    const forecast_next_month = round4(avgMonthly);

    const revenueTotal = w90.get(productId)?.revenue ?? w30.get(productId)?.revenue ?? 0;
    const qtyTotal = w90.get(productId)?.qty ?? w30.get(productId)?.qty ?? 0;
    const unit_revenue = qtyTotal > 0 ? round2(revenueTotal / qtyTotal) : 0;

    const warnings: ForecastWarning[] = [];
    if (d30 > 0 && avgWeekly > 0 && d30 / (30 / 7) > avgWeekly * 1.5) {
      warnings.push({
        code: "demand_spike",
        message: `${product_name} demand is spiking versus the 90-day average.`,
        product_id: productId,
        product_name,
      });
    }
    if (trend === "Declining") {
      warnings.push({
        code: "demand_decline",
        message: `${product_name} demand is declining versus the prior period.`,
        product_id: productId,
        product_name,
      });
    }
    const onHand = fgStock.get(productId) ?? 0;
    if (forecast_next_month > onHand * 1.2 && forecast_next_month > 0) {
      warnings.push({
        code: "stock_risk",
        message: `${product_name} forecast may exceed finished goods on hand (${onHand}).`,
        product_id: productId,
        product_name,
      });
    }

    forecasts.push({
      product_id: productId,
      product_name,
      demand_30d: round4(d30),
      demand_90d: round4(d90),
      demand_180d: round4(d180),
      avg_weekly_demand: avgWeekly,
      avg_monthly_demand: avgMonthly,
      trend,
      forecast_next_week,
      forecast_next_month,
      confidence_level: confidence,
      unit_revenue,
      warnings,
    });
  }

  return forecasts.sort((a, b) => b.forecast_next_month - a.forecast_next_month);
}

export async function persistDemandForecasts(
  supabase: SupabaseClient,
  companyId: string,
  forecasts: ProductDemandForecastRow[]
) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("vyron_cost_demand_forecasts")
    .delete()
    .eq("company_id", companyId)
    .eq("forecast_date", today);

  if (!forecasts.length) return;

  const rows = forecasts.flatMap((row) => [
    {
      id: randomUUID(),
      company_id: companyId,
      forecast_date: today,
      product_id: row.product_id,
      product_name: row.product_name,
      period_type: "Weekly" as ForecastPeriodType,
      forecast_qty: row.forecast_next_week,
      confidence_level: row.confidence_level,
    },
    {
      id: randomUUID(),
      company_id: companyId,
      forecast_date: today,
      product_id: row.product_id,
      product_name: row.product_name,
      period_type: "Monthly" as ForecastPeriodType,
      forecast_qty: row.forecast_next_month,
      confidence_level: row.confidence_level,
    },
  ]);

  const { error } = await supabase.from("vyron_cost_demand_forecasts").insert(rows);
  if (error) throw new Error(error.message);
}

export async function computeStoreDemandForecasts(
  supabase: SupabaseClient,
  companyId: string
): Promise<StoreDemandForecastRow[]> {
  const lines = await loadDemandOrderLines(supabase, companyId, 90);
  const delivered = lines.filter((line) => line.status === "Delivered");
  const source = delivered.length ? delivered : lines;

  const from90 = daysAgoIso(90);
  const byStore = new Map<
    string,
    {
      store_code: string;
      store_name: string;
      orders: Set<string>;
      order_values: Map<string, number>;
      volume: number;
    }
  >();

  for (const line of source) {
    if (line.order_date < from90) continue;
    const bucket =
      byStore.get(line.store_id) ||
      ({
        store_code: line.store_code,
        store_name: line.store_name,
        orders: new Set<string>(),
        order_values: new Map<string, number>(),
        volume: 0,
      });
    bucket.orders.add(line.order_id);
    if (!bucket.order_values.has(line.order_id)) {
      bucket.order_values.set(line.order_id, line.order_value);
    }
    bucket.volume = round4(bucket.volume + line.quantity);
    byStore.set(line.store_id, bucket);
  }

  return [...byStore.entries()]
    .map(([store_id, bucket]) => {
      const revenue_90d = round2([...bucket.order_values.values()].reduce((sum, v) => sum + v, 0));
      return {
        store_id,
        store_code: bucket.store_code,
        store_name: bucket.store_name,
        orders_90d: bucket.orders.size,
        revenue_90d,
        volume_90d: bucket.volume,
        expected_orders: round2(bucket.orders.size / 3),
        expected_revenue: round2(revenue_90d / 3),
        expected_volume: round4(bucket.volume / 3),
      };
    })
    .sort((a, b) => b.expected_revenue - a.expected_revenue);
}

export async function computeProcurementDemandForecast(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ ingredients: ProcurementForecastIngredientRow[]; total_value: number }> {
  const productForecasts = await computeProductDemandForecasts(supabase, companyId);
  const productBom = await loadProductBomMap(supabase, companyId);

  const demand = productForecasts
    .filter((row) => row.forecast_next_month > 0)
    .map((row) => ({ product_id: row.product_id, planned_qty: row.forecast_next_month }));

  const ingredientBase = buildIngredientRequirements(demand, productBom);

  const ingredientIds = ingredientBase.map((row) => row.ingredient_id).filter(Boolean) as string[];
  const { data: ingredients } = ingredientIds.length
    ? await supabase
        .from("vyron_cost_ingredients")
        .select("id, true_unit_cost, purchase_cost")
        .eq("company_id", companyId)
        .in("id", ingredientIds)
    : { data: [] };

  const costByIngredient = new Map<string, number>();
  for (const row of ingredients || []) {
    costByIngredient.set(
      String(row.id),
      round4(Number(row.true_unit_cost || row.purchase_cost || 0))
    );
  }

  const mapped = ingredientBase.map((row) => {
    const unit_cost = row.ingredient_id ? costByIngredient.get(row.ingredient_id) || 0 : 0;
    return {
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient_name,
      required_qty: row.required_qty,
      unit: row.unit,
      unit_cost,
      estimated_cost: round2(row.required_qty * unit_cost),
    };
  });

  const total_value = round2(mapped.reduce((sum, row) => sum + row.estimated_cost, 0));
  return { ingredients: mapped.sort((a, b) => b.estimated_cost - a.estimated_cost), total_value };
}

export async function getDemandForecastDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<DemandForecastDashboardStats> {
  const [products, procurement] = await Promise.all([
    computeProductDemandForecasts(supabase, companyId),
    computeProcurementDemandForecast(supabase, companyId),
  ]);

  const forecastRevenue = round2(
    products.reduce((sum, row) => sum + row.forecast_next_month * row.unit_revenue, 0)
  );
  const forecastProduction = round4(products.reduce((sum, row) => sum + row.forecast_next_month, 0));
  const productsGrowingFastest = products.filter((row) => row.trend === "Growing").length;

  const warnings: ForecastWarning[] = [];
  for (const row of products) {
    for (const warning of row.warnings) {
      if (!warnings.some((w) => w.code === warning.code && w.product_id === warning.product_id)) {
        warnings.push(warning);
      }
    }
  }

  return {
    forecastRevenue,
    forecastProduction,
    forecastProcurementValue: procurement.total_value,
    productsGrowingFastest,
    warnings: warnings.slice(0, 12),
  };
}

export async function listPersistedForecasts(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from("vyron_cost_demand_forecasts")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}
