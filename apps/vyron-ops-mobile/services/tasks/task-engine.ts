import type { OpsTask, OpsTaskPriority, PurchaseOrder } from "@/types/receiving";

export function getOrderPriority(order: PurchaseOrder): OpsTaskPriority {
  return derivePriority(order);
}

function derivePriority(order: PurchaseOrder): OpsTaskPriority {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (order.expected_date) {
    const expected = new Date(order.expected_date);
    expected.setHours(0, 0, 0, 0);
    if (expected < today) return "urgent";
  }
  if (order.total_value >= 50000) return "high";
  if (order.status === "Partially Received") return "normal";
  return "normal";
}

function outstandingForOrder(order: PurchaseOrder) {
  return (order.lines || []).reduce((sum, line) => sum + line.outstanding_qty, 0);
}

export function buildReceivePurchaseOrderTasks(orders: PurchaseOrder[]): OpsTask[] {
  return orders
    .filter((order) => {
      if (!order.lines?.length) return true;
      return outstandingForOrder(order) > 0;
    })
    .map((order) => ({
      id: `receive-po-${order.id}`,
      type: "receive_purchase_order" as const,
      title: "Receive Purchase Order",
      purchaseOrderId: order.id,
      poNumber: order.po_number,
      supplierName: order.supplier_name,
      expectedDate: order.expected_date,
      status: order.display_status || order.status,
      priority: derivePriority(order),
      outstandingQty: outstandingForOrder(order),
    }))
    .sort((a, b) => {
      const rank: Record<OpsTaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return rank[a.priority] - rank[b.priority];
    });
}
