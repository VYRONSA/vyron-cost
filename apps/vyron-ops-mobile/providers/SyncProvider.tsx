import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { conflictResolver, deviceRegistration, networkMonitor, syncEvents, syncManager } from "@/platform/sync";
import type { ConnectionState, ConflictResolution, RegisteredDevice, SyncConflict, SyncMetricsSnapshot, SyncQueueItem } from "@/types/sync";
import type { SyncHistoryEntry } from "@/types/sync";

type SyncContextValue = {
  connectionState: ConnectionState;
  metrics: SyncMetricsSnapshot;
  queue: SyncQueueItem[];
  history: SyncHistoryEntry[];
  conflicts: SyncConflict[];
  device: RegisteredDevice | null;
  isSyncing: boolean;
  enqueue: typeof syncManager.enqueue;
  processQueue: () => Promise<void>;
  resolveConflict: (queueId: string, resolution: ConflictResolution) => void;
  retryFailed: () => Promise<void>;
  actorEmail: string;
  companyId: string | null;
  workspaceId: string | null;
};

const SyncCtx = createContext<SyncContextValue | null>(null);

type SyncProviderProps = {
  children: ReactNode;
  actorEmail?: string | null;
  companyId?: string | null;
  workspaceId?: string | null;
};

export function SyncProvider({ children, actorEmail, companyId, workspaceId }: SyncProviderProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("online");
  const [metrics, setMetrics] = useState<SyncMetricsSnapshot>(syncManager.getMetrics());
  const [queue, setQueue] = useState<SyncQueueItem[]>(syncManager.getQueue());
  const [history, setHistory] = useState<SyncHistoryEntry[]>(syncManager.getHistory());
  const [conflicts, setConflicts] = useState<SyncConflict[]>(syncManager.getOpenConflicts());
  const [device, setDevice] = useState<RegisteredDevice | null>(deviceRegistration.getDevice());
  const actor = actorEmail ?? "vyron-ops-mobile";

  useEffect(() => {
    void syncManager.initialize({ user: actor, companyId, workspaceId });
    const unsubNetwork = networkMonitor.subscribe(setConnectionState);
    const refresh = () => {
      setMetrics(syncManager.getMetrics());
      setQueue(syncManager.getQueue());
      setHistory(syncManager.getHistory());
      setConflicts(syncManager.getOpenConflicts());
      setDevice(deviceRegistration.getDevice());
    };
    const unsubs = [
      unsubNetwork,
      syncEvents.on("queue_updated", refresh),
      syncEvents.on("sync_completed", refresh),
      syncEvents.on("sync_failed", refresh),
      syncEvents.on("conflict_detected", refresh),
      conflictResolver.subscribe(() => refresh()),
    ];
    refresh();
    return () => {
      for (const unsub of unsubs) unsub?.();
    };
  }, [actor, companyId, workspaceId]);

  const value = useMemo<SyncContextValue>(
    () => ({
      connectionState,
      metrics,
      queue,
      history,
      conflicts,
      device,
      isSyncing: metrics.isSyncing,
      enqueue: syncManager.enqueue.bind(syncManager),
      processQueue: () => syncManager.processQueue(),
      resolveConflict: (queueId, resolution) => syncManager.resolveConflict(queueId, resolution),
      retryFailed: () => syncManager.retryFailed(),
      actorEmail: actor,
      companyId: companyId ?? null,
      workspaceId: workspaceId ?? null,
    }),
    [connectionState, metrics, queue, history, conflicts, device, actor, companyId, workspaceId]
  );

  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useSync() {
  const context = useContext(SyncCtx);
  if (!context) throw new Error("useSync must be used within SyncProvider");
  return context;
}

export function useSyncOptional() {
  return useContext(SyncCtx);
}
