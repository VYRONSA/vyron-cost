import { NextResponse } from "next/server";
import { getInventoryTransactionDashboardStats } from "@/lib/vyron-inventory-transactions";
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
    await requirePackageFeature("inventory");
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        stats: { inventoryValue: 0, stockMovementsToday: 0, negativeStockWarnings: 0, stockAdjustments: 0 },
      });
    }

    const stats = await getInventoryTransactionDashboardStats(supabase, companyId);
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Inventory stats failed.");
  }
}
