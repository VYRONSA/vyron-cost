import { NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { reorderIntoCart } from "@/lib/vyron-order-history";

export const runtime = "nodejs";

/**
 * Load a past order into the cart.
 *
 * Re-validated against today's catalogue rather than cloned: gone or unpriced
 * products are reported as skipped, and any price that has moved is returned so
 * the customer sees it before they submit.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  try {
    const outcome = await reorderIntoCart(guard.supabase, guard.scope, id);
    if (!outcome) return customerError("Order not found.", 404);
    return NextResponse.json({ ok: true, ...outcome });
  } catch {
    return customerError("We could not rebuild that order.", 500);
  }
}
