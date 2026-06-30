import { recordAuditEvent } from "@/services/audit/audit-service";
import { scheduleLocalNotification } from "@/platform/notifications";
import { conflictResolver } from "@/platform/sync/ConflictResolver";
import { deviceRegistration } from "@/platform/sync/DeviceRegistration";
import { isNetworkFailure, networkMonitor } from "@/platform/sync/NetworkMonitor";
import { syncEvents } from "@/platform/sync/SyncEvents";
import { syncMetrics } from "@/platform/sync/SyncMetrics";
import { syncQueue } from "@/platform/sync/SyncQueue";
import { syncStorage } from "@/platform/sync/SyncStorage";
import { backoffDelayMs, executeSyncQueueItem, isConflictError } from "@/platform/sync/SyncWorker";
import type { EnqueueSyncInput, SyncHistoryEntry, SyncQueueItem } from "@/types/sync";

class SyncManager {
  private syncing = false;
  private initialized = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  async initialize(input?: {
    user?: string | null;
    workspaceId?: string | null;
    companyId?: string | null;
  }) {
    if (this.initialized) return;
    await syncQueue.hydrate();
    const history = await syncStorage.loadHistory<SyncHistoryEntry>();
    await syncMetrics.hydrate(history);
    await deviceRegistration.initialize({
      currentUser: input?.user,
      workspaceId: input?.workspaceId,
      companyId: input?.companyId,
    });
    await networkMonitor.start();
    networkMonitor.subscribe((state) => {
      if (state === "offline") {
        void scheduleLocalNotification("Offline mode enabled", "Operations will queue until connection returns.");
        syncEvents.emit("offline_enabled", { pending: syncQueue.countByStatus("pending") });
      }
      if (state === "online" || state === "weak") {
        syncEvents.emit("back_online", {});
        void this.processQueue();
      }
    });
    this.initialized = true;
    if (networkMonitor.isOnline()) void this.processQueue();
  }

  isSyncing() {
    return this.syncing;
  }

  getConnectionState() {
    return networkMonitor.getState();
  }

  async enqueue(input: EnqueueSyncInput) {
    const item = await syncQueue.enqueue(input);
    recordAuditEvent({
      module: "sync",
      action: "sync_queued",
      entityType: input.entityType,
      entityId: input.entityId,
      actorEmail: input.user,
      metadata: { workflow: input.workflow, action: input.action },
    });
    syncEvents.emit("queue_updated", {
      pending: syncQueue.countByStatus("pending"),
      failed: syncQueue.countByStatus("failed") + syncQueue.countByStatus("conflict"),
    });
    if (networkMonitor.isOnline()) void this.processQueue();
    return item.id;
  }

  async processQueue() {
    if (this.syncing || !networkMonitor.isOnline()) return;
    const pending = syncQueue.listProcessable();
    if (!pending.length) return;

    this.syncing = true;
    networkMonitor.setSyncing(true);
    await deviceRegistration.heartbeat("syncing");
    const started = Date.now();
    syncEvents.emit("sync_started", { total: pending.length });

    let completed = 0;
    for (const item of pending) {
      syncEvents.emit("sync_progress", {
        completed,
        total: pending.length,
        currentWorkflow: item.workflow,
      });

      const resolution = conflictResolver.getResolution(item.id);
      if (resolution === "use_server" || resolution === "refresh") {
        await syncQueue.remove(item.id);
        completed += 1;
        continue;
      }

      const working: SyncQueueItem = { ...item, status: "syncing", lastError: null };
      await syncQueue.update(working);
      const itemStarted = Date.now();

      try {
        await executeSyncQueueItem(working);
        await syncQueue.remove(working.id);
        const historyEntry = syncMetrics.record({
          timestamp: new Date().toISOString(),
          workflow: working.workflow,
          action: working.action,
          durationMs: Date.now() - itemStarted,
          status: "completed",
          error: null,
          queueId: working.id,
        });
        await syncStorage.saveHistory(syncMetrics.exportHistory());
        recordAuditEvent({
          module: "sync",
          action: "sync_completed",
          entityType: working.entityType,
          entityId: working.entityId,
          actorEmail: working.user,
          metadata: { workflow: working.workflow, queueId: working.id },
        });
        completed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        if (isConflictError(error)) {
          const conflict = conflictResolver.detectConflict(working, message, working.entityId);
          working.status = "conflict";
          working.lastError = message;
          await syncQueue.update(working);
          syncMetrics.record({
            timestamp: new Date().toISOString(),
            workflow: working.workflow,
            action: working.action,
            durationMs: Date.now() - itemStarted,
            status: "conflict",
            error: message,
            queueId: working.id,
          });
          await syncStorage.saveHistory(syncMetrics.exportHistory());
          syncEvents.emit("conflict_detected", { queueId: working.id, message });
          await scheduleLocalNotification("Conflict detected", message);
          recordAuditEvent({
            module: "sync",
            action: "sync_conflict",
            entityType: working.entityType,
            entityId: working.entityId,
            actorEmail: working.user,
            metadata: { workflow: working.workflow, message },
          });
        } else {
          working.retryCount += 1;
          working.status = working.retryCount >= 5 ? "failed" : "pending";
          working.lastError = message;
          await syncQueue.update(working);
          syncMetrics.record({
            timestamp: new Date().toISOString(),
            workflow: working.workflow,
            action: working.action,
            durationMs: Date.now() - itemStarted,
            status: "failed",
            error: message,
            queueId: working.id,
          });
          await syncStorage.saveHistory(syncMetrics.exportHistory());
          syncEvents.emit("sync_failed", { queueId: working.id, error: message });
          if (working.retryCount >= 5) {
            await scheduleLocalNotification("Synchronization failed", message);
            await deviceRegistration.heartbeat("error");
          } else if (isNetworkFailure(error)) {
            this.scheduleRetry(backoffDelayMs(working.retryCount));
            break;
          }
          recordAuditEvent({
            module: "sync",
            action: "sync_failed",
            entityType: working.entityType,
            entityId: working.entityId,
            actorEmail: working.user,
            metadata: { workflow: working.workflow, retryCount: working.retryCount, message },
          });
        }
      }
    }

    const durationMs = Date.now() - started;
    this.syncing = false;
    networkMonitor.setSyncing(false);
    await deviceRegistration.heartbeat(networkMonitor.isOnline() ? "online" : "offline");
    syncEvents.emit("sync_completed", { completed, durationMs });
    syncEvents.emit("queue_updated", {
      pending: syncQueue.countByStatus("pending"),
      failed: syncQueue.countByStatus("failed") + syncQueue.countByStatus("conflict"),
    });
    if (completed > 0) {
      await scheduleLocalNotification("Synchronization complete", `${completed} operations synced.`);
    }
  }

  private scheduleRetry(delayMs: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      void this.processQueue();
    }, delayMs);
  }

  getMetrics() {
    return syncMetrics.snapshot(syncQueue.list(), this.syncing);
  }

  getQueue() {
    return syncQueue.list();
  }

  getHistory() {
    return syncMetrics.getHistory();
  }

  getOpenConflicts() {
    return conflictResolver.listOpenConflicts();
  }

  resolveConflict(queueId: string, resolution: import("@/types/sync").ConflictResolution) {
    conflictResolver.resolve(queueId, resolution);
    void this.processQueue();
  }

  async retryFailed() {
    const items = syncQueue.list().filter((item) => item.status === "failed" || item.status === "conflict");
    for (const item of items) {
      await syncQueue.update({ ...item, status: "pending", retryCount: 0, lastError: null });
    }
    await this.processQueue();
  }
}

export const syncManager = new SyncManager();
