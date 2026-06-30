import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/query-keys";
import { loadOpsPermissions } from "@/platform/permissions";

export function usePermissions() {
  return useQuery({
    queryKey: queryKeys.permissions,
    queryFn: loadOpsPermissions,
    staleTime: 120_000,
  });
}
