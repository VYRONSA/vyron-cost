import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { scannerManager, type ScanRequest } from "@/platform/scanner-manager";
import { getScannerSettings, updateScannerSettings } from "@/platform/scanner-settings";
import type { ScanContext, ScanValidationResult, ScanWorkflow, ScannerSettings } from "@/types/scanner";

export function useScanner() {
  const router = useRouter();
  const [lastResult, setLastResult] = useState<ScanValidationResult | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(getScannerSettings());

  useEffect(() => {
    const unsubscribe = scannerManager.subscribe((result) => setLastResult(result));
    return () => {
      unsubscribe();
    };
  }, []);

  const launchScan = useCallback(
    async (input: ScanRequest) => {
      const promise = scannerManager.requestScan(input);
      router.push("/(tabs)/scanner");
      return promise;
    },
    [router]
  );

  const scanValue = useCallback(
    async (value: string, workflow: ScanWorkflow, context?: ScanContext, actorEmail?: string) => {
      return scannerManager.simulateScan(value, { workflow, context, actorEmail });
    },
    []
  );

  const refreshSettings = useCallback(() => {
    setSettings(getScannerSettings());
  }, []);

  const patchSettings = useCallback((patch: Partial<ScannerSettings>) => {
    const next = updateScannerSettings(patch);
    setSettings({ ...next });
    return next;
  }, []);

  return {
    launchScan,
    scanValue,
    lastResult,
    clearLastResult: () => setLastResult(null),
    history: scannerManager.getHistory(),
    stats: scannerManager.getDashboardStats(),
    settings,
    patchSettings,
    refreshSettings,
    pendingRequest: scannerManager.getPendingRequest(),
  };
}
