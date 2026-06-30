/** API response shapes — presentation only, no business rules. */

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  ingredient_id: string | null;
  ingredient_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  received_qty: number;
  outstanding_qty: number;
  unit: string;
};

export type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string;
  status: string;
  display_status: string;
  order_date: string | null;
  expected_date: string | null;
  total_value: number;
  notes: string | null;
  updated_at?: string | null;
  line_count?: number;
  lines?: PurchaseOrderLine[];
};

export type PurchaseOrderEngineStats = {
  openPurchaseOrders: number;
  outstandingReceipts: number;
  purchaseValueThisMonth: number;
  lateDeliveries: number;
};

export type OpsTaskType = "receive_purchase_order";

export type OpsTaskPriority = "low" | "normal" | "high" | "urgent";

export type OpsTask = {
  id: string;
  type: OpsTaskType;
  title: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  expectedDate: string | null;
  status: string;
  priority: OpsTaskPriority;
  outstandingQty: number;
};

export type ReceiveLineDraft = {
  lineId: string;
  ingredientName: string;
  orderedQty: number;
  receivedQty: number;
  outstandingQty: number;
  unit: string;
  unitCost: number;
  receiveQty: number;
  skipped: boolean;
};

export type ReceiveSummary = {
  totalLines: number;
  totalQuantity: number;
  outstandingQuantity: number;
  estimatedValue: number;
};

export type ReceiveReceiptPayload = {
  mode: "full" | "partial";
  lines?: Array<{ line_id: string; receive_qty: number }>;
  actor?: string;
};
