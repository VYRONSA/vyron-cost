import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/query-keys";
import {
  createStockCountSession,
  fetchStockCountSession,
  fetchStockCountSessions,
  stockCountAction,
  updateStockCountLine,
} from "@/services/inventory/stock-count-api";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";

export function useStockCountSessions() {
  return useQuery({
    queryKey: queryKeys.stockCountSessions,
    queryFn: fetchStockCountSessions,
    staleTime: 30_000,
  });
}

export function useStockCountSession(countId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stockCountSession(countId || ""),
    queryFn: () => fetchStockCountSession(countId!),
    enabled: Boolean(countId),
    staleTime: 10_000,
  });
}

async function invalidateStockCountQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.stockCountSessions }),
    queryClient.invalidateQueries({ queryKey: ["stock-count-session"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.openStockCounts }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stockItems }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventoryLedger("all") }),
    queryClient.invalidateQueries({ queryKey: ["inventory-ledger"] }),
    queryClient.invalidateQueries({ queryKey: ["ops-tasks"] }),
  ]);
}

export function useCreateStockCountSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Parameters<typeof createStockCountSession>[0] & { actor?: string }) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_count",
        action: "count_session_create",
        entityType: "stock_count",
        entityId: input.countType,
        payload: input as unknown as Record<string, unknown>,
        user: input.actor || input.createdBy || "vyron-ops-mobile",
        onlineExecute: () => createStockCountSession(input),
      });
      if (outcome.mode === "queued") return { queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateStockCountQueries(queryClient),
  });
}

export function useUpdateStockCountLineMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { countId: string; lineId: string; countedQty: number; actor?: string }) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_count",
        action: "count_session_update_line",
        entityType: "stock_count_line",
        entityId: input.lineId,
        payload: input as unknown as Record<string, unknown>,
        user: input.actor || "vyron-ops-mobile",
        onlineExecute: () => updateStockCountLine(input),
      });
      if (outcome.mode === "queued") return { queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateStockCountQueries(queryClient),
  });
}

export function useStockCountActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Parameters<typeof stockCountAction>[0] & {
        actor?: string;
      }
    ) => {
      const outcome = await executeOrEnqueue({
        workflow: "inventory_count",
        action: `count_session_${input.action}`,
        entityType: "stock_count",
        entityId: input.countId,
        payload: input as unknown as Record<string, unknown>,
        user: input.actor || input.approvedBy || "vyron-ops-mobile",
        onlineExecute: () => stockCountAction(input),
      });
      if (outcome.mode === "queued") return { queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => invalidateStockCountQueries(queryClient),
  });
}
