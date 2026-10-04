import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdmin, isSupabaseServiceRoleConfigured } from "@/lib/supabase-server";
import { canonicalWooUrl } from "@/lib/store-sales/credentials";
import { runAfterResponse } from "@/lib/store-sales/http";
import { storeRuntime } from "@/lib/store-sales/runtime";
import { loadConnectionByStore, processDueOrders, recordWebhookDelivery } from "@/lib/store-sales/service";
import { MAX_WEBHOOK_BYTES, isWooPing, verifyHmacBase64, wooOrderIdFromWebhook } from "@/lib/store-sales/webhooks";

export const runtime = "nodejs";
export const maxDuration = 60;

const TOPICS = new Set(["order.created", "order.updated", "order.deleted", "order.restored"]);

/**
 * POST /api/integrations/woocommerce/webhooks — WooCommerce order events.
 *
 * Public, so nothing is trusted until X-WC-Webhook-Signature verifies (base64
 * HMAC-SHA256 of the raw body with the webhook's secret, server environment
 * only). The store is X-WC-Webhook-Source and must be a connected store whose
 * credentials belong to that connection's company. The delivery is recorded
 * and acknowledged at once and processed after the response; a delivery seen
 * twice is ignored by X-WC-Webhook-Delivery-ID.
 *
 * WooCommerce does NOT retry a failed delivery and disables a webhook after
 * five consecutive failures, so the scheduled catch-up (orders modified since
 * the last run) is what recovers anything missed.
 */
export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > MAX_WEBHOOK_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_WEBHOOK_BYTES) return NextResponse.json({ ok: false }, { status: 413 });

  // Saving a webhook in WooCommerce sends an unsigned `webhook_id=<n>` ping to test the address.
  if (isWooPing(request.headers.get("content-type"), raw)) return NextResponse.json({ ok: true, ping: true });

  const storeUrl = canonicalWooUrl(String(request.headers.get("x-wc-webhook-source") || "").replace(/\/+$/, ""));
  const credentials = storeUrl ? storeRuntime.credentials("WOOCOMMERCE", storeUrl) : null;
  if (!storeUrl || !credentials || credentials.kind !== "WOOCOMMERCE" || !credentials.webhookSecret) return NextResponse.json({ ok: false }, { status: 401 });
  if (!verifyHmacBase64(raw, request.headers.get("x-wc-webhook-signature"), credentials.webhookSecret)) return NextResponse.json({ ok: false }, { status: 401 });

  const topic = String(request.headers.get("x-wc-webhook-topic") || "").trim().toLowerCase();
  const deliveryId = String(request.headers.get("x-wc-webhook-delivery-id") || "").trim();
  if (!topic || !deliveryId) return NextResponse.json({ ok: false, error: "Missing webhook headers." }, { status: 400 });
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
    const connection = await loadConnectionByStore(supabase, "WOOCOMMERCE", storeUrl);
    if (!connection || connection.company_id.toLowerCase() !== credentials.companyId) return NextResponse.json({ ok: false }, { status: 404 });
    const result = await recordWebhookDelivery(supabase, connection, { deliveryId, topic, externalOrderId: wooOrderIdFromWebhook(topic, body) });
    if (!result.duplicate && result.orderRowId && connection.status === "ACTIVE") {
      const orderRowId = result.orderRowId;
      runAfterResponse(
        after,
        async () => {
          await processDueOrders(supabase, connection, { orderRowIds: [orderRowId], limit: 1 });
          await processDueOrders(supabase, connection, { limit: 5, deadline: storeRuntime.now() + 40_000 });
        },
        "WooCommerce processing after webhook"
      );
    }
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("[store-sales] WooCommerce webhook failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
