import { NextResponse } from "next/server";
import { evaluateStoreOrderWarnings } from "@/lib/vyron-store-order-commercial";
import { getStoreOrderDetail } from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requirePackageFeature, requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await requireApiCompanyId();
    const { id } = await context.params;
    const order = await getStoreOrderDetail(supabase, companyId, id);
    if (!order) return NextResponse.json({ ok: false, error: "Store order not found." }, { status: 404 });

    const warnings = await evaluateStoreOrderWarnings(supabase, companyId, {
      id: order.id,
      store_id: order.store_id,
      order_value: order.order_value,
      subtotal: order.subtotal,
      margin_pct: order.margin_pct,
      lines: (order.lines || []).map((line) => ({
        product_id: line.product_id,
        product_name_snapshot: line.product_name_snapshot,
        quantity: line.quantity,
      })),
    });

    return NextResponse.json({ ok: true, warnings });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Evaluate warnings failed.");
  }
}
