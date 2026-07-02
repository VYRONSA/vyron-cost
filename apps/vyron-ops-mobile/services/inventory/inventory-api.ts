import { apiClient } from "@/services/api";
import type {
  AdjustmentReason,
  InventoryLedgerEntry,
  InventoryStats,
  LowStockAlert,
  StockItem,
  TransferDestination,
} from "@/types/inventory";

type StockItemsResponse = { ok: boolean; items?: StockItem[]; error?: string };
type StatsResponse = { ok: boolean; stats?: InventoryStats; error?: string };
type AlertsResponse = {
  ok: boolean;
  lowStockAlerts?: LowStockAlert[];
  error?: string;
};
type LedgerResponse = { ok: boolean; entries?: InventoryLedgerEntry[]; error?: string };
type TransactionResponse = { ok: boolean; transaction?: unknown; error?: string };
type TransferResponse = { ok: boolean; transferGroupId?: string; error?: string };

export async function fetchStockItems() {
  const response = await apiClient.get<StockItemsResponse>("/api/inventory-transactions/stock-items");
  if (!response.ok) throw new Error(response.error || "Failed to load stock items.");
  return response.items || [];
}

export async function fetchInventoryStats() {
  const response = await apiClient.get<StatsResponse>("/api/inventory-transactions/stats");
  if (!response.ok) throw new Error(response.error || "Failed to load inventory stats.");
  return response.stats;
}

export async function fetchLowStockAlerts() {
  try {
    const response = await apiClient.get<AlertsResponse>("/api/inventory/alerts");
    return response.lowStockAlerts || [];
  } catch {
    return [];
  }
}

export async function fetchInventoryLedger(stockItemId?: string) {
  const query = stockItemId ? `?stockItemId=${stockItemId}` : "";
  const response = await apiClient.get<LedgerResponse>(`/api/inventory-transactions/ledger${query}`);
  if (!response.ok) throw new Error(response.error || "Failed to load inventory history.");
  return response.entries || [];
}

export async function postStockCount(input: {
  stock_item_id: string;
  counted_qty: number;
  notes?: string;
  created_by?: string;
}) {
  const response = await apiClient.post<TransactionResponse>("/api/inventory-transactions", {
    action: "count",
    ...input,
  });
  if (!response.ok) throw new Error(response.error || "Stock count failed.");
  return response.transaction;
}

export async function postInventoryAdjustment(input: {
  stock_item_id: string;
  quantity_delta: number;
  notes?: string;
  created_by?: string;
}) {
  const response = await apiClient.post<TransactionResponse>("/api/inventory-transactions", {
    action: "adjust",
    transaction_type: "Adjustment",
    ...input,
  });
  if (!response.ok) throw new Error(response.error || "Adjustment failed.");
  return response.transaction;
}

export async function postStockTransfer(input: {
  from_stock_item_id: string;
  to_stock_item_id: string;
  quantity: number;
  notes?: string;
  created_by?: string;
  destination?: TransferDestination;
}) {
  const noteParts = [input.destination ? `Destination: ${input.destination}` : null, input.notes]
    .filter(Boolean)
    .join(" · ");
  const response = await apiClient.post<TransferResponse>("/api/inventory-transactions", {
    action: "transfer",
    from_stock_item_id: input.from_stock_item_id,
    to_stock_item_id: input.to_stock_item_id,
    quantity: input.quantity,
    notes: noteParts || undefined,
    created_by: input.created_by,
  });
  if (!response.ok) throw new Error(response.error || "Transfer failed.");
  return response;
}

export async function fetchOpenStockCounts() {
  try {
    const response = await apiClient.get<{ ok: boolean; counts?: Array<{ id: string; status: string }> }>(
      "/api/inventory/counts"
    );
    return (response.counts || []).filter((count) =>
      ["Draft", "In Progress", "Paused", "Submitted", "Recount Requested"].includes(count.status)
    );
  } catch {
    return [];
  }
}

export function countTransfersToday(entries: InventoryLedgerEntry[]) {
  const today = new Date().toISOString().slice(0, 10);
  return entries.filter(
    (entry) => entry.transaction_type === "Transfer" && entry.created_at.slice(0, 10) === today
  ).length;
}

export function countStockCountsToday(entries: InventoryLedgerEntry[]) {
  const today = new Date().toISOString().slice(0, 10);
  return entries.filter(
    (entry) => entry.transaction_type === "Count" && entry.created_at.slice(0, 10) === today
  ).length;
}

export function formatAdjustmentNote(reason: AdjustmentReason, note?: string) {
  return note ? `${reason}: ${note}` : reason;
}
