import type { SupabaseClient } from "@supabase/supabase-js";
import { calcLineCost, type BomHeader, type BomLine } from "@/lib/vyron-cost-bom-data";
import { VYRON_DEFAULT_TENANT_ID } from "@/lib/vyron-documents";
import {
  findOrCreateStockItem,
  postStockMovement,
  writeInventoryAudit,
  type StockEntityType,
} from "@/lib/vyron-inventory";
import { postInventoryTransaction } from "@/lib/vyron-inventory-transactions";

export const PRODUCTION_STATUSES = ["Planned", "Approved", "In Production", "Completed", "Cancelled", "Reversed"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];

export const WASTE_REASONS = ["Production Error", "Damage", "Spoilage", "Shrinkage", "Other"] as const;
export const OVERHEAD_TYPES = ["Electricity", "Rent", "Factory Overheads"] as const;
export const ALLOCATION_METHODS = ["Per Unit", "Per Run", "Percentage"] as const;

export type StockShortage = {
  ingredient: string;
  lineType: string;
  required: number;
  available: number;
  shortfall: number;
  unit: string;
};

export type ProductionRunRow = {
  id: string;
  company_id: string;
  run_number: string;
  bom_id: string | null;
  recipe_id: string | null;
  product_id: string | null;
  bom_name_snapshot: string;
  product_name_snapshot: string | null;
  status: ProductionStatus;
  batch_multiplier: number;
  planned_qty: number;
  actual_qty: number;
  yield_pct: number;
  yield_status: string | null;
  wastage_pct: number;
  ingredient_cost: number;
  packaging_cost: number;
  labour_cost: number;
  overhead_cost: number;
  ingredient_waste_value: number;
  packaging_waste_value: number;
  total_production_cost: number;
  cost_per_unit: number;
  planned_cost: number;
  actual_cost: number;
  cost_variance_pct: number;
  planned_usage_value: number;
  actual_usage_value: number;
  usage_variance_pct: number;
  production_efficiency_pct: number;
  stock_override: boolean;
  stock_override_by: string | null;
  stock_override_reason: string | null;
  notes: string | null;
  created_by: string | null;
  approved_by: string | null;
  started_by: string | null;
  completed_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  lines?: ProductionRunLineRow[];
  labour?: ProductionLabourRow[];
  overhead?: ProductionOverheadRow[];
  wastage?: ProductionWastageRow[];
  audit?: ProductionAuditRow[];
};

export type ProductionRunLineRow = {
  id: string;
  line_type: string;
  ingredient_id: string | null;
  stock_item_id: string | null;
  line_name: string;
  unit: string;
  planned_qty: number;
  actual_qty: number;
  unit_cost: number;
  planned_value: number;
  actual_value: number;
};

export type ProductionLabourRow = {
  id: string;
  description: string;
  hours: number;
  rate: number;
  labour_cost: number;
};

export type ProductionOverheadRow = {
  id: string;
  overhead_type: string;
  allocation_method: string;
  amount: number;
  percent_value: number | null;
  allocated_cost: number;
};

export type ProductionWastageRow = {
  id: string;
  waste_category: string;
  line_name: string;
  waste_qty: number;
  waste_value: number;
  waste_reason: string;
};

export type ProductionAuditRow = {
  id: string;
  event_type: string;
  actor: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  detail: string | null;
  created_at: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/**
 * Quantities are stored to six decimals, and recipes genuinely use them —
 * 0.006250 kg of salmon is not 0.0063. Rounding a quantity to four decimals
 * consumes the wrong amount of stock, so quantity maths rounds at six.
 * Money keeps round2/round4; this is only for quantities.
 */
function roundQty(n: number) {
  return Math.round(n * 1000000) / 1000000;
}

/** Unit costs are stored to eight decimals (R1.7414892 is a real rate). */
function roundCost(n: number) {
  return Math.round(n * 100000000) / 100000000;
}

export function calcYieldStatus(yieldPct: number): string {
  if (yieldPct < 95) return "Under Yield";
  if (yieldPct > 105) return "Above Yield";
  return "On Target";
}

export function calcYieldPct(planned: number, actual: number) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return round2((actual / planned) * 100);
}

export function calcVariancePct(planned: number, actual: number) {
  if (planned <= 0) return 0;
  return round2(((actual - planned) / planned) * 100);
}

export async function writeProductionAudit(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    productionRunId: string;
    eventType: string;
    actor?: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    detail?: string;
  }
) {
  await supabase.from("vyron_cost_production_audit_log").insert({
    company_id: params.companyId,
    production_run_id: params.productionRunId,
    event_type: params.eventType,
    actor: params.actor || "system",
    field_name: params.fieldName || null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    detail: params.detail || null,
  });
}

export async function loadBomSource(
  supabase: SupabaseClient,
  companyId: string,
  bomId: string
): Promise<{ bom: BomHeader; lines: BomLine[]; productId: string | null; productName: string | null; fromRecipe: boolean } | null> {
  const { data: bom } = await supabase
    .from("vyron_cost_boms")
    .select("*")
    .eq("id", bomId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (bom) {
    const { data: lines } = await supabase
      .from("vyron_cost_bom_lines")
      .select("*")
      .eq("bom_id", bomId)
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });
    let productName: string | null = null;
    if (bom.product_id) {
      const { data: prod } = await supabase
        .from("vyron_cost_products")
        .select("product_name")
        .eq("id", bom.product_id)
        .eq("company_id", companyId)
        .maybeSingle();
      productName = prod?.product_name ? String(prod.product_name) : null;
    }
    return {
      bom: bom as BomHeader,
      lines: (lines || []) as BomLine[],
      productId: (bom.product_id as string) || null,
      productName,
      fromRecipe: false,
    };
  }

  const { data: recipe } = await supabase
    .from("vyron_cost_recipes")
    .select("*")
    .eq("id", bomId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!recipe) return null;

  const { data: items } = await supabase
    .from("vyron_cost_recipe_items")
    .select("*")
    .eq("recipe_id", bomId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  const lines: BomLine[] = (items || []).map((item, idx) => ({
    id: String(item.id),
    bom_id: bomId,
    line_type: "Ingredient",
    ingredient_id: item.ingredient_id as string | null,
    line_name: String(item.ingredient_name_snapshot),
    quantity: Number(item.quantity || 0),
    unit: String(item.unit || "kg"),
    unit_cost: Number(item.true_unit_cost || 0),
    wastage_percent: 0,
    line_cost: Number(item.line_cost || item.quantity * item.true_unit_cost || 0),
    sort_order: idx,
  }));

  const { data: link } = await supabase
    .from("vyron_cost_product_recipe_links")
    .select("product_id, vyron_cost_products(product_name)")
    .eq("recipe_id", bomId)
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  const productName =
    link && typeof link.vyron_cost_products === "object" && link.vyron_cost_products !== null
      ? String((link.vyron_cost_products as { product_name?: string }).product_name || "")
      : null;

  return {
    bom: {
      id: bomId,
      bom_name: String(recipe.recipe_name),
      yield_qty: Number(recipe.yield_qty || 1),
      yield_unit: "unit",
      total_cost: Number(recipe.total_cost || 0),
      cost_per_unit: Number(recipe.total_cost || 0) / Math.max(1, Number(recipe.yield_qty || 1)),
    },
    lines,
    productId: (link?.product_id as string) || null,
    productName,
    fromRecipe: true,
  };
}

export function scaleBomRequirements(
  lines: BomLine[],
  batchMultiplier: number
): Array<{
  line_type: string;
  ingredient_id: string | null;
  line_name: string;
  unit: string;
  planned_qty: number;
  unit_cost: number;
  planned_value: number;
}> {
  return lines
    .filter((l) => ["Ingredient", "Packaging"].includes(String(l.line_type)))
    .map((line, idx) => {
      // Six decimals for the quantity, eight for the cost — the precision the
      // BOM columns actually hold, so a scaled requirement matches the recipe.
      const qty = roundQty(Number(line.quantity || 0) * batchMultiplier);
      const unitCost = roundCost(Number(line.unit_cost || 0));
      const plannedValue = round2(calcLineCost({ quantity: qty, unit_cost: unitCost, wastage_percent: line.wastage_percent }));
      return {
        line_type: String(line.line_type),
        ingredient_id: line.ingredient_id || null,
        line_name: line.line_name,
        unit: line.unit || "kg",
        planned_qty: qty,
        unit_cost: unitCost,
        planned_value: plannedValue,
        sort_order: idx,
      };
    });
}

export async function resolveStockItemForLine(
  supabase: SupabaseClient,
  companyId: string,
  line: { line_type: string; ingredient_id: string | null; line_name: string; unit: string; unit_cost: number }
) {
  const entityType: StockEntityType =
    line.line_type === "Packaging" ? "packaging" : "ingredient";

  if (line.ingredient_id) {
    const { data: stock } = await supabase
      .from("vyron_cost_stock_items")
      .select("id, qty_on_hand, average_cost, current_cost")
      .eq("company_id", companyId)
      .eq("entity_id", line.ingredient_id)
      .maybeSingle();
    if (stock) return stock;
    const { data: ing } = await supabase
      .from("vyron_cost_ingredients")
      .select("id, ingredient_name, category, purchase_unit, purchase_cost")
      .eq("id", line.ingredient_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (ing) {
      const created = await findOrCreateStockItem(supabase, companyId, {
        entityType,
        entityId: ing.id as string,
        itemCode: `ING-${String(ing.id).slice(0, 8).toUpperCase()}`,
        description: String(ing.ingredient_name),
        category: String(ing.category || "Ingredient"),
        unit: String(ing.purchase_unit || line.unit),
        currentCost: Number(ing.purchase_cost || line.unit_cost),
      });
      return { id: created.id, qty_on_hand: created.qty_on_hand, average_cost: created.average_cost, current_cost: created.current_cost };
    }
  }

  const { data: byName } = await supabase
    .from("vyron_cost_stock_items")
    .select("id, qty_on_hand, average_cost, current_cost")
    .eq("company_id", companyId)
    .eq("entity_type", entityType)
    .ilike("description", line.line_name)
    .limit(1)
    .maybeSingle();
  return byName;
}

export async function validateProductionStock(
  supabase: SupabaseClient,
  companyId: string,
  runId: string
): Promise<{ ok: boolean; shortages: StockShortage[] }> {
  const { data: run } = await supabase
    .from("vyron_cost_production_runs")
    .select("id")
    .eq("id", runId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!run) return { ok: false, shortages: [] };

  const { data: lines } = await supabase
    .from("vyron_cost_production_run_lines")
    .select("*")
    .eq("production_run_id", runId)
    .eq("company_id", companyId);

  const shortages: StockShortage[] = [];
  for (const line of lines || []) {
    let available = 0;
    if (line.stock_item_id) {
      const { data: stockRow } = await supabase
        .from("vyron_cost_stock_items")
        .select("qty_on_hand")
        .eq("id", line.stock_item_id)
        .eq("company_id", companyId)
        .maybeSingle();
      available = Number(stockRow?.qty_on_hand || 0);
    } else {
      const stock = await resolveStockItemForLine(supabase, companyId, {
        line_type: line.line_type,
        ingredient_id: line.ingredient_id,
        line_name: line.line_name,
        unit: line.unit,
        unit_cost: line.unit_cost,
      });
      available = Number(stock?.qty_on_hand || 0);
    }
    const required = Number(line.planned_qty || 0);
    if (required > available + 0.0001) {
      shortages.push({
        ingredient: line.line_name,
        lineType: line.line_type,
        required,
        available,
        shortfall: round4(required - available),
        unit: line.unit,
      });
    }
  }
  return { ok: shortages.length === 0, shortages };
}

function calcOverheadAllocated(
  row: { allocation_method: string; amount: number; percent_value?: number | null },
  baseCost: number,
  plannedQty: number,
  actualQty: number
) {
  const qty = actualQty > 0 ? actualQty : plannedQty;
  if (row.allocation_method === "Per Unit") return round2(row.amount * qty);
  if (row.allocation_method === "Percentage") return round2(baseCost * (Number(row.percent_value || row.amount) / 100));
  return round2(row.amount);
}

export async function listProductionRuns(
  supabase: SupabaseClient,
  companyId = VYRON_DEFAULT_TENANT_ID,
  filters?: { status?: string; search?: string; limit?: number }
) {
  let query = supabase
    .from("vyron_cost_production_runs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 200);
  if (filters?.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data || []) as ProductionRunRow[];
  if (filters?.search?.trim()) {
    const t = filters.search.trim().toLowerCase();
    rows = rows.filter((r) =>
      [r.run_number, r.bom_name_snapshot, r.product_name_snapshot || ""].join(" ").toLowerCase().includes(t)
    );
  }
  return rows;
}

export async function getProductionRun(
  supabase: SupabaseClient,
  runId: string,
  companyId?: string
): Promise<ProductionRunRow | null> {
  let query = supabase.from("vyron_cost_production_runs").select("*").eq("id", runId);
  if (companyId) query = query.eq("company_id", companyId);
  const { data: run, error } = await query.maybeSingle();
  if (error || !run) return null;

  const [lines, labour, overhead, wastage, audit] = await Promise.all([
    supabase.from("vyron_cost_production_run_lines").select("*").eq("production_run_id", runId).order("sort_order"),
    supabase.from("vyron_cost_production_labour").select("*").eq("production_run_id", runId),
    supabase.from("vyron_cost_production_overhead").select("*").eq("production_run_id", runId),
    supabase.from("vyron_cost_production_wastage").select("*").eq("production_run_id", runId),
    supabase
      .from("vyron_cost_production_audit_log")
      .select("*")
      .eq("production_run_id", runId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return {
    ...(run as ProductionRunRow),
    lines: (lines.data || []) as ProductionRunLineRow[],
    labour: (labour.data || []) as ProductionLabourRow[],
    overhead: (overhead.data || []) as ProductionOverheadRow[],
    wastage: (wastage.data || []) as ProductionWastageRow[],
    audit: (audit.data || []) as ProductionAuditRow[],
  };
}

export type CreateProductionRunInput = {
  bom_id: string;
  product_id?: string | null;
  batch_multiplier?: number;
  planned_qty?: number;
  notes?: string;
  created_by?: string;
  labour?: Array<{ description?: string; hours: number; rate: number }>;
  overhead?: Array<{
    overhead_type: string;
    allocation_method: string;
    amount: number;
    percent_value?: number;
  }>;
};

export async function createProductionRun(
  supabase: SupabaseClient,
  companyId: string,
  input: CreateProductionRunInput
): Promise<ProductionRunRow> {
  const source = await loadBomSource(supabase, companyId, input.bom_id);
  if (!source) throw new Error("Recipe / BOM not found.");

  const yieldQty = Math.max(0.0001, Number(source.bom.yield_qty || 1));
  const multiplier = input.batch_multiplier ?? (input.planned_qty ? input.planned_qty / yieldQty : 1);
  const plannedQty = roundQty(input.planned_qty ?? yieldQty * multiplier);
  const scaled = scaleBomRequirements(source.lines, multiplier);

  /*
   * A run built from a BOM with no consumable lines can never consume stock, so
   * it would complete "successfully" having posted nothing. Refuse it at source
   * rather than let it become a run that silently does nothing.
   */
  if (!scaled.some((l) => l.line_type === "Ingredient" || l.line_type === "Packaging")) {
    throw new Error(
      `${source.bom.bom_name || "This BOM"} has no ingredient or packaging lines, so a production run would not consume any stock. Add lines to the BOM first.`
    );
  }

  const ingredientPlanned = scaled.filter((l) => l.line_type === "Ingredient").reduce((s, l) => s + l.planned_value, 0);
  const packagingPlanned = scaled.filter((l) => l.line_type === "Packaging").reduce((s, l) => s + l.planned_value, 0);
  const labourRows = input.labour?.length
    ? input.labour
    : source.lines
        .filter((l) => l.line_type === "Labour")
        .map((l) => ({
          description: l.line_name,
          hours: l.unit === "hour" ? Number(l.quantity) : 1,
          rate: l.unit === "hour" ? Number(l.unit_cost) : Number(l.line_cost || l.quantity * l.unit_cost),
        }));

  const labourCost = round2(labourRows.reduce((s, r) => s + round2(r.hours * r.rate), 0));
  const baseForOverhead = ingredientPlanned + packagingPlanned + labourCost;
  const overheadRows = (input.overhead || []).map((o) => ({
    ...o,
    allocated_cost: calcOverheadAllocated(o, baseForOverhead, plannedQty, 0),
  }));
  const overheadCost = round2(overheadRows.reduce((s, o) => s + o.allocated_cost, 0));
  const plannedCost = round2(ingredientPlanned + packagingPlanned + labourCost + overheadCost);
  const costPerUnit = plannedQty > 0 ? round4(plannedCost / plannedQty) : 0;

  const runNumber = `PR-${Date.now().toString().slice(-8)}`;
  const productId = input.product_id || source.productId;

  const { data: header, error } = await supabase
    .from("vyron_cost_production_runs")
    .insert({
      company_id: companyId,
      run_number: runNumber,
      bom_id: source.fromRecipe ? null : source.bom.id,
      recipe_id: source.fromRecipe ? input.bom_id : null,
      product_id: productId,
      bom_name_snapshot: source.bom.bom_name || "BOM",
      product_name_snapshot: source.productName,
      status: "Planned",
      batch_multiplier: multiplier,
      planned_qty: plannedQty,
      planned_cost: plannedCost,
      ingredient_cost: ingredientPlanned,
      packaging_cost: packagingPlanned,
      labour_cost: labourCost,
      overhead_cost: overheadCost,
      total_production_cost: plannedCost,
      cost_per_unit: costPerUnit,
      planned_usage_value: round2(ingredientPlanned + packagingPlanned),
      notes: input.notes || null,
      created_by: input.created_by || "user",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const runId = header.id as string;
  for (let i = 0; i < scaled.length; i++) {
    const line = scaled[i];
    const stock = await resolveStockItemForLine(supabase, companyId, line);
    const { error: lineErr } = await supabase.from("vyron_cost_production_run_lines").insert({
      company_id: companyId,
      production_run_id: runId,
      line_type: line.line_type,
      ingredient_id: line.ingredient_id,
      stock_item_id: stock?.id || null,
      line_name: line.line_name,
      unit: line.unit,
      planned_qty: line.planned_qty,
      actual_qty: line.planned_qty,
      unit_cost: line.unit_cost,
      planned_value: line.planned_value,
      actual_value: line.planned_value,
      sort_order: i,
    });
    // A swallowed failure here leaves a run that consumes nothing on completion.
    if (lineErr) throw new Error(`Could not add "${line.line_name}" to the production run: ${lineErr.message}`);
  }

  for (const lb of labourRows) {
    await supabase.from("vyron_cost_production_labour").insert({
      company_id: companyId,
      production_run_id: runId,
      description: lb.description || "Direct Labour",
      hours: lb.hours,
      rate: lb.rate,
      labour_cost: round2(lb.hours * lb.rate),
    });
  }

  for (const oh of overheadRows) {
    await supabase.from("vyron_cost_production_overhead").insert({
      company_id: companyId,
      production_run_id: runId,
      overhead_type: oh.overhead_type,
      allocation_method: oh.allocation_method,
      amount: oh.amount,
      percent_value: oh.percent_value ?? null,
      allocated_cost: oh.allocated_cost,
    });
  }

  await writeProductionAudit(supabase, {
    companyId,
    productionRunId: runId,
    eventType: "Production Run Created",
    actor: input.created_by,
    detail: `Run ${runNumber} planned for ${plannedQty} units from ${source.bom.bom_name}`,
  });

  return (await getProductionRun(supabase, runId, companyId)) as ProductionRunRow;
}

export async function transitionProductionRun(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  action: "approve" | "start" | "cancel",
  actor = "user"
) {
  const run = await getProductionRun(supabase, runId, companyId);
  if (!run) throw new Error("Production run not found.");

  const transitions: Record<string, { from: ProductionStatus[]; to: ProductionStatus; fields: Record<string, unknown> }> = {
    approve: {
      from: ["Planned"],
      to: "Approved",
      fields: { approved_by: actor, approved_at: new Date().toISOString() },
    },
    start: {
      from: ["Planned", "Approved"],
      to: "In Production",
      fields: { started_by: actor, started_at: new Date().toISOString() },
    },
    cancel: {
      from: ["Planned", "Approved", "In Production"],
      to: "Cancelled",
      fields: { cancelled_at: new Date().toISOString() },
    },
  };

  const t = transitions[action];
  if (!t.from.includes(run.status)) throw new Error(`Cannot ${action} from status ${run.status}.`);

  if (action === "start") {
    const stockCheck = await validateProductionStock(supabase, run.company_id, runId);
    if (!stockCheck.ok) {
      throw new Error(`Stock shortage: ${stockCheck.shortages.length} line(s) below required quantity. Approve with awareness or add stock before starting.`);
    }
  }

  const startFromPlannedFields =
    action === "start" && run.status === "Planned"
      ? { approved_by: actor, approved_at: new Date().toISOString() }
      : {};

  await supabase
    .from("vyron_cost_production_runs")
    .update({ status: t.to, ...startFromPlannedFields, ...t.fields, updated_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("company_id", companyId);

  await writeProductionAudit(supabase, {
    companyId: run.company_id,
    productionRunId: runId,
    eventType: `Production ${action === "approve" ? "Approved" : action === "start" ? "Started" : "Cancelled"}`,
    actor,
    fieldName: "status",
    oldValue: run.status,
    newValue: t.to,
  });

  return getProductionRun(supabase, runId, companyId);
}

export type CompleteProductionInput = {
  actual_qty: number;
  line_actuals?: Array<{ line_id: string; actual_qty: number }>;
  wastage?: Array<{
    waste_category: string;
    line_name: string;
    waste_qty: number;
    waste_value: number;
    waste_reason: string;
  }>;
  stock_override?: boolean;
  stock_override_reason?: string;
  completed_by?: string;
};

export async function completeProductionRun(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  input: CompleteProductionInput
) {
  const run = await getProductionRun(supabase, runId, companyId);
  if (!run) throw new Error("Production run not found.");
  if (run.status !== "In Production" && run.status !== "Approved") {
    throw new Error(`Cannot complete from status ${run.status}. Start production first.`);
  }

  /*
   * A run with nothing to consume and nothing to receive would post no stock at
   * all, yet still be marked Completed — which is exactly how a completed run
   * leaves the Stock Master untouched. Refuse it rather than report a success
   * that moved nothing.
   */
  const consumable = (run.lines || []).filter(
    (l) => (l.line_type === "Ingredient" || l.line_type === "Packaging") && Number(l.planned_qty || 0) > 0
  );
  if (!consumable.length && !run.product_id) {
    throw new Error(
      `${run.run_number} has no ingredient or packaging lines and no linked product, so completing it would not move any stock. Check the BOM this run was created from.`
    );
  }

  const stockCheck = await validateProductionStock(supabase, run.company_id, runId);
  if (!stockCheck.ok && !input.stock_override) {
    const err = new Error("STOCK_SHORTAGE");
    (err as Error & { shortages: StockShortage[] }).shortages = stockCheck.shortages;
    throw err;
  }

  const actualQty = roundQty(input.actual_qty);
  const yieldPct = calcYieldPct(Number(run.planned_qty), actualQty);
  const yieldStatus = calcYieldStatus(yieldPct);
  const actor = input.completed_by || "user";

  let ingredientActual = 0;
  let packagingActual = 0;
  let actualUsage = 0;

  /*
   * Postgres gives us no transaction across these separate posts, so completion
   * tracks what it has already moved. If any later post fails, everything
   * already consumed is put back before the error propagates — the run is never
   * left half-consumed, and it is never marked Completed either, because the
   * status update happens only after all posting has succeeded.
   */
  const posted: Array<{ stockItemId: string; quantity: number; unitCost: number; lineName: string }> = [];
  async function compensatePostedStock() {
    for (const p of posted.reverse()) {
      try {
        await postStockMovement(supabase, {
          companyId: run!.company_id,
          stockItemId: p.stockItemId,
          movementType: "Production Reversal",
          quantityIn: p.quantity,
          unitCost: p.unitCost,
          referenceType: "production_run_rollback",
          referenceId: runId,
          referenceLabel: run!.run_number,
          actor,
          metadata: { reason: "Completion failed — stock restored", line_name: p.lineName },
        });
      } catch {
        // Keep restoring the rest even if one line cannot be put back.
      }
    }
  }

  try {
  for (const line of run.lines || []) {
    const override = input.line_actuals?.find((l) => l.line_id === line.id);
    const actualLineQty = roundQty(override?.actual_qty ?? line.planned_qty);
    const unitCost = Number(line.unit_cost || 0);
    const actualValue = round2(actualLineQty * unitCost);

    await supabase
      .from("vyron_cost_production_run_lines")
      .update({ actual_qty: actualLineQty, actual_value: actualValue })
      .eq("id", line.id)
      .eq("company_id", companyId);

    if (line.line_type === "Ingredient") ingredientActual += actualValue;
    else if (line.line_type === "Packaging") packagingActual += actualValue;
    actualUsage += actualValue;

    let stockItemId = line.stock_item_id;
    if (!stockItemId) {
      const stock = await resolveStockItemForLine(supabase, run.company_id, {
        line_type: line.line_type,
        ingredient_id: line.ingredient_id,
        line_name: line.line_name,
        unit: line.unit,
        unit_cost: unitCost,
      });
      stockItemId = stock?.id as string | null;
    }
    if (stockItemId && actualLineQty > 0) {
      const avgCost = unitCost;
      const entityType: StockEntityType =
        line.line_type === "Packaging" ? "packaging" : "ingredient";
      await postInventoryTransaction(supabase, {
        companyId: run.company_id,
        transactionType: "Consumption",
        entityType,
        entityId: line.ingredient_id || null,
        stockItemId,
        quantity: actualLineQty,
        unitCost: avgCost,
        referenceType: "production_run",
        referenceId: runId,
        referenceLabel: run.run_number,
        createdBy: actor,
        notes: `Consumed ${actualLineQty} ${line.unit} for ${run.run_number}`,
        allowNegative: Boolean(input.stock_override),
      });
      posted.push({ stockItemId, quantity: actualLineQty, unitCost: avgCost, lineName: line.line_name });
      await writeInventoryAudit(supabase, {
        companyId: run.company_id,
        stockItemId,
        eventType: "Production Consumption",
        actor,
        detail: `Consumed ${actualLineQty} ${line.unit} for ${run.run_number}`,
        referenceType: "production_run",
        referenceId: runId,
      });
    }
  }
  } catch (postErr) {
    await compensatePostedStock();
    throw postErr;
  }

  let wasteIng = 0;
  let wastePkg = 0;
  let totalWasteQty = 0;
  await supabase.from("vyron_cost_production_wastage").delete().eq("production_run_id", runId).eq("company_id", companyId);
  for (const w of input.wastage || []) {
    await supabase.from("vyron_cost_production_wastage").insert({
      company_id: run.company_id,
      production_run_id: runId,
      waste_category: w.waste_category,
      line_name: w.line_name,
      waste_qty: w.waste_qty,
      waste_value: w.waste_value,
      waste_reason: w.waste_reason,
    });
    totalWasteQty += w.waste_qty;
    if (w.waste_category === "Packaging") wastePkg += w.waste_value;
    else wasteIng += w.waste_value;
  }

  const labourCost = round2((run.labour || []).reduce((s, l) => s + Number(l.labour_cost || 0), 0));
  const materialBase = ingredientActual + packagingActual;
  const overheadCost = round2(
    (run.overhead || []).reduce(
      (s, o) => s + calcOverheadAllocated(o, materialBase + labourCost, Number(run.planned_qty), actualQty),
      0
    )
  );

  const actualCost = round2(ingredientActual + packagingActual + labourCost + overheadCost + wasteIng + wastePkg);
  const costPerUnit = actualQty > 0 ? round4(actualCost / actualQty) : 0;
  const wastagePct =
    actualUsage > 0 ? round2(((wasteIng + wastePkg) / (actualUsage + wasteIng + wastePkg)) * 100) : 0;
  const costVarPct = calcVariancePct(Number(run.planned_cost), actualCost);
  const usageVarPct = calcVariancePct(Number(run.planned_usage_value), actualUsage);
  const efficiency =
    Number(run.planned_cost) > 0 ? round2((Number(run.planned_cost) / Math.max(actualCost, 0.01)) * 100) : 100;

  if (run.product_id && actualQty > 0) {
    await supabase
      .from("vyron_cost_products")
      .update({ total_cost: costPerUnit })
      .eq("id", run.product_id)
      .eq("company_id", companyId);

    const { data: fgStock } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", companyId)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", run.product_id)
      .maybeSingle();

    let fgId = fgStock?.id as string | undefined;
    if (!fgId) {
      const { data: prod } = await supabase
        .from("vyron_cost_products")
        .select("product_name, category")
        .eq("id", run.product_id)
        .eq("company_id", companyId)
        .maybeSingle();
      const created = await findOrCreateStockItem(supabase, run.company_id, {
        entityType: "finished_goods",
        entityId: run.product_id,
        itemCode: `FG-${String(run.product_id).slice(0, 8).toUpperCase()}`,
        description: String(prod?.product_name || run.product_name_snapshot || "Finished Good"),
        category: String(prod?.category || "Finished Goods"),
        unit: "unit",
        currentCost: costPerUnit,
      });
      fgId = created.id;
    }

    try {
      await postInventoryTransaction(supabase, {
        companyId: run.company_id,
        transactionType: "Receipt",
        entityType: "finished_goods",
        entityId: run.product_id,
        stockItemId: fgId,
        quantity: actualQty,
        unitCost: costPerUnit,
        referenceType: "production_run",
        referenceId: runId,
        referenceLabel: run.run_number,
        createdBy: actor,
        notes: `Production completion ${run.run_number}`,
      });
    } catch (fgErr) {
      // Receiving the finished goods failed, so the raw materials go back.
      await compensatePostedStock();
      throw fgErr;
    }
  }

  await supabase
    .from("vyron_cost_production_runs")
    .update({
      status: "Completed",
      actual_qty: actualQty,
      yield_pct: yieldPct,
      yield_status: yieldStatus,
      wastage_pct: wastagePct,
      ingredient_cost: ingredientActual,
      packaging_cost: packagingActual,
      labour_cost: labourCost,
      overhead_cost: overheadCost,
      ingredient_waste_value: wasteIng,
      packaging_waste_value: wastePkg,
      total_production_cost: actualCost,
      actual_cost: actualCost,
      cost_per_unit: costPerUnit,
      cost_variance_pct: costVarPct,
      actual_usage_value: actualUsage,
      usage_variance_pct: usageVarPct,
      production_efficiency_pct: efficiency,
      stock_override: Boolean(input.stock_override),
      stock_override_by: input.stock_override ? actor : null,
      stock_override_reason: input.stock_override_reason || null,
      completed_by: actor,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("company_id", companyId);

  await writeProductionAudit(supabase, {
    companyId: run.company_id,
    productionRunId: runId,
    eventType: "Production Completed",
    actor,
    detail: `Produced ${actualQty} units · yield ${yieldPct}% · cost ${actualCost}`,
    fieldName: "actual_qty",
    newValue: String(actualQty),
  });

  if (input.stock_override) {
    await writeProductionAudit(supabase, {
      companyId: run.company_id,
      productionRunId: runId,
      eventType: "Stock Override",
      actor,
      detail: input.stock_override_reason || "Completed despite stock shortage",
    });
  }

  const consumptionLines: Array<{
    itemId: string;
    itemName: string;
    itemType: "raw_material" | "packaging";
    qtyOut: number;
    unitCost: number;
  }> = [];
  for (const line of run.lines || []) {
    const override = input.line_actuals?.find((l) => l.line_id === line.id);
    const actualLineQty = round4(override?.actual_qty ?? line.planned_qty);
    if (actualLineQty <= 0) continue;
    consumptionLines.push({
      itemId: String(line.ingredient_id || line.stock_item_id || line.id),
      itemName: line.line_name,
      itemType: line.line_type === "Packaging" ? "packaging" : "raw_material",
      qtyOut: actualLineQty,
      unitCost: Number(line.unit_cost || 0),
    });
  }

  await syncManufacturingStockLayer(supabase, run.company_id, {
    runId,
    runNumber: run.run_number,
    runDate: new Date().toISOString().slice(0, 10),
    productId: run.product_id,
    productName: String(run.product_name_snapshot || "Finished Good"),
    actualQty,
    costPerUnit,
    consumptionLines,
  });

  return getProductionRun(supabase, runId, companyId);
}

async function findFinishedGoodForCompany(
  supabase: SupabaseClient,
  companyId: string,
  productName: string,
  productId?: string | null
) {
  if (productId) {
    const byId = await supabase
      .from("vyron_finished_goods")
      .select("*")
      .eq("id", productId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!byId.error && byId.data) return byId.data;
  }

  const byName = await supabase
    .from("vyron_finished_goods")
    .select("*")
    .eq("company_id", companyId)
    .ilike("product_name", productName)
    .limit(1)
    .maybeSingle();
  if (!byName.error && byName.data) return byName.data;

  const loose = await supabase.from("vyron_finished_goods").select("*").ilike("product_name", productName).limit(5);
  if (loose.error) return null;
  const rows = loose.data || [];
  if (!rows.some((row) => row.company_id != null && String(row.company_id).trim() !== "")) {
    return null;
  }
  return rows.find((row) => row.company_id === companyId) || null;
}

async function syncManufacturingStockLayer(
  supabase: SupabaseClient,
  companyId: string,
  params: {
    runId: string;
    runNumber: string;
    runDate: string;
    productId?: string | null;
    productName: string;
    actualQty: number;
    costPerUnit: number;
    consumptionLines: Array<{
      itemId: string;
      itemName: string;
      itemType: "raw_material" | "packaging";
      qtyOut: number;
      unitCost: number;
    }>;
  }
) {
  for (const line of params.consumptionLines) {
    await supabase.from("vyron_stock_movements").insert({
      company_id: companyId,
      movement_date: params.runDate,
      item_type: line.itemType,
      item_id: line.itemId,
      item_name: line.itemName,
      movement_type: "MANUFACTURING_CONSUMPTION",
      reference_number: params.runNumber,
      quantity_in: 0,
      quantity_out: line.qtyOut,
      unit_cost: line.unitCost,
      related_document_id: params.runId,
      notes: "Manufacturing batch completion",
    });
  }

  if (params.actualQty <= 0) return;

  const fg = await findFinishedGoodForCompany(supabase, companyId, params.productName, params.productId);
  if (fg) {
    const nextStock = round4(Number(fg.current_stock || 0) + params.actualQty);
    const nextValue = round2(nextStock * params.costPerUnit);
    await supabase
      .from("vyron_finished_goods")
      .update({
        current_stock: nextStock,
        stock_value: nextValue,
        latest_actual_cost: params.costPerUnit,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fg.id);
  }

  await supabase.from("vyron_stock_movements").insert({
    company_id: companyId,
    movement_date: params.runDate,
    item_type: "finished_good",
    item_id: fg?.id || params.runId,
    item_name: params.productName,
    movement_type: "MANUFACTURING_OUTPUT",
    reference_number: params.runNumber,
    quantity_in: params.actualQty,
    quantity_out: 0,
    unit_cost: params.costPerUnit,
    related_document_id: params.runId,
    notes: "Manufacturing batch completion",
  });
}

export async function reverseProductionRun(
  supabase: SupabaseClient,
  companyId: string,
  runId: string,
  input: { reason: string; actor?: string; supervisor?: boolean }
) {
  if (!input.supervisor) {
    throw new Error("Supervisor approval required to reverse a completed batch.");
  }

  const run = await getProductionRun(supabase, runId, companyId);
  if (!run) throw new Error("Production run not found.");
  if (run.status !== "Completed") throw new Error(`Cannot reverse from status ${run.status}.`);

  const actor = input.actor || "supervisor";
  const actualQty = Number(run.actual_qty || 0);

  for (const line of run.lines || []) {
    const actualLineQty = round4(Number(line.actual_qty || line.planned_qty || 0));
    if (actualLineQty <= 0) continue;
    const unitCost = Number(line.unit_cost || 0);
    let stockItemId = line.stock_item_id;
    if (!stockItemId) {
      const stock = await resolveStockItemForLine(supabase, run.company_id, {
        line_type: line.line_type,
        ingredient_id: line.ingredient_id,
        line_name: line.line_name,
        unit: line.unit,
        unit_cost: unitCost,
      });
      stockItemId = stock?.id as string | null;
    }
    if (stockItemId) {
      await postStockMovement(supabase, {
        companyId: run.company_id,
        stockItemId,
        movementType: "Production Reversal",
        quantityIn: actualLineQty,
        unitCost,
        referenceType: "production_run_reversal",
        referenceId: runId,
        referenceLabel: run.run_number,
        actor,
        metadata: { reason: input.reason, line_name: line.line_name },
      });
      await writeInventoryAudit(supabase, {
        companyId: run.company_id,
        stockItemId,
        eventType: "Production Reversal",
        actor,
        detail: `Restored ${actualLineQty} ${line.unit} — ${input.reason}`,
        referenceType: "production_run",
        referenceId: runId,
      });
    }

    await supabase.from("vyron_stock_movements").insert({
      company_id: run.company_id,
      movement_date: new Date().toISOString().slice(0, 10),
      item_type: line.line_type === "Packaging" ? "packaging" : "raw_material",
      item_id: String(line.ingredient_id || line.stock_item_id || line.id),
      item_name: line.line_name,
      movement_type: "MANUFACTURING_REVERSAL",
      reference_number: run.run_number,
      quantity_in: actualLineQty,
      quantity_out: 0,
      unit_cost: unitCost,
      related_document_id: runId,
      notes: input.reason,
    });
  }

  if (run.product_id && actualQty > 0) {
    const costPerUnit = Number(run.cost_per_unit || 0);
    const { data: fgStock } = await supabase
      .from("vyron_cost_stock_items")
      .select("id")
      .eq("company_id", run.company_id)
      .eq("entity_type", "finished_goods")
      .eq("entity_id", run.product_id)
      .maybeSingle();
    if (fgStock?.id) {
      await postStockMovement(supabase, {
        companyId: run.company_id,
        stockItemId: fgStock.id as string,
        movementType: "Production Reversal",
        quantityOut: actualQty,
        unitCost: costPerUnit,
        referenceType: "production_run_reversal",
        referenceId: runId,
        referenceLabel: run.run_number,
        actor,
        metadata: { reason: input.reason },
      });
    }

    const productName = String(run.product_name_snapshot || "Finished Good");
    const fg = await findFinishedGoodForCompany(supabase, companyId, productName, run.product_id);
    if (fg) {
      const nextStock = round4(Number(fg.current_stock || 0) - actualQty);
      const nextValue = round2(Math.max(0, nextStock) * costPerUnit);
      await supabase
        .from("vyron_finished_goods")
        .update({ current_stock: nextStock, stock_value: nextValue, updated_at: new Date().toISOString() })
        .eq("id", fg.id);
    }

    await supabase.from("vyron_stock_movements").insert({
      company_id: run.company_id,
      movement_date: new Date().toISOString().slice(0, 10),
      item_type: "finished_good",
      item_id: fg?.id || run.product_id,
      item_name: productName,
      movement_type: "MANUFACTURING_REVERSAL",
      reference_number: run.run_number,
      quantity_in: 0,
      quantity_out: actualQty,
      unit_cost: costPerUnit,
      related_document_id: runId,
      notes: input.reason,
    });
  }

  await supabase
    .from("vyron_cost_production_runs")
    .update({
      status: "Reversed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("company_id", companyId);

  await writeProductionAudit(supabase, {
    companyId: run.company_id,
    productionRunId: runId,
    eventType: "Production Reversed",
    actor,
    detail: input.reason,
    fieldName: "status",
    oldValue: "Completed",
    newValue: "Reversed",
  });

  return getProductionRun(supabase, runId, companyId);
}

export async function getManufacturingDashboardStats(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: runs } = await supabase
    .from("vyron_cost_production_runs")
    .select("*")
    .eq("company_id", companyId);

  const all = runs || [];
  const completed = all.filter((r) => r.status === "Completed");
  const weekCompleted = completed.filter((r) => r.completed_at && new Date(r.completed_at as string) >= weekStart);
  const monthCompleted = completed.filter((r) => r.completed_at && new Date(r.completed_at as string) >= monthStart);

  const productionThisWeek = weekCompleted.reduce((s, r) => s + Number(r.actual_qty || 0), 0);
  const productionThisMonth = monthCompleted.reduce((s, r) => s + Number(r.actual_qty || 0), 0);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const productionToday = completed
    .filter((r) => r.completed_at && new Date(r.completed_at as string) >= todayStart)
    .reduce((s, r) => s + Number(r.actual_qty || 0), 0);
  const productionCost = monthCompleted.reduce((s, r) => s + Number(r.actual_cost || 0), 0);

  const yields = monthCompleted.map((r) => Number(r.yield_pct || 0)).filter((y) => y > 0);
  const wastages = monthCompleted.map((r) => Number(r.wastage_pct || 0)).filter((w) => w >= 0);
  const avgYield = yields.length ? round2(yields.reduce((a, b) => a + b, 0) / yields.length) : 0;
  const avgWastage = wastages.length ? round2(wastages.reduce((a, b) => a + b, 0) / wastages.length) : 0;

  const ingredientUsage = monthCompleted.reduce((s, r) => s + Number(r.ingredient_cost || 0), 0);
  const packagingUsage = monthCompleted.reduce((s, r) => s + Number(r.packaging_cost || 0), 0);
  const finishedProduced = productionThisMonth;

  const varianceRuns = completed.filter((r) => Math.abs(Number(r.cost_variance_pct || 0)) >= 5);
  const productionVariances = varianceRuns.length;
  const efficiencies = monthCompleted.map((r) => Number(r.production_efficiency_pct || 0)).filter((e) => e > 0);
  const productionEfficiency = efficiencies.length
    ? round2(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length)
    : 0;

  const { data: fgItems } = await supabase
    .from("vyron_cost_stock_items")
    .select("inventory_value")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods");

  const finishedGoodsValue = round2((fgItems || []).reduce((s, i) => s + Number(i.inventory_value || 0), 0));

  return {
    productionToday,
    productionThisWeek,
    productionThisMonth,
    productionCost,
    yieldPct: avgYield,
    wastagePct: avgWastage,
    ingredientUsageValue: ingredientUsage,
    packagingUsageValue: packagingUsage,
    finishedGoodsProduced: finishedProduced,
    productionVariances,
    productionEfficiency,
    finishedGoodsValue,
    activeRuns: all.filter((r) => ["Planned", "Approved", "In Production"].includes(String(r.status))).length,
    completedRuns: completed.length,
  };
}

export async function getProductionVariances(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data } = await supabase
    .from("vyron_cost_production_runs")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "Completed")
    .order("completed_at", { ascending: false })
    .limit(50);

  return (data || []).map((r) => ({
    id: r.id,
    run_number: r.run_number,
    bom_name_snapshot: r.bom_name_snapshot,
    product_name_snapshot: r.product_name_snapshot,
    completed_at: r.completed_at,
    planned_cost: Number(r.planned_cost || 0),
    actual_cost: Number(r.actual_cost || 0),
    cost_variance_pct: Number(r.cost_variance_pct || 0),
    planned_qty: Number(r.planned_qty || 0),
    actual_qty: Number(r.actual_qty || 0),
    yield_pct: Number(r.yield_pct || 0),
    yield_status: r.yield_status,
    planned_usage_value: Number(r.planned_usage_value || 0),
    actual_usage_value: Number(r.actual_usage_value || 0),
    usage_variance_pct: Number(r.usage_variance_pct || 0),
    production_efficiency_pct: Number(r.production_efficiency_pct || 0),
  }));
}

export async function getFinishedGoodsDashboard(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data: items } = await supabase
    .from("vyron_cost_stock_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .order("description");

  const entityIds = Array.from(
    new Set((items || []).map((item) => String(item.entity_id || "")).filter(Boolean))
  );

  const { data: directProducts } = entityIds.length
    ? await supabase
        .from("vyron_cost_products")
        .select("id")
        .eq("company_id", companyId)
        .in("id", entityIds)
    : { data: [] as Array<{ id: string }> };

  const directProductIds = new Set((directProducts || []).map((row) => String(row.id)));

  let legacyMap = new Map<string, string>();
  const unresolvedIds = entityIds.filter((id) => !directProductIds.has(id));
  if (unresolvedIds.length) {
    try {
      const { data: legacyRows } = await supabase
        .from("vyron_finished_goods")
        .select("id, product_id")
        .eq("company_id", companyId)
        .in("id", unresolvedIds);

      legacyMap = new Map(
        (legacyRows || [])
          .map((row): [string, string] => [String(row.id), String(row.product_id || "")])
          .filter((entry) => Boolean(entry[1]))
      );
    } catch {
      legacyMap = new Map();
    }
  }

  return (items || []).map((item) => ({
    id: item.id,
    entity_id: item.entity_id,
    product_id: directProductIds.has(String(item.entity_id || ""))
      ? String(item.entity_id)
      : legacyMap.get(String(item.entity_id || "")) || null,
    item_code: item.item_code,
    description: item.description,
    qty_on_hand: Number(item.qty_on_hand || 0),
    average_cost: Number(item.average_cost || 0),
    inventory_value: Number(item.inventory_value || 0),
    unit: item.unit,
    stock_status: item.stock_status,
  }));
}

export type ProductionInsight = {
  severity: "high" | "medium" | "low";
  category: string;
  message: string;
  href?: string;
};

export async function generateProductionInsights(
  supabase: SupabaseClient,
  companyId = VYRON_DEFAULT_TENANT_ID
): Promise<ProductionInsight[]> {
  const insights: ProductionInsight[] = [];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: recent } = await supabase
    .from("vyron_cost_production_runs")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "Completed")
    .gte("completed_at", monthStart)
    .order("completed_at", { ascending: false });

  const runs = recent || [];
  for (const run of runs) {
    if (Number(run.yield_pct || 0) > 0 && Number(run.yield_pct) < 93) {
      insights.push({
        severity: "high",
        category: "Yield",
        message: `${run.bom_name_snapshot} production yield is ${run.yield_pct}% (${run.yield_status}) on run ${run.run_number}.`,
        href: `/manufacturing/runs/${run.id}`,
      });
    }
    if (Number(run.wastage_pct || 0) >= 8) {
      insights.push({
        severity: "medium",
        category: "Wastage",
        message: `Wastage on ${run.bom_name_snapshot} reached ${run.wastage_pct}% (R${Number(run.ingredient_waste_value || 0) + Number(run.packaging_waste_value || 0)} waste value).`,
        href: `/manufacturing/runs/${run.id}`,
      });
    }
    if (Math.abs(Number(run.cost_variance_pct || 0)) >= 10) {
      insights.push({
        severity: "high",
        category: "Cost",
        message: `Production cost on ${run.bom_name_snapshot} varied ${run.cost_variance_pct}% from plan (actual R${Number(run.actual_cost).toFixed(2)}).`,
        href: `/manufacturing/runs/${run.id}`,
      });
    }
  }

  const byBom = new Map<string, { yields: number[]; name: string }>();
  for (const run of runs) {
    const key = String(run.bom_id || run.bom_name_snapshot);
    if (!byBom.has(key)) byBom.set(key, { yields: [], name: String(run.bom_name_snapshot) });
    if (Number(run.yield_pct) > 0) byBom.get(key)!.yields.push(Number(run.yield_pct));
  }
  for (const [, agg] of byBom) {
    if (agg.yields.length >= 2) {
      const latest = agg.yields[0];
      const prior = agg.yields.slice(1);
      const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
      const drop = round2(priorAvg - latest);
      if (drop >= 5) {
        insights.push({
          severity: "high",
          category: "Yield Trend",
          message: `${agg.name} production yield dropped by ${drop}% compared to earlier runs this month.`,
          href: "/manufacturing/variances",
        });
      }
    }
  }

  const { data: wasteRows } = await supabase
    .from("vyron_cost_production_wastage")
    .select("line_name, waste_value, production_run_id")
    .eq("company_id", companyId);

  const wasteByLine = new Map<string, number>();
  for (const w of wasteRows || []) {
    const name = String(w.line_name);
    wasteByLine.set(name, (wasteByLine.get(name) || 0) + Number(w.waste_value || 0));
  }
  for (const [line, total] of wasteByLine) {
    if (total >= 500) {
      insights.push({
        severity: "medium",
        category: "Wastage Trend",
        message: `Wastage on ${line} increased to R${total.toLocaleString("en-ZA", { minimumFractionDigits: 0 })} this month.`,
        href: "/manufacturing/history",
      });
    }
  }

  return insights.slice(0, 12);
}

export async function getManufacturingExecutiveStats(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const dash = await getManufacturingDashboardStats(supabase, companyId);
  return {
    productionCost: dash.productionCost,
    yieldPct: dash.yieldPct,
    wastagePct: dash.wastagePct,
    finishedGoodsValue: dash.finishedGoodsValue,
    productionVariances: dash.productionVariances,
    productionEfficiency: dash.productionEfficiency,
  };
}

export async function listBomsForProduction(supabase: SupabaseClient, companyId = VYRON_DEFAULT_TENANT_ID) {
  const { data: boms } = await supabase
    .from("vyron_cost_boms")
    .select("id, bom_name, yield_qty, yield_unit, total_cost, cost_per_unit, status, product_id")
    .eq("company_id", companyId)
    .order("bom_name");

  if (boms?.length) return boms;

  const { data: recipes } = await supabase
    .from("vyron_cost_recipes")
    .select("id, recipe_name, yield_qty, total_cost, status")
    .eq("company_id", companyId)
    .order("recipe_name");

  return (recipes || []).map((r) => ({
    id: r.id,
    bom_name: r.recipe_name,
    yield_qty: r.yield_qty,
    yield_unit: "unit",
    total_cost: r.total_cost,
    cost_per_unit: Number(r.total_cost || 0) / Math.max(1, Number(r.yield_qty || 1)),
    status: r.status,
    product_id: null,
  }));
}
