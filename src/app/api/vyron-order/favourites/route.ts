import { NextRequest, NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { listFavourites, toggleFavourite } from "@/lib/vyron-order-history";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, favourites: await listFavourites(guard.supabase, guard.scope) });
  } catch {
    return customerError("We could not load your favourites.", 500);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  let body: { productId?: unknown };
  try { body = await request.json(); } catch { return customerError("Invalid request."); }
  try {
    const result = await toggleFavourite(guard.supabase, guard.scope, String(body.productId || ""));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return customerError(error instanceof Error ? error.message : "We could not update your favourites.");
  }
}
