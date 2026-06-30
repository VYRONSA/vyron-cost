import { syncStorage } from "@/platform/sync/SyncStorage";
import type { EnqueueSyncInput, SyncQueueItem } from "@/types/sync";
import { WORKFLOW_SYNC_PRIORITY as PRIORITY_MAP } from "@/types/sync";

function createQueueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SyncQueue {
  private items: SyncQueueItem[] = [];
  private loaded = false;

  async hydrate() {
    if (this.loaded) return;
    this.items = await syncStorage.loadQueue<SyncQueueItem>();
    this.loaded = true;
  }

  async persist() {
    await syncStorage.saveQueue(this.items);
  }

  list() {
    return [...this.items];
  }

  listProcessable() {
    return this.items
      .filter((item) => item.status === "pending" || item.status === "failed")
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  }

  async enqueue(input: EnqueueSyncInput) {
    await this.hydrate();
    const item: SyncQueueItem = {
      id: createQueueId(),
      workflow: input.workflow,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
      createdAt: new Date().toISOString(),
      user: input.user,
      companyId: input.companyId ?? null,
      workspaceId: input.workspaceId ?? null,
      status: "pending",
      retryCount: 0,
      priority: input.priority ?? PRIORITY_MAP[input.workflow],
      lastError: null,
    };
    this.items.push(item);
    await this.persist();
    return item;
  }

  async update(item: SyncQueueItem) {
    const index = this.items.findIndex((row) => row.id === item.id);
    if (index >= 0) this.items[index] = item;
    await this.persist();
  }

  async remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
    await this.persist();
  }

  countByStatus(status: SyncQueueItem["status"]) {
    return this.items.filter((item) => item.status === status).length;
  }
}

export const syncQueue = new SyncQueue();
