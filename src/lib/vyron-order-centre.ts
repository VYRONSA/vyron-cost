import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * VYRON ORDER CENTRE — the operational read model.
 *
 * Every figure here is derived from vyron_customer_sales_orders, the existing
 * engine's own table. Nothing is recomputed, no second counter is stored, and
 * nothing in this file can move an order — transitions go through
 * transitionCustomerSalesOrder, which remains the only state machine.
 *
 * Queries are tenant scoped and bounded. The list pages server-side rather than
 * shipping an order history to the browser.
 */

/** The engine's statuses, grouped the way an operations desk actually thinks. */
const NEW_STATUSES = ["Draft", "Awaiting Approval"];
const PRODUCTION_STATUSES = ["Approved", "Picking"];
const READY_STATUSES = ["Packed"];
const UNPAID_STATUSES = ["Dispatched", "Partially Invoiced"];

export type OrderCentreSummary = {
  newOrders: number;
  toReview: number;
  inProduction: number;
  ready: number;
  unpaid: number;
  todayValue: number;
  todayCount: number;
};

export type OrderCentreRow = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerId: string | null;
  total: number;
  lineCount: number;
  status: string;
  requestedDeliveryDate: string | null;
  createdAt: string;
};

const startOfTodayIso = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
};

/**
 * Dashboard tiles.
 *
 * Counts use head-only queries so the browser never receives the rows behind
 * them, and each is a single indexed count rather than a client-side reduce
 * over a downloaded table.
 */
export async function getOrderCentreSummary(
  supabase: SupabaseClient,
  companyId: string
): Promise<OrderCentreSummary> {
  const countFor = async (statuses: string[]) => {
    const { count } = await supabase
      .from("vyron_customer_sales_orders")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .in("status", statuses);
    return count || 0;
  };

  const [newOrders, inProduction, ready, unpaid] = await Promise.all([
    countFor(NEW_STATUSES),
    countFor(PRODUCTION_STATUSES),
    countFor(READY_STATUSES),
    countFor(UNPAID_STATUSES),
  ]);

  // Today's committed value, from the orders themselves.
  const { data: todayRows } = await supabase
    .from("vyron_customer_sales_orders")
    .select("total")
    .eq("company_id", companyId)
    .gte("created_at", startOfTodayIso())
    .neq("status", "Cancelled");

  const todayValue = (todayRows || []).reduce((sum, r) => sum + Number(r.total || 0), 0);

  return {
    newOrders,
    // "To review" is the subset still awaiting a human decision.
    toReview: await countFor(["Awaiting Approval"]),
    inProduction,
    ready,
    unpaid,
    todayValue: Math.round(todayValue * 100) / 100,
    todayCount: (todayRows || []).length,
  };
}

export type OrderCentreFilters = {
  status?: string;
  search?: string;
  customerId?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  limit?: number;
  offset?: number;
};

/** Server-side filtered, paged order list. */
export async function listOrderCentreOrders(
  supabase: SupabaseClient,
  companyId: string,
  filters: OrderCentreFilters = {}
): Promise<{ rows: OrderCentreRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit || 25, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  let query = supabase
    .from("vyron_customer_sales_orders")
    .select("id, order_number, customer_name, customer_id, total, status, requested_delivery_date, created_at", { count: "exact" })
    .eq("company_id", companyId);

  if (filters.status && filters.status !== "All") {
    if (filters.status === "New") query = query.in("status", NEW_STATUSES);
    else if (filters.status === "In production") query = query.in("status", PRODUCTION_STATUSES);
    else if (filters.status === "Ready") query = query.in("status", READY_STATUSES);
    else query = query.eq("status", filters.status);
  }
  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.deliveryFrom) query = query.gte("requested_delivery_date", filters.deliveryFrom);
  if (filters.deliveryTo) query = query.lte("requested_delivery_date", filters.deliveryTo);
  if (filters.search) {
    const term = filters.search.replace(/[%,()]/g, "").trim();
    if (term) query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const rows = data || [];
  const lineCounts = new Map<string, number>();
  if (rows.length) {
    const { data: lines } = await supabase
      .from("vyron_customer_sales_order_lines")
      .select("sales_order_id")
      .eq("company_id", companyId)
      .in("sales_order_id", rows.map((r) => r.id));
    for (const l of lines || []) {
      const key = String(l.sales_order_id);
      lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
    }
  }

  return {
    total: count || 0,
    rows: rows.map((r) => ({
      orderId: String(r.id),
      orderNumber: String(r.order_number || ""),
      customerName: String(r.customer_name || ""),
      customerId: r.customer_id ? String(r.customer_id) : null,
      total: Number(r.total || 0),
      lineCount: lineCounts.get(String(r.id)) || 0,
      status: String(r.status || ""),
      requestedDeliveryDate: r.requested_delivery_date ? String(r.requested_delivery_date) : null,
      createdAt: String(r.created_at),
    })),
  };
}

/**
 * Which transitions the engine will accept from here.
 *
 * Mirrors transitionCustomerSalesOrder's own actions so the screen cannot offer
 * a button the engine would reject. It decides nothing on its own.
 */
export function availableActions(status: string): { action: string; label: string; permission: string }[] {
  switch (status) {
    case "Draft":
    case "Awaiting Approval":
      return [
        { action: "approve", label: "Confirm order", permission: "sales_orders.approve" },
        { action: "cancel", label: "Cancel", permission: "sales_orders.edit" },
      ];
    case "Approved":
      return [
        { action: "start_picking", label: "Start picking", permission: "sales_orders.pick" },
        { action: "cancel", label: "Cancel", permission: "sales_orders.edit" },
      ];
    case "Picking":
      return [
        { action: "pack", label: "Mark packed", permission: "sales_orders.pick" },
        { action: "cancel", label: "Cancel", permission: "sales_orders.edit" },
      ];
    case "Packed":
      return [
        { action: "dispatch", label: "Dispatch", permission: "sales_orders.dispatch" },
        { action: "cancel", label: "Cancel", permission: "sales_orders.edit" },
      ];
    default:
      return [];
  }
}

/** The notification event a transition produces, or null where none applies. */
export function eventForAction(action: string) {
  switch (action) {
    case "approve": return "order_approved" as const;
    case "start_picking": return "order_picking" as const;
    case "pack": return "order_packed" as const;
    case "dispatch": return "order_dispatched" as const;
    case "cancel": return "order_cancelled" as const;
    default: return null;
  }
}
