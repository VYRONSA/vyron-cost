import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stock reserved by sales orders — the one definition shared by the sales-order
 * engine (checkAndReserveStock), the Order Engine's stock check and the
 * customer ordering application.
 *
 * A `Reserved` row in vyron_customer_sales_order_allocations only holds stock
 * while its sales order is live. Cancelling an order does not release its
 * allocation rows (the engine never did), so counting every `Reserved` row
 * would let a cancelled order block stock forever.
 *
 * An order holds the stock it has reserved at whatever stage it is at: a
 * customer's order holds it from the moment it is placed, which is the whole
 * point of telling that customer what is available. The two statuses that hold
 * nothing are `Cancelled` (the order is off) and `Invoiced` (the stock has
 * physically left, and the rows have moved to `Converted`). An order that has
 * not reserved anything contributes nothing whatever its status, because it
 * has no rows.
 */
export const ACTIVE_RESERVATION_STATUSES = [
  "Draft",
  "Awaiting Approval",
  "Approved",
  "Picking",
  "Packed",
  "Dispatched",
  "Partially Invoiced",
] as const;

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

/** On hand, what live orders hold, and the difference. */
export type ProductAvailability = {
  /** vyron_cost_stock_items.qty_on_hand — the balance the business keeps. */
  onHand: number;
  /** Held by other live sales orders. */
  reserved: number;
  /** What may still be sold. Never below zero. */
  available: number;
  /** False when the product has no stock record at all — not the same as zero. */
  measured: boolean;
};

/**
 * Available to sell, per product: on hand minus what live sales orders hold.
 *
 * This is the one definition. Anything that needs to know what can still be
 * sold — the staff sales-order approval, the Order Engine, the customer
 * ordering application — reads it from here rather than working it out again,
 * so the figure a customer is shown and the figure approval enforces cannot
 * drift apart.
 *
 * A product with no stock record is reported as `measured: false` with zero
 * available. That is deliberately different from "we measured it and there is
 * none": the caller decides what to do about an unmeasured product, and this
 * function never invents a quantity for it.
 */
export async function loadAvailableQuantities(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[],
  options: { excludeSalesOrderId?: string | null } = {}
): Promise<Map<string, ProductAvailability>> {
  const result = new Map<string, ProductAvailability>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return result;

  const { data: stockRows, error } = await supabase
    .from("vyron_cost_stock_items")
    .select("entity_id, qty_on_hand")
    .eq("company_id", companyId)
    .eq("entity_type", "finished_goods")
    .in("entity_id", ids);
  if (error && !missingTable(error)) throw new Error(`Stock lookup failed: ${error.message}`);

  const onHandByProduct = new Map<string, number>();
  for (const row of (stockRows || []) as Array<{ entity_id: string; qty_on_hand: number | null }>) {
    const key = String(row.entity_id);
    onHandByProduct.set(key, Math.round(((onHandByProduct.get(key) || 0) + Number(row.qty_on_hand || 0)) * 10000) / 10000);
  }

  const reserved = await loadReservedQuantities(supabase, companyId, ids, options);

  for (const id of ids) {
    const measured = onHandByProduct.has(id);
    const onHand = onHandByProduct.get(id) || 0;
    const held = reserved.get(id) || 0;
    result.set(id, {
      onHand,
      reserved: held,
      available: Math.max(0, Math.round((onHand - held) * 10000) / 10000),
      measured,
    });
  }
  return result;
}
