export const queryKeys = {
  permissions: ["ops-permissions"] as const,
  receivingQueue: (filters?: { status?: string; search?: string }) =>
    ["receiving-queue", filters?.status ?? "All", filters?.search ?? ""] as const,
  purchaseOrder: (id: string) => ["purchase-order", id] as const,
  opsTasks: ["ops-tasks"] as const,
  inventoryAlerts: ["inventory-alerts"] as const,
  productionQueue: (filters?: { status?: string; search?: string }) =>
    ["production-queue", filters?.status ?? "All", filters?.search ?? ""] as const,
  productionRun: (id: string) => ["production-run", id] as const,
  productionShortages: (id: string) => ["production-shortages", id] as const,
  manufacturingStats: ["manufacturing-stats"] as const,
  productionPlanningStats: ["production-planning-stats"] as const,
  pickingQueue: (filters?: { status?: string; search?: string }) =>
    ["picking-queue", filters?.status ?? "All", filters?.search ?? ""] as const,
  dispatchQueue: (filters?: { status?: string; search?: string }) =>
    ["dispatch-queue", filters?.status ?? "All", filters?.search ?? ""] as const,
  storeOrder: (id: string) => ["store-order", id] as const,
  storeOrderStats: ["store-order-stats"] as const,
  stockItems: ["stock-items"] as const,
  inventoryStats: ["inventory-stats"] as const,
  lowStockAlerts: ["low-stock-alerts"] as const,
  inventoryLedger: (stockItemId?: string) => ["inventory-ledger", stockItemId ?? "all"] as const,
  openStockCounts: ["open-stock-counts"] as const,
  stockCountSessions: ["stock-count-sessions"] as const,
  stockCountSession: (id: string) => ["stock-count-session", id] as const,
  costAiInsights: ["cost-ai-insights"] as const,
  executionActions: ["execution-actions"] as const,
  salesCustomers: ["sales-customers"] as const,
  salesProducts: (search?: string) => ["sales-products", search ?? ""] as const,
  salesInvoices: (filters?: { status?: string; search?: string }) =>
    ["sales-invoices", filters?.status ?? "All", filters?.search ?? ""] as const,
  salesInvoice: (id: string) => ["sales-invoice", id] as const,
  mobileProductIntelligence: ["mobile-product-intelligence"] as const,
};
