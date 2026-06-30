import { apiClient } from "@/services/api";
import type { StoreOrder, StoreOrderOperationsStats, StoreOrderWorkflowAction } from "@/types/store-orders";

type OrdersListResponse = {
  ok: boolean;
  orders?: StoreOrder[];
  error?: string;
};

type OrderDetailResponse = {
  ok: boolean;
  order?: StoreOrder;
  error?: string;
};

type StatsResponse = {
  ok: boolean;
  stats?: StoreOrderOperationsStats;
  error?: string;
};

export async function fetchStoreOrders(filters?: {
  status?: string;
  statuses?: string[];
  search?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== "All") params.set("status", filters.status);
  if (filters?.statuses?.length) params.set("statuses", filters.statuses.join(","));
  if (filters?.search) params.set("search", filters.search);
  const query = params.toString();
  const response = await apiClient.get<OrdersListResponse>(
    `/api/store-orders${query ? `?${query}` : ""}`
  );
  if (!response.ok) throw new Error(response.error || "Failed to load store orders.");
  return response.orders || [];
}

export async function fetchStoreOrderDetail(orderId: string) {
  const response = await apiClient.get<OrderDetailResponse>(`/api/store-orders/${orderId}`);
  if (!response.ok || !response.order) {
    throw new Error(response.error || "Store order not found.");
  }
  return response.order;
}

export async function applyStoreOrderWorkflow(
  orderId: string,
  action: StoreOrderWorkflowAction,
  input?: { note?: string; actor?: string }
) {
  const response = await apiClient.patch<OrderDetailResponse>(`/api/store-orders/${orderId}/workflow`, {
    action,
    note: input?.note,
    actor: input?.actor,
  });
  if (!response.ok || !response.order) {
    throw new Error(response.error || "Workflow action failed.");
  }
  return response.order;
}

export async function fetchStoreOrderOperationsStats() {
  const response = await apiClient.get<StatsResponse>("/api/store-orders/operations/stats");
  if (!response.ok) throw new Error(response.error || "Failed to load store order stats.");
  return response.stats;
}
