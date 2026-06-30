import { NextRequest, NextResponse } from "next/server";
import { deleteStoreOrder, getStoreOrderDetail, saveStoreOrder } from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) return NextResponse.json({ ok: false, error: "Company not found." }, { status: 404 });

    const { id } = await context.params;
    const order = await getStoreOrderDetail(supabase, companyId, id);
    if (!order) return NextResponse.json({ ok: false, error: "Store order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Get store order failed.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.edit");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const order = await saveStoreOrder(supabase, companyId, {
      id,
      store_id: String(body.store_id || ""),
      order_number: body.order_number,
      order_date: body.order_date,
      required_date: body.required_date,
      notes: body.notes,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update store order failed.");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.delete");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    await deleteStoreOrder(supabase, companyId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Delete store order failed.");
  }
}
