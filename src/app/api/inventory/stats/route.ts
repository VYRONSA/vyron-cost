import { NextRequest, NextResponse } from "next/server";
import { detectLegacyFinishedGoodsStockBuckets, getInventoryDashboardStats } from "@/lib/vyron-inventory";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import {
  requireWorkspacePermission,
  workspaceAccessErrorResponse,
} from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY_STATS = {
  totalInventoryValue: 0,
  ingredientsValue: 0,
  packagingValue: 0,
  rawMaterialValue: 0,
  finishedGoodsValue: 0,
  lowStockItems: 0,
  outOfStockItems: 0,
  overstockItems: 0,
  slowMovingItems: 0,
  negativeStockRisks: 0,
  inventoryVarianceValue: 0,
  stockTurnover: 0,
  inventoryTurns: 0,
  itemCount: 0,
};

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
        { ok: true, stats: EMPTY_STATS },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    if (request.nextUrl.searchParams.get("legacyFgReport") === "1") {
      const legacyFgReport = await detectLegacyFinishedGoodsStockBuckets(supabase, companyId);
      return NextResponse.json(
        { ok: true, legacyFgReport },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const stats = await getInventoryDashboardStats(supabase, companyId);
    return NextResponse.json(
      { ok: true, stats },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Stats failed.");
  }
}
