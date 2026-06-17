import { NextResponse } from "next/server";
import { getProcurementDashboardStats } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("purchase_orders.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: { openPos: 0, pendingApproval: 0, partiallyReceived: 0, closedPos: 0, backOrders: 0, poVariances: 0 },
      });
    }
    const stats = await getProcurementDashboardStats(supabase, companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Stats failed.");
  }
}
