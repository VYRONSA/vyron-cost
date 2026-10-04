import { NextResponse } from "next/server";
import { orderRouteContext, readJsonBody } from "@/lib/order-engine/http";
import { storeErrorResponse, webhookCallbackUrl } from "@/lib/store-sales/http";
import { listConnections, saveConnection } from "@/lib/store-sales/service";

export const runtime = "nodejs";

/**
 * GET /api/integrations/store-sales/connections — the company's Shopify and
 * WooCommerce stores, with status, totals and whether server credentials exist
 * (never the credentials themselves).
 */
export async function GET() {
  try {
    const { supabase, companyId, can } = await orderRouteContext("invoices.view");
    return NextResponse.json({
      ok: true,
      connections: await listConnections(supabase, companyId),
      companyId,
      webhookUrls: { SHOPIFY: webhookCallbackUrl("SHOPIFY"), WOOCOMMERCE: webhookCallbackUrl("WOOCOMMERCE") },
      can: { manage: can("admin.company"), resolve: can("invoices.create"), import: can("admin.imports") },
    });
  } catch (error) {
    return storeErrorResponse(error, "List stores failed.");
  }
}

/**
 * POST /api/integrations/store-sales/connections
 *   { channel: "SHOPIFY" | "WOOCOMMERCE", storeUrl, displayName? }   connect a store (starts DISABLED)
 *   { id, displayName?, defaultCustomerId? }                        rename it / choose its online-sales customer
 */
export async function POST(request: Request) {
  try {
    const { supabase, companyId, actor } = await orderRouteContext("admin.company");
    const body = await readJsonBody(request);
    const connection = await saveConnection(
      supabase,
      companyId,
      {
        id: typeof body.id === "string" ? body.id : null,
        channel: body.channel,
        storeUrl: body.storeUrl,
        displayName: body.displayName,
        defaultCustomerId: body.defaultCustomerId,
      },
      actor.userId
    );
    return NextResponse.json({ ok: true, connection });
  } catch (error) {
    return storeErrorResponse(error, "Save store failed.");
  }
}
