import type { OpsTaskPriority } from "@/types/receiving";
import type { StoreOpsTask, StoreOpsTaskType, StoreOrder } from "@/types/store-orders";

function derivePriority(order: StoreOrder): OpsTaskPriority {
  if (order.required_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const required = new Date(order.required_date);
    required.setHours(0, 0, 0, 0);
    if (required < today) return "urgent";
    if (required.getTime() === today.getTime()) return "high";
  }
  if (order.status === "Picking") return "high";
  if (order.status === "ReadyToDispatch") return "normal";
  return "normal";
}

function taskTypeForOrder(order: StoreOrder): StoreOpsTaskType {
  if (order.status === "Approved") return "pick_store_order";
  if (order.status === "Picking") return "resume_picking";
  if (order.status === "ReadyToDispatch") return "dispatch_order";
  if (order.status === "Dispatched") return "confirm_delivery";
  return "pick_store_order";
}

function taskTitle(type: StoreOpsTaskType) {
  switch (type) {
    case "pick_store_order":
      return "Pick Store Order";
    case "resume_picking":
      return "Resume Picking";
    case "dispatch_order":
      return "Dispatch Order";
    case "confirm_delivery":
      return "Confirm Delivery";
  }
}

export function getStoreOrderPriority(order: StoreOrder): OpsTaskPriority {
  return derivePriority(order);
}

export function buildStoreOpsTasks(orders: StoreOrder[]): StoreOpsTask[] {
  const actionable = new Set(["Approved", "Picking", "ReadyToDispatch", "Dispatched"]);

  return orders
    .filter((order) => actionable.has(order.status))
    .map((order) => {
      const type = taskTypeForOrder(order);
      return {
        id: `store-${type}-${order.id}`,
        type,
        title: taskTitle(type),
        storeOrderId: order.id,
        orderNumber: order.order_number,
        storeName: order.store_name_snapshot || order.store_code_snapshot || "Store",
        status: order.status,
        priority: derivePriority(order),
        requiredTime: order.required_date,
        lineCount: order.lines?.length ?? order.line_count ?? 0,
      };
    })
    .sort((a, b) => {
      const rank: Record<OpsTaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return rank[a.priority] - rank[b.priority];
    });
}
