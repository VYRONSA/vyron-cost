import { syncManager } from "@/platform/sync";

export function queueScanForOfflineValidation(input: {
  payload: Record<string, unknown>;
  workflow: string;
  context?: Record<string, unknown>;
  actorEmail?: string;
}) {
  return syncManager.enqueue({
    workflow: "barcode_validation",
    action: "validate_scan",
    entityType: "barcode",
    entityId: String(input.payload.value ?? "unknown"),
    payload: {
      barcode: input.payload.value,
      scanWorkflow: input.workflow,
      context: input.context,
      raw: input.payload,
    },
    user: input.actorEmail ?? "vyron-ops-mobile",
  });
}

export function listPendingScans() {
  return syncManager.getQueue().filter((item) => item.workflow === "barcode_validation");
}
