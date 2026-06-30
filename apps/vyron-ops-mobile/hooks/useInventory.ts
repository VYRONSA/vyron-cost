import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/hooks/query-keys";
import type { QueryRefreshOptions } from "@/hooks/query-options";
import {
  fetchInventoryLedger,
  fetchInventoryStats,
  fetchLowStockAlerts,
  fetchOpenStockCounts,
  fetchStockItems,
  postInventoryAdjustment,
  postStockCount,
  postStockTransfer,
} from "@/services/inventory/inventory-api";
import { buildInventoryOpsTasks } from "@/services/tasks/inventory-task-engine";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";
import type { AdjustmentReason, TransferDestination } from "@/types/inventory";

export function useStockItems() {
  return useQuery({
    queryKey: queryKeys.stockItems,
    queryFn: fetchStockItems,
    staleTime: 60_000,
  });
}

type RefreshOptions = QueryRefreshOptions;

export function useInventoryStats(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.inventoryStats,
    queryFn: fetchInventoryStats,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useLowStockAlerts(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.lowStockAlerts,
    queryFn: fetchLowStockAlerts,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useInventoryLedger(stockItemId?: string, refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.inventoryLedger(stockItemId),
    queryFn: () => fetchInventoryLedger(stockItemId),
    ...refresh,
  });
}

export function useOpenStockCounts() {
  return useQuery({
    queryKey: queryKeys.openStockCounts,
    queryFn: fetchOpenStockCounts,
    staleTime: 60_000,
  });
}

export function useInventoryOpsTasks(refresh?: RefreshOptions) {
  const stockItems = useStockItems();
  const alerts = useLowStockAlerts(refresh);
  const openCounts = useOpenStockCounts();

  const tasks = useMemo(
    () =>
      buildInventoryOpsTasks({
        stockItems: stockItems.data ?? [],
        lowStockAlerts: alerts.data ?? [],
        openCounts: openCounts.data ?? [],
      }),
    [stockItems.data, alerts.data, openCounts.data]
  );

  return {
    isLoading: stockItems.isLoading || alerts.isLoading || openCounts.isLoading,
    error: stockItems.error || alerts.error || openCounts.error,
    refetch: () => {
      void stockItems.refetch();
      void alerts.refetch();
      void openCounts.refetch();
    },
    tasks,
  };
}

async function invalidateInventory(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.stockItems }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventoryStats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.lowStockAlerts }),
    queryClient.invalidateQueries({ queryKey: ["inventory-ledger"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.openStockCounts }),
    queryClient.invalidateQueries({ queryKey: ["ops-tasks"] }),
  ]);
}

export function usePostStockCountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof postStockCount>[0]) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_count",
        action: "post_count",
        entityType: "stock_item",
        entityId: input.stock_item_id,
        payload: { count: input },
        user: input.created_by ?? "vyron-ops-mobile",
        onlineExecute: () => postStockCount(input),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateInventory(queryClient),
  });
}

export function usePostAdjustmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      stock_item_id: string;
      quantity_delta: number;
      notes?: string;
      created_by?: string;
    }) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_adjustment",
        action: "post_adjustment",
        entityType: "stock_item",
        entityId: input.stock_item_id,
        payload: { adjustment: input },
        user: input.created_by ?? "vyron-ops-mobile",
        onlineExecute: () => postInventoryAdjustment(input),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateInventory(queryClient),
  });
}

export function usePostTransferMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from_stock_item_id: string;
      to_stock_item_id: string;
      quantity: number;
      notes?: string;
      created_by?: string;
      destination?: TransferDestination;
    }) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_transfer",
        action: "post_transfer",
        entityType: "stock_item",
        entityId: input.from_stock_item_id,
        payload: { transfer: input },
        user: input.created_by ?? "vyron-ops-mobile",
        onlineExecute: () => postStockTransfer(input),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateInventory(queryClient),
  });
}
