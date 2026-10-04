import { NextResponse } from "next/server";
import { orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { StoreSyncError } from "@/lib/store-sales/errors";
import { storeErrorResponse, webhookCallbackUrl } from "@/lib/store-sales/http";
import { loadConnection, processDueOrders, registerWebhooks, setConnectionStatus, syncNow, testConnection } from "@/lib/store-sales/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/integrations/store-sales/connections/:id
 *   { action: "test" }                               Test Connection (one read with the server credentials)
 *   { action: "sync_now" }                           catch up on orders changed recently, then process what is due
 *   { action: "activate" | "disable" | "suspend" }   turn the store's sync on / off
 *   { action: "register_webhooks" }                  Shopify only: subscribe order + refund events
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJsonBody(request);
    const action = String(body.action || "");
    if (action === "sync_now") {
      const { supabase, companyId, actor } = await orderRouteContext("invoices.create");
      const connection = await loadConnection(supabase, companyId, id);
      return NextResponse.json({ ok: true, ...(await syncNow(supabase, connection, actor.userId, { deadline: Date.now() + 45_000 })) });
    }
    if (action === "test") {
      const { supabase, companyId, actor } = await orderRouteContext("invoices.create");
      return NextResponse.json({ ok: true, result: await testConnection(supabase, companyId, id, actor.userId) });
    }
    const { supabase, companyId, actor } = await orderRouteContext("admin.company");
    if (action === "activate" || action === "disable" || action === "suspend") {
      const status = action === "activate" ? "ACTIVE" : action === "disable" ? "DISABLED" : "SUSPENDED";
      const connection = await setConnectionStatus(supabase, companyId, id, status, actor.userId);
      const summary = status === "ACTIVE" ? await processDueOrders(supabase, connection, { limit: 10, deadline: Date.now() + 30_000 }) : null;
      return NextResponse.json({ ok: true, connection, summary });
    }
    if (action === "register_webhooks") {
      const current = await loadConnection(supabase, companyId, id);
      return NextResponse.json({ ok: true, connection: await registerWebhooks(supabase, companyId, id, webhookCallbackUrl(current.channel), actor.userId) });
    }
    throw new StoreSyncError("INVALID_INPUT", "Unknown action.");
  } catch (error) {
    return storeErrorResponse(error, "Store action failed.");
  }
}
