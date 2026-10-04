import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { canonicalShopifyUrl } from "@/lib/store-sales/credentials";
import { runAfterResponse } from "@/lib/store-sales/http";
import { storeRuntime } from "@/lib/store-sales/runtime";
import { loadConnectionByStore, processDueOrders, recordWebhookDelivery } from "@/lib/store-sales/service";
import { MAX_WEBHOOK_BYTES, shopifyOrderIdFromWebhook, verifyHmacBase64 } from "@/lib/store-sales/webhooks";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOPICS = new Set(["orders/create", "orders/updated", "orders/cancelled", "orders/paid", "orders/edited", "refunds/create"]);

/**
 * POST /api/integrations/shopify/webhooks — Shopify's order and refund events.
 *
 * Public, so nothing is trusted until X-Shopify-Hmac-Sha256 verifies against
 * the store's client secret (server environment only, bound to one company).
 * The company is the verified store's connection, never anything in the
 * payload. Shopify allows five seconds: the delivery is recorded and
 * acknowledged at once and processed after the response. A non-2xx answer makes
 * Shopify retry (8 times over 4 hours); a delivery seen twice is ignored by its
 * X-Shopify-Webhook-Id.
 */
export async function POST(request: NextRequest) {
  const storeUrl = canonicalShopifyUrl(request.headers.get("x-shopify-shop-domain"));
  const credentials = storeUrl ? storeRuntime.credentials("SHOPIFY", storeUrl) : null;
  if (!storeUrl || !credentials || credentials.kind !== "SHOPIFY") return NextResponse.json({ ok: false }, { status: 401 });

  if (Number(request.headers.get("content-length") || 0) > MAX_WEBHOOK_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_WEBHOOK_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyHmacBase64(raw, request.headers.get("x-shopify-hmac-sha256"), credentials.clientSecret)) return NextResponse.json({ ok: false }, { status: 401 });

  const topic = String(request.headers.get("x-shopify-topic") || "").trim().toLowerCase();
  const deliveryId = String(request.headers.get("x-shopify-webhook-id") || "").trim();
  if (!topic || !deliveryId) return NextResponse.json({ ok: false, error: "Missing webhook headers." }, { status: 400 });
  // A verified topic VOLORA does not use is acknowledged and ignored (never retried forever).
  if (!TOPICS.has(topic)) return NextResponse.json({ ok: true, ignored: topic });

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not JSON." }, { status: 400 });
  }

  if (!isSupabaseServiceRoleConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const connection = await loadConnectionByStore(supabase, "SHOPIFY", storeUrl);
    // Not connected yet, or bound to another company: answer an error so Shopify retries rather than the order being dropped.
    if (!connection || connection.company_id.toLowerCase() !== credentials.companyId) return NextResponse.json({ ok: false }, { status: 404 });
    const result = await recordWebhookDelivery(supabase, connection, { deliveryId, topic, externalOrderId: shopifyOrderIdFromWebhook(topic, body) });
    if (!result.duplicate && result.orderRowId && connection.status === "ACTIVE") {
      const orderRowId = result.orderRowId;
      runAfterResponse(
        after,
        async () => {
          await processDueOrders(supabase, connection, { orderRowIds: [orderRowId], limit: 1 });
          await processDueOrders(supabase, connection, { limit: 5, deadline: storeRuntime.now() + 40_000 });
        },
        "Shopify processing after webhook"
      );
    }
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("[store-sales] Shopify webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
