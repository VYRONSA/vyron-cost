import type { SupabaseClient } from "@supabase/supabase-js";
import { transitionCustomerSalesOrder } from "@/lib/vyron-customer-sales-orders";

/**
 * How long an unapproved customer order may hold stock.
 *
 * A customer's order holds what it commits from the moment it is placed —
 * otherwise the quantity shown to the next customer is a guess, and two
 * customers can be promised the same units. But an order nobody approves must
 * not hold that stock for ever: it would quietly take the product off the
 * shelf for everyone else.
 *
 * How long is a business decision. There is no default here and no number in
 * the code: until a company sets one, the policy reads NOT CONFIGURED and the
 * hold does not expire, which is exactly what the system did before. Nothing
 * starts expiring in a live tenant because this file was deployed.
 *
 * When a policy IS set, an expired order is cancelled through the ordinary
 * order lifecycle — the same transition a person would use — so its
 * reservation stops counting through the one availability calculation rather
 * than through a second rule.
 */

/** The statuses a customer's order passes through while it still awaits a decision. */
export const PENDING_APPROVAL_STATUSES = ["Draft", "Awaiting Approval"] as const;

export type HoldPolicy = {
  /** Minutes an unapproved order may hold stock. Null = not configured. */
  minutes: number | null;
  /** Where the number came from, for the screen that shows it. */
  source: "customer" | "company" | "not_configured";
  configured: boolean;
};

export const NOT_CONFIGURED: HoldPolicy = { minutes: null, source: "not_configured", configured: false };

const minutesOf = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

function missing(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || "");
  const message = String((error as { message?: string } | null)?.message || "").toLowerCase();
  // An un-migrated database has neither the column nor, possibly, the table.
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

/**
 * The policy for one customer: their own override, else the company's, else
 * not configured. A database that has not been migrated reads as not
 * configured rather than failing — the ordering application must keep working.
 */
export async function loadHoldPolicy(supabase: SupabaseClient, companyId: string, customerId?: string | null): Promise<HoldPolicy> {
  if (customerId) {
    const { data, error } = await supabase
      .from("vyron_customer_portal_identities")
      .select("pending_hold_minutes")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .limit(1)
      .maybeSingle();
    if (error && !missing(error)) throw new Error(`Hold policy lookup failed: ${error.message}`);
    const own = minutesOf(data?.pending_hold_minutes);
    if (own) return { minutes: own, source: "customer", configured: true };
  }

  const { data, error } = await supabase
    .from("vyron_customer_portal_tenants")
    .select("pending_hold_minutes")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (error && !missing(error)) throw new Error(`Hold policy lookup failed: ${error.message}`);
  const company = minutesOf(data?.pending_hold_minutes);
  return company ? { minutes: company, source: "company", configured: true } : NOT_CONFIGURED;
}

export type ExpiredHold = { salesOrderId: string; orderNumber: string | null; customerId: string | null; placedAt: string | null; releasedUnits: number };

/**
 * Release the stock held by customer orders nobody decided on in time.
 *
 * Does nothing at all when the policy is not configured — which is the state
 * of every company until one is set, so this is a no-op in production until
 * somebody chooses the number.
 *
 * Each expired order is cancelled through `transitionCustomerSalesOrder`, so
 * it follows the same path, writes the same audit trail and leaves the same
 * history as a cancellation by a person. Its allocations then stop counting,
 * because a Cancelled order holds nothing.
 */
export async function expireStaleCustomerHolds(
  supabase: SupabaseClient,
  companyId: string,
  options: { now?: Date; actor?: string } = {}
): Promise<{ policy: HoldPolicy; expired: ExpiredHold[] }> {
  const policy = await loadHoldPolicy(supabase, companyId);
  if (!policy.configured || !policy.minutes) return { policy, expired: [] };

  const now = options.now || new Date();
  const cutoff = new Date(now.getTime() - policy.minutes * 60_000).toISOString();

  const { data: stale, error } = await supabase
    .from("vyron_customer_sales_orders")
    .select("id, order_number, customer_id, created_at, status")
    .eq("company_id", companyId)
    .in("status", PENDING_APPROVAL_STATUSES as unknown as string[])
    .lt("created_at", cutoff)
    .limit(200);
  if (error) {
    if (missing(error)) return { policy, expired: [] };
    throw new Error(`Expiring holds failed: ${error.message}`);
  }
  const candidates = (stale || []) as Array<{ id: string; order_number: string | null; customer_id: string | null; created_at: string | null }>;
  if (!candidates.length) return { policy, expired: [] };

  // Only orders that actually hold something need releasing; a pending order
  // with no allocations is simply an old order, and is left alone.
  const { data: allocations, error: allocationError } = await supabase
    .from("vyron_customer_sales_order_allocations")
    .select("sales_order_id, reserved_qty, status")
    .eq("company_id", companyId)
    .eq("status", "Reserved")
    .in("sales_order_id", candidates.map((c) => String(c.id)));
  if (allocationError && !missing(allocationError)) throw new Error(`Expiring holds failed: ${allocationError.message}`);

  const heldByOrder = new Map<string, number>();
  for (const row of (allocations || []) as Array<{ sales_order_id: string; reserved_qty: number | null }>) {
    const key = String(row.sales_order_id);
    heldByOrder.set(key, Math.round(((heldByOrder.get(key) || 0) + Number(row.reserved_qty || 0)) * 10000) / 10000);
  }

  const expired: ExpiredHold[] = [];
  for (const order of candidates) {
    const held = heldByOrder.get(String(order.id));
    if (!held) continue;
    try {
      await transitionCustomerSalesOrder(supabase, companyId, String(order.id), "cancel", options.actor || "vyron-order (hold expired)");
      expired.push({
        salesOrderId: String(order.id),
        orderNumber: order.order_number ?? null,
        customerId: order.customer_id ?? null,
        placedAt: order.created_at ?? null,
        releasedUnits: held,
      });
    } catch {
      // One order that cannot be cancelled (an unexpected status, a concurrent
      // decision) must not stop the others being released.
    }
  }
  return { policy, expired };
}
