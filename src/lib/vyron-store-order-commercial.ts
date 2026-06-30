import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcLineCost } from "@/lib/vyron-cost-bom-data";

export const DEFAULT_STORE_ORDER_APPROVAL_RULES = {
  maxOrderValue: 50000,
  minMarginPct: 25,
  maxQtyVariancePct: 50,
  warnInactiveProducts: true,
} as const;

export type StoreOrderApprovalRules = {
  maxOrderValue: number;
  minMarginPct: number;
  maxQtyVariancePct: number;
  warnInactiveProducts: boolean;
};

export type StoreOrderWarning = {
  code: string;
  message: string;
};

export type ProductUnitCostSnapshot = {
  productId: string;
  unitCost: number;
  productStatus: string;
  source: "bom_live" | "bom_stored" | "product_total_cost" | "missing";
};

export type StorePerformanceRow = {
  store_id: string;
  store_code: string;
  store_name: string;
  orders_this_month: number;
  revenue: number;
  gross_margin: number;
  average_order_value: number;
  top_products: { product_id: string; product_name: string; quantity: number }[];
  last_order_date: string | null;
  rank: number;
};

export type StoreScorecardRow = {
  store_id: string;
  store_code: string;
  store_name: string;
  revenue: number;
  orders: number;
  margin: number;
  margin_pct: number;
  products_ordered: number;
  last_order: string | null;
};

export type ProductDemandRow = {
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
  order_count: number;
};

export type StoreOrderCommercialDashboard = {
  ordersToday: number;
  revenueToday: number;
  pendingApproval: number;
  picking: number;
  readyForDispatch: number;
  delivered: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function isActiveProductStatus(status: string | null | undefined) {
  const normalized = String(status || "Active").trim().toLowerCase();
  return normalized === "active" || normalized === "imported";
}

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function mapApprovalRules(row: Record<string, unknown> | null): StoreOrderApprovalRules {
  if (!row) return { ...DEFAULT_STORE_ORDER_APPROVAL_RULES };
  return {
    maxOrderValue: Number(row.max_order_value ?? DEFAULT_STORE_ORDER_APPROVAL_RULES.maxOrderValue),
    minMarginPct: Number(row.min_margin_pct ?? DEFAULT_STORE_ORDER_APPROVAL_RULES.minMarginPct),
    maxQtyVariancePct: Number(row.max_qty_variance_pct ?? DEFAULT_STORE_ORDER_APPROVAL_RULES.maxQtyVariancePct),
    warnInactiveProducts: row.warn_inactive_products !== false,
  };
}

export function calcLineCommercial(
  quantity: number,
  unitPrice: number,
  unitCost: number,
  vatRate = 15
) {
  const qty = round4(quantity);
  const price = round4(unitPrice);
  const cost = round4(unitCost);
  const netRevenue = round2(qty * price);
  const lineEstimatedCost = round2(qty * cost);
  const lineGrossMargin = round2(netRevenue - lineEstimatedCost);
  const lineMarginPct = netRevenue > 0 ? round2((lineGrossMargin / netRevenue) * 100) : 0;
  const vatAmount = round2(netRevenue * (vatRate / 100));
  const lineTotal = round2(netRevenue + vatAmount);
  return {
    qty,
    price,
    cost,
    netRevenue,
    lineEstimatedCost,
    lineGrossMargin,
    lineMarginPct,
    vatAmount,
    lineTotal,
  };
}

export function calcOrderCommercial(
  lines: Array<{ netRevenue: number; lineEstimatedCost: number; lineGrossMargin: number }>
) {
  const orderValue = round2(lines.reduce((sum, line) => sum + line.netRevenue, 0));
  const estimatedCost = round2(lines.reduce((sum, line) => sum + line.lineEstimatedCost, 0));
  const grossMargin = round2(lines.reduce((sum, line) => sum + line.lineGrossMargin, 0));
  const marginPct = orderValue > 0 ? round2((grossMargin / orderValue) * 100) : 0;
  return { orderValue, estimatedCost, grossMargin, marginPct };
}

export async function loadProductUnitCosts(
  supabase: SupabaseClient,
  companyId: string
): Promise<Map<string, ProductUnitCostSnapshot>> {
  const [{ data: products }, { data: boms }, { data: bomLines }, { data: ingredients }] = await Promise.all([
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, linked_bom_id, total_cost, product_status, status")
      .eq("company_id", companyId),
    supabase
      .from("vyron_cost_boms")
      .select("id, product_id, yield_qty, total_cost, cost_per_unit, status")
      .eq("company_id", companyId)
      .neq("status", "Archived"),
    supabase.from("vyron_cost_bom_lines").select("*").eq("company_id", companyId),
    supabase
      .from("vyron_cost_ingredients")
      .select("id, true_unit_cost, purchase_cost")
      .eq("company_id", companyId),
  ]);

  const ingredientCost = new Map<string, number>();
  for (const row of ingredients || []) {
    const cost = Number(row.true_unit_cost ?? row.purchase_cost ?? 0);
    ingredientCost.set(String(row.id), cost);
  }

  const linesByBom = new Map<string, Record<string, unknown>[]>();
  for (const line of bomLines || []) {
    const bomId = String(line.bom_id);
    const bucket = linesByBom.get(bomId) || [];
    bucket.push(line as Record<string, unknown>);
    linesByBom.set(bomId, bucket);
  }

  const bomById = new Map<string, Record<string, unknown>>();
  const bomByProduct = new Map<string, Record<string, unknown>>();
  for (const bom of boms || []) {
    const id = String(bom.id);
    bomById.set(id, bom as Record<string, unknown>);
    if (bom.product_id) bomByProduct.set(String(bom.product_id), bom as Record<string, unknown>);
  }

  function resolveBomUnitCost(bom: Record<string, unknown>) {
    const bomId = String(bom.id);
    const lines = linesByBom.get(bomId) || [];
    if (lines.length) {
      const total = round2(
        lines.reduce((sum, line) => {
          const ingredientId = line.ingredient_id ? String(line.ingredient_id) : "";
          const liveCost = ingredientId ? ingredientCost.get(ingredientId) : undefined;
          const unitCost = liveCost ?? Number(line.unit_cost || 0);
          return (
            sum +
            calcLineCost({
              quantity: Number(line.quantity || 0),
              unit_cost: unitCost,
              wastage_percent: Number(line.wastage_percent || 0),
            })
          );
        }, 0)
      );
      const yieldQty = Math.max(1, Number(bom.yield_qty || 1));
      return { unitCost: round4(total / yieldQty), source: "bom_live" as const };
    }
    const storedPerUnit = Number(bom.cost_per_unit || 0);
    if (storedPerUnit > 0) return { unitCost: storedPerUnit, source: "bom_stored" as const };
    const yieldQty = Math.max(1, Number(bom.yield_qty || 1));
    const totalCost = Number(bom.total_cost || 0);
    if (totalCost > 0) return { unitCost: round4(totalCost / yieldQty), source: "bom_stored" as const };
    return { unitCost: 0, source: "missing" as const };
  }

  const map = new Map<string, ProductUnitCostSnapshot>();
  for (const product of products || []) {
    const productId = String(product.id);
    const linkedBomId = product.linked_bom_id ? String(product.linked_bom_id) : "";
    const bom =
      (linkedBomId ? bomById.get(linkedBomId) : undefined) || bomByProduct.get(productId);
    const productStatus = String(product.product_status || product.status || "Active");

    if (bom) {
      const resolved = resolveBomUnitCost(bom);
      map.set(productId, {
        productId,
        unitCost: resolved.unitCost,
        productStatus,
        source: resolved.source,
      });
      continue;
    }

    const productCost = Number(product.total_cost || 0);
    map.set(productId, {
      productId,
      unitCost: productCost,
      productStatus,
      source: productCost > 0 ? "product_total_cost" : "missing",
    });
  }

  return map;
}

export async function getStoreOrderApprovalRules(
  supabase: SupabaseClient,
  companyId: string
): Promise<StoreOrderApprovalRules> {
  const { data, error } = await supabase
    .from("vyron_store_order_approval_rules")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapApprovalRules((data as Record<string, unknown> | null) || null);
}

export async function saveStoreOrderApprovalRules(
  supabase: SupabaseClient,
  companyId: string,
  rules: StoreOrderApprovalRules
): Promise<StoreOrderApprovalRules> {
  const payload = {
    max_order_value: rules.maxOrderValue,
    min_margin_pct: rules.minMarginPct,
    max_qty_variance_pct: rules.maxQtyVariancePct,
    warn_inactive_products: rules.warnInactiveProducts,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: loadError } = await supabase
    .from("vyron_store_order_approval_rules")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);

  if (existing?.id) {
    const { error } = await supabase
      .from("vyron_store_order_approval_rules")
      .update(payload)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("vyron_store_order_approval_rules").insert({
      id: randomUUID(),
      company_id: companyId,
      ...payload,
    });
    if (error) throw new Error(error.message);
  }

  return getStoreOrderApprovalRules(supabase, companyId);
}

type WarningOrderInput = {
  id?: string;
  store_id?: string;
  order_value?: number;
  total?: number;
  subtotal?: number;
  margin_pct?: number;
  lines?: Array<{
    product_id: string;
    product_name_snapshot?: string;
    quantity: number;
  }>;
};

export async function evaluateStoreOrderWarnings(
  supabase: SupabaseClient,
  companyId: string,
  order: WarningOrderInput,
  rules?: StoreOrderApprovalRules,
  productCosts?: Map<string, ProductUnitCostSnapshot>
): Promise<StoreOrderWarning[]> {
  const resolvedRules = rules || (await getStoreOrderApprovalRules(supabase, companyId));
  const costs = productCosts || (await loadProductUnitCosts(supabase, companyId));
  const warnings: StoreOrderWarning[] = [];

  const orderValue = Number(order.order_value ?? order.subtotal ?? order.total ?? 0);
  if (orderValue > resolvedRules.maxOrderValue) {
    warnings.push({
      code: "order_value_threshold",
      message: `Order value R${orderValue.toLocaleString("en-ZA")} exceeds threshold R${resolvedRules.maxOrderValue.toLocaleString("en-ZA")}.`,
    });
  }

  const marginPct = Number(order.margin_pct ?? 0);
  if (orderValue > 0 && marginPct < resolvedRules.minMarginPct) {
    warnings.push({
      code: "margin_threshold",
      message: `Margin ${marginPct.toFixed(1)}% is below threshold ${resolvedRules.minMarginPct}%.`,
    });
  }

  const lines = order.lines || [];
  if (resolvedRules.warnInactiveProducts) {
    for (const line of lines) {
      const snapshot = costs.get(line.product_id);
      if (snapshot && !isActiveProductStatus(snapshot.productStatus)) {
        warnings.push({
          code: "inactive_product",
          message: `Inactive product ordered: ${line.product_name_snapshot || line.product_id}.`,
        });
      }
    }
  }

  if (lines.length && order.store_id) {
    const productIds = [...new Set(lines.map((line) => line.product_id))];
    const since = daysAgoIso(90);
    const { data: historicalLines } = await supabase
      .from("vyron_cost_store_order_lines")
      .select("product_id, quantity, vyron_cost_store_orders!inner(store_id, order_date, status)")
      .eq("company_id", companyId)
      .in("product_id", productIds)
      .gte("vyron_cost_store_orders.order_date", since)
      .not("vyron_cost_store_orders.status", "in", "(Draft,Cancelled)");

    const avgQty = new Map<string, { total: number; count: number }>();
    for (const row of historicalLines || []) {
      const storeOrder = row.vyron_cost_store_orders as { store_id?: string } | null;
      if (storeOrder?.store_id !== order.store_id) continue;
      const productId = String(row.product_id);
      const bucket = avgQty.get(productId) || { total: 0, count: 0 };
      bucket.total += Number(row.quantity || 0);
      bucket.count += 1;
      avgQty.set(productId, bucket);
    }

    for (const line of lines) {
      const bucket = avgQty.get(line.product_id);
      if (!bucket || bucket.count < 2) continue;
      const average = bucket.total / bucket.count;
      if (average <= 0) continue;
      const variancePct = ((Number(line.quantity) - average) / average) * 100;
      if (variancePct > resolvedRules.maxQtyVariancePct) {
        warnings.push({
          code: "qty_variance",
          message: `${line.product_name_snapshot || "Product"} qty ${Number(line.quantity)} is ${variancePct.toFixed(0)}% above store average ${average.toFixed(2)}.`,
        });
      }
    }
  }

  return warnings;
}

type AnalyticsOrder = {
  id: string;
  store_id: string;
  order_date: string;
  status: string;
  order_value: number;
  gross_margin: number;
  margin_pct: number;
  subtotal: number;
  store_code?: string | null;
  store_name?: string | null;
};

type AnalyticsLine = {
  store_order_id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  line_estimated_cost: number;
  line_gross_margin: number;
};

async function loadCommercialOrders(
  supabase: SupabaseClient,
  companyId: string,
  fromDate?: string
) {
  let query = supabase
    .from("vyron_cost_store_orders")
    .select("id, store_id, order_date, status, order_value, gross_margin, margin_pct, subtotal, vyron_cost_stores!inner(store_code, store_name)")
    .eq("company_id", companyId)
    .not("status", "in", "(Draft,Cancelled)")
    .order("order_date", { ascending: false });

  if (fromDate) query = query.gte("order_date", fromDate);

  const { data, error } = await query.limit(5000);
  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const store = row.vyron_cost_stores as { store_code?: string; store_name?: string } | null;
    const { vyron_cost_stores: _store, ...order } = row as Record<string, unknown>;
    return {
      ...(order as AnalyticsOrder),
      order_value: Number(order.order_value || order.subtotal || 0),
      gross_margin: Number(order.gross_margin || 0),
      margin_pct: Number(order.margin_pct || 0),
      store_code: store?.store_code || null,
      store_name: store?.store_name || null,
    };
  });
}

async function loadCommercialLines(
  supabase: SupabaseClient,
  companyId: string,
  orderIds: string[]
) {
  if (!orderIds.length) return [] as AnalyticsLine[];
  const { data, error } = await supabase
    .from("vyron_cost_store_order_lines")
    .select("store_order_id, product_id, product_name_snapshot, quantity, unit_price, line_estimated_cost, line_gross_margin")
    .eq("company_id", companyId)
    .in("store_order_id", orderIds);
  if (error) throw new Error(error.message);
  return (data || []) as AnalyticsLine[];
}

export async function getStorePerformanceReport(
  supabase: SupabaseClient,
  companyId: string
): Promise<StorePerformanceRow[]> {
  const fromDate = monthStartIso();
  const orders = (await loadCommercialOrders(supabase, companyId, fromDate)).filter(
    (order) => order.order_date >= fromDate
  );
  const lines = await loadCommercialLines(
    supabase,
    companyId,
    orders.map((order) => order.id)
  );
  const linesByOrder = new Map<string, AnalyticsLine[]>();
  for (const line of lines) {
    const bucket = linesByOrder.get(line.store_order_id) || [];
    bucket.push(line);
    linesByOrder.set(line.store_order_id, bucket);
  }

  const byStore = new Map<string, StorePerformanceRow>();
  for (const order of orders) {
    const existing =
      byStore.get(order.store_id) ||
      ({
        store_id: order.store_id,
        store_code: order.store_code || "—",
        store_name: order.store_name || "—",
        orders_this_month: 0,
        revenue: 0,
        gross_margin: 0,
        average_order_value: 0,
        top_products: [],
        last_order_date: null,
        rank: 0,
      } satisfies StorePerformanceRow);

    existing.orders_this_month += 1;
    existing.revenue = round2(existing.revenue + order.order_value);
    existing.gross_margin = round2(existing.gross_margin + order.gross_margin);
    if (!existing.last_order_date || order.order_date > existing.last_order_date) {
      existing.last_order_date = order.order_date;
    }

    const productQty = new Map<string, { product_id: string; product_name: string; quantity: number }>();
    for (const line of linesByOrder.get(order.id) || []) {
      const current = productQty.get(line.product_id) || {
        product_id: line.product_id,
        product_name: line.product_name_snapshot,
        quantity: 0,
      };
      current.quantity += Number(line.quantity || 0);
      productQty.set(line.product_id, current);
    }
    for (const product of productQty.values()) {
      const match = existing.top_products.find((row) => row.product_id === product.product_id);
      if (match) match.quantity = round4(match.quantity + product.quantity);
      else existing.top_products.push({ ...product, quantity: round4(product.quantity) });
    }

    byStore.set(order.store_id, existing);
  }

  const rows = [...byStore.values()].map((row) => ({
    ...row,
    average_order_value:
      row.orders_this_month > 0 ? round2(row.revenue / row.orders_this_month) : 0,
    top_products: [...row.top_products].sort((a, b) => b.quantity - a.quantity).slice(0, 3),
  }));

  rows.sort((a, b) => b.revenue - a.revenue);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getStoreScorecards(
  supabase: SupabaseClient,
  companyId: string
): Promise<StoreScorecardRow[]> {
  const fromDate = daysAgoIso(90);
  const orders = await loadCommercialOrders(supabase, companyId, fromDate);
  const lines = await loadCommercialLines(
    supabase,
    companyId,
    orders.map((order) => order.id)
  );
  const linesByOrder = new Map<string, AnalyticsLine[]>();
  for (const line of lines) {
    const bucket = linesByOrder.get(line.store_order_id) || [];
    bucket.push(line);
    linesByOrder.set(line.store_order_id, bucket);
  }

  const byStore = new Map<string, StoreScorecardRow>();
  for (const order of orders) {
    const existing =
      byStore.get(order.store_id) ||
      ({
        store_id: order.store_id,
        store_code: order.store_code || "—",
        store_name: order.store_name || "—",
        revenue: 0,
        orders: 0,
        margin: 0,
        margin_pct: 0,
        products_ordered: 0,
        last_order: null,
      } satisfies StoreScorecardRow);

    existing.orders += 1;
    existing.revenue = round2(existing.revenue + order.order_value);
    existing.margin = round2(existing.margin + order.gross_margin);
    if (!existing.last_order || order.order_date > existing.last_order) {
      existing.last_order = order.order_date;
    }

    const products = new Set<string>();
    for (const line of linesByOrder.get(order.id) || []) products.add(line.product_id);
    existing.products_ordered += products.size;
    byStore.set(order.store_id, existing);
  }

  return [...byStore.values()]
    .map((row) => ({
      ...row,
      margin_pct: row.revenue > 0 ? round2((row.margin / row.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function getProductDemandReport(
  supabase: SupabaseClient,
  companyId: string,
  days: 7 | 30 | 90
): Promise<{ top: ProductDemandRow[]; bottom: ProductDemandRow[] }> {
  const fromDate = daysAgoIso(days);
  const orders = await loadCommercialOrders(supabase, companyId, fromDate);
  const orderIds = orders.map((order) => order.id);
  const lines = await loadCommercialLines(supabase, companyId, orderIds);
  const orderValueById = new Map(orders.map((order) => [order.id, order.order_value]));

  const byProduct = new Map<string, ProductDemandRow>();
  for (const line of lines) {
    const existing =
      byProduct.get(line.product_id) ||
      ({
        product_id: line.product_id,
        product_name: line.product_name_snapshot,
        quantity: 0,
        revenue: 0,
        order_count: 0,
      } satisfies ProductDemandRow);
    existing.quantity = round4(existing.quantity + Number(line.quantity || 0));
    const net = round2(Number(line.quantity || 0) * Number(line.unit_price || 0));
    existing.revenue = round2(existing.revenue + net);
    existing.order_count += 1;
    byProduct.set(line.product_id, existing);
  }

  const rows = [...byProduct.values()].sort((a, b) => b.quantity - a.quantity);
  const withDemand = rows.filter((row) => row.quantity > 0);
  return {
    top: withDemand.slice(0, 10),
    bottom: [...withDemand].reverse().slice(0, 10),
  };
}

export async function getStoreOrderCommercialDashboard(
  supabase: SupabaseClient,
  companyId: string
): Promise<StoreOrderCommercialDashboard> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: todayOrders, error: todayError } = await supabase
    .from("vyron_cost_store_orders")
    .select("id, order_value, subtotal")
    .eq("company_id", companyId)
    .eq("order_date", today)
    .not("status", "eq", "Cancelled");
  if (todayError) throw new Error(todayError.message);

  const revenueToday = round2(
    (todayOrders || []).reduce(
      (sum, row) => sum + Number(row.order_value || row.subtotal || 0),
      0
    )
  );

  const [
    { count: pendingApproval },
    { count: picking },
    { count: readyForDispatch },
    { count: delivered },
  ] = await Promise.all([
    supabase
      .from("vyron_cost_store_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "Submitted"),
    supabase
      .from("vyron_cost_store_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["Approved", "Picking"]),
    supabase
      .from("vyron_cost_store_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "ReadyToDispatch"),
    supabase
      .from("vyron_cost_store_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "Delivered"),
  ]);

  return {
    ordersToday: todayOrders?.length || 0,
    revenueToday,
    pendingApproval: pendingApproval || 0,
    picking: picking || 0,
    readyForDispatch: readyForDispatch || 0,
    delivered: delivered || 0,
  };
}
