import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { readCustomerSessionToken, resolveCustomerSession } from "@/lib/vyron-order-customer-auth";
import type { CartScope } from "@/lib/vyron-order-cart";

/**
 * The single entry point every customer-facing VYRON ORDER route uses.
 *
 * It returns the tenant and customer from the authenticated session and nothing
 * else. No route reads a company or customer identifier from a query string,
 * body or header, so there is no identifier for a caller to forge.
 */
export async function requireCustomerScope(): Promise<
  { ok: true; supabase: SupabaseClient; scope: CartScope } | { ok: false; response: NextResponse }
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 }) };
  }
  const session = await resolveCustomerSession(supabase, await readCustomerSessionToken());
  if (!session) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 }) };
  }
  return {
    ok: true,
    supabase,
    scope: { companyId: session.companyId, customerId: session.customerId, customerName: session.customerName },
  };
}

/** Customer devices never see database detail. */
export function customerError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
