import { NextRequest, NextResponse } from "next/server";
import { STORE_ORDER_STATUSES, transitionStoreOrder } from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "");

  if (!STORE_ORDER_STATUSES.includes(status as (typeof STORE_ORDER_STATUSES)[number])) {
    return NextResponse.json({ ok: false, error: "Valid status is required." }, { status: 400 });
  }

  try {
    await requirePackageFeature("store_ordering");
    const permission =
      status === "Approved" || status === "Cancelled" ? "store_orders.approve" : "store_orders.edit";
    await requireWorkspacePermission(permission);
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const order = await transitionStoreOrder(supabase, companyId, id, status, {
      approvedBy: typeof body.approvedBy === "string" ? body.approvedBy : undefined,
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Status transition failed.");
  }
}
