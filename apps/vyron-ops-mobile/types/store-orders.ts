/** API response shapes — presentation only, no business rules. */

import type { OpsTaskPriority } from "./receiving";

export type StoreOrderLine = {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export type StoreOrder = {
  id: string;
  store_id: string;
  order_number: string;
  status: string;
  order_date: string;
  required_date: string | null;
  notes: string | null;
  change_request_note: string | null;
  total: number;
  store_name_snapshot?: string | null;
  store_code_snapshot?: string | null;
  picking_at: string | null;
  picking_completed_at: string | null;
  ready_to_dispatch_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  lines?: StoreOrderLine[];
  line_count?: number;
};

export type StoreOrderOperationsStats = {
  ordersToday: number;
  revenueToday: number;
  awaitingApproval: number;
  picking: number;
  readyForDispatch: number;
  delivered: number;
};

export type StoreOrderWorkflowAction =
  | "start_picking"
  | "complete_picking"
  | "dispatch"
  | "mark_delivered";

export type StoreOpsTaskType =
  | "pick_store_order"
  | "resume_picking"
  | "dispatch_order"
  | "confirm_delivery";

export type StoreOpsTask = {
  id: string;
  type: StoreOpsTaskType;
  title: string;
  storeOrderId: string;
  orderNumber: string;
  storeName: string;
  status: string;
  priority: OpsTaskPriority;
  requiredTime: string | null;
  lineCount: number;
};

export type ShortPickReason = "Out of Stock" | "Damaged" | "Substituted" | "Other";

export type PickLineDraft = {
  lineId: string;
  productName: string;
  requiredQty: number;
  pickedQty: number;
  unit: string;
  skipped: boolean;
  shortPickReason: ShortPickReason | null;
  shortPickNote: string | null;
};

export type PickSummary = {
  totalLines: number;
  picked: number;
  outstanding: number;
  shortPicked: number;
  completionPct: number;
};

export type DeliveryState = "Delivered" | "Partially Delivered";

export type DeliveryDraft = {
  state: DeliveryState;
  notes: string;
  signatureCaptured: boolean;
  photoCaptured: boolean;
};
