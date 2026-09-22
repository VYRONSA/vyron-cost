import { NextRequest, NextResponse } from "next/server";
import { WorkspaceAccessError } from "@/lib/vyron-workspace-access";
import { orderErrorResponse, orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { listOrderPolicies, saveOrderPolicy } from "@/lib/order-engine/policies";

export const runtime = "nodejs";

/** GET /api/order-intake/policies — every customer order policy and the company default. */
export async function GET() {
  try {
    const { supabase, companyId } = await orderRouteContext("sales_orders.view");
    return NextResponse.json({ ok: true, policies: await listOrderPolicies(supabase, companyId) });
  } catch (error) {
    return orderErrorResponse(error, "Load order policies failed.");
  }
}

/**
 * PUT /api/order-intake/policies { customerId: string | null, requirePo, requireDeliveryDate,
 *   minOrderValue, minGpPct, enforceCaseQuantity, deliveryWeekdays, orderCutoffTime, specialInstructions }
 * Ordering rules are a commercial control: approvers only.
 */
export async function PUT(request: NextRequest) {
  try {
    const { supabase, companyId, actor, can } = await orderRouteContext("sales_orders.view");
    if (!can("sales_orders.approve")) throw new WorkspaceAccessError("Access denied.", 403);
    const body = await readJsonBody(request);
    const policy = await saveOrderPolicy(
      supabase,
      companyId,
      body.customerId ? String(body.customerId) : null,
      {
        requirePo: body.requirePo === true,
        requireDeliveryDate: body.requireDeliveryDate === true,
        minOrderValue: body.minOrderValue as number | null,
        minGpPct: body.minGpPct as number | null,
        enforceCaseQuantity: body.enforceCaseQuantity === true,
        deliveryWeekdays: Array.isArray(body.deliveryWeekdays) ? (body.deliveryWeekdays as number[]) : null,
        orderCutoffTime: typeof body.orderCutoffTime === "string" ? body.orderCutoffTime : null,
        specialInstructions: typeof body.specialInstructions === "string" ? body.specialInstructions : null,
      },
      actor
    );
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    return orderErrorResponse(error, "Save order policy failed.");
  }
}
