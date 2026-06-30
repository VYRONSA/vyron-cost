import type { ConflictResolution, SyncConflict, SyncQueueItem } from "@/types/sync";

type ConflictListener = (conflict: SyncConflict) => void;

class ConflictResolver {
  private listeners = new Set<ConflictListener>();
  private openConflicts = new Map<string, SyncConflict>();
  private resolutions = new Map<string, ConflictResolution>();

  subscribe(listener: ConflictListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  detectConflict(item: SyncQueueItem, serverMessage: string, entityLabel: string) {
    const conflict: SyncConflict = {
      queueId: item.id,
      workflow: item.workflow,
      action: item.action,
      entityLabel,
      serverMessage,
      detectedAt: new Date().toISOString(),
    };
    this.openConflicts.set(item.id, conflict);
    for (const listener of this.listeners) listener(conflict);
    return conflict;
  }

  listOpenConflicts() {
    return [...this.openConflicts.values()];
  }

  resolve(queueId: string, resolution: ConflictResolution) {
    this.resolutions.set(queueId, resolution);
    this.openConflicts.delete(queueId);
    return resolution;
  }

  getResolution(queueId: string) {
    return this.resolutions.get(queueId) ?? null;
  }

  shouldDropLocal(queueId: string) {
    const resolution = this.resolutions.get(queueId);
    return resolution === "use_server" || resolution === "refresh";
  }

  shouldRetry(queueId: string) {
    const resolution = this.resolutions.get(queueId);
    return resolution === "retry" || resolution === "keep_local";
  }
}

export const conflictResolver = new ConflictResolver();
