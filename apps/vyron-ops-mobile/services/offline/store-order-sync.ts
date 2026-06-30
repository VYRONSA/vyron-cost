import { syncManager } from "@/platform/sync";
import { mapStoreOrderSyncWorkflow } from "@/services/sync/store-workflow-map";
import type { StoreOrderWorkflowAction } from "@/types/store-orders";

export function queueStoreOrderActionForOfflineSync(
  orderId: string,
  action: StoreOrderWorkflowAction,
  payload: Record<string, unknown>,
  user = "vyron-ops-mobile"
) {
  return syncManager.enqueue({
    workflow: mapStoreOrderSyncWorkflow(action),
    action,
    entityType: "store_order",
    entityId: orderId,
    payload: { orderId, action, ...payload },
    user,
  });
}

export function listPendingStoreOrderActions() {
  return syncManager
    .getQueue()
    .filter((item) => ["picking", "dispatch", "delivery"].includes(item.workflow));
}
