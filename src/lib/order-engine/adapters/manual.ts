import { cleanText, toNumberOrNull } from "@/lib/order-engine/normalize";
import type { OrderCandidate } from "@/lib/order-engine/types";
import { OrderSourceParseError, type OrderSourceAdapter } from "@/lib/order-engine/adapters/types";

/**
 * Manual entry from the Order Inbox form. The body is untrusted browser input:
 * only the named fields are read, every value is coerced, and the source is
 * always "manual" whatever the body says. An optional idempotency key (the
 * form sends one per draft) stops a double-submit creating two orders.
 */
export const manualOrderAdapter: OrderSourceAdapter<Record<string, unknown>> = {
  source: "manual",
  connected: true,
  normalize(body) {
    if (!body || typeof body !== "object") throw new OrderSourceParseError("An order is required.");
    const rawLines = Array.isArray(body.lines) ? (body.lines as Array<Record<string, unknown>>) : [];
    const candidate: OrderCandidate = {
      source: "manual",
      sourceKey: cleanText(body.idempotencyKey, 200),
      sourceReference: "Manual entry",
      customerId: cleanText(body.customerId, 64),
      customerName: cleanText(body.customerName, 300),
      customerPoNumber: cleanText(body.customerPoNumber, 120),
      requestedDeliveryDate: cleanText(body.requestedDeliveryDate, 20),
      deliveryAddress: cleanText(body.deliveryAddress, 1000),
      contactName: cleanText(body.contactName, 200),
      notes: cleanText(body.notes, 4000),
      lines: rawLines.map((line) => {
        const quantity = toNumberOrNull(line?.quantity);
        return {
          sku: cleanText(line?.sku, 200),
          description: cleanText(line?.description, 500),
          productId: cleanText(line?.productId, 64),
          unit: cleanText(line?.unit, 40),
          quantity: quantity === null ? Number.NaN : quantity,
          unitPrice: toNumberOrNull(line?.unitPrice),
        };
      }),
    };
    return candidate;
  },
};
