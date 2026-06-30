/** API response shapes — presentation only, no business rules. */

import type { OpsTaskPriority } from "./receiving";

export type StockItem = {
  id: string;
  item_code: string;
  description: string;
  entity_type: string;
  entity_id: string | null;
  unit: string;
  qty_on_hand: number;
  unit_cost: number;
};

export type InventoryStats = {
  inventoryValue: number;
  stockMovementsToday: number;
  negativeStockWarnings: number;
  stockAdjustments: number;
};

export type LowStockAlert = {
  id: string;
  stock_item_id?: string;
  status?: string;
  vyron_cost_stock_items?: {
    item_code?: string;
    description?: string;
    qty_on_hand?: number;
    unit?: string;
  };
};

export type InventoryLedgerEntry = {
  id: string;
  transaction_type: string;
  item_name: string;
  item_code: string;
  quantity: number;
  signed_quantity: number;
  running_balance: number;
  reference_label: string | null;
  reference_type: string | null;
  created_by: string | null;
  created_at: string;
};

export type InventoryOpsTaskType =
  | "perform_stock_count"
  | "approve_adjustment"
  | "transfer_stock"
  | "investigate_negative_stock"
  | "review_inventory_alert";

export type InventoryOpsTask = {
  id: string;
  type: InventoryOpsTaskType;
  title: string;
  stockItemId?: string;
  stockItemName: string;
  priority: OpsTaskPriority;
  detail: string;
};

export type AdjustmentReason =
  | "Damaged"
  | "Expired"
  | "Lost"
  | "Found"
  | "Correction"
  | "Production Variance"
  | "Other";

export type TransferDestination = "Warehouse" | "Store" | "Production";

export type CountLineDraft = {
  stockItemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  systemQty: number;
  countedQty: number;
  reason: string;
  skipped: boolean;
};
