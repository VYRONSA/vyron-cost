import { apiClient } from "@/services/api";
import type { PurchaseOrder, PurchaseOrderEngineStats, ReceiveReceiptPayload } from "@/types/receiving";

type EngineListResponse = {
  ok: boolean;
  orders?: PurchaseOrder[];
  stats?: PurchaseOrderEngineStats;
  error?: string;
};

type EngineDetailResponse = {
  ok: boolean;
  purchaseOrder?: PurchaseOrder;
  error?: string;
};

type ReceiveResponse = {
  ok: boolean;
  purchaseOrder?: PurchaseOrder;
  error?: string;
};

const RECEIVABLE_STATUSES = new Set(["Approved", "Sent", "Submitted", "Partially Received"]);

export function isReceivablePurchaseOrder(order: PurchaseOrder) {
  return RECEIVABLE_STATUSES.has(order.status) || order.display_status === "Awaiting Receipt";
}

export async function fetchReceivingQueue(filters?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "All") params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const query = params.toString();
  const response = await apiClient.get<EngineListResponse>(
    `/api/purchase-orders/engine${query ? `?${query}` : ""}`
  );
  if (!response.ok) throw new Error(response.error || "Failed to load purchase orders.");
  const orders = (response.orders || []).filter(isReceivablePurchaseOrder);
  return { orders, stats: response.stats };
}

export async function fetchPurchaseOrderDetail(poId: string) {
  const response = await apiClient.get<EngineDetailResponse>(`/api/purchase-orders/engine?id=${poId}`);
  if (!response.ok || !response.purchaseOrder) {
    throw new Error(response.error || "Purchase order not found.");
  }
  return response.purchaseOrder;
}

export async function confirmPurchaseOrderReceipt(poId: string, payload: ReceiveReceiptPayload) {
  const response = await apiClient.post<ReceiveResponse>(`/api/purchase-orders/${poId}/receive`, payload);
  if (!response.ok) throw new Error(response.error || "Receipt failed.");
  return response.purchaseOrder;
}

export async function fetchInventoryAlertCount() {
  try {
    const response = await apiClient.get<{
      ok: boolean;
      stats?: { negativeStockWarnings?: number };
    }>("/api/inventory-transactions/stats");
    return response.stats?.negativeStockWarnings ?? 0;
  } catch {
    return null;
  }
}
