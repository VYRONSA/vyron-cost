import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { readCustomerSessionToken, resolveCustomerSession } from "@/lib/vyron-order-customer-auth";

export const runtime = "nodejs";

/**
 * Who the caller is, according to the server.
 *
 * Returns the customer's own identity only. The company id is intentionally NOT
 * exposed: the browser has no use for it and every endpoint derives it from the
 * session anyway.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, authenticated: false }, { status: 503 });

  const scope = await resolveCustomerSession(supabase, await readCustomerSessionToken());
  if (!scope) return NextResponse.json({ ok: true, authenticated: false }, { status: 200 });

  return NextResponse.json({
    ok: true,
    authenticated: true,
    customer: { customerId: scope.customerId, customerName: scope.customerName },
    expiresAt: scope.expiresAt,
  });
}
