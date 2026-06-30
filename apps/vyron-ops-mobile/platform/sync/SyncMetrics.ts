import type { SyncHistoryEntry, SyncMetricsSnapshot, SyncQueueItem } from "@/types/sync";

const MAX_HISTORY = 500;
const syncDurations: number[] = [];

class SyncMetrics {
  private history: SyncHistoryEntry[] = [];
  private lastSuccessfulSync: string | null = null;

  async hydrate(history: SyncHistoryEntry[]) {
    this.history = history;
    this.lastSuccessfulSync =
      history.find((entry) => entry.status === "completed")?.timestamp ?? this.lastSuccessfulSync;
  }

  getHistory() {
    return [...this.history];
  }

  record(entry: Omit<SyncHistoryEntry, "id">) {
    const row: SyncHistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    this.history.unshift(row);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    if (row.status === "completed") {
      this.lastSuccessfulSync = row.timestamp;
      syncDurations.push(row.durationMs);
      if (syncDurations.length > 100) syncDurations.shift();
    }
    return row;
  }

  snapshot(queue: SyncQueueItem[], isSyncing: boolean, offlineDevices = 1): SyncMetricsSnapshot {
    const today = new Date().toISOString().slice(0, 10);
    const completedToday = this.history.filter(
      (entry) => entry.status === "completed" && entry.timestamp.slice(0, 10) === today
    ).length;
    const averageSyncTimeMs = syncDurations.length
      ? Math.round(syncDurations.reduce((sum, value) => sum + value, 0) / syncDurations.length)
      : 0;

    return {
      pendingSyncs: queue.filter((item) => item.status === "pending").length,
      failedSyncs: queue.filter((item) => item.status === "failed" || item.status === "conflict").length,
      completedToday,
      lastSuccessfulSync: this.lastSuccessfulSync,
      offlineDevices,
      averageSyncTimeMs,
      isSyncing,
    };
  }

  exportHistory() {
    return [...this.history];
  }
}

export const syncMetrics = new SyncMetrics();
