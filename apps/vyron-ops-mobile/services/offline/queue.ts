import { syncManager } from "@/platform/sync";
import type { OfflineQueueItem } from "@/types";

/** @deprecated Use syncManager from @/platform/sync */
export class OfflineQueue {
  enqueue(item: Omit<OfflineQueueItem, "id" | "createdAt">) {
    void syncManager.enqueue({
      workflow: item.module as never,
      action: item.action,
      entityType: item.module,
      entityId: String(item.payload.id ?? item.action),
      payload: item.payload,
      user: "vyron-ops-mobile",
    });
  }

  list() {
    return syncManager.getQueue().map((item) => ({
      id: item.id,
      module: item.workflow,
      action: item.action,
      payload: item.payload,
      createdAt: item.createdAt,
    }));
  }

  clear() {
    // Legacy clear is intentionally unsupported — use sync dashboard retry/resolve flows.
  }
}

export const offlineQueue = new OfflineQueue();
