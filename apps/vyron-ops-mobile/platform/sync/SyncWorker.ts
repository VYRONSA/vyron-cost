import { confirmPurchaseOrderReceipt } from "@/services/receiving/purchase-order-api";
import { completeProductionRun, startProductionRun } from "@/services/production/production-api";
import { applyStoreOrderWorkflow } from "@/services/store-orders/store-order-api";
import {
  postInventoryAdjustment,
  postStockCount,
  postStockTransfer,
} from "@/services/inventory/inventory-api";
import { validateScanOnServer } from "@/services/scanner/scan-api";
import type { SyncQueueItem } from "@/types/sync";
import { ApiClientError } from "@/services/api/types";

export async function executeSyncQueueItem(item: SyncQueueItem) {
  const payload = item.payload;

  switch (item.workflow) {
    case "receiving":
      if (item.action === "confirm_receipt") {
        return confirmPurchaseOrderReceipt(String(payload.poId), payload.receipt as never);
      }
      break;
    case "production":
      if (item.action === "start_run") {
        return startProductionRun(String(payload.runId), payload.actor as string | undefined);
      }
      if (item.action === "complete_run") {
        return completeProductionRun(String(payload.runId), payload.completion as never);
      }
      break;
    case "picking":
    case "dispatch":
    case "delivery":
      return applyStoreOrderWorkflow(String(payload.orderId), payload.action as never, {
        note: payload.note as string | undefined,
        actor: payload.actor as string | undefined,
      });
    case "inventory_count":
      return postStockCount(payload.count as never);
    case "inventory_adjustment":
      return postInventoryAdjustment(payload.adjustment as never);
    case "inventory_transfer":
      return postStockTransfer(payload.transfer as never);
    case "barcode_validation":
      return validateScanOnServer({
        barcode: String(payload.barcode),
        workflow: payload.scanWorkflow as never,
        context: payload.context as never,
      });
    default:
      break;
  }

  throw new Error(`Unsupported sync action ${item.workflow}/${item.action}`);
}

export function isConflictError(error: unknown) {
  if (error instanceof ApiClientError) {
    return error.status === 409 || error.status === 412 || error.status === 422;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("conflict") || message.includes("changed") || message.includes("stale");
  }
  return false;
}

export function backoffDelayMs(retryCount: number) {
  return Math.min(60_000, 1000 * 2 ** retryCount);
}
