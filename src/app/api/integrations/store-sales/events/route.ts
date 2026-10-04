import { NextRequest, NextResponse } from "next/server";
import { orderRouteContext } from "@/lib/order-engine/http";
import { StoreSyncError } from "@/lib/store-sales/errors";
import { storeErrorResponse } from "@/lib/store-sales/http";
import { listSyncEvents } from "@/lib/store-sales/service";

export const runtime = "nodejs";

/** GET /api/integrations/store-sales/events?connectionId= — the sync log, newest first. */
export async function GET(request: NextRequest) {
  try {
    const { supabase, companyId } = await orderRouteContext("invoices.view");
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) throw new StoreSyncError("INVALID_INPUT", "connectionId is required.");
    return NextResponse.json({ ok: true, events: await listSyncEvents(supabase, companyId, connectionId, Number(request.nextUrl.searchParams.get("limit") || 200)) });
  } catch (error) {
    return storeErrorResponse(error, "Load sync log failed.");
  }
}
