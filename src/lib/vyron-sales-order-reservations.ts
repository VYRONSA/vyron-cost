import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stock reserved by sales orders — the one definition shared by the sales-order
 * engine (checkAndReserveStock) and the Order Engine's stock check.
 *
 * A `Reserved` row in vyron_customer_sales_order_allocations only holds stock
 * while its sales order is live. Cancelling an order does not release its
 * allocation rows (the engine never did), so counting every `Reserved` row
 * would let a cancelled order block stock forever. Only orders in these
 * statuses hold stock; stock physically leaves on invoice posting, and a fully
 * invoiced order's rows move to `Converted`.
 */
export const ACTIVE_RESERVATION_STATUSES = ["Approved", "Picking", "Packed", "Dispatched", "Partially Invoiced"] as const;

function missingTable(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("could not find the table") || (message.includes("relation") && message.includes("does not exist"));
}

/**
 * Quantity per product reserved by live sales orders of the company, optionally
 * excluding one sales order (its own reservation is being replaced).
 */
export async function loadReservedQuantities(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[],
  options: { excludeSalesOrderId?: string | null } = {}
): Promise<Map<string, number>> {
  const reserved = new Map<string, number>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return reserved;

  const { data: allocations, error } = await supabase
    .from("vyron_customer_sales_order_allocations")
    .select("sales_order_id, product_id, reserved_qty")
    .eq("company_id", companyId)
    .eq("status", "Reserved")
    .in("product_id", ids);
  if (error) {
    if (missingTable(error)) return reserved;
    throw new Error(`Reservation lookup failed: ${error.message}`);
  }
  const rows = ((allocations || []) as Array<{ sales_order_id: string; product_id: string; reserved_qty: number | null }>).filter(
    (row) => row.sales_order_id !== options.excludeSalesOrderId
  );
  const orderIds = [...new Set(rows.map((row) => String(row.sales_order_id)))];
  if (!orderIds.length) return reserved;

  const { data: orders, error: orderError } = await supabase
    .from("vyron_customer_sales_orders")
    .select("id, status")
    .eq("company_id", companyId)
    .in("id", orderIds);
  if (orderError) throw new Error(`Reservation lookup failed: ${orderError.message}`);
  const live = new Set(
    ((orders || []) as Array<{ id: string; status: string }>)
      .filter((order) => (ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(order.status))
      .map((order) => String(order.id))
  );

  for (const row of rows) {
    if (!live.has(String(row.sales_order_id))) continue;
    const key = String(row.product_id);
    reserved.set(key, Math.round(((reserved.get(key) || 0) + Number(row.reserved_qty || 0)) * 10000) / 10000);
  }
  return reserved;
}
