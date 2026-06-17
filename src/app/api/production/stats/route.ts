import { NextRequest, NextResponse } from "next/server";
import { getManufacturingDashboardStats } from "@/lib/vyron-manufacturing";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { manufacturingCompanyContextFromRequest } from "@/lib/vyron-manufacturing-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_STATS = {
  productionToday: 0,
  productionThisWeek: 0,
  productionThisMonth: 0,
  productionCost: 0,
  yieldPct: 0,
  wastagePct: 0,
  ingredientUsageValue: 0,
  packagingUsageValue: 0,
  finishedGoodsProduced: 0,
  productionVariances: 0,
  productionEfficiency: 0,
  finishedGoodsValue: 0,
  activeRuns: 0,
  completedRuns: 0,
};

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("manufacturing.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, manufacturingCompanyContextFromRequest(request));
    if (!companyId) {
      return NextResponse.json({ ok: true, stats: EMPTY_STATS }, { headers: { "Cache-Control": "no-store" } });
    }
    const stats = await getManufacturingDashboardStats(supabase, companyId);
    return NextResponse.json({ ok: true, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Stats failed.");
  }
}
