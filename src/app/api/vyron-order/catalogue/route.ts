import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { readCustomerSessionToken, resolveCustomerSession } from "@/lib/vyron-order-customer-auth";
import { getCustomerCatalogue } from "@/lib/vyron-order-catalogue";

export const runtime = "nodejs";

/**
 * The authenticated customer's catalogue.
 *
 * Company and customer come from the session, never from the query string, so
 * there is no parameter through which another tenant's catalogue can be asked
 * for. The payload carries selling prices only — no cost, BOM cost, supplier
 * price, margin or GP.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 });

  const scope = await resolveCustomerSession(supabase, await readCustomerSessionToken());
  if (!scope) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  try {
    const catalogue = await getCustomerCatalogue(supabase, scope.companyId, scope.customerId);
    return NextResponse.json({ ok: true, catalogue });
  } catch {
    // Never surface database detail to a customer device.
    return NextResponse.json({ ok: false, error: "We couldn't load your products." }, { status: 500 });
  }
}
