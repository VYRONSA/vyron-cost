import { createHmac, timingSafeEqual } from "crypto";

/**
 * Webhook authenticity for both channels. Both platforms sign the RAW body
 * with HMAC-SHA256 and send it base64-encoded; the comparison is constant-time
 * over the exact bytes received, never over re-serialised JSON.
 *
 *   Shopify      X-Shopify-Hmac-Sha256   key: the app's client secret
 *   WooCommerce  X-WC-Webhook-Signature  key: the secret entered on the webhook
 */

/** Largest webhook body accepted. Order payloads are far smaller. */
export const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export function verifyHmacBase64(rawBody: Buffer, signatureHeader: string | null, secret: string | null): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signatureHeader.trim(), "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const numericId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const id = String(value).trim();
  return /^\d{1,20}$/.test(id) ? id : null;
};

/** Shopify: orders/* carry the order as `id`, refunds/create as `order_id`. */
export function shopifyOrderIdFromWebhook(topic: string, body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (topic.startsWith("refunds/")) return numericId(record.order_id);
  if (topic.startsWith("orders/")) return numericId(record.id);
  return null;
}

/** WooCommerce: order.* carry the order as `id`. */
export function wooOrderIdFromWebhook(topic: string, body: unknown): string | null {
  if (!topic.startsWith("order.") || !body || typeof body !== "object") return null;
  return numericId((body as Record<string, unknown>).id);
}

/**
 * The request WooCommerce sends when a webhook is saved, to check the address:
 * a form body `webhook_id=<n>`, unsigned. It is acknowledged and nothing else.
 */
export function isWooPing(contentType: string | null, rawBody: Buffer): boolean {
  return /application\/x-www-form-urlencoded/i.test(String(contentType || "")) && /^webhook_id=\d+$/.test(rawBody.toString("utf8").trim());
}
