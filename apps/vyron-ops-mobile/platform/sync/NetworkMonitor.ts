import type { ConnectionState } from "@/types/sync";

type NetworkListener = (state: ConnectionState) => void;

/** Global network monitor — single connection state for all workflows. */
class NetworkMonitor {
  private state: ConnectionState = "online";
  private listeners = new Set<NetworkListener>();
  private unsubscribeNative: (() => void) | null = null;
  private manualSyncing = false;

  getState() {
    return this.state;
  }

  isOnline() {
    return this.state === "online" || this.state === "weak" || this.state === "syncing";
  }

  setSyncing(active: boolean) {
    this.manualSyncing = active;
    this.publish(active ? "syncing" : this.deriveConnection());
  }

  private deriveConnection(): ConnectionState {
    return this.lastReachable === false ? "offline" : this.lastWeak ? "weak" : "online";
  }

  private lastReachable = true;
  private lastWeak = false;

  subscribe(listener: NetworkListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private publish(next: ConnectionState) {
    if (this.manualSyncing && next !== "offline") {
      this.state = "syncing";
    } else {
      this.state = next;
    }
    for (const listener of this.listeners) listener(this.state);
  }

  async start() {
    try {
      const Network = await import("expo-network");
      const current = await Network.getNetworkStateAsync();
      this.lastReachable = current.isConnected ?? true;
      this.lastWeak = current.type === Network.NetworkStateType.CELLULAR;
      this.publish(this.deriveConnection());

      this.unsubscribeNative = Network.addNetworkStateListener((event) => {
        this.lastReachable = event.isConnected ?? false;
        this.lastWeak = event.type === Network.NetworkStateType.CELLULAR;
        this.publish(this.deriveConnection());
      }).remove;
    } catch {
      this.publish("online");
    }
  }

  stop() {
    this.unsubscribeNative?.();
    this.unsubscribeNative = null;
  }
}

export const networkMonitor = new NetworkMonitor();

export function isNetworkFailure(error: unknown) {
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("network") || message.includes("fetch") || message.includes("failed");
  }
  return false;
}
