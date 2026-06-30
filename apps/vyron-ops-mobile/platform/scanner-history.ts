import type { ScanHistoryEntry, ScanValidationStatus, ScanWorkflow } from "@/types/scanner";

const MAX_HISTORY = 50;
const history: ScanHistoryEntry[] = [];

export function recordScanHistory(entry: Omit<ScanHistoryEntry, "id">) {
  history.unshift({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  return history[0];
}

export function listScanHistory() {
  return [...history];
}

export function getScanDashboardStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = history.filter((event) => event.scannedAt.slice(0, 10) === today);
  const failed = todayEvents.filter((event) => event.status !== "success").length;
  const wrong = todayEvents.filter((event) => event.status === "wrong_item").length;
  const success = todayEvents.filter((event) => event.status === "success").length;
  const total = todayEvents.length;
  return {
    scansToday: total,
    failedScans: failed,
    wrongItemAttempts: wrong,
    verificationRate: total ? `${Math.round((success / total) * 100)}%` : "100%",
  };
}

export function wasDuplicateScan(barcode: string, workflow: ScanWorkflow, windowMs = 3000) {
  const cutoff = Date.now() - windowMs;
  return history.some(
    (entry) =>
      entry.barcode === barcode &&
      entry.workflow === workflow &&
      new Date(entry.scannedAt).getTime() >= cutoff
  );
}
