import { syncManager, isNetworkFailure, networkMonitor } from "@/platform/sync";
import type { EnqueueSyncInput } from "@/types/sync";

export type SyncAwareResult<T> = {
  mode: "online" | "queued";
  result?: T;
  queueId?: string;
};

export async function executeOrEnqueue<T>(
  input: EnqueueSyncInput & { onlineExecute: () => Promise<T> }
): Promise<SyncAwareResult<T>> {
  if (!networkMonitor.isOnline()) {
    const queueId = await syncManager.enqueue(input);
    return { mode: "queued", queueId };
  }

  try {
    const result = await input.onlineExecute();
    return { mode: "online", result };
  } catch (error) {
    if (isNetworkFailure(error)) {
      const queueId = await syncManager.enqueue(input);
      return { mode: "queued", queueId };
    }
    throw error;
  }
}

export function unwrapSyncResult<T>(value: SyncAwareResult<T>): T {
  if (value.mode === "online" && value.result !== undefined) return value.result;
  return { queued: true, queueId: value.queueId } as T;
}
