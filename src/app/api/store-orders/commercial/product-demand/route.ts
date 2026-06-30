import { NextRequest, NextResponse } from "next/server";
import { getProductDemandReport } from "@/lib/vyron-store-order-commercial";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const daysParam = Number(request.nextUrl.searchParams.get("days") || 30);
  const days = ([7, 30, 90] as const).includes(daysParam as 7 | 30 | 90)
    ? (daysParam as 7 | 30 | 90)
    : 30;

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, days, top: [], bottom: [] });
    }
    const report = await getProductDemandReport(supabase, companyId, days);
    return NextResponse.json({ ok: true, days, ...report });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Product demand report failed.");
  }
}
