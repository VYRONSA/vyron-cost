import type { ScannerSettings } from "@/types/scanner";
import { DEFAULT_SCANNER_SETTINGS } from "@/types/scanner";

let settings: ScannerSettings = { ...DEFAULT_SCANNER_SETTINGS };

export function getScannerSettings() {
  return { ...settings };
}

export function updateScannerSettings(patch: Partial<ScannerSettings>) {
  settings = { ...settings, ...patch };
  return settings;
}

export function resetScannerSettings() {
  settings = { ...DEFAULT_SCANNER_SETTINGS };
  return settings;
}
