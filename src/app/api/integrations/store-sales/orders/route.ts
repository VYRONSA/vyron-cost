import { NextRequest, NextResponse } from "next/server";
import { orderRouteContext } from "@/lib/order-engine/http";
import { StoreSyncError } from "@/lib/store-sales/errors";
import { storeErrorResponse } from "@/lib/store-sales/http";
import { getSyncOverview } from "@/lib/store-sales/service";

export const runtime = "nodejs";

/** GET /api/integrations/store-sales/orders?connectionId=&status= — counts, orders and the historical import. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await orderRouteContext("invoices.view");
    const q = request.nextUrl.searchParams;
    const connectionId = q.get("connectionId");
    if (!connectionId) throw new StoreSyncError("INVALID_INPUT", "connectionId is required.");
    return NextResponse.json({ ok: true, ...(await getSyncOverview(supabase, companyId, connectionId, { status: q.get("status"), limit: Number(q.get("limit") || 100) })) });
  } catch (error) {
    return storeErrorResponse(error, "Load store orders failed.");
  }
}
