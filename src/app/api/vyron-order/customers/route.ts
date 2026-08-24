import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getWorkspaceCompanyId } from "@/lib/vyron-workspace-server";
import { listPortalCustomers } from "@/lib/vyron-order-customer-auth";

export const runtime = "nodejs";

/**
 * Sign-in options for the workspace currently in context.
 *
 * The company is resolved through the existing workspace resolution, so this
 * lists one tenant's portal customers and never all of them. Without a
 * workspace context it returns an empty list rather than every customer in the
 * database. Only display names are returned — no credential material.
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: true, customers: [] });

  const companyId = await getWorkspaceCompanyId();
  if (!companyId) return NextResponse.json({ ok: true, customers: [] });

  try {
    return NextResponse.json({ ok: true, customers: await listPortalCustomers(supabase, companyId) });
  } catch {
    return NextResponse.json({ ok: true, customers: [] });
  }
}
