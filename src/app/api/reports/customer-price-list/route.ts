import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { PriceListError } from "@/lib/vyron-customer-price-lists";
import { getCustomerPriceListReport } from "@/lib/vyron-customer-sales-reports";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/customer-price-list
 *
 * What price each customer is entitled to for each product. Needs reports.view.
 * The company is the one the signed-in member's workspace owns; the query string
 * can only narrow within it, and a customer, list or product id from another
 * company is answered 404 like a missing one.
 */
export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("reports.view");
    const companyId = await requireApiCompanyId();
    const q = request.nextUrl.searchParams;
    const report = await getCustomerPriceListReport(supabase, companyId, {
      customerId: q.get("customerId"),
      priceListId: q.get("priceListId"),
      productId: q.get("productId"),
      search: q.get("search"),
      status: q.get("status"),
      asOf: q.get("asOf"),
      effectiveFrom: q.get("effectiveFrom"),
      effectiveTo: q.get("effectiveTo"),
    });
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PriceListError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Customer price list report failed.");
  }
}
