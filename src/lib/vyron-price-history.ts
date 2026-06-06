import type { SupabaseClient } from "@supabase/supabase-js";

export type PriceMovement = "increase" | "decrease" | "no_change";

export type PriceHistoryScope = "supplier" | "ingredient" | "packaging" | "product" | "all";

export type PriceHistoryRow = {
  id: string;
  tenant_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  document_id: string | null;
  line_item_id: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  item_description: string | null;
  previous_price: number | null;
  new_price: number | null;
  price_difference: number | null;
  percentage_change: number | null;
  change_percent: number | null;
  price_movement: PriceMovement | null;
  movement_type: string | null;
  currency: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type PriceHistoryFilters = {
  scope?: PriceHistoryScope;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  supplierName?: string;
  entityId?: string;
  limit?: number;
};

export function computePriceMovement(previousPrice: number, newPrice: number): PriceMovement {
  const diff = round4(newPrice - previousPrice);
  if (Math.abs(diff) < 0.0001) return "no_change";
  return diff > 0 ? "increase" : "decrease";
}

export function priceMovementLabel(movement: PriceMovement | null | undefined) {
  if (movement === "increase") return "Increase";
  if (movement === "decrease") return "Decrease";
  return "No Change";
}

export function priceMovementClass(movement: PriceMovement | null | undefined) {
  if (movement === "increase") return "bg-red-100 text-red-800";
  if (movement === "decrease") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

export function changePercent(previousValue: number, newValue: number) {
  if (!previousValue || previousValue <= 0) return null;
  return round4(((newValue - previousValue) / previousValue) * 100);
}

export type BuildPriceHistoryInput = {
  tenantId: string;
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  documentId: string;
  lineItemId: string;
  entityType: "ingredient" | "packaging" | "product";
  entityId: string;
  entityName: string;
  itemDescription: string;
  quantity?: number | null;
  unit?: string | null;
  previousPrice: number;
  newPrice: number;
  currency?: string;
  approvedBy: string;
  approvedAt: string;
  movementType?: string;
};

export function buildPriceHistoryRecord(input: BuildPriceHistoryInput) {
  const prev = Number(input.previousPrice || 0);
  const next = Number(input.newPrice || 0);
  const pct = changePercent(prev, next);
  const diff = round4(next - prev);
  const movement = computePriceMovement(prev, next);

  return {
    tenant_id: input.tenantId,
    supplier_id: input.supplierId ?? null,
    supplier_name: input.supplierName ?? null,
    invoice_number: input.invoiceNumber ?? null,
    invoice_date: input.invoiceDate ?? null,
    document_id: input.documentId,
    line_item_id: input.lineItemId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_name: input.entityName,
    item_kind: input.entityType,
    item_description: input.itemDescription,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    previous_price: prev,
    new_price: next,
    price_difference: diff,
    percentage_change: pct,
    change_percent: pct,
    price_movement: movement,
    movement_type: input.movementType ?? movement,
    currency: input.currency || "ZAR",
    potential_costing_impact: diff,
    approved_by: input.approvedBy,
    approved_at: input.approvedAt,
  };
}

export async function insertPriceHistoryRows(supabase: SupabaseClient, rows: ReturnType<typeof buildPriceHistoryRecord>[]) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from("vyron_supplier_price_history").insert(rows).select("id");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listPriceHistory(supabase: SupabaseClient, tenantId: string, filters: PriceHistoryFilters = {}) {
  const limit = filters.limit ?? 200;
  let query = supabase
    .from("vyron_supplier_price_history")
    .select(
      "id, tenant_id, supplier_id, supplier_name, invoice_number, invoice_date, document_id, line_item_id, entity_type, entity_id, entity_name, item_description, previous_price, new_price, price_difference, percentage_change, change_percent, price_movement, movement_type, currency, approved_by, approved_at, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const scope = filters.scope || "all";
  if (scope === "ingredient") query = query.eq("entity_type", "ingredient");
  if (scope === "packaging") query = query.eq("entity_type", "packaging");
  if (scope === "product") query = query.eq("entity_type", "product");
  if (scope === "supplier") {
    /* all entity types — supplier-focused screen */
  }

  if (filters.supplierName) query = query.ilike("supplier_name", `%${filters.supplierName}%`);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.dateFrom) query = query.gte("approved_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("approved_at", `${filters.dateTo}T23:59:59.999Z`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data || []) as PriceHistoryRow[];
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter((row) =>
      [
        row.supplier_name,
        row.invoice_number,
        row.entity_name,
        row.item_description,
        row.entity_type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }

  return rows.map((row) => ({
    ...row,
    price_movement:
      (row.price_movement as PriceMovement | null) ||
      computePriceMovement(Number(row.previous_price || 0), Number(row.new_price || 0)),
  }));
}

export async function listPriceHistoryForDocument(supabase: SupabaseClient, documentId: string) {
  const { data, error } = await supabase
    .from("vyron_supplier_price_history")
    .select(
      "id, supplier_name, invoice_number, invoice_date, entity_type, entity_id, entity_name, item_description, previous_price, new_price, price_difference, percentage_change, price_movement, approved_by, approved_at, created_at"
    )
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
