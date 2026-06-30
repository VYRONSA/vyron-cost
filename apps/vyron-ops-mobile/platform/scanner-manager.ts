import { recordAuditEvent } from "@/services/audit/audit-service";
import { validateScanOnServer } from "@/services/scanner/scan-api";
import { scheduleLocalNotification } from "@/platform/notifications";
import { getScannerSettings } from "@/platform/scanner-settings";
import { queueScanForOfflineValidation } from "@/platform/scanner-offline";
import { isNetworkFailure } from "@/platform/sync";
import { getScanDashboardStats, listScanHistory, recordScanHistory, wasDuplicateScan } from "@/platform/scanner-history";
import { buildSimulatedPayload, cameraScannerAdapter, hardwareScannerAdapter, rfidScannerAdapter } from "@/platform/scanner-adapters";
import type {
  ScanContext,
  ScanRawPayload,
  ScanValidationResult,
  ScanWorkflow,
} from "@/types/scanner";

export type ScanRequest = {
  workflow: ScanWorkflow;
  context?: ScanContext;
  actorEmail?: string;
  title?: string;
};

export type ScanListener = (result: ScanValidationResult) => void;

type PendingRequest = ScanRequest & {
  resolve: (result: ScanValidationResult) => void;
  reject: (error: Error) => void;
};

/** Single enterprise scanner manager — all workflows route through here. */
class ScannerManager {
  private listeners = new Set<ScanListener>();
  private pending: PendingRequest | null = null;
  private isOpen = false;
  private lastBarcode: string | null = null;
  private batchBuffer: ScanValidationResult[] = [];

  subscribe(listener: ScanListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPendingRequest() {
    return this.pending;
  }

  clearPendingRequest() {
    this.pending = null;
  }

  isScannerOpen() {
    return this.isOpen;
  }

  async open(): Promise<void> {
    this.isOpen = true;
    const settings = getScannerSettings();
    const adapter = settings.hardwareScannerEnabled ? hardwareScannerAdapter : cameraScannerAdapter;
    await adapter.open();
  }

  async close(): Promise<void> {
    this.isOpen = false;
    await cameraScannerAdapter.close();
    await hardwareScannerAdapter.close();
    await rfidScannerAdapter.close();
  }

  requestScan(request: ScanRequest) {
    return new Promise<ScanValidationResult>((resolve, reject) => {
      this.pending = { ...request, resolve, reject };
    });
  }

  completePending(result: ScanValidationResult) {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(result);
    for (const listener of this.listeners) listener(result);
  }

  rejectPending(error: Error) {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }

  async readAndValidate(payload: ScanRawPayload, request: ScanRequest): Promise<ScanValidationResult> {
    const settings = getScannerSettings();

    if (wasDuplicateScan(payload.value, request.workflow)) {
      const duplicate: ScanValidationResult = {
        valid: false,
        status: "duplicate",
        barcode: payload.value,
        symbology: payload.symbology,
        workflow: request.workflow,
        actual: { label: payload.value },
        recommendation: "This barcode was scanned moments ago.",
        action: "Continue or scan a different item",
      };
      await this.dispatchResult(duplicate, request);
      return duplicate;
    }

    try {
      const result = await validateScanOnServer({
        barcode: payload.value,
        workflow: request.workflow,
        context: request.context,
      });
      const enriched: ScanValidationResult = {
        ...result,
        symbology: payload.symbology,
        barcode: payload.value,
        workflow: request.workflow,
      };
      await this.dispatchResult(enriched, request);
      return enriched;
    } catch (error) {
      if (isNetworkFailure(error)) {
        await queueScanForOfflineValidation({
          payload,
          workflow: request.workflow,
          context: request.context,
          actorEmail: request.actorEmail,
        });
      }
      const fallback: ScanValidationResult = {
        valid: false,
        status: "unknown",
        barcode: payload.value,
        symbology: payload.symbology,
        workflow: request.workflow,
        recommendation: error instanceof Error ? error.message : "Validation unavailable offline.",
        action: "Queued for online validation",
      };
      await this.dispatchResult(fallback, request);
      return fallback;
    } finally {
      if (settings.batchModeEnabled) {
        // Architecture only — batch buffer retained for future complete action.
      }
    }
  }

  async simulateScan(value: string, request: ScanRequest, format = "code128") {
    const payload = buildSimulatedPayload(value, format);
    return this.readAndValidate(payload, request);
  }

  private async dispatchResult(result: ScanValidationResult, request: ScanRequest) {
    this.lastBarcode = result.barcode;
    recordScanHistory({
      scannedAt: new Date().toISOString(),
      user: request.actorEmail || "operator",
      item: result.matched?.description || result.actual?.label || result.barcode,
      workflow: request.workflow,
      status: result.status,
      barcode: result.barcode,
    });

    recordAuditEvent({
      module: "scanner",
      action: result.valid ? "scan_validated" : "scan_rejected",
      entityType: "barcode",
      entityId: result.barcode,
      entityLabel: result.matched?.description || result.barcode,
      actorEmail: request.actorEmail,
      metadata: {
        workflow: request.workflow,
        status: result.status,
        recommendation: result.recommendation,
      },
    });

    if (!result.valid) {
      if (result.status === "wrong_item") {
        await scheduleLocalNotification("Wrong item scanned", result.recommendation);
      } else if (result.status === "unknown") {
        await scheduleLocalNotification("Unknown barcode", result.recommendation);
      } else if (result.status === "duplicate") {
        await scheduleLocalNotification("Duplicate scan", result.recommendation);
      }
    } else {
      await scheduleLocalNotification("Scan completed", result.matched?.description || result.barcode);
    }

    this.completePending(result);
  }

  getHistory() {
    return listScanHistory();
  }

  getDashboardStats() {
    return getScanDashboardStats();
  }

  getBatchBuffer() {
    return [...this.batchBuffer];
  }
}

export const scannerManager = new ScannerManager();

// Legacy export — all callers should migrate to scannerManager.
export { scannerManager as scannerService };
