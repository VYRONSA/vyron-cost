import { NextRequest, NextResponse } from "next/server";
import { searchItemLookup } from "@/lib/platform/item-lookup/searchItemLookup";
import { resolveApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import type { ItemLookupSearchParams } from "@/lib/platform/item-lookup/ItemLookupTypes";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const searchParams = request.nextUrl.searchParams;
  const params: ItemLookupSearchParams = {
    q: searchParams.get("q") || undefined,
    type: (searchParams.get("type") as ItemLookupSearchParams["type"]) || undefined,
    status: (searchParams.get("status") as ItemLookupSearchParams["status"]) || undefined,
    category: searchParams.get("category") || undefined,
    supplierId: searchParams.get("supplierId") || undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
  };

  try {
    await requireWorkspacePermission("products.view");
    const companyId = await resolveApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: true, items: [] });

    const items = await searchItemLookup(supabase, companyId, params);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Item lookup search failed.");
  }
}
