import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProductUnitCosts } from "@/lib/vyron-store-order-commercial";

export const STORE_PRODUCTION_STATUSES = [
  "Draft",
  "Planned",
  "Released",
  "Completed",
  "Cancelled",
] as const;

export type StoreProductionStatus = (typeof STORE_PRODUCTION_STATUSES)[number];

export const STORE_ORDER_DEMAND_STATUSES = ["Approved", "Picking", "ReadyToDispatch"] as const;

export type StoreContribution = {
  store_id: string;
  store_code: string;
  store_name: string;
  quantity: number;
};

export type ConsolidatedDemandRow = {
  product_id: string;
  product_name: string;
  required_qty: number;
  planned_qty: number;
  unit_cost: number;
  total_cost: number;
  store_contributions: StoreContribution[];
};

export type IngredientRequirementRow = {
  ingredient_id: string | null;
  ingredient_name: string;
  required_qty: number;
  available_qty: number;
  shortfall: number;
  unit: string;
  has_shortage: boolean;
};

export type StoreProductionRunLineRow = {
  id: string;
  company_id: string;
  production_run_id: string;
  product_id: string;
  product_name: string;
  required_qty: number;
  planned_qty: number;
  produced_qty: number;
  unit_cost: number;
  total_cost: number;
  store_contributions: StoreContribution[];
  sort_order: number;
};

export type StoreProductionRunRow = {
  id: string;
  company_id: string;
  run_number: string;
  production_date: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  total_cost: number;
  created_at: string;
  updated_at: string;
  lines?: StoreProductionRunLineRow[];
  ingredient_requirements?: IngredientRequirementRow[];
};

export type ProductionPlanningStats = {
  productionRequiredToday: number;
  productionRunsOpen: number;
  rawMaterialShortages: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function mapRunLine(row: Record<string, unknown>): StoreProductionRunLineRow {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    production_run_id: String(row.production_run_id),
    product_id: String(row.product_id),
    product_name: String(row.product_name || ""),
    required_qty: Number(row.required_qty || 0),
    planned_qty: Number(row.planned_qty || 0),
    produced_qty: Number(row.produced_qty || 0),
    unit_cost: Number(row.unit_cost || 0),
    total_cost: Number(row.total_cost || 0),
    store_contributions: Array.isArray(row.store_contributions)
      ? (row.store_contributions as StoreContribution[])
      : [],
    sort_order: Number(row.sort_order || 0),
  };
}

async function loadProductBomMap(supabase: SupabaseClient, companyId: string) {
  const [{ data: products }, { data: boms }, { data: bomLines }] = await Promise.all([
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, linked_bom_id")
      .eq("company_id", companyId),
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
    productBom.set(productId, {
      bom,
      lines: linesByBom.get(String(bom.id)) || [],
    });
  }

  return productBom;
}

export async function consolidateStoreOrderDemand(
  supabase: SupabaseClient,
  companyId: string
): Promise<ConsolidatedDemandRow[]> {
  const { data: orders, error } = await supabase
    .from("vyron_cost_store_orders")
    .select("id, store_id, vyron_cost_stores!inner(store_code, store_name)")
    .eq("company_id", companyId)
    .in("status", [...STORE_ORDER_DEMAND_STATUSES]);

  if (error) throw new Error(error.message);
  if (!orders?.length) return [];

  const orderMeta = new Map<string, { store_id: string; store_code: string; store_name: string }>();
  for (const order of orders) {
    const store = order.vyron_cost_stores as { store_code?: string; store_name?: string } | null;
    orderMeta.set(String(order.id), {
      store_id: String(order.store_id),
      store_code: store?.store_code || "—",
      store_name: store?.store_name || "—",
    });
  }

  const orderIds = orders.map((order) => String(order.id));
  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_store_order_lines")
    .select("store_order_id, product_id, product_name_snapshot, quantity")
    .eq("company_id", companyId)
    .in("store_order_id", orderIds);

  if (lineError) throw new Error(lineError.message);

  const productCosts = await loadProductUnitCosts(supabase, companyId);
  const byProduct = new Map<string, ConsolidatedDemandRow>();

  for (const line of lines || []) {
    const productId = String(line.product_id);
    const qty = Number(line.quantity || 0);
    const meta = orderMeta.get(String(line.store_order_id));
    const unitCost = productCosts.get(productId)?.unitCost ?? 0;

    const existing =
      byProduct.get(productId) ||
      ({
        product_id: productId,
        product_name: String(line.product_name_snapshot || ""),
        required_qty: 0,
        planned_qty: 0,
        unit_cost: unitCost,
        total_cost: 0,
        store_contributions: [],
      } satisfies ConsolidatedDemandRow);

    existing.required_qty = round4(existing.required_qty + qty);
    existing.planned_qty = existing.required_qty;
    existing.unit_cost = unitCost;
    existing.total_cost = round2(existing.required_qty * unitCost);

    if (meta) {
      const match = existing.store_contributions.find((row) => row.store_id === meta.store_id);
      if (match) match.quantity = round4(match.quantity + qty);
      else {
        existing.store_contributions.push({
          store_id: meta.store_id,
          store_code: meta.store_code,
          store_name: meta.store_name,
          quantity: round4(qty),
        });
      }
    }

    byProduct.set(productId, existing);
  }

  return [...byProduct.values()].sort((a, b) => b.required_qty - a.required_qty);
}

export function buildIngredientRequirements(
  demand: Array<{ product_id: string; planned_qty: number }>,
  productBom: Map<string, { bom: Record<string, unknown>; lines: Record<string, unknown>[] }>
): Omit<IngredientRequirementRow, "available_qty" | "shortfall" | "has_shortage">[] {
  const totals = new Map<string, { ingredient_id: string | null; ingredient_name: string; required_qty: number; unit: string }>();

  for (const row of demand) {
    const bomPack = productBom.get(row.product_id);
    if (!bomPack) continue;
    const yieldQty = Math.max(1, Number(bomPack.bom.yield_qty || 1));
    const scale = Number(row.planned_qty || 0) / yieldQty;

    for (const line of bomPack.lines) {
      const lineType = String(line.line_type || "Ingredient");
      if (lineType !== "Ingredient" && !line.ingredient_id) continue;

      const key = line.ingredient_id ? String(line.ingredient_id) : String(line.line_name);
      const lineRequired = round4(
        Number(line.quantity || 0) * scale * (1 + Number(line.wastage_percent || 0) / 100)
      );
      const bucket = totals.get(key) || {
        ingredient_id: line.ingredient_id ? String(line.ingredient_id) : null,
        ingredient_name: String(line.line_name || "Ingredient"),
        required_qty: 0,
        unit: String(line.unit || "kg"),
      };
      bucket.required_qty = round4(bucket.required_qty + lineRequired);
      totals.set(key, bucket);
    }
  }

  return [...totals.values()];
}

export async function enrichIngredientShortages(
  supabase: SupabaseClient,
  companyId: string,
  requirements: Omit<IngredientRequirementRow, "available_qty" | "shortfall" | "has_shortage">[]
): Promise<IngredientRequirementRow[]> {
  const ingredientIds = requirements.map((row) => row.ingredient_id).filter(Boolean) as string[];
  const { data: stockItems } = ingredientIds.length
    ? await supabase
        .from("vyron_cost_stock_items")
        .select("entity_id, qty_on_hand")
        .eq("company_id", companyId)
        .eq("entity_type", "ingredient")
        .in("entity_id", ingredientIds)
    : { data: [] };

  const stockByIngredient = new Map<string, number>();
  for (const item of stockItems || []) {
    if (item.entity_id) stockByIngredient.set(String(item.entity_id), Number(item.qty_on_hand || 0));
  }

  return requirements.map((row) => {
    const available = row.ingredient_id ? stockByIngredient.get(row.ingredient_id) || 0 : 0;
    const shortfall = round4(Math.max(0, row.required_qty - available));
    return {
      ...row,
      available_qty: round4(available),
      shortfall,
      has_shortage: shortfall > 0.0001,
    };
  });
}

export async function getProductionPlanWithBom(
  supabase: SupabaseClient,
  companyId: string
) {
  const demand = await consolidateStoreOrderDemand(supabase, companyId);
  const productBom = await loadProductBomMap(supabase, companyId);
  const ingredientBase = buildIngredientRequirements(
    demand.map((row) => ({ product_id: row.product_id, planned_qty: row.planned_qty })),
    productBom
  );
  const ingredients = await enrichIngredientShortages(supabase, companyId, ingredientBase);
  return { demand, ingredients };
}

export async function listStoreProductionRuns(
  supabase: SupabaseClient,
  companyId: string,
  filters?: { status?: string }
) {
  let query = supabase
    .from("vyron_cost_store_production_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return (data || []) as StoreProductionRunRow[];
}

export async function getStoreProductionRunDetail(
  supabase: SupabaseClient,
  companyId: string,
  runId: string
): Promise<StoreProductionRunRow | null> {
  const { data: run, error } = await supabase
    .from("vyron_cost_store_production_runs")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!run) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_store_production_run_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("production_run_id", runId)
    .order("sort_order", { ascending: true });

  if (lineError) throw new Error(lineError.message);

  const mappedLines = (lines || []).map((line) => mapRunLine(line as Record<string, unknown>));
  const productBom = await loadProductBomMap(supabase, companyId);
  const ingredientBase = buildIngredientRequirements(
    mappedLines.map((line) => ({ product_id: line.product_id, planned_qty: line.planned_qty })),
    productBom
  );
  const ingredient_requirements = await enrichIngredientShortages(supabase, companyId, ingredientBase);

  return {
    ...(run as StoreProductionRunRow),
    lines: mappedLines,
    ingredient_requirements,
  };
}

export async function createStoreProductionRun(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    production_date?: string;
    notes?: string | null;
    created_by?: string | null;
    lines: ConsolidatedDemandRow[];
  }
) {
  if (!input.lines.length) throw new Error("At least one production line is required.");

  const now = new Date().toISOString();
  const runId = randomUUID();
  const runNumber = `PR-${Date.now().toString().slice(-8)}`;
  const productionDate = input.production_date || new Date().toISOString().slice(0, 10);
  const totalCost = round2(input.lines.reduce((sum, line) => sum + line.total_cost, 0));

  const { error: headerError } = await supabase.from("vyron_cost_store_production_runs").insert({
    id: runId,
    company_id: companyId,
    run_number: runNumber,
    production_date: productionDate,
    status: "Draft",
    notes: input.notes?.trim() || null,
    created_by: input.created_by?.trim() || null,
    total_cost: totalCost,
    created_at: now,
    updated_at: now,
  });

  if (headerError) throw new Error(headerError.message);

  const { error: lineError } = await supabase.from("vyron_cost_store_production_run_lines").insert(
    input.lines.map((line, index) => ({
      id: randomUUID(),
      company_id: companyId,
      production_run_id: runId,
      product_id: line.product_id,
      product_name: line.product_name,
      required_qty: line.required_qty,
      planned_qty: line.planned_qty,
      produced_qty: 0,
      unit_cost: line.unit_cost,
      total_cost: line.total_cost,
      store_contributions: line.store_contributions,
      sort_order: index,
      created_at: now,
      updated_at: now,
    }))
  );

  if (lineError) throw new Error(lineError.message);

  const detail = await getStoreProductionRunDetail(supabase, companyId, runId);
  if (!detail) throw new Error("Production run not found after create.");
  return detail;
}

export async function getProductionPlanningStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProductionPlanningStats> {
  const demand = await consolidateStoreOrderDemand(supabase, companyId);
  const productionRequiredToday = round2(
    demand.reduce((sum, row) => sum + row.required_qty, 0)
  );

  const [{ count: productionRunsOpen }, plan] = await Promise.all([
    supabase
      .from("vyron_cost_store_production_runs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", ["Draft", "Planned", "Released"]),
    getProductionPlanWithBom(supabase, companyId),
  ]);

  const rawMaterialShortages = plan.ingredients.filter((row) => row.has_shortage).length;

  return {
    productionRequiredToday,
    productionRunsOpen: productionRunsOpen || 0,
    rawMaterialShortages,
  };
}
