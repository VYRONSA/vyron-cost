import { NextRequest, NextResponse } from "next/server";
import {
  listFinishedGoodsForStoreOrder,
  listStoreOrders,
  saveStoreOrder,
} from "@/lib/vyron-store-orders";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId, resolveAndAlignApiCompanyId } from "@/lib/vyron-api-workspace";
import { assertOperationsSchemaReady } from "@/lib/vyron-schema-readiness";
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
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.view");
    const companyId = await resolveAndAlignApiCompanyId();
    if (!companyId) {
      return NextResponse.json({ ok: true, orders: [], products: [] });
    }

    await assertOperationsSchemaReady(supabase);

    const includeProducts = request.nextUrl.searchParams.get("includeProducts") === "true";
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const statusesParam = request.nextUrl.searchParams.get("statuses");
    const statuses = statusesParam
      ? statusesParam.split(",").map((value) => value.trim()).filter(Boolean)
      : undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const storeId = request.nextUrl.searchParams.get("storeId") || undefined;

    const includeWarnings = request.nextUrl.searchParams.get("includeWarnings") === "true";

    const orders = await listStoreOrders(supabase, companyId, { status, statuses, search, storeId });
    const products = includeProducts ? await listFinishedGoodsForStoreOrder(supabase, companyId) : undefined;

    let warningsByOrderId: Record<string, { code: string; message: string }[]> | undefined;
    if (includeWarnings && orders.length) {
      const { evaluateStoreOrderWarnings } = await import("@/lib/vyron-store-order-commercial");
      const orderIds = orders.map((order) => order.id);
      const { data: lineRows } = await supabase
        .from("vyron_cost_store_order_lines")
        .select("store_order_id, product_id, product_name_snapshot, quantity")
        .eq("company_id", companyId)
        .in("store_order_id", orderIds);

      const linesByOrder = new Map<string, Array<{ product_id: string; product_name_snapshot: string; quantity: number }>>();
      for (const row of lineRows || []) {
        const bucket = linesByOrder.get(String(row.store_order_id)) || [];
        bucket.push({
          product_id: String(row.product_id),
          product_name_snapshot: String(row.product_name_snapshot || ""),
          quantity: Number(row.quantity || 0),
        });
        linesByOrder.set(String(row.store_order_id), bucket);
      }

      const entries = await Promise.all(
        orders.map(async (order) => {
          const warnings = await evaluateStoreOrderWarnings(supabase, companyId, {
            id: order.id,
            store_id: order.store_id,
            order_value: order.order_value,
            subtotal: order.subtotal,
            margin_pct: order.margin_pct,
            lines: linesByOrder.get(order.id) || [],
          });
          return [order.id, warnings] as const;
        })
      );
      warningsByOrderId = Object.fromEntries(entries);
    }

    return NextResponse.json({ ok: true, orders, products, warningsByOrderId });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List store orders failed.");
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
    await requirePackageFeature("store_ordering");
    await requireWorkspacePermission("store_orders.create");
    const companyId = await requireApiCompanyId();
    await assertOperationsSchemaReady(supabase);
    const order = await saveStoreOrder(supabase, companyId, {
      id: body.id,
      store_id: String(body.store_id || ""),
      order_number: body.order_number,
      order_date: body.order_date,
      required_date: body.required_date,
      notes: body.notes,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save store order failed.");
  }
}
