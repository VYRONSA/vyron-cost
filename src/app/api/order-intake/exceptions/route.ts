import { NextResponse } from "next/server";
import { orderErrorResponse, orderRouteContext } from "@/lib/order-engine/http";
import { COST_PERMISSION } from "@/lib/order-engine/redaction";
import { listExceptionCentre } from "@/lib/order-engine/service";

export const runtime = "nodejs";

/** GET /api/order-intake/exceptions — open issues across orders, and recent resolutions. */
export async function GET() {
  try {
    const { supabase, companyId, can } = await orderRouteContext("sales_orders.view");
    const result = await listExceptionCentre(supabase, companyId);
    const seeCost = can(COST_PERMISSION);
    return NextResponse.json({
      ok: true,
      open: result.open.map((row) => (seeCost || row.category !== "margin" ? row : { ...row, message: "Margin check — visible to approvers." })),
      resolved: result.resolved,
    });
  } catch (error) {
    return orderErrorResponse(error, "Load exceptions failed.");
  }
}
