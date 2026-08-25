import { NextResponse, type NextRequest } from "next/server";
import { requireStaffScope, staffError } from "@/lib/vyron-order-staff-request";
import { getCustomerSalesOrder, transitionCustomerSalesOrder } from "@/lib/vyron-customer-sales-orders";
import { requireWorkspacePermission } from "@/lib/vyron-workspace-access";
import { availableActions, eventForAction } from "@/lib/vyron-order-centre";
import { notifyOrderEvent, listDeliveryLog } from "@/lib/vyron-order-notifications";

export const runtime = "nodejs";

/**
 * One order, for staff.
 *
 * The order is loaded through the existing engine's own getCustomerSalesOrder,
 * scoped to the workspace company — an id from another tenant simply does not
 * resolve. Cost and GP live on the row the engine returns and are shown only to
 * staff whose permissions allow it.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  const { id } = await context.params;

  try {
    const loaded = await getCustomerSalesOrder(guard.supabase, guard.companyId, id);
    if (!loaded) return staffError("Order not found.", 404);

    // Costing is a separate permission from viewing the order.
    let maySeeCosting = false;
    try {
      await requireWorkspacePermission("sales_orders.approve");
      maySeeCosting = true;
    } catch {
      maySeeCosting = false;
    }

    const order = { ...loaded.order } as Record<string, unknown>;
    if (!maySeeCosting) {
      delete order.cost_value;
      delete order.gross_profit;
      delete order.gp_percentage;
    }
    const lines = (loaded.lines || []).map((line) => {
      const copy = { ...line } as Record<string, unknown>;
      if (!maySeeCosting) {
        delete copy.cost_per_unit;
        delete copy.line_cost;
      }
      return copy;
    });

    // The engine writes this trail; read it directly rather than duplicating it.
    const { data: audit } = await guard.supabase
      .from("vyron_customer_sales_order_audit")
      .select("event_type, actor, from_status, to_status, detail, created_at")
      .eq("company_id", guard.companyId)
      .eq("sales_order_id", id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      ok: true,
      order,
      lines,
      audit: audit || [],
      actions: availableActions(String(loaded.order.status || "")),
      maySeeCosting,
      notifications: await listDeliveryLog(guard.supabase, guard.companyId, { salesOrderId: id, limit: 50 }),
    });
  } catch {
    return staffError("We couldn't load that order.", 500);
  }
}

/**
 * Move an order.
 *
 * The transition is performed by transitionCustomerSalesOrder — the only state
 * machine — and this route refuses any action that machine would not accept
 * from the current status. The matching notification is generated afterwards
 * and can never undo the transition.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireStaffScope("sales_orders.view");
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const action = String(body?.action || "");

  try {
    const loaded = await getCustomerSalesOrder(guard.supabase, guard.companyId, id);
    if (!loaded) return staffError("Order not found.", 404);

    const allowed = availableActions(String(loaded.order.status || ""));
    const match = allowed.find((a) => a.action === action);
    if (!match) return staffError("That action is not available for this order.", 409);

    // Each action carries its own permission, checked before anything moves.
    try {
      await requireWorkspacePermission(match.permission);
    } catch {
      return staffError("You do not have permission for that action.", 403);
    }

    const updated = await transitionCustomerSalesOrder(
      guard.supabase,
      guard.companyId,
      id,
      action as "approve" | "start_picking" | "pack" | "dispatch" | "cancel",
      "VYRON ORDER CENTRE"
    );

    const event = eventForAction(action);
    if (event) {
      const { count: lineCount } = await guard.supabase
        .from("vyron_customer_sales_order_lines")
        .select("*", { count: "exact", head: true })
        .eq("company_id", guard.companyId)
        .eq("sales_order_id", id);
      await notifyOrderEvent(
        guard.supabase,
        event,
        {
          companyId: guard.companyId,
          salesOrderId: id,
          orderNumber: String(updated.order_number || ""),
          customerName: String(updated.customer_name || ""),
          total: Number(updated.total || 0),
          itemCount: lineCount || 0,
          requestedDeliveryDate: updated.requested_delivery_date ? String(updated.requested_delivery_date) : null,
          notes: updated.notes ? String(updated.notes) : null,
        },
        { baseUrl: request.nextUrl.origin }
      );
    }

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (error) {
    return staffError(error instanceof Error ? error.message : "We couldn't update that order.", 400);
  }
}
