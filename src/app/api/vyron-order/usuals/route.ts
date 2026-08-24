import { NextResponse } from "next/server";
import { requireCustomerScope, customerError } from "@/lib/vyron-order-request";
import { getUsualProducts } from "@/lib/vyron-order-history";

export const runtime = "nodejs";

/** Empty until the customer has enough history for the answer to be honest. */
export async function GET() {
  const guard = await requireCustomerScope();
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ ok: true, usuals: await getUsualProducts(guard.supabase, guard.scope) });
  } catch {
    return customerError("We could not load your usual products.", 500);
  }
}
