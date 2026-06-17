import { NextRequest, NextResponse } from "next/server";
import { getOverstockItems, getSlowMovingItems } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) {
      return NextResponse.json(
        {
          ok: true,
          lowStockAlerts: [],
          slowMoving30: [],
          slowMoving60: [],
          slowMoving90: [],
          overstock: [],
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const [{ data: lowStock }, slow30, slow60, slow90, overstock] = await Promise.all([
      supabase
        .from("vyron_cost_low_stock_alerts")
        .select("*, vyron_cost_stock_items(item_code, description, qty_on_hand, unit)")
        .eq("company_id", companyId)
        .eq("status", "Open"),
      getSlowMovingItems(supabase, companyId, 30),
      getSlowMovingItems(supabase, companyId, 60),
      getSlowMovingItems(supabase, companyId, 90),
      getOverstockItems(supabase, companyId),
    ]);
    return NextResponse.json(
      {
        ok: true,
        lowStockAlerts: lowStock || [],
        slowMoving30: slow30,
        slowMoving60: slow60,
        slowMoving90: slow90,
        overstock,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Alerts failed.");
  }
}
