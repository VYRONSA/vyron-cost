export type SyncEventName =
  | "queue_updated"
  | "sync_started"
  | "sync_progress"
  | "sync_completed"
  | "sync_failed"
  | "offline_enabled"
  | "back_online"
  | "conflict_detected";

export type SyncEventPayload = {
  queue_updated: { pending: number; failed: number };
  sync_started: { total: number };
  sync_progress: { completed: number; total: number; currentWorkflow: string };
  sync_completed: { completed: number; durationMs: number };
  sync_failed: { queueId: string; error: string };
  offline_enabled: { pending: number };
  back_online: Record<string, never>;
  conflict_detected: { queueId: string; message: string };
};

type SyncEventListener<T extends SyncEventName> = (payload: SyncEventPayload[T]) => void;

class SyncEventBus {
  private listeners: Partial<Record<SyncEventName, Set<SyncEventListener<SyncEventName>>>> = {};

  on<T extends SyncEventName>(event: T, listener: SyncEventListener<T>) {
    if (!this.listeners[event]) this.listeners[event] = new Set();
    this.listeners[event]!.add(listener as SyncEventListener<SyncEventName>);
    return () => this.listeners[event]?.delete(listener as SyncEventListener<SyncEventName>);
  }

  emit<T extends SyncEventName>(event: T, payload: SyncEventPayload[T]) {
    for (const listener of this.listeners[event] ?? []) {
      listener(payload);
    }
  }
}

export const syncEvents = new SyncEventBus();
