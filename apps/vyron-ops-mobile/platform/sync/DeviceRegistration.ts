import { Platform } from "react-native";
import Constants from "expo-constants";
import { appConfig } from "@/utils/config";
import { syncStorage } from "@/platform/sync/SyncStorage";
import type { RegisteredDevice } from "@/types/sync";

function createDeviceId() {
  return `vyron-ops-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class DeviceRegistration {
  private device: RegisteredDevice | null = null;

  async initialize(input: {
    currentUser?: string | null;
    workspaceId?: string | null;
    companyId?: string | null;
    health?: RegisteredDevice["health"];
  }) {
    const stored = await syncStorage.loadDevice<RegisteredDevice>();
    const device: RegisteredDevice = {
      deviceId: stored?.deviceId ?? createDeviceId(),
      friendlyName: stored?.friendlyName ?? `${Platform.OS} tablet`,
      appVersion: appConfig.version,
      platform: Platform.OS,
      lastSeen: new Date().toISOString(),
      currentUser: input.currentUser ?? stored?.currentUser ?? null,
      workspaceId: input.workspaceId ?? stored?.workspaceId ?? null,
      companyId: input.companyId ?? stored?.companyId ?? null,
      health: input.health ?? stored?.health ?? "online",
    };
    this.device = device;
    await syncStorage.saveDevice(device);
    return device;
  }

  async heartbeat(health: RegisteredDevice["health"], user?: string | null) {
    if (!this.device) return null;
    this.device = {
      ...this.device,
      lastSeen: new Date().toISOString(),
      health,
      currentUser: user ?? this.device.currentUser,
      appVersion: Constants.expoConfig?.version ?? appConfig.version,
    };
    await syncStorage.saveDevice(this.device);
    return this.device;
  }

  getDevice() {
    return this.device;
  }
}

export const deviceRegistration = new DeviceRegistration();
