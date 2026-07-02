export type ScanSymbology = "ean13" | "code128" | "upc" | "qr" | "rfid" | "unknown";

export type ScanWorkflow =
  | "receiving"
  | "production"
  | "picking"
  | "dispatch"
  | "inventory_count"
  | "inventory_lookup"
  | "inventory_transfer"
  | "sales"
  | "products"
  | "general";

export type ScanContext = {
  purchaseOrderId?: string;
  lineId?: string;
  storeOrderId?: string;
  productionRunId?: string;
  stockItemId?: string;
  expectedLabel?: string;
  transferStep?: "source" | "destination";
  warehouseId?: string;
  locationId?: string;
  returnPath?: string;
};

export type ScanMatchedItem = {
  stockItemId: string;
  itemCode: string;
  description: string;
  qtyOnHand: number;
  unit: string;
  entityType: string;
};

export type ScanValidationStatus = "success" | "wrong_item" | "unknown" | "duplicate" | "not_found";

export type ScanValidationResult = {
  valid: boolean;
  status: ScanValidationStatus;
  barcode: string;
  symbology: ScanSymbology;
  workflow: ScanWorkflow;
  matched?: ScanMatchedItem;
  expected?: { label: string; itemCode?: string };
  actual?: { label: string; itemCode?: string };
  recommendation: string;
  action: string;
  lineId?: string;
  routeHint?: string;
};

export type ScanHistoryEntry = {
  id: string;
  scannedAt: string;
  user: string;
  item: string;
  workflow: ScanWorkflow;
  status: ScanValidationStatus;
  barcode: string;
};

export type ScannerSettings = {
  cameraFacing: "back" | "front";
  torchEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  sensitivity: "low" | "normal" | "high";
  hardwareScannerEnabled: boolean;
  batchModeEnabled: boolean;
};

export type ScanRawPayload = {
  value: string;
  symbology: ScanSymbology;
  scannedAt: string;
};

export type QrEntityType =
  | "product"
  | "ingredient"
  | "order"
  | "production_run"
  | "location"
  | "store"
  | "warehouse"
  | "equipment";

export type LocationPlaceholder = {
  id: string;
  type: "warehouse" | "bin" | "shelf" | "zone";
  label: string;
  ready: boolean;
};

export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = {
  cameraFacing: "back",
  torchEnabled: false,
  soundEnabled: true,
  vibrationEnabled: true,
  sensitivity: "normal",
  hardwareScannerEnabled: false,
  batchModeEnabled: false,
};

export const QR_ENTITY_PLACEHOLDERS: QrEntityType[] = [
  "product",
  "ingredient",
  "order",
  "production_run",
  "location",
  "store",
  "warehouse",
  "equipment",
];

export const LOCATION_PLACEHOLDERS: LocationPlaceholder[] = [
  { id: "wh-main", type: "warehouse", label: "Main Warehouse", ready: false },
  { id: "bin-a1", type: "bin", label: "Bin A1", ready: false },
  { id: "shelf-12", type: "shelf", label: "Shelf 12", ready: false },
  { id: "zone-cold", type: "zone", label: "Cold Zone", ready: false },
];
