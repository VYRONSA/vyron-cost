import type { StoreOrderWorkflowAction } from "@/types/store-orders";
import type { SyncWorkflow } from "@/types/sync";

export function mapStoreOrderSyncWorkflow(action: StoreOrderWorkflowAction): SyncWorkflow {
  if (action === "mark_delivered") return "delivery";
  if (action === "dispatch") return "dispatch";
  return "picking";
}
