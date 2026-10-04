import { NextResponse } from "next/server";
import { orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { storeErrorResponse } from "@/lib/store-sales/http";
import { retryOrder } from "@/lib/store-sales/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/integrations/store-sales/orders/:id/retry — process one store order again now. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, companyId, actor } = await orderRouteContext("invoices.create");
    await readJsonBody(request);
    const { id } = await params;
    const result = await retryOrder(supabase, companyId, id, actor.userId);
    return NextResponse.json({ ok: true, outcome: result.outcome, order: result.row });
  } catch (error) {
    return storeErrorResponse(error, "Retry failed.");
  }
}
