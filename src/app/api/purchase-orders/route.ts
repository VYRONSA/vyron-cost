import { NextRequest, NextResponse } from "next/server";
import { listPurchaseOrders, savePurchaseOrder } from "@/lib/vyron-procurement";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { resolveApiCompanyIdWithContext } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function companyContextFromBody(body: Record<string, unknown>) {
  return {
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : null,
    companyId: typeof body.companyId === "string" ? body.companyId : null,
  };
}

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const status = request.nextUrl.searchParams.get("status") || undefined;
  const search = request.nextUrl.searchParams.get("search") || undefined;
  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");
    const companyId = await resolveApiCompanyIdWithContext(supabase, {
      workspaceId: request.nextUrl.searchParams.get("workspaceId"),
      companyId: request.nextUrl.searchParams.get("companyId"),
    });
    if (!companyId) return NextResponse.json({ ok: true, orders: [] });
    const orders = await listPurchaseOrders(supabase, companyId, { status, search });
    return NextResponse.json({ ok: true, orders });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase admin unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.create");
    const companyId = await resolveApiCompanyIdWithContext(supabase, companyContextFromBody(body));
    if (!companyId) return NextResponse.json({ ok: false, error: "No active workspace company." }, { status: 400 });
    const po = await savePurchaseOrder(supabase, companyId, {
      id: body.id,
      po_number: String(body.po_number || `PO-${Date.now().toString().slice(-6)}`),
      supplier_id: body.supplier_id || null,
      supplier_name_snapshot: String(body.supplier_name_snapshot || ""),
      status: body.status || "Draft",
      order_date: body.order_date,
      notes: body.notes,
      header_discount_pct: body.header_discount_pct,
      header_discount_value: body.header_discount_value,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, purchaseOrder: po });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save failed.");
  }
}
