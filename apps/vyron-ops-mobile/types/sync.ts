export type SyncWorkflow =
  | "receiving"
  | "production"
  | "picking"
  | "dispatch"
  | "delivery"
  | "sales"
  | "inventory_count"
  | "inventory_adjustment"
  | "inventory_transfer"
  | "barcode_validation";

export type SyncQueueStatus = "pending" | "syncing" | "completed" | "failed" | "conflict";

export type ConnectionState = "online" | "offline" | "weak" | "syncing";

export type SyncQueueItem = {
  id: string;
  workflow: SyncWorkflow;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  user: string;
  companyId: string | null;
  workspaceId: string | null;
  status: SyncQueueStatus;
  retryCount: number;
  priority: number;
  lastError: string | null;
};

export type SyncHistoryEntry = {
  id: string;
  timestamp: string;
  workflow: SyncWorkflow;
  action: string;
  durationMs: number;
  status: "completed" | "failed" | "conflict";
  error: string | null;
  queueId: string;
};

export type SyncConflict = {
  queueId: string;
  workflow: SyncWorkflow;
  action: string;
  entityLabel: string;
  serverMessage: string;
  detectedAt: string;
};

export type ConflictResolution = "retry" | "refresh" | "keep_local" | "use_server";

export type SyncMetricsSnapshot = {
  pendingSyncs: number;
  failedSyncs: number;
  completedToday: number;
  lastSuccessfulSync: string | null;
  offlineDevices: number;
  averageSyncTimeMs: number;
  isSyncing: boolean;
};

export type RegisteredDevice = {
  deviceId: string;
  friendlyName: string;
  appVersion: string;
  platform: string;
  lastSeen: string;
  currentUser: string | null;
  workspaceId: string | null;
  companyId: string | null;
  health: "online" | "offline" | "syncing" | "needs_attention" | "error";
};

export type EnqueueSyncInput = {
  workflow: SyncWorkflow;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  user: string;
  companyId?: string | null;
  workspaceId?: string | null;
  priority?: number;
};

export const WORKFLOW_SYNC_PRIORITY: Record<SyncWorkflow, number> = {
  receiving: 10,
  barcode_validation: 15,
  sales: 18,
  inventory_count: 20,
  inventory_adjustment: 20,
  inventory_transfer: 20,
  production: 30,
  picking: 40,
  dispatch: 50,
  delivery: 60,
};
