import { NextRequest, NextResponse } from "next/server";
import { listArchivedPurchaseOrders } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const search = request.nextUrl.searchParams.get("search") || undefined;
  const status = request.nextUrl.searchParams.get("status") || undefined;

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");

    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      companyId: request.nextUrl.searchParams.get("companyId"),
    });
    if (!companyId) return NextResponse.json({ ok: true, orders: [] });

    const orders = await listArchivedPurchaseOrders(supabase, companyId, { search, status });
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Archived purchase orders failed.");
  }
}
