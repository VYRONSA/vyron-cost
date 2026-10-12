import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { StockOnHandError, getStockOnHandReport } from "@/lib/vyron-stock-on-hand";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/stock-on-hand?asAt=YYYY-MM-DD
 *
 * Stock on hand at the end of the date (SA time), rebuilt from the stock ledger. Read-only. Needs
 * inventory.view; the company is the one the signed-in member's workspace owns.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await requireApiCompanyId();
    const report = await getStockOnHandReport(supabase, companyId, String(request.nextUrl.searchParams.get("asAt") || "").trim());
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StockOnHandError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return workspaceAccessErrorResponse(error, "Stock on hand report failed.");
  }
}
