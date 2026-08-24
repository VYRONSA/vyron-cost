import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { listPortalCustomers } from "@/lib/vyron-order-customer-auth";
import { resolvePortalTenant } from "@/lib/vyron-order-tenant";

export const runtime = "nodejs";

/**
 * The accounts that can sign in through a given ordering link.
 *
 * The tenant comes from the link the customer was given (?tenant=<slug>), which
 * the server resolves itself — the caller supplies a slug, never a company id,
 * so this cannot be pointed at a tenant by guessing an internal identifier.
 *
 * It returns ONLY customers who have been given portal access for that tenant
 * and whose access is Active. A tenant with one enabled customer returns one
 * row, not its whole customer master. Suspended and never-enabled customers are
 * absent, so this is not a customer list.
 *
 * An unknown slug, a disabled tenant and a malformed slug all return the same
 * 404 with the same message: whether a particular supplier uses VYRON ORDER is
 * not something this endpoint will confirm.
 *
 * Staff opening the portal from inside VYRON COST with no slug still get their
 * own workspace's list, which is how the internal preview works.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Ordering is not available." }, { status: 503 });

  const slug = request.nextUrl.searchParams.get("tenant");

  if (slug) {
    const tenant = await resolvePortalTenant(supabase, slug);
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "That ordering link is not valid." }, { status: 404 });
    }
    try {
      return NextResponse.json({
        ok: true,
        tenant: { slug: tenant.slug, displayName: tenant.displayName },
        customers: await listPortalCustomers(supabase, tenant.companyId),
      });
    } catch {
      return NextResponse.json({ ok: false, error: "We couldn't load the accounts." }, { status: 500 });
    }
  }

  // No slug: the internal preview path, scoped to the staff workspace in
  // context. Without a workspace this returns nothing rather than everything.
  const companyId = await getWorkspaceCompanyId();
  if (!companyId) return NextResponse.json({ ok: true, customers: [] });

  try {
    return NextResponse.json({ ok: true, customers: await listPortalCustomers(supabase, companyId) });
  } catch {
    return NextResponse.json({ ok: true, customers: [] });
  }
}
