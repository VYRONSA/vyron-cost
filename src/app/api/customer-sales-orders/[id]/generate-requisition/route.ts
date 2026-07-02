import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { generateProcurementRequisitionForSalesOrder } from "@/lib/vyron-customer-sales-orders";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requireWorkspacePermission("procurement.requisitions.create");
    await requireWorkspacePermission("sales_orders.approve");
    const companyId = await requireApiCompanyId();
    const result = await generateProcurementRequisitionForSalesOrder(
      supabase,
      companyId,
      id,
      String(body.actor || "user")
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Generate requisition from sales order failed.");
  }
}
