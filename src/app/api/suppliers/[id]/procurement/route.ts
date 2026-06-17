import { NextRequest, NextResponse } from "next/server";
import { getSupplierProcurementStats } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id: supplierId } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("suppliers.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: {
          poCount: 0,
          grnCount: 0,
          invoiceCount: 0,
          spendThisMonth: 0,
          spendThisYear: 0,
          averageVariancePercent: 0,
        },
      });
    }
    const stats = await getSupplierProcurementStats(supabase, supplierId, companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Stats failed.");
  }
}
