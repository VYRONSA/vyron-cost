import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio message status callbacks — how a WhatsApp/SMS notification moves from "Sent" (Twilio
 * accepted it) to "Delivered" or "Failed" (what actually happened). Nothing else in VOLORA sets
 * Delivered: a delivery is only claimed when Twilio reports it, through a request signed with the
 * account's auth token.
 */

export const TWILIO_STATUS_PATH = "/api/integrations/twilio/status";

/** The public https callback URL, or null when NEXT_PUBLIC_APP_URL is not a public https address (callbacks then stay off). */
export function twilioStatusCallbackUrl(): string | null {
  const base = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^/]+/i.test(base) ? `${base}${TWILIO_STATUS_PATH}` : null;
}

/**
 * Twilio's request signature: base64(HMAC-SHA1(authToken, url + each POST param name+value in
 * name order)). Compared in constant time. Any missing piece is a failed check.
 */
export function validTwilioSignature(input: { url: string; params: Record<string, string>; signature: string | null; authToken: string }): boolean {
  if (!input.signature || !input.authToken || !input.url) return false;
  const data = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + input.params[key], input.url);
  const expected = createHmac("sha1", input.authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Twilio MessageStatus → delivery status. Intermediate states (queued, sending, sent) change nothing. */
export function deliveryStatusFromTwilio(messageStatus: string | null | undefined): "Delivered" | "Failed" | null {
  const s = String(messageStatus || "").trim().toLowerCase();
  if (s === "delivered" || s === "read") return "Delivered";
  if (s === "failed" || s === "undelivered" || s === "canceled") return "Failed";
  return null;
}
