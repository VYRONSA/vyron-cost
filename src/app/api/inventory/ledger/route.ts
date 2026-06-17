import { NextRequest, NextResponse } from "next/server";
import { getStockLedger } from "@/lib/vyron-inventory";
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
  const stockItemId = request.nextUrl.searchParams.get("stockItemId") || undefined;
  try {
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, entries: [] }, { headers: { "Cache-Control": "no-store" } });
    const entries = await getStockLedger(supabase, companyId, { stockItemId });
    return NextResponse.json({ ok: true, entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Ledger failed.");
  }
}
