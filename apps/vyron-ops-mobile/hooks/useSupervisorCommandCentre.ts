import { useMemo } from "react";
import { useInventoryAlerts, useOpsTasks, useReceivingQueue } from "@/hooks/useReceiving";
import { useManufacturingStats, useProductionOpsTasks, useProductionPlanningStats, useProductionQueue } from "@/hooks/useProduction";
import { useDispatchQueue, usePickingQueue, useStoreOpsTasks, useStoreOrderStats } from "@/hooks/useStoreOrders";
import { useInventoryLedger, useInventoryOpsTasks, useInventoryStats, useLowStockAlerts } from "@/hooks/useInventory";
import { useCostAiInsights, useExecutionActions } from "@/hooks/useSupervisorApi";
import { mergeOperationalActivity } from "@/platform/activity";
import { listEquipmentCards } from "@/platform/equipment";
import { scannerManager } from "@/platform/scanner-manager";
import { syncManager } from "@/platform/sync";
import { getCurrentShift } from "@/platform/shift";
import { buildStaffStatusRows } from "@/platform/staff-status";
import { SUPERVISOR_REFRESH_MS } from "@/services/supervisor/supervisor-api";
import { countStockCountsToday } from "@/services/inventory/inventory-api";
import type { InventoryOpsTask } from "@/types/inventory";
import type { ProductionOpsTask } from "@/types/production";
import type { OpsTask } from "@/types/receiving";
import type { StoreOpsTask } from "@/types/store-orders";
import type {
  NotificationItem,
  ShiftDashboardRow,
  ShiftName,
  SupervisorAggregatedTask,
  SupervisorKpi,
} from "@/types/supervisor";

const refresh = { staleTime: SUPERVISOR_REFRESH_MS, refetchInterval: SUPERVISOR_REFRESH_MS };

function countTodaysReceipts(orders: Array<{ status: string; updated_at?: string | null }>) {
  const today = new Date().toISOString().slice(0, 10);
  return orders.filter(
    (order) =>
      ["Fully Received", "Partially Received"].includes(order.status) &&
      order.updated_at?.slice(0, 10) === today
  ).length;
}

function countProductionRunsToday(runs: Array<{ created_at?: string; started_at?: string | null }>) {
  const today = new Date().toISOString().slice(0, 10);
  return runs.filter(
    (run) => run.created_at?.slice(0, 10) === today || run.started_at?.slice(0, 10) === today
  ).length;
}

function countDispatchedToday(orders: Array<{ dispatched_at?: string | null }>) {
  const today = new Date().toISOString().slice(0, 10);
  return orders.filter((order) => order.dispatched_at?.slice(0, 10) === today).length;
}

function receivingRoute(task: OpsTask) {
  return `/receiving/${task.purchaseOrderId}/receive`;
}

function productionRoute(task: ProductionOpsTask) {
  if (task.type === "start_production_run") return `/production/${task.productionRunId}`;
  if (task.type === "complete_production_run") return `/production/${task.productionRunId}/summary`;
  return `/production/${task.productionRunId}/live`;
}

function storeRoute(task: StoreOpsTask) {
  if (task.type === "pick_store_order") return `/picking/${task.storeOrderId}`;
  if (task.type === "resume_picking") return `/picking/${task.storeOrderId}/pick`;
  if (task.type === "dispatch_order") return `/dispatch/${task.storeOrderId}`;
  return `/dispatch/${task.storeOrderId}/deliver`;
}

function inventoryRoute(task: InventoryOpsTask) {
  if (task.type === "perform_stock_count") {
    return task.stockItemId ? `/inventory/count/${task.stockItemId}` : "/inventory/count";
  }
  if (task.type === "transfer_stock") return "/inventory/transfer";
  if (task.type === "approve_adjustment") return "/inventory/adjustment";
  if (task.stockItemId) return `/inventory/lookup/${task.stockItemId}`;
  return "/inventory/lookup";
}

function buildShiftRows(current: ShiftName, metrics: ShiftDashboardRow["metrics"]): ShiftDashboardRow[] {
  const shifts: ShiftName[] = ["Morning Shift", "Afternoon Shift", "Night Shift"];
  return shifts.map((shift) => ({
    shift,
    isCurrent: shift === current,
    metrics: shift === current ? metrics : { production: 0, receiving: 0, dispatch: 0, picking: 0, counts: 0 },
  }));
}

export function useSupervisorCommandCentre() {
  const receiving = useReceivingQueue(undefined, refresh);
  const production = useProductionQueue(undefined, refresh);
  const manufacturingStats = useManufacturingStats(refresh);
  const planningStats = useProductionPlanningStats(refresh);
  const storeStats = useStoreOrderStats(refresh);
  const pickingQueue = usePickingQueue(undefined, refresh);
  const dispatchQueue = useDispatchQueue(undefined, refresh);
  const inventoryStats = useInventoryStats(refresh);
  const lowStockAlerts = useLowStockAlerts(refresh);
  const inventoryLedger = useInventoryLedger(undefined, refresh);
  const inventoryAlerts = useInventoryAlerts(refresh);
  const receivingTasks = useOpsTasks(refresh);
  const productionTasks = useProductionOpsTasks(refresh);
  const storeTasks = useStoreOpsTasks(refresh);
  const inventoryTasks = useInventoryOpsTasks(refresh);
  const aiInsights = useCostAiInsights();
  const executionActions = useExecutionActions();

  const isLoading =
    receiving.isLoading ||
    production.isLoading ||
    storeStats.isLoading ||
    inventoryStats.isLoading ||
    aiInsights.isLoading;

  const refetchAll = () => {
    void receiving.refetch();
    void production.refetch();
    void manufacturingStats.refetch();
    void planningStats.refetch();
    void storeStats.refetch();
    void pickingQueue.refetch();
    void dispatchQueue.refetch();
    void inventoryStats.refetch();
    void lowStockAlerts.refetch();
    void inventoryLedger.refetch();
    void inventoryAlerts.refetch();
    void receivingTasks.refetch();
    void productionTasks.refetch();
    void storeTasks.refetch();
    void inventoryTasks.refetch();
    void aiInsights.refetch();
    void executionActions.refetch();
  };

  const orders = receiving.data?.orders ?? [];
  const runs = production.data ?? [];
  const stats = receiving.data?.stats;
  const store = storeStats.data;
  const mfg = manufacturingStats.data;
  const inv = inventoryStats.data;
  const ledgerEntries = inventoryLedger.data ?? [];
  const pickingOrders = pickingQueue.data ?? [];
  const dispatchOrders = dispatchQueue.data ?? [];

  const todaysReceipts = useMemo(() => countTodaysReceipts(orders), [orders]);
  const productionRunsToday = useMemo(() => countProductionRunsToday(runs), [runs]);
  const inProgressRuns = useMemo(() => runs.filter((run) => run.status === "In Production").length, [runs]);
  const awaitingPicking = useMemo(
    () => pickingOrders.filter((order) => order.status === "Approved").length,
    [pickingOrders]
  );
  const dispatchedToday = useMemo(() => countDispatchedToday(dispatchOrders), [dispatchOrders]);
  const stockCountsToday = useMemo(() => countStockCountsToday(ledgerEntries), [ledgerEntries]);
  const criticalStock = (lowStockAlerts.data?.length ?? 0) + (inv?.negativeStockWarnings ?? 0);

  const pickingEfficiency = useMemo(() => {
    const total = (store?.picking ?? 0) + (store?.readyForDispatch ?? 0) + (store?.delivered ?? 0);
    if (!total) return "—";
    return `${Math.round(((store?.readyForDispatch ?? 0) / total) * 100)}%`;
  }, [store]);

  const dispatchEfficiency = useMemo(() => {
    const ready = store?.readyForDispatch ?? 0;
    const dispatched = dispatchedToday;
    const total = ready + dispatched;
    if (!total) return "—";
    return `${Math.round((dispatched / total) * 100)}%`;
  }, [store, dispatchedToday]);

  const inventoryAccuracy = useMemo(() => {
    const warnings = inv?.negativeStockWarnings ?? 0;
    const items = (lowStockAlerts.data?.length ?? 0) + warnings;
    if (!items) return "100%";
    return `${Math.max(0, 100 - items)}%`;
  }, [inv, lowStockAlerts.data]);

  const scanStats = useMemo(() => scannerManager.getDashboardStats(), [inventoryLedger.data, receiving.data]);
  const syncStats = useMemo(() => syncManager.getMetrics(), [inventoryLedger.data, receiving.data]);

  const kpis: SupervisorKpi[] = useMemo(
    () => [
      {
        id: "goods-received",
        title: "Goods Received Today",
        subtitle: "Receipts completed today",
        value: todaysReceipts,
        accent: "emerald",
        route: "/receiving",
        loading: receiving.isLoading,
      },
      {
        id: "po-waiting",
        title: "Purchase Orders Waiting",
        subtitle: "Open POs awaiting receipt",
        value: stats?.openPurchaseOrders ?? "—",
        accent: "amber",
        route: "/receiving",
        loading: receiving.isLoading,
      },
      {
        id: "production-today",
        title: "Production Runs Today",
        subtitle: "Runs scheduled or started",
        value: productionRunsToday,
        accent: "violet",
        route: "/production",
        loading: production.isLoading,
      },
      {
        id: "production-active",
        title: "Production In Progress",
        subtitle: "Active manufacturing runs",
        value: inProgressRuns,
        accent: "emerald",
        route: "/production",
        loading: production.isLoading,
      },
      {
        id: "picking-queue",
        title: "Picking Queue",
        subtitle: "Orders awaiting or in picking",
        value: (store?.picking ?? 0) + awaitingPicking,
        accent: "sky",
        route: "/picking",
        loading: pickingQueue.isLoading,
      },
      {
        id: "ready-dispatch",
        title: "Orders Ready For Dispatch",
        subtitle: "Pick-complete orders",
        value: store?.readyForDispatch ?? "—",
        accent: "amber",
        route: "/dispatch",
        loading: storeStats.isLoading,
      },
      {
        id: "dispatched",
        title: "Orders Dispatched",
        subtitle: "Dispatched today",
        value: dispatchedToday,
        accent: "violet",
        route: "/dispatch",
        loading: dispatchQueue.isLoading,
      },
      {
        id: "delivered",
        title: "Orders Delivered",
        subtitle: "Delivered orders",
        value: store?.delivered ?? "—",
        accent: "sky",
        route: "/dispatch",
        loading: storeStats.isLoading,
      },
      {
        id: "inventory-alerts",
        title: "Inventory Alerts",
        subtitle: "Negative stock warnings",
        value: inv?.negativeStockWarnings ?? inventoryAlerts.data ?? "—",
        accent: "rose",
        route: "/inventory",
        loading: inventoryStats.isLoading,
      },
      {
        id: "critical-stock",
        title: "Critical Stock Items",
        subtitle: "Low stock and negative items",
        value: criticalStock,
        accent: "rose",
        route: "/inventory/lookup",
        loading: lowStockAlerts.isLoading,
      },
      {
        id: "adjustments",
        title: "Inventory Adjustments Today",
        subtitle: "Posted adjustments",
        value: inv?.stockAdjustments ?? "—",
        accent: "violet",
        route: "/inventory/adjustment",
        loading: inventoryStats.isLoading,
      },
      {
        id: "counts",
        title: "Stock Counts Today",
        subtitle: "Count transactions today",
        value: stockCountsToday,
        accent: "emerald",
        route: "/inventory/count",
        loading: inventoryLedger.isLoading,
      },
      {
        id: "production-efficiency",
        title: "Production Efficiency",
        subtitle: "Manufacturing efficiency",
        value: mfg?.productionEfficiency != null ? `${mfg.productionEfficiency}%` : "—",
        accent: "violet",
        route: "/production",
        loading: manufacturingStats.isLoading,
      },
      {
        id: "picking-efficiency",
        title: "Picking Efficiency",
        subtitle: "Ready-for-dispatch share",
        value: pickingEfficiency,
        accent: "sky",
        route: "/picking",
        loading: storeStats.isLoading,
      },
      {
        id: "dispatch-efficiency",
        title: "Dispatch Efficiency",
        subtitle: "Dispatched vs ready today",
        value: dispatchEfficiency,
        accent: "amber",
        route: "/dispatch",
        loading: dispatchQueue.isLoading,
      },
      {
        id: "inventory-accuracy",
        title: "Inventory Accuracy",
        subtitle: "Derived from alerts",
        value: inventoryAccuracy,
        accent: "emerald",
        route: "/inventory/history",
        loading: inventoryStats.isLoading,
      },
      {
        id: "scans-today",
        title: "Scans Today",
        subtitle: "Barcode validations today",
        value: scanStats.scansToday,
        accent: "sky",
        route: "/scanner",
        loading: false,
      },
      {
        id: "failed-scans",
        title: "Failed Scans",
        subtitle: "Rejected or unknown scans",
        value: scanStats.failedScans,
        accent: "rose",
        route: "/scanner",
        loading: false,
      },
      {
        id: "wrong-item",
        title: "Wrong Item Attempts",
        subtitle: "Mismatched workflow scans",
        value: scanStats.wrongItemAttempts,
        accent: "amber",
        route: "/scanner",
        loading: false,
      },
      {
        id: "scan-verification",
        title: "Inventory Verification Rate",
        subtitle: "Successful scans today",
        value: scanStats.verificationRate,
        accent: "violet",
        route: "/scanner",
        loading: false,
      },
      {
        id: "pending-syncs",
        title: "Pending Syncs",
        subtitle: "Queued offline operations",
        value: syncStats.pendingSyncs,
        accent: "amber",
        route: "/sync",
        loading: false,
      },
      {
        id: "failed-syncs",
        title: "Failed Syncs",
        subtitle: "Operations needing attention",
        value: syncStats.failedSyncs,
        accent: "rose",
        route: "/sync",
        loading: false,
      },
    ],
    [
      todaysReceipts,
      stats,
      productionRunsToday,
      inProgressRuns,
      store,
      awaitingPicking,
      dispatchedToday,
      inv,
      inventoryAlerts.data,
      criticalStock,
      stockCountsToday,
      mfg,
      pickingEfficiency,
      dispatchEfficiency,
      inventoryAccuracy,
      scanStats,
      syncStats,
      receiving.isLoading,
      production.isLoading,
      pickingQueue.isLoading,
      storeStats.isLoading,
      dispatchQueue.isLoading,
      inventoryStats.isLoading,
      lowStockAlerts.isLoading,
      inventoryLedger.isLoading,
      manufacturingStats.isLoading,
    ]
  );

  const activity = useMemo(
    () =>
      mergeOperationalActivity({
        ledgerEntries,
        executionActions: executionActions.data?.actions ?? [],
      }),
    [ledgerEntries, executionActions.data?.actions]
  );

  const tasks: SupervisorAggregatedTask[] = useMemo(() => {
    const rows: SupervisorAggregatedTask[] = [];
    for (const task of receivingTasks.tasks) {
      rows.push({
        id: task.id,
        module: "receiving",
        title: task.title,
        owner: "Receiving",
        due: task.expectedDate ?? null,
        status: "Open",
        priority: task.priority,
        route: receivingRoute(task),
      });
    }
    for (const task of productionTasks.tasks) {
      rows.push({
        id: task.id,
        module: "production",
        title: task.title,
        owner: "Production",
        due: null,
        status: task.type.replace(/_/g, " "),
        priority: task.priority,
        route: productionRoute(task),
      });
    }
    for (const task of storeTasks.tasks) {
      rows.push({
        id: task.id,
        module: task.type.includes("dispatch") || task.type.includes("deliver") ? "dispatch" : "picking",
        title: task.title,
        owner: "Warehouse",
        due: null,
        status: task.type.replace(/_/g, " "),
        priority: task.priority,
        route: storeRoute(task),
      });
    }
    for (const task of inventoryTasks.tasks) {
      rows.push({
        id: task.id,
        module: "inventory",
        title: task.title,
        owner: "Inventory",
        due: null,
        status: task.type.replace(/_/g, " "),
        priority: task.priority,
        route: inventoryRoute(task),
      });
    }
    const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
    return rows.sort((a, b) => rank[a.priority] - rank[b.priority]);
  }, [receivingTasks.tasks, productionTasks.tasks, storeTasks.tasks, inventoryTasks.tasks]);

  const currentShift = getCurrentShift();
  const shiftMetrics = useMemo(
    () => ({
      production: productionRunsToday,
      receiving: todaysReceipts,
      dispatch: dispatchedToday,
      picking: (store?.picking ?? 0) + awaitingPicking,
      counts: stockCountsToday,
    }),
    [productionRunsToday, todaysReceipts, dispatchedToday, store, awaitingPicking, stockCountsToday]
  );
  const shifts = useMemo(() => buildShiftRows(currentShift, shiftMetrics), [currentShift, shiftMetrics]);

  const staff = useMemo(
    () =>
      buildStaffStatusRows({
        openPurchaseOrders: stats?.openPurchaseOrders ?? 0,
        inProgressRuns,
        pickingQueue: (store?.picking ?? 0) + awaitingPicking,
        dispatchQueue: (store?.readyForDispatch ?? 0) + dispatchedToday,
        inventoryAlerts: criticalStock,
      }),
    [stats, inProgressRuns, store, awaitingPicking, dispatchedToday, criticalStock]
  );

  const equipment = useMemo(() => listEquipmentCards(), []);

  const notifications: NotificationItem[] = useMemo(() => {
    const items: NotificationItem[] = [];
    for (const insight of aiInsights.data?.insights ?? []) {
      items.push({
        id: `ai-${insight.id}`,
        category: "ai",
        title: insight.title,
        body: insight.recommendation,
        priority: insight.priority === "Critical" ? "urgent" : insight.priority === "High" ? "high" : "normal",
        route: insight.route,
        unread: true,
      });
    }
    if ((inv?.negativeStockWarnings ?? 0) > 0) {
      items.push({
        id: "neg-stock",
        category: "alert",
        title: "Negative inventory",
        body: `${inv?.negativeStockWarnings} items below zero on hand.`,
        priority: "urgent",
        route: "/inventory",
        unread: true,
      });
    }
    if ((lowStockAlerts.data?.length ?? 0) > 0) {
      items.push({
        id: "low-stock",
        category: "warning",
        title: "Critical stock risk",
        body: `${lowStockAlerts.data?.length} items below reorder.`,
        priority: "high",
        route: "/inventory/lookup",
        unread: true,
      });
    }
    if ((stats?.lateDeliveries ?? 0) > 0) {
      items.push({
        id: "late-po",
        category: "warning",
        title: "Late purchase orders",
        body: `${stats?.lateDeliveries} deliveries are overdue.`,
        priority: "high",
        route: "/receiving",
        unread: true,
      });
    }
    return items;
  }, [aiInsights.data, inv, lowStockAlerts.data, stats]);

  return {
    isLoading,
    refetchAll,
    kpis,
    activity,
    aiAlerts: aiInsights.data?.insights ?? [],
    tasks,
    shifts,
    staff,
    equipment,
    notifications,
    currentShift,
  };
}

export function useSupervisorNotifications() {
  const centre = useSupervisorCommandCentre();
  return {
    notifications: centre.notifications,
    isLoading: centre.isLoading,
    refetch: centre.refetchAll,
    unreadCount: centre.notifications.filter((item) => item.unread).length,
  };
}
