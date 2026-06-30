import { NextRequest, NextResponse } from "next/server";
import {
  getPurchaseOrderEngineDetail,
  getPurchaseOrderEngineDashboardStats,
  getSupplierPerformanceForPo,
  listPurchaseOrdersEngine,
} from "@/lib/vyron-purchase-order-engine";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({
        ok: true,
        orders: [],
        stats: { openPurchaseOrders: 0, outstandingReceipts: 0, purchaseValueThisMonth: 0, lateDeliveries: 0 },
      });
    }

    const status = request.nextUrl.searchParams.get("status") || undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const poId = request.nextUrl.searchParams.get("id");
    const supplierId = request.nextUrl.searchParams.get("supplierId");

    if (poId) {
      const purchaseOrder = await getPurchaseOrderEngineDetail(supabase, companyId, poId);
      if (!purchaseOrder) {
        return NextResponse.json({ ok: false, error: "Purchase order not found." }, { status: 404 });
      }
      const supplierPerformance = purchaseOrder.supplier_id
        ? await getSupplierPerformanceForPo(supabase, companyId, purchaseOrder.supplier_id)
        : null;
      return NextResponse.json({ ok: true, purchaseOrder, supplierPerformance });
    }

    if (supplierId) {
      const supplierPerformance = await getSupplierPerformanceForPo(supabase, companyId, supplierId);
      return NextResponse.json({ ok: true, supplierPerformance });
    }

    const [orders, stats] = await Promise.all([
      listPurchaseOrdersEngine(supabase, companyId, { status, search }),
      getPurchaseOrderEngineDashboardStats(supabase, companyId),
    ]);

    return NextResponse.json({ ok: true, orders, stats });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Purchase order engine failed.");
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  const body = await request.json().catch(() => ({}));

  try {
    await requirePackageFeature("purchase_orders");
    await requireWorkspacePermission("purchase_orders.edit");
    const companyId = await requireApiCompanyId();
    const poId = String(body.id);
    const { error } = await supabase
      .from("vyron_cost_purchase_orders")
      .update({ status: String(body.status || "Sent"), updated_at: new Date().toISOString() })
      .eq("id", poId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    const purchaseOrder = await getPurchaseOrderEngineDetail(supabase, companyId, poId);
    return NextResponse.json({ ok: true, purchaseOrder });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Update purchase order failed.");
  }
}
