import { apiClient } from "@/services/api";

export type WorkspaceSessionRole =
  | "OWNER"
  | "ADMIN"
  | "SUPERVISOR"
  | "MANAGER"
  | "PROCUREMENT"
  | "PRODUCTION"
  | "INVENTORY"
  | "SALES"
  | "VIEW_ONLY"
  | "USER";

export type OpsPermissionSnapshot = {
  role: WorkspaceSessionRole | null;
  email: string | null;
  canReceivePurchaseOrders: boolean;
  canViewAssignedReceipts: boolean;
  canViewAllReceipts: boolean;
  canViewSupervisorStats: boolean;
  canExecuteProductionRuns: boolean;
  canCompleteProductionRuns: boolean;
  canViewAllProductionRuns: boolean;
  canViewProductionDashboard: boolean;
  canPickStoreOrders: boolean;
  canDispatchStoreOrders: boolean;
  canViewAllStoreOrders: boolean;
  canViewStoreOrderDashboard: boolean;
  canPerformInventoryOperations: boolean;
  canPostInventoryAdjustments: boolean;
  canTransferStock: boolean;
  canViewInventoryDashboard: boolean;
  canViewSupervisorCommandCentre: boolean;
  canScanInWorkflows: boolean;
  canViewScanHistory: boolean;
  canViewSyncDashboard: boolean;
};

const SUPERVISOR_ROLES = new Set<WorkspaceSessionRole>(["OWNER", "ADMIN", "SUPERVISOR", "MANAGER"]);
const RECEIVE_ROLES = new Set<WorkspaceSessionRole>([
  "OWNER",
  "ADMIN",
  "SUPERVISOR",
  "MANAGER",
  "INVENTORY",
  "PROCUREMENT",
]);
const PRODUCTION_OPERATOR_ROLES = new Set<WorkspaceSessionRole>(["OWNER", "ADMIN", "PRODUCTION"]);
const WAREHOUSE_OPERATOR_ROLES = new Set<WorkspaceSessionRole>([
  "OWNER",
  "ADMIN",
  "INVENTORY",
  "SALES",
]);
const INVENTORY_OPERATOR_ROLES = new Set<WorkspaceSessionRole>(["OWNER", "ADMIN", "INVENTORY"]);

function normalizeRole(role: string | null | undefined): WorkspaceSessionRole | null {
  if (!role) return null;
  if (role === "MANAGER") return "SUPERVISOR";
  return role as WorkspaceSessionRole;
}

export function resolveOpsPermissions(input: {
  sessionRole?: string | null;
  sessionEmail?: string | null;
}): OpsPermissionSnapshot {
  const role = normalizeRole(input.sessionRole);
  const isSupervisor = role ? SUPERVISOR_ROLES.has(role) : false;
  const canReceive = role ? RECEIVE_ROLES.has(role) : false;
  const canOperateProduction = role ? PRODUCTION_OPERATOR_ROLES.has(role) : false;
  const canOperateWarehouse = role ? WAREHOUSE_OPERATOR_ROLES.has(role) : false;
  const canOperateInventory = role ? INVENTORY_OPERATOR_ROLES.has(role) : false;

  return {
    role,
    email: input.sessionEmail ?? null,
    canReceivePurchaseOrders: canReceive,
    canViewAssignedReceipts: canReceive || isSupervisor,
    canViewAllReceipts: isSupervisor,
    canViewSupervisorStats: isSupervisor,
    canExecuteProductionRuns: canOperateProduction,
    canCompleteProductionRuns: canOperateProduction || isSupervisor,
    canViewAllProductionRuns: isSupervisor || canOperateProduction,
    canViewProductionDashboard: isSupervisor,
    canPickStoreOrders: canOperateWarehouse || isSupervisor,
    canDispatchStoreOrders: canOperateWarehouse || isSupervisor,
    canViewAllStoreOrders: isSupervisor || canOperateWarehouse,
    canViewStoreOrderDashboard: isSupervisor,
    canPerformInventoryOperations: canOperateInventory || isSupervisor,
    canPostInventoryAdjustments: canOperateInventory || isSupervisor,
    canTransferStock: canOperateInventory || isSupervisor,
    canViewInventoryDashboard: isSupervisor,
    canViewSupervisorCommandCentre: isSupervisor,
    canScanInWorkflows:
      canReceive ||
      canOperateProduction ||
      canOperateWarehouse ||
      canOperateInventory ||
      isSupervisor,
    canViewScanHistory: isSupervisor,
    canViewSyncDashboard: isSupervisor,
  };
}

export async function loadOpsPermissions(): Promise<OpsPermissionSnapshot> {
  try {
    const status = await apiClient.get<{
      ok?: boolean;
      sessionRole?: string | null;
      sessionEmail?: string | null;
    }>("/api/workspace/status");
    return resolveOpsPermissions(status);
  } catch {
    return resolveOpsPermissions({});
  }
}

export function hasPermission(permissions: OpsPermissionSnapshot, key: string): boolean {
  if (key === "goods_receipts.create") return permissions.canReceivePurchaseOrders;
  if (key === "goods_receipts.view") return permissions.canViewAssignedReceipts;
  if (key === "purchase_orders.view") return permissions.canViewAssignedReceipts || permissions.canViewAllReceipts;
  if (key === "ops.supervisor.stats") return permissions.canViewSupervisorStats;
  if (key === "manufacturing.runs.start") return permissions.canExecuteProductionRuns;
  if (key === "manufacturing.runs.complete") return permissions.canCompleteProductionRuns;
  if (key === "manufacturing.view") return permissions.canViewAllProductionRuns;
  if (key === "ops.production.dashboard") return permissions.canViewProductionDashboard;
  if (key === "store_orders.edit") return permissions.canPickStoreOrders || permissions.canDispatchStoreOrders;
  if (key === "store_orders.view") return permissions.canViewAllStoreOrders;
  if (key === "ops.store_orders.dashboard") return permissions.canViewStoreOrderDashboard;
  if (key === "inventory.view") return permissions.canPerformInventoryOperations;
  if (key === "inventory.counts.create") return permissions.canPerformInventoryOperations;
  if (key === "inventory.adjustments.post") return permissions.canPostInventoryAdjustments;
  if (key === "ops.inventory.dashboard") return permissions.canViewInventoryDashboard;
  if (key === "ops.supervisor.command_centre") return permissions.canViewSupervisorCommandCentre;
  if (key === "ops.scan.use") return permissions.canScanInWorkflows;
  if (key === "ops.scan.history") return permissions.canViewScanHistory;
  if (key === "ops.sync.dashboard") return permissions.canViewSyncDashboard;
  return false;
}
