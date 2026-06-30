import type { ScanRawPayload, ScanSymbology } from "@/types/scanner";

export type ScannerHardwareAdapter = {
  id: string;
  label: string;
  open: () => Promise<void>;
  close: () => Promise<void>;
  captureOnce: () => Promise<ScanRawPayload | null>;
};

function inferSymbology(format: string): ScanSymbology {
  const value = format.toLowerCase();
  if (value.includes("qr")) return "qr";
  if (value.includes("ean")) return "ean13";
  if (value.includes("upc")) return "upc";
  if (value.includes("128")) return "code128";
  return "unknown";
}

/** Camera adapter — expo-camera plugs in here in a future sprint. */
export const cameraScannerAdapter: ScannerHardwareAdapter = {
  id: "camera",
  label: "Device Camera",
  async open() {},
  async close() {},
  async captureOnce() {
    return null;
  },
};

/** Dedicated hardware wedge / bluetooth scanner adapter placeholder. */
export const hardwareScannerAdapter: ScannerHardwareAdapter = {
  id: "hardware",
  label: "Hardware Scanner",
  async open() {},
  async close() {},
  async captureOnce() {
    return null;
  },
};

/** RFID adapter placeholder. */
export const rfidScannerAdapter: ScannerHardwareAdapter = {
  id: "rfid",
  label: "RFID Reader",
  async open() {},
  async close() {},
  async captureOnce() {
    return null;
  },
};

export function buildSimulatedPayload(value: string, format = "code128"): ScanRawPayload {
  return {
    value,
    symbology: inferSymbology(format),
    scannedAt: new Date().toISOString(),
  };
}
