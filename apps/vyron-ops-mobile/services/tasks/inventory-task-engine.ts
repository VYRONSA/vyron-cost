import type { InventoryOpsTask, InventoryOpsTaskType, LowStockAlert, StockItem } from "@/types/inventory";
import type { OpsTaskPriority } from "@/types/receiving";

function taskTitle(type: InventoryOpsTaskType) {
  switch (type) {
    case "perform_stock_count":
      return "Perform Stock Count";
    case "approve_adjustment":
      return "Approve Adjustment";
    case "transfer_stock":
      return "Transfer Stock";
    case "investigate_negative_stock":
      return "Investigate Negative Stock";
    case "review_inventory_alert":
      return "Review Inventory Alert";
  }
}

function derivePriority(type: InventoryOpsTaskType, qtyOnHand?: number): OpsTaskPriority {
  if (type === "investigate_negative_stock" || (qtyOnHand != null && qtyOnHand < 0)) return "urgent";
  if (type === "review_inventory_alert") return "high";
  if (type === "approve_adjustment") return "normal";
  return "normal";
}

export function buildInventoryOpsTasks(input: {
  stockItems: StockItem[];
  lowStockAlerts: LowStockAlert[];
  openCounts: Array<{ id: string; status: string }>;
}): InventoryOpsTask[] {
  const tasks: InventoryOpsTask[] = [];

  for (const item of input.stockItems.filter((row) => row.qty_on_hand < 0)) {
    tasks.push({
      id: `inventory-negative-${item.id}`,
      type: "investigate_negative_stock",
      title: taskTitle("investigate_negative_stock"),
      stockItemId: item.id,
      stockItemName: item.description,
      priority: derivePriority("investigate_negative_stock", item.qty_on_hand),
      detail: `${item.qty_on_hand} ${item.unit} on hand`,
    });
  }

  for (const alert of input.lowStockAlerts.slice(0, 10)) {
    const stock = alert.vyron_cost_stock_items;
    tasks.push({
      id: `inventory-alert-${alert.id}`,
      type: "review_inventory_alert",
      title: taskTitle("review_inventory_alert"),
      stockItemId: alert.stock_item_id,
      stockItemName: stock?.description || "Low stock item",
      priority: derivePriority("review_inventory_alert"),
      detail: `${stock?.qty_on_hand ?? 0} ${stock?.unit ?? ""} remaining`,
    });
  }

  for (const count of input.openCounts) {
    tasks.push({
      id: `inventory-count-${count.id}`,
      type: "perform_stock_count",
      title: taskTitle("perform_stock_count"),
      stockItemName: `Count session ${count.id.slice(0, 8)}`,
      priority: derivePriority("perform_stock_count"),
      detail: `Status ${count.status}`,
    });
  }

  if (input.stockItems.length > 0) {
    tasks.push({
      id: "inventory-transfer-suggested",
      type: "transfer_stock",
      title: taskTitle("transfer_stock"),
      stockItemName: input.stockItems[0]?.description || "Stock item",
      stockItemId: input.stockItems[0]?.id,
      priority: "low",
      detail: "Move stock between locations",
    });
  }

  return tasks.sort((a, b) => {
    const rank: Record<OpsTaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
    return rank[a.priority] - rank[b.priority];
  });
}
