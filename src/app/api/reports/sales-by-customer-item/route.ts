import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { PriceListError } from "@/lib/vyron-customer-price-lists";
import { getSalesByCustomerItemReport } from "@/lib/vyron-customer-sales-reports";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/sales-by-customer-item
 *
 * Recorded sales by customer, item and date, from customer invoices (default)
 * or sales orders. Every price is the one recorded on the transaction line.
 * Needs reports.view. The company is the one the signed-in member's workspace
 * owns; a customer or product id from another company is answered 404.
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
    const report = await getSalesByCustomerItemReport(supabase, companyId, {
      source: q.get("source"),
      from: q.get("from"),
      to: q.get("to"),
      customerId: q.get("customerId"),
      productId: q.get("productId"),
      search: q.get("search"),
      status: q.get("status"),
    });
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PriceListError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return workspaceAccessErrorResponse(error, "Sales report failed.");
  }
}
