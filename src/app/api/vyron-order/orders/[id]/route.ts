import { NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { getCustomerOrder } from "@/lib/vyron-order-history";

export const runtime = "nodejs";

/**
 * One order.
 *
 * The lookup is filtered on the session's company AND customer, so another
 * customer's order id resolves to nothing and returns 404 — it never returns
 * their data, and it does not reveal that the order exists.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  try {
    const order = await getCustomerOrder(guard.supabase, guard.scope, id);
    if (!order) return customerError("Order not found.", 404);
    return NextResponse.json({ ok: true, order });
  } catch {
    return customerError("We could not load that order.", 500);
  }
}
