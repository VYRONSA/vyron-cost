import { NextRequest, NextResponse } from "next/server";
import { getInventoryLedger } from "@/lib/vyron-inventory-transactions";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { inventoryCompanyContextFromRequest } from "@/lib/vyron-inventory-api-context";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

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
    await requirePackageFeature("inventory");
    await requireWorkspacePermission("inventory.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, inventoryCompanyContextFromRequest(request));
    if (!companyId) return NextResponse.json({ ok: true, entries: [] });

    const entries = await getInventoryLedger(supabase, companyId, { stockItemId, limit: 1000 });
    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Inventory ledger failed.");
  }
}
