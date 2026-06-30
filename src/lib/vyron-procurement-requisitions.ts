import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductionPlanWithBom } from "@/lib/vyron-store-production-planning";

export const PROCUREMENT_REQUISITION_STATUSES = [
  "Draft",
  "Approved",
  "ReadyForPurchase",
  "Ordered",
  "Received",
  "Cancelled",
] as const;

export type ProcurementRequisitionStatus = (typeof PROCUREMENT_REQUISITION_STATUSES)[number];

export const PROCUREMENT_REQUISITION_STATUS_LABELS: Record<ProcurementRequisitionStatus, string> = {
  Draft: "Draft",
  Approved: "Approved",
  ReadyForPurchase: "Ready For Purchase",
  Ordered: "Ordered",
  Received: "Received",
  Cancelled: "Cancelled",
};

export type ProcurementRequisitionLineInput = {
  ingredient_id?: string | null;
  ingredient_name: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
  unit?: string;
  estimated_cost?: number;
  preferred_supplier_id?: string | null;
};

export type ProcurementRequisitionLineRow = ProcurementRequisitionLineInput & {
  id: string;
  requisition_id: string;
  company_id: string;
  unit: string;
  estimated_cost: number;
  preferred_supplier_id: string | null;
  sort_order: number;
  recommended_supplier?: SupplierRecommendation | null;
};

export type ProcurementRequisitionRow = {
  id: string;
  company_id: string;
  requisition_number: string;
  status: ProcurementRequisitionStatus;
  required_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  line_count?: number;
  estimated_cost?: number;
  lines?: ProcurementRequisitionLineRow[];
};

export type SupplierRecommendation = {
  supplier_id: string;
  supplier_name: string;
  lead_time_days: number;
  reliability_score: number;
  last_cost: number;
  warning: string | null;
  score: number;
};

export type ProcurementDashboardStats = {
  openRequisitions: number;
  procurementValue: number;
  shortageValue: number;
  ingredientsAtRisk: number;
};

export type ShortageSource = "production_planning" | "inventory" | "manual";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function mapLine(row: Record<string, unknown>): ProcurementRequisitionLineRow {
  return {
    id: String(row.id),
    requisition_id: String(row.requisition_id),
    company_id: String(row.company_id),
    ingredient_id: row.ingredient_id ? String(row.ingredient_id) : null,
    ingredient_name: String(row.ingredient_name || ""),
    required_qty: Number(row.required_qty || 0),
    available_qty: Number(row.available_qty || 0),
    shortage_qty: Number(row.shortage_qty || 0),
    unit: String(row.unit || "kg"),
    estimated_cost: Number(row.estimated_cost || 0),
    preferred_supplier_id: row.preferred_supplier_id ? String(row.preferred_supplier_id) : null,
    sort_order: Number(row.sort_order || 0),
  };
}

export async function nextRequisitionNumber(supabase: SupabaseClient, companyId: string) {
  const prefix = `PRQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const { count } = await supabase
    .from("vyron_cost_procurement_requisitions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .like("requisition_number", `${prefix}%`);
  const seq = String((count || 0) + 1).padStart(4, "0");
  return `${prefix}-${seq}`;
}

export async function recommendSupplierForIngredient(
  supabase: SupabaseClient,
  companyId: string,
  ingredientId: string | null
): Promise<SupplierRecommendation | null> {
  if (!ingredientId) return null;

  const { data: ingredient } = await supabase
    .from("vyron_cost_ingredients")
    .select("id, ingredient_name, supplier_id, purchase_cost, true_unit_cost")
    .eq("company_id", companyId)
    .eq("id", ingredientId)
    .maybeSingle();
  if (!ingredient) return null;

  const lastCost = round4(Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0));

  const { data: suppliers } = await supabase
    .from("vyron_cost_suppliers")
    .select("id, supplier_name, lead_time_days, last_price_movement, risk_status")
    .eq("company_id", companyId);

  const candidates = (suppliers || []).map((supplier) => {
    const movement = Math.abs(Number(supplier.last_price_movement || 0));
    const leadTime = Number(supplier.lead_time_days || 0);
    const riskPenalty =
      supplier.risk_status === "High Risk" ? 25 : supplier.risk_status === "Watch" ? 12 : 0;
    const reliability = Math.max(35, Math.round(100 - movement * 2 - riskPenalty));
    const isLinked = ingredient.supplier_id && String(ingredient.supplier_id) === String(supplier.id);
    const leadScore = Math.max(0, 100 - leadTime * 3);
    const costScore = lastCost > 0 ? 80 : 50;
    const linkBonus = isLinked ? 20 : 0;
    const score = reliability * 0.45 + leadScore * 0.3 + costScore * 0.15 + linkBonus;

    let warning: string | null = null;
    if (reliability < 60) warning = "Low supplier reliability — review before ordering.";
    else if (leadTime > 14) warning = `Lead time is ${leadTime} days — plan ahead.`;
    else if (movement > 8) warning = "Recent price movement detected on this supplier.";

    return {
      supplier_id: String(supplier.id),
      supplier_name: String(supplier.supplier_name),
      lead_time_days: leadTime,
      reliability_score: reliability,
      last_cost: lastCost,
      warning,
      score,
    };
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

export async function buildShortageRequisitionLines(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProcurementRequisitionLineInput[]> {
  const [{ ingredients: productionShortages }, { data: stockItems }, { data: ingredientRows }] =
    await Promise.all([
      getProductionPlanWithBom(supabase, companyId),
      supabase
        .from("vyron_cost_stock_items")
        .select("entity_id, qty_on_hand, reorder_level, min_level, average_cost, current_cost")
        .eq("company_id", companyId)
        .eq("entity_type", "ingredient"),
      supabase
        .from("vyron_cost_ingredients")
        .select("id, ingredient_name, purchase_unit, true_unit_cost, purchase_cost, supplier_id")
        .eq("company_id", companyId),
    ]);

  const ingredientMeta = new Map<
    string,
    { name: string; unit: string; unitCost: number; supplier_id: string | null }
  >();
  for (const row of ingredientRows || []) {
    ingredientMeta.set(String(row.id), {
      name: String(row.ingredient_name || ""),
      unit: String(row.purchase_unit || "kg"),
      unitCost: round4(Number(row.true_unit_cost || row.purchase_cost || 0)),
      supplier_id: row.supplier_id ? String(row.supplier_id) : null,
    });
  }

  const merged = new Map<string, ProcurementRequisitionLineInput>();

  for (const row of productionShortages.filter((item) => item.has_shortage)) {
    const key = row.ingredient_id || row.ingredient_name;
    const meta = row.ingredient_id ? ingredientMeta.get(row.ingredient_id) : undefined;
    const unitCost = meta?.unitCost ?? 0;
    const shortage = round4(row.shortfall);
    merged.set(key, {
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredient_name,
      required_qty: round4(row.required_qty),
      available_qty: round4(row.available_qty),
      shortage_qty: shortage,
      unit: row.unit || meta?.unit || "kg",
      estimated_cost: round2(shortage * unitCost),
      preferred_supplier_id: meta?.supplier_id ?? null,
    });
  }

  for (const stock of stockItems || []) {
    if (!stock.entity_id) continue;
    const ingredientId = String(stock.entity_id);
    const meta = ingredientMeta.get(ingredientId);
    if (!meta) continue;

    const available = round4(Number(stock.qty_on_hand || 0));
    const reorder = round4(Number(stock.reorder_level || stock.min_level || 0));
    if (reorder <= 0 || available >= reorder) continue;

    const required = reorder;
    const shortage = round4(Math.max(0, required - available));
    if (shortage <= 0) continue;

    const key = ingredientId;
    const existing = merged.get(key);
    const unitCost = round4(Number(stock.average_cost || stock.current_cost || meta.unitCost));

    if (existing) {
      existing.required_qty = round4(Math.max(existing.required_qty, required));
      existing.available_qty = available;
      existing.shortage_qty = round4(Math.max(existing.shortage_qty, shortage));
      existing.estimated_cost = round2(existing.shortage_qty * unitCost);
    } else {
      merged.set(key, {
        ingredient_id: ingredientId,
        ingredient_name: meta.name,
        required_qty: required,
        available_qty: available,
        shortage_qty: shortage,
        unit: meta.unit,
        estimated_cost: round2(shortage * unitCost),
        preferred_supplier_id: meta.supplier_id,
      });
    }
  }

  return [...merged.values()].sort((a, b) => b.shortage_qty - a.shortage_qty);
}

export async function listProcurementRequisitions(
  supabase: SupabaseClient,
  companyId: string,
  filters?: { status?: string; search?: string }
) {
  let query = supabase
    .from("vyron_cost_procurement_requisitions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (filters?.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Record<string, unknown>[];
  if (!rows.length) return [];

  const ids = rows.map((row) => String(row.id));
  const { data: lineRows } = await supabase
    .from("vyron_cost_procurement_requisition_lines")
    .select("requisition_id, estimated_cost")
    .eq("company_id", companyId)
    .in("requisition_id", ids);

  const costByReq = new Map<string, number>();
  const countByReq = new Map<string, number>();
  for (const line of lineRows || []) {
    const id = String(line.requisition_id);
    costByReq.set(id, round2((costByReq.get(id) || 0) + Number(line.estimated_cost || 0)));
    countByReq.set(id, (countByReq.get(id) || 0) + 1);
  }

  let result = rows.map((row) => ({
    ...(row as ProcurementRequisitionRow),
    line_count: countByReq.get(String(row.id)) || 0,
    estimated_cost: costByReq.get(String(row.id)) || 0,
  }));

  const term = filters?.search?.trim().toLowerCase();
  if (term) {
    result = result.filter((row) =>
      [row.requisition_number, row.status, row.notes].join(" ").toLowerCase().includes(term)
    );
  }

  return result;
}

export async function getProcurementRequisitionDetail(
  supabase: SupabaseClient,
  companyId: string,
  requisitionId: string
): Promise<ProcurementRequisitionRow | null> {
  const { data: header, error } = await supabase
    .from("vyron_cost_procurement_requisitions")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", requisitionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!header) return null;

  const { data: lines, error: lineError } = await supabase
    .from("vyron_cost_procurement_requisition_lines")
    .select("*")
    .eq("company_id", companyId)
    .eq("requisition_id", requisitionId)
    .order("sort_order", { ascending: true });
  if (lineError) throw new Error(lineError.message);

  const mappedLines = await Promise.all(
    (lines || []).map(async (line) => {
      const mapped = mapLine(line as Record<string, unknown>);
      const recommendation = await recommendSupplierForIngredient(
        supabase,
        companyId,
        mapped.ingredient_id ?? null
      );
      return {
        ...mapped,
        preferred_supplier_id: mapped.preferred_supplier_id || recommendation?.supplier_id || null,
        recommended_supplier: recommendation,
      };
    })
  );

  const estimated_cost = round2(mappedLines.reduce((sum, line) => sum + line.estimated_cost, 0));

  return {
    ...(header as ProcurementRequisitionRow),
    lines: mappedLines,
    line_count: mappedLines.length,
    estimated_cost,
  };
}

export async function createProcurementRequisition(
  supabase: SupabaseClient,
  companyId: string,
  input: {
    required_date?: string | null;
    notes?: string | null;
    created_by?: string | null;
    lines?: ProcurementRequisitionLineInput[];
    source?: ShortageSource;
  }
) {
  const now = new Date().toISOString();
  const requisitionId = randomUUID();
  const requisitionNumber = await nextRequisitionNumber(supabase, companyId);
  const lines =
    input.lines?.length ? input.lines : await buildShortageRequisitionLines(supabase, companyId);

  if (!lines.length) throw new Error("No shortages found to generate a requisition.");

  const { error: headerError } = await supabase.from("vyron_cost_procurement_requisitions").insert({
    id: requisitionId,
    company_id: companyId,
    requisition_number: requisitionNumber,
    status: "Draft",
    required_date: input.required_date || null,
    notes: input.notes?.trim() || (input.source ? `Source: ${input.source}` : null),
    created_by: input.created_by?.trim() || null,
    created_at: now,
    updated_at: now,
  });
  if (headerError) throw new Error(headerError.message);

  const { error: lineError } = await supabase.from("vyron_cost_procurement_requisition_lines").insert(
    lines.map((line, index) => ({
      id: randomUUID(),
      company_id: companyId,
      requisition_id: requisitionId,
      ingredient_id: line.ingredient_id || null,
      ingredient_name: line.ingredient_name,
      required_qty: round4(line.required_qty),
      available_qty: round4(line.available_qty),
      shortage_qty: round4(line.shortage_qty),
      unit: line.unit || "kg",
      estimated_cost: round2(line.estimated_cost ?? line.shortage_qty * 0),
      preferred_supplier_id: line.preferred_supplier_id || null,
      sort_order: index,
      created_at: now,
    }))
  );
  if (lineError) throw new Error(lineError.message);

  const detail = await getProcurementRequisitionDetail(supabase, companyId, requisitionId);
  if (!detail) throw new Error("Requisition not found after create.");
  return detail;
}

const STATUS_TRANSITIONS: Record<ProcurementRequisitionStatus, ProcurementRequisitionStatus[]> = {
  Draft: ["Approved", "Cancelled"],
  Approved: ["ReadyForPurchase", "Cancelled"],
  ReadyForPurchase: ["Ordered", "Cancelled"],
  Ordered: ["Received"],
  Received: [],
  Cancelled: [],
};

export async function updateProcurementRequisitionStatus(
  supabase: SupabaseClient,
  companyId: string,
  requisitionId: string,
  nextStatus: ProcurementRequisitionStatus
) {
  if (!PROCUREMENT_REQUISITION_STATUSES.includes(nextStatus)) {
    throw new Error("Invalid requisition status.");
  }

  const existing = await getProcurementRequisitionDetail(supabase, companyId, requisitionId);
  if (!existing) throw new Error("Requisition not found.");

  const current = existing.status as ProcurementRequisitionStatus;
  if (!STATUS_TRANSITIONS[current]?.includes(nextStatus)) {
    throw new Error(`Cannot move from ${current} to ${nextStatus}.`);
  }

  const { error } = await supabase
    .from("vyron_cost_procurement_requisitions")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("id", requisitionId);
  if (error) throw new Error(error.message);

  const detail = await getProcurementRequisitionDetail(supabase, companyId, requisitionId);
  if (!detail) throw new Error("Requisition not found after update.");
  return detail;
}

export async function getProcurementDashboardStats(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProcurementDashboardStats> {
  const openStatuses = ["Draft", "Approved", "ReadyForPurchase", "Ordered"];

  const [{ count: openRequisitions }, { data: openReqs }, shortageLines, productionPlan] =
    await Promise.all([
      supabase
        .from("vyron_cost_procurement_requisitions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", openStatuses),
      supabase
        .from("vyron_cost_procurement_requisitions")
        .select("id")
        .eq("company_id", companyId)
        .in("status", openStatuses),
      buildShortageRequisitionLines(supabase, companyId),
      getProductionPlanWithBom(supabase, companyId),
    ]);

  const openIds = (openReqs || []).map((row) => String(row.id));
  let procurementValue = 0;
  if (openIds.length) {
    const { data: openLines } = await supabase
      .from("vyron_cost_procurement_requisition_lines")
      .select("estimated_cost")
      .eq("company_id", companyId)
      .in("requisition_id", openIds);
    procurementValue = round2(
      (openLines || []).reduce((sum, line) => sum + Number(line.estimated_cost || 0), 0)
    );
  }

  const shortageValue = round2(
    shortageLines.reduce((sum, line) => sum + Number(line.estimated_cost || 0), 0)
  );

  const ingredientsAtRisk = new Set<string>();
  for (const row of productionPlan.ingredients.filter((item) => item.has_shortage)) {
    ingredientsAtRisk.add(row.ingredient_id || row.ingredient_name);
  }
  for (const line of shortageLines) {
    ingredientsAtRisk.add(line.ingredient_id || line.ingredient_name);
  }

  return {
    openRequisitions: openRequisitions || 0,
    procurementValue: round2(procurementValue),
    shortageValue,
    ingredientsAtRisk: ingredientsAtRisk.size,
  };
}
