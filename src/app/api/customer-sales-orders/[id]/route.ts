import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { getSalesOrderInsight, transitionCustomerSalesOrder } from "@/lib/vyron-customer-sales-orders";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("sales_orders.view");
    const companyId = await requireApiCompanyId();
    const loaded = await getSalesOrderInsight(supabase, companyId, id);
    if (!loaded) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    return NextResponse.json({ ok: true, ...loaded });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Load sales order failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  try {
    const companyId = await requireApiCompanyId();

    if (action === "submit") await requireWorkspacePermission("sales_orders.create");
    else if (action === "approve") await requireWorkspacePermission("sales_orders.approve");
    else if (action === "start_picking" || action === "pack") await requireWorkspacePermission("sales_orders.pick");
    else if (action === "dispatch") await requireWorkspacePermission("sales_orders.dispatch");
    else if (action === "cancel") await requireWorkspacePermission("sales_orders.edit");
    else return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

    const order = await transitionCustomerSalesOrder(
      supabase,
      companyId,
      id,
      action as "submit" | "approve" | "start_picking" | "pack" | "dispatch" | "cancel",
      String(body.actor || "user")
    );
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "SALES_ORDER_STOCK_SHORTAGE"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Insufficient stock for approval.",
          shortages: (error as { shortages?: unknown }).shortages || [],
        },
        { status: 409 }
      );
    }
    return workspaceAccessErrorResponse(error, "Update sales order failed.");
  }
}
