import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import {
  listPortalAccess,
  setCustomerPortalPin,
  setPortalAccessStatus,
} from "@/lib/vyron-order-customer-auth";
import { getPortalTenantForCompany, setPortalTenant } from "@/lib/vyron-order-tenant";

export const runtime = "nodejs";

/**
 * Staff-side management of customer portal access.
 *
 * Scoped through the existing workspace resolution, exactly like every other
 * VYRON COST admin surface — there is no company input on any of these
 * handlers, so a request cannot reach another tenant's customers.
 *
 * A PIN can be set here. It can never be read here: no handler returns a PIN,
 * a hash or a salt, and no PIN value is written to a log or an audit detail.
 */

async function scope() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const companyId = await getWorkspaceCompanyId();
  if (!companyId) return null;
  return { supabase, companyId };
}

export async function GET() {
  const context = await scope();
  if (!context) return NextResponse.json({ ok: false, error: "No workspace in context." }, { status: 401 });
  try {
    const [access, tenant] = await Promise.all([
      listPortalAccess(context.supabase, context.companyId),
      getPortalTenantForCompany(context.supabase, context.companyId),
    ]);
    // The ordering link is public by design, so returning it here is safe. The
    // company id it resolves to is not returned.
    return NextResponse.json({
      ok: true,
      access,
      tenant: tenant ? { slug: tenant.slug, displayName: tenant.displayName, status: tenant.status } : null,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "We couldn't load portal access." }, { status: 500 });
  }
}

/** Create or change this workspace's ordering link. */
export async function PUT(request: NextRequest) {
  const context = await scope();
  if (!context) return NextResponse.json({ ok: false, error: "No workspace in context." }, { status: 401 });

  const body = await request.json().catch(() => null);
  try {
    const tenant = await setPortalTenant(context.supabase, context.companyId, {
      slug: String(body?.slug || ""),
      displayName: String(body?.displayName || ""),
      status: body?.status === "Disabled" ? "Disabled" : "Active",
    });
    return NextResponse.json({ ok: true, tenant: { slug: tenant.slug, displayName: tenant.displayName } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't save that link.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Issue or replace a customer's PIN. The value is used and discarded. */
export async function POST(request: NextRequest) {
  const context = await scope();
  if (!context) return NextResponse.json({ ok: false, error: "No workspace in context." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const customerId = String(body?.customerId || "").trim();
  const pin = String(body?.pin || "");
  if (!customerId) return NextResponse.json({ ok: false, error: "Choose a customer." }, { status: 400 });

  try {
    await setCustomerPortalPin(context.supabase, context.companyId, { customerId, pin });
    // Deliberately returns nothing about the credential itself.
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't set that PIN.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Suspend or restore access without touching the credential. */
export async function PATCH(request: NextRequest) {
  const context = await scope();
  if (!context) return NextResponse.json({ ok: false, error: "No workspace in context." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const customerId = String(body?.customerId || "").trim();
  const status = body?.status === "Suspended" ? "Suspended" : "Active";
  if (!customerId) return NextResponse.json({ ok: false, error: "Choose a customer." }, { status: 400 });

  try {
    await setPortalAccessStatus(context.supabase, context.companyId, { customerId, status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "We couldn't change that.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
