import { apiClient } from "@/services/api";
import type { StockCountLine, StockCountSession } from "@/types/inventory";

type CountListResponse = { ok: boolean; counts?: Array<Record<string, unknown>>; error?: string };
type CountCreateResponse = { ok: boolean; count?: Record<string, unknown>; lineCount?: number; error?: string };
type CountDetailResponse = {
  ok: boolean;
  count?: Record<string, unknown>;
  lines?: Array<Record<string, unknown>>;
  error?: string;
};
type ActionResponse = { ok: boolean; error?: string };

function toNum(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapCount(row: Record<string, unknown>): StockCountSession {
  return {
    id: String(row.id || ""),
    count_number: String(row.count_number || ""),
    count_type: String(row.count_type || ""),
    status: String(row.status || "Draft") as StockCountSession["status"],
    notes: row.notes ? String(row.notes) : null,
    variance_value_total: toNum(row.variance_value_total),
    created_by: row.created_by ? String(row.created_by) : null,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    posted_at: row.posted_at ? String(row.posted_at) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapLine(row: Record<string, unknown>): StockCountLine {
  return {
    id: String(row.id || ""),
    stock_count_id: String(row.stock_count_id || ""),
    stock_item_id: String(row.stock_item_id || ""),
    system_qty: toNum(row.system_qty),
    counted_qty: toNum(row.counted_qty),
    variance_qty: toNum(row.variance_qty),
    variance_pct: toNum(row.variance_pct),
    variance_value: toNum(row.variance_value),
    variance_class: String(row.variance_class || "minor"),
    unit_cost: toNum(row.unit_cost),
    approved: Boolean(row.approved),
    vyron_cost_stock_items: row.vyron_cost_stock_items as StockCountLine["vyron_cost_stock_items"],
  };
}

export async function fetchStockCountSessions() {
  const response = await apiClient.get<CountListResponse>("/api/inventory/counts");
  if (!response.ok) throw new Error(response.error || "Could not load stock counts.");
  return (response.counts || []).map(mapCount);
}

export async function createStockCountSession(input: {
  countType: "ingredients" | "packaging" | "finished_goods";
  createdBy?: string;
  warehouseName?: string;
  locationName?: string;
  notes?: string;
}) {
  const response = await apiClient.post<CountCreateResponse>("/api/inventory/counts", {
    countType: input.countType,
    createdBy: input.createdBy,
    warehouseName: input.warehouseName,
    locationName: input.locationName,
    notes: input.notes,
  });
  if (!response.ok || !response.count) {
    throw new Error(response.error || "Could not create stock count.");
  }
  return {
    count: mapCount(response.count),
    lineCount: response.lineCount || 0,
  };
}

export async function fetchStockCountSession(countId: string) {
  const response = await apiClient.get<CountDetailResponse>(`/api/inventory/counts/${countId}`);
  if (!response.ok || !response.count) {
    throw new Error(response.error || "Stock count not found.");
  }
  return {
    count: mapCount(response.count),
    lines: (response.lines || []).map(mapLine),
  };
}

export async function updateStockCountLine(input: { countId: string; lineId: string; countedQty: number }) {
  const response = await apiClient.patch<ActionResponse>(`/api/inventory/counts/${input.countId}`, {
    action: "updateLine",
    lineId: input.lineId,
    countedQty: input.countedQty,
  });
  if (!response.ok) throw new Error(response.error || "Could not save count line.");
  return { ok: true };
}

export async function stockCountAction(input: {
  countId: string;
  action: "start" | "pause" | "resume" | "submit" | "approve" | "reject" | "request_recount" | "post";
  actor?: string;
  approvedBy?: string;
  reason?: string;
  overrideNote?: string;
}) {
  const response = await apiClient.patch<ActionResponse>(`/api/inventory/counts/${input.countId}`, {
    action: input.action,
    actor: input.actor,
    approvedBy: input.approvedBy,
    reason: input.reason,
    overrideNote: input.overrideNote,
  });
  if (!response.ok) throw new Error(response.error || `Action ${input.action} failed.`);
  return { ok: true };
}
