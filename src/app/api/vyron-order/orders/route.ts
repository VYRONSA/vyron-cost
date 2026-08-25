import { NextRequest, NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { submitCart } from "@/lib/vyron-order-cart";
import { listCustomerOrders } from "@/lib/vyron-order-history";

export const runtime = "nodejs";

/** The customer's own orders. Scoped by company AND customer. */
export async function GET() {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, orders: await listCustomerOrders(guard.supabase, guard.scope) });
  } catch {
    return customerError("We could not load your orders.", 500);
  }
}

/**
 * Place the order.
 *
 * The body carries only an idempotency key and the prices the customer was
 * shown. Products, quantities, pricing and totals all come from the server.
 */
export async function POST(request: NextRequest) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  let body: { idempotencyKey?: unknown; acknowledgedPrices?: unknown };
  try { body = await request.json(); } catch { return customerError("Invalid request."); }

  const acknowledged = Array.isArray(body.acknowledgedPrices)
    ? (body.acknowledgedPrices as { productId?: unknown; sellingPrice?: unknown }[]).map((p) => ({
        productId: String(p.productId || ""),
        sellingPrice: Number(p.sellingPrice) || 0,
      }))
    : [];

  const outcome = await submitCart(guard.supabase, guard.scope, {
    idempotencyKey: String(body.idempotencyKey || ""),
    acknowledgedPrices: acknowledged,
    // Origin of this request, so the staff "View order" link in notifications is
    // correct in every environment without hardcoding a production host.
    baseUrl: request.nextUrl.origin,
  });

  if (!outcome.ok) {
    const status = outcome.reason === "price_changed" ? 409 : outcome.reason === "failed" ? 500 : 400;
    return NextResponse.json(
      { ok: false, reason: outcome.reason, error: outcome.message, priceChanges: outcome.priceChanges, unavailable: outcome.unavailable },
      { status }
    );
  }
  return NextResponse.json({ ok: true, order: outcome });
}
