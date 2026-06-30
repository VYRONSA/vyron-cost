import { NextResponse } from "next/server";
import { getStorePerformanceReport, getStoreScorecards } from "@/lib/vyron-store-order-commercial";
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
    await requirePackageFeature("store_performance");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, performance: [], scorecards: [] });
    }
    const [performance, scorecards] = await Promise.all([
      getStorePerformanceReport(supabase, companyId),
      getStoreScorecards(supabase, companyId),
    ]);
    return NextResponse.json({ ok: true, performance, scorecards });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Store performance report failed.");
  }
}
