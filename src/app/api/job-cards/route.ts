import { NextRequest, NextResponse } from "next/server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { findJobCard, JobCardError, type JobCardSourceType } from "@/lib/vyron-job-cards";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

/** GET /api/job-cards?type=customer_sales_order&id=<order id> — the order's job card, if one was issued. */
export async function GET(request: NextRequest) {
  const supabase = isSupabaseServiceRoleConfigured() ? getSupabaseAdmin() : null;
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });
  const type = (request.nextUrl.searchParams.get("type") || "customer_sales_order") as JobCardSourceType;
  const id = request.nextUrl.searchParams.get("id") || "";
  try {
    await requireWorkspacePermission(type === "store_order" ? "store_orders.view" : "sales_orders.view");
    const companyId = await requireApiCompanyId();
    const card = await findJobCard(supabase, companyId, type, id);
    return NextResponse.json({ ok: true, card }, { headers: noStore });
  } catch (error) {
    if (error instanceof JobCardError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: noStore });
    return workspaceAccessErrorResponse(error, "Could not read the job card.");
  }
}
