import { syncManager } from "@/platform/sync";

export function queueInventoryActionForOfflineSync(
  workflow: "inventory_count" | "inventory_adjustment" | "inventory_transfer",
  action: string,
  entityId: string,
  payload: Record<string, unknown>,
  user = "vyron-ops-mobile"
) {
  return syncManager.enqueue({
    workflow,
    action,
    entityType: "stock_item",
    entityId,
    payload,
    user,
  });
}

export function listPendingInventoryActions() {
  return syncManager
    .getQueue()
    .filter((item) =>
      ["inventory_count", "inventory_adjustment", "inventory_transfer"].includes(item.workflow)
    );
}
