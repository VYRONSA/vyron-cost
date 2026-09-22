import { NextResponse } from "next/server";
import { orderErrorResponse, orderRouteContext } from "@/lib/order-engine/http";
import { ORDER_SOURCE_REGISTRY } from "@/lib/order-engine/sources";

export const runtime = "nodejs";

/** GET /api/order-intake/sources — each order source and its honest state (READY / NOT_CONNECTED / COMING_SOON). */
export async function GET() {
  try {
    await orderRouteContext("sales_orders.view");
    return NextResponse.json({ ok: true, sources: ORDER_SOURCE_REGISTRY });
  } catch (error) {
    return orderErrorResponse(error, "Load sources failed.");
  }
}
