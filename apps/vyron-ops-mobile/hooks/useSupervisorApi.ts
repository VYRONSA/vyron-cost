import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/query-keys";
import { fetchCostAiInsights, fetchExecutionActions, SUPERVISOR_REFRESH_MS } from "@/services/supervisor/supervisor-api";

const supervisorQueryOptions = {
  staleTime: SUPERVISOR_REFRESH_MS,
  refetchInterval: SUPERVISOR_REFRESH_MS,
};

export function useCostAiInsights() {
  return useQuery({
    queryKey: queryKeys.costAiInsights,
    queryFn: fetchCostAiInsights,
    ...supervisorQueryOptions,
  });
}

export function useExecutionActions() {
  return useQuery({
    queryKey: queryKeys.executionActions,
    queryFn: fetchExecutionActions,
    ...supervisorQueryOptions,
  });
}
