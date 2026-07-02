import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { requireApiCompanyId } from "@/lib/vyron-api-workspace";
import { requireWorkspacePermission, workspaceAccessErrorResponse } from "@/lib/vyron-workspace-access";
import { listCustomerSalesOrders, saveCustomerSalesOrder, salesOrderKpis } from "@/lib/vyron-customer-sales-orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isSupabaseServiceRoleConfigured()) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required." }, { status: 500 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase unavailable." }, { status: 500 });

  try {
    await requireWorkspacePermission("sales_orders.view");
    const companyId = await requireApiCompanyId();
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const customerId = request.nextUrl.searchParams.get("customerId") || undefined;
    const orders = await listCustomerSalesOrders(supabase, companyId, { status, search, customerId });
    return NextResponse.json({ ok: true, orders, kpis: salesOrderKpis(orders) });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "List sales orders failed.");
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
    await requireWorkspacePermission(body.id ? "sales_orders.edit" : "sales_orders.create");
    const companyId = await requireApiCompanyId();
    const order = await saveCustomerSalesOrder(supabase, companyId, {
      id: body.id,
      customerId: body.customerId || null,
      customerName: String(body.customerName || ""),
      deliveryAddress: body.deliveryAddress,
      contactName: body.contactName,
      salesperson: body.salesperson,
      warehouse: body.warehouse,
      requestedDeliveryDate: body.requestedDeliveryDate || null,
      notes: body.notes,
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return workspaceAccessErrorResponse(error, "Save sales order failed.");
  }
}
