import { syncManager } from "@/platform/sync";

/** @deprecated Use syncManager.enqueue via platform sync engine. */
export function queueReceiptForOfflineSync(poId: string, payload: Record<string, unknown>, user = "vyron-ops-mobile") {
  return syncManager.enqueue({
    workflow: "receiving",
    action: "confirm_receipt",
    entityType: "purchase_order",
    entityId: poId,
    payload: { poId, receipt: payload },
    user,
  });
}

export function listPendingReceipts() {
  return syncManager.getQueue().filter((item) => item.workflow === "receiving");
}
