import { syncManager } from "@/platform/sync";

export function queueProductionUpdateForOfflineSync(
  runId: string,
  action: string,
  payload: Record<string, unknown>,
  user = "vyron-ops-mobile"
) {
  return syncManager.enqueue({
    workflow: "production",
    action,
    entityType: "production_run",
    entityId: runId,
    payload: { runId, ...payload },
    user,
  });
}

export function queueProductionCompleteForOfflineSync(runId: string, payload: Record<string, unknown>, user?: string) {
  return queueProductionUpdateForOfflineSync(runId, "complete_run", { completion: payload }, user);
}

export function listPendingProductionUpdates() {
  return syncManager.getQueue().filter((item) => item.workflow === "production");
}
