import { NextRequest, NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { getCart, setCartLine, setCartDelivery, clearCart } from "@/lib/vyron-order-cart";

export const runtime = "nodejs";

/** The customer's own cart, priced fresh on every read. */
export async function GET() {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, cart: await getCart(guard.supabase, guard.scope) });
  } catch {
    return customerError("We could not load your order.", 500);
  }
}

/** Set one line to an absolute quantity in units. Zero removes it. */
export async function POST(request: NextRequest) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  let body: { productId?: unknown; quantityUnits?: unknown; entryMode?: unknown };
  try { body = await request.json(); } catch { return customerError("Invalid request."); }

  const productId = String(body.productId || "").trim();
  const quantity = Number(body.quantityUnits);
  if (!productId) return customerError("Choose a product.");
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1000000) return customerError("Enter a valid quantity.");

  try {
    const cart = await setCartLine(guard.supabase, guard.scope, {
      productId,
      quantityUnits: quantity,
      entryMode: body.entryMode === "boxes" ? "boxes" : "units",
    });
    return NextResponse.json({ ok: true, cart });
  } catch (error) {
    return customerError(error instanceof Error ? error.message : "We could not update your order.");
  }
}

/** Delivery date and note. */
export async function PATCH(request: NextRequest) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  let body: { requestedDeliveryDate?: unknown; notes?: unknown };
  try { body = await request.json(); } catch { return customerError("Invalid request."); }

  try {
    const cart = await setCartDelivery(guard.supabase, guard.scope, {
      requestedDeliveryDate:
        body.requestedDeliveryDate === undefined ? undefined : body.requestedDeliveryDate === null ? null : String(body.requestedDeliveryDate),
      notes: body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes),
    });
    return NextResponse.json({ ok: true, cart });
  } catch (error) {
    return customerError(error instanceof Error ? error.message : "We could not update your order.");
  }
}

export async function DELETE() {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, cart: await clearCart(guard.supabase, guard.scope) });
  } catch {
    return customerError("We could not clear your order.", 500);
  }
}
