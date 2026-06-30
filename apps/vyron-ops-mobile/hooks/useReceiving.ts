import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { queryKeys } from "@/hooks/query-keys";
import type { QueryRefreshOptions } from "@/hooks/query-options";
import {
  confirmPurchaseOrderReceipt,
  fetchInventoryAlertCount,
  fetchPurchaseOrderDetail,
  fetchReceivingQueue,
} from "@/services/receiving/purchase-order-api";
import { executeOrEnqueue } from "@/services/sync/sync-gateway";
import type { ReceiveReceiptPayload } from "@/types/receiving";
import { buildReceivePurchaseOrderTasks } from "@/services/tasks/task-engine";

type RefreshOptions = QueryRefreshOptions;

export function useReceivingQueue(
  filters?: { status?: string; search?: string },
  refresh?: RefreshOptions
) {
  return useQuery({
    queryKey: queryKeys.receivingQueue(filters),
    queryFn: () => fetchReceivingQueue(filters),
    ...refresh,
  });
}

export function usePurchaseOrderDetail(poId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.purchaseOrder(poId ?? ""),
    queryFn: () => fetchPurchaseOrderDetail(poId!),
    enabled: Boolean(poId),
  });
}

export function useOpsTasks(refresh?: RefreshOptions) {
  const query = useReceivingQueue(undefined, refresh);
  const tasks = useMemo(
    () => buildReceivePurchaseOrderTasks(query.data?.orders ?? []),
    [query.data?.orders]
  );
  return { ...query, tasks };
}

export function useInventoryAlerts(refresh?: RefreshOptions) {
  return useQuery({
    queryKey: queryKeys.inventoryAlerts,
    queryFn: fetchInventoryAlertCount,
    staleTime: 60_000,
    ...refresh,
  });
}

export function useConfirmReceiptMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ poId, payload }: { poId: string; payload: ReceiveReceiptPayload }) => {
      const outcome = await executeOrEnqueue({
        workflow: "receiving",
        action: "confirm_receipt",
        entityType: "purchase_order",
        entityId: poId,
        payload: { poId, receipt: payload },
        user: payload.actor ?? "vyron-ops-mobile",
        onlineExecute: () => confirmPurchaseOrderReceipt(poId, payload),
      });
      if (outcome.mode === "queued") return { ok: true, queued: true, queueId: outcome.queueId };
      return outcome.result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["receiving-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["ops-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-order"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryAlerts }),
        queryClient.invalidateQueries({ queryKey: ["sync"] }),
      ]);
    },
  });
}
