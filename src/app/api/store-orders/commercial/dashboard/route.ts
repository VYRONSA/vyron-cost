import { NextResponse } from "next/server";
import { getStoreOrderCommercialDashboard } from "@/lib/vyron-store-order-commercial";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        dashboard: {
          ordersToday: 0,
          revenueToday: 0,
          pendingApproval: 0,
          picking: 0,
          readyForDispatch: 0,
          delivered: 0,
        },
      });
    }
    const dashboard = await getStoreOrderCommercialDashboard(supabase, companyId);
    return NextResponse.json({ ok: true, dashboard });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Store order dashboard failed.");
  }
}
