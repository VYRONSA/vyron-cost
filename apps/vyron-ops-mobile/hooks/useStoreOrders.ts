import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/hooks/query-keys";
import type { QueryRefreshOptions } from "@/hooks/query-options";
import {
  applyStoreOrderWorkflow,
  fetchStoreOrderDetail,
  fetchStoreOrderOperationsStats,
  fetchStoreOrders,
} from "@/services/store-orders/store-order-api";
import { buildStoreOpsTasks } from "@/services/tasks/store-order-task-engine";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";
import { mapStoreOrderSyncWorkflow } from "@/services/sync/store-workflow-map";
import type { StoreOrderWorkflowAction } from "@/types/store-orders";

type RefreshOptions = QueryRefreshOptions;

export function usePickingQueue(
  filters?: { status?: string; search?: string },
  refresh?: RefreshOptions
) {
  return useQuery({
    queryKey: queryKeys.pickingQueue(filters),
    queryFn: () =>
      fetchStoreOrders({
        statuses:
          filters?.status && filters.status !== "All"
            ? [filters.status]
            : ["Approved", "Picking"],
        search: filters?.search,
      }),
    ...refresh,
  });
}

export function useDispatchQueue(
  filters?: { status?: string; search?: string },
  refresh?: RefreshOptions
) {
  return useQuery({
    queryKey: queryKeys.dispatchQueue(filters),
    queryFn: () =>
      fetchStoreOrders({
        statuses:
          filters?.status && filters.status !== "All"
            ? [filters.status]
            : ["ReadyToDispatch", "Dispatched"],
        search: filters?.search,
      }),
    ...refresh,
  });
}

export function useStoreOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.storeOrder(orderId ?? ""),
    queryFn: () => fetchStoreOrderDetail(orderId!),
    enabled: Boolean(orderId),
  });
}

export function useStoreOrderStats(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.storeOrderStats,
    queryFn: fetchStoreOrderOperationsStats,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useStoreOpsTasks(refresh?: RefreshOptions) {
  const picking = usePickingQueue(undefined, refresh);
  const dispatch = useDispatchQueue({ status: "All" }, refresh);
  const tasks = useMemo(() => {
    const orders = [...(picking.data ?? []), ...(dispatch.data ?? [])];
    const unique = new Map(orders.map((order) => [order.id, order]));
    return buildStoreOpsTasks([...unique.values()]);
  }, [picking.data, dispatch.data]);

  return {
    isLoading: picking.isLoading || dispatch.isLoading,
    error: picking.error || dispatch.error,
    refetch: () => {
      void picking.refetch();
      void dispatch.refetch();
    },
    tasks,
  };
}

export function useStoreOrderWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      action,
      note,
      actor,
    }: {
      orderId: string;
      action: StoreOrderWorkflowAction;
      note?: string;
      actor?: string;
    }) => {
      const outcome = await executeOrEnqueue({
        workflow: mapStoreOrderSyncWorkflow(action),
        action,
        entityType: "store_order",
        entityId: orderId,
        payload: { orderId, action, note, actor },
        user: actor ?? "vyron-ops-mobile",
        onlineExecute: () => applyStoreOrderWorkflow(orderId, action, { note, actor }),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => {
      await invalidateStoreOrderQueries(queryClient);
    },
  });
}

async function invalidateStoreOrderQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["picking-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["dispatch-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["store-order"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.storeOrderStats }),
    queryClient.invalidateQueries({ queryKey: ["ops-tasks"] }),
  ]);
}
