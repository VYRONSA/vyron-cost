import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/hooks/query-keys";
import type { QueryRefreshOptions } from "@/hooks/query-options";
import {
  completeProductionRun,
  fetchManufacturingStats,
  fetchProductionPlanningStats,
  fetchProductionQueue,
  fetchProductionRunDetail,
  fetchProductionStockShortages,
  startProductionRun,
} from "@/services/production/production-api";
import { buildProductionOpsTasks } from "@/services/tasks/production-task-engine";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";
import type { CompleteProductionPayload } from "@/types/production";

type RefreshOptions = QueryRefreshOptions;

export function useProductionQueue(
  filters?: { status?: string; search?: string },
  refresh?: RefreshOptions
) {
  return useQuery({
    queryKey: queryKeys.productionQueue(filters),
    queryFn: () => fetchProductionQueue(filters),
    ...refresh,
  });
}

export function useProductionRunDetail(runId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.productionRun(runId ?? ""),
    queryFn: () => fetchProductionRunDetail(runId!),
    enabled: Boolean(runId),
  });
}

export function useProductionShortages(runId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.productionShortages(runId ?? ""),
    queryFn: () => fetchProductionStockShortages(runId!),
    enabled: Boolean(runId),
  });
}

export function useManufacturingStats(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.manufacturingStats,
    queryFn: fetchManufacturingStats,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useProductionPlanningStats(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.productionPlanningStats,
    queryFn: fetchProductionPlanningStats,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useProductionOpsTasks(refresh?: RefreshOptions) {
  const query = useProductionQueue(undefined, refresh);
  const tasks = useMemo(
    () => buildProductionOpsTasks(query.data ?? []),
    [query.data]
  );
  return { ...query, tasks };
}

export function useStartProductionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, actor }: { runId: string; actor?: string }) => {
      const outcome = await executeOrEnqueue({
        workflow: "production",
        action: "start_run",
        entityType: "production_run",
        entityId: runId,
        payload: { runId, actor },
        user: actor ?? "vyron-ops-mobile",
        onlineExecute: () => startProductionRun(runId, actor),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => {
      await invalidateProductionQueries(queryClient);
    },
  });
}

export function useCompleteProductionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, payload }: { runId: string; payload: CompleteProductionPayload }) => {
      const outcome = await executeOrEnqueue({
        workflow: "production",
        action: "complete_run",
        entityType: "production_run",
        entityId: runId,
        payload: { runId, completion: payload },
        user: payload.completed_by ?? "vyron-ops-mobile",
        onlineExecute: () => completeProductionRun(runId, payload),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => {
      await invalidateProductionQueries(queryClient);
    },
  });
}

async function invalidateProductionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["production-queue"] }),
    queryClient.invalidateQueries({ queryKey: ["production-run"] }),
    queryClient.invalidateQueries({ queryKey: ["production-shortages"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.manufacturingStats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.productionPlanningStats }),
    queryClient.invalidateQueries({ queryKey: ["ops-tasks"] }),
  ]);
}
