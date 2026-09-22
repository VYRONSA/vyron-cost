import { cleanText, toIsoDateOrNull, toNumberOrNull } from "@/lib/order-engine/normalize";
import type { OrderCandidate } from "@/lib/order-engine/types";
import { OrderSourceParseError, type OrderSourceAdapter } from "@/lib/order-engine/adapters/types";

/**
 * WooCommerce and Shopify order adapters.
 *
 * NOT CONNECTED. There are no credentials, no webhooks and no API calls. These
 * are pure normalisers of each platform's documented order JSON (WooCommerce
 * REST v3 `order`, Shopify Admin REST `order`), tested against synthetic
 * payloads, so that a future connector only has to fetch and hand over.
 *
 * OPERATIONAL ORDERS ONLY. Historical e-commerce sales belong to the separate
 * external-sales design and must never be pushed through here: they are not
 * orders to fulfil, and turning them into sales orders would manufacture
 * invoices and GP.
 *
 * Decisions encoded (docs/order-engine/ORDER_SOURCE_ADAPTERS.md):
 * - `storeKey` is required and prefixes the source key: two stores can issue
 *   the same order id.
 * - The platform's customer id / e-mail become `customerReference` only; a
 *   customer is never created and never matched by e-mail automatically here.
 * - Orders the platform reports as cancelled / refunded / failed are refused.
 * - VAT basis is NOT assumed. If the platform states its prices include tax,
 *   the order is flagged and cannot be approved until a person confirms ex-tax
 *   prices. Totals are stored exactly as supplied.
 * - Shipping is not an order line. Its total is recorded and shown to the
 *   approver; it is not carried to the sales order.
 * - A partial refund already recorded on the platform is flagged, never netted.
 * - Discounts: WooCommerce allocates coupon discounts to lines (subtotal −
 *   total); Shopify's per-line `discount_allocations` are summed. Coupon codes
 *   are recorded for reference only.
 */

/**
 * `purpose: "historical"` marks an export of past web-store sales (e.g. Metorik
 * history). Such orders are external sales intelligence: the converter still
 * produces the candidate faithfully, and intake refuses it.
 */
export type PlatformOrderInput<T> = { storeKey: string; order: T; purpose?: "fulfilment" | "historical" };

type WooLineItem = {
  id?: number | string;
  product_id?: number | string;
  variation_id?: number | string;
  sku?: string;
  name?: string;
  quantity?: number | string;
  price?: number | string;
  subtotal?: string;
  subtotal_tax?: string;
  total?: string;
  total_tax?: string;
};
export type WooOrder = {
  id?: number | string;
  number?: string;
  status?: string;
  currency?: string;
  date_created?: string;
  prices_include_tax?: boolean;
  customer_id?: number | string;
  customer_note?: string;
  billing?: { email?: string; company?: string; first_name?: string; last_name?: string };
  total?: string;
  total_tax?: string;
  discount_total?: string;
  shipping_total?: string;
  line_items?: WooLineItem[];
  shipping_lines?: Array<{ total?: string }>;
  coupon_lines?: Array<{ code?: string; discount?: string }>;
  refunds?: Array<{ id?: number | string; total?: string }>;
};

type ShopifyMoney = { shop_money?: { amount?: string; currency_code?: string } };
type ShopifyLineItem = {
  id?: number | string;
  product_id?: number | string;
  variant_id?: number | string;
  sku?: string | null;
  title?: string;
  name?: string;
  quantity?: number;
  price?: string;
  total_discount?: string;
  discount_allocations?: Array<{ amount?: string }>;
  tax_lines?: Array<{ price?: string }>;
};
export type ShopifyOrder = {
  id?: number | string;
  name?: string;
  order_number?: number | string;
  created_at?: string;
  currency?: string;
  cancelled_at?: string | null;
  financial_status?: string;
  taxes_included?: boolean;
  email?: string;
  note?: string | null;
  customer?: { id?: number | string; email?: string } | null;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_price?: string;
  total_shipping_price_set?: ShopifyMoney;
  shipping_lines?: Array<{ price?: string }>;
  discount_codes?: Array<{ code?: string }>;
  refunds?: Array<{ id?: number | string; transactions?: Array<{ amount?: string; kind?: string }> }>;
  line_items?: ShopifyLineItem[];
};

const WOO_REFUSED = new Set(["cancelled", "refunded", "failed", "trash", "checkout-draft"]);
const SHOPIFY_REFUSED_FINANCIAL = new Set(["refunded", "voided"]);

const sum = (values: Array<number | null>) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? Math.round(present.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

function requireStoreKey(storeKey: string): string {
  const key = cleanText(storeKey, 100);
  if (!key) throw new OrderSourceParseError("A store key is required: two stores can issue the same order id.");
  return key;
}

export function normalizeWooCommerceOrder(input: PlatformOrderInput<WooOrder>): OrderCandidate {
  const storeKey = requireStoreKey(input.storeKey);
  const order = input.order;
  if (!order || order.id === undefined || order.id === null || order.id === "") throw new OrderSourceParseError("WooCommerce order has no id.");
  const status = String(order.status || "").toLowerCase();
  if (WOO_REFUSED.has(status)) throw new OrderSourceParseError(`WooCommerce order ${order.id} is ${status}; it is not an order to fulfil.`);
  const items = Array.isArray(order.line_items) ? order.line_items : [];
  if (!items.length) throw new OrderSourceParseError(`WooCommerce order ${order.id} has no line items.`);
  const refunded = sum((order.refunds || []).map((r) => {
    const t = toNumberOrNull(r.total);
    return t === null ? null : Math.abs(t);
  }));
  const shipping = toNumberOrNull(order.shipping_total) ?? sum((order.shipping_lines || []).map((l) => toNumberOrNull(l.total)));
  return {
    source: "woocommerce",
    context: "B2C",
    sourceChannel: `web_store:${storeKey}`,
    catalogSystem: `woocommerce:${storeKey}`,
    externalCustomerId: order.customer_id && String(order.customer_id) !== "0" ? String(order.customer_id) : null,
    purpose: input.purpose ?? "fulfilment",
    sourceKey: `${storeKey}:order:${order.id}`,
    sourceReference: `WooCommerce ${storeKey}`,
    sourceStatus: status || null,
    externalOrderNumber: cleanText(order.number ?? order.id, 120),
    customerName: cleanText(order.billing?.company || [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" "), 300),
    customerReference: cleanText(order.customer_id && String(order.customer_id) !== "0" ? `woocommerce:${storeKey}:customer:${order.customer_id}` : order.billing?.email, 300),
    orderDate: toIsoDateOrNull(order.date_created),
    currency: cleanText(order.currency, 10),
    notes: cleanText(order.customer_note, 4000),
    pricesIncludeTax: typeof order.prices_include_tax === "boolean" ? order.prices_include_tax : null,
    supplied: {
      subtotal: sum(items.map((item) => toNumberOrNull(item.total))),
      discountTotal: toNumberOrNull(order.discount_total),
      taxTotal: toNumberOrNull(order.total_tax),
      shippingTotal: shipping,
      total: toNumberOrNull(order.total),
    },
    extraction: {
      method: "structured",
      sourceFacts: {
        couponCodes: (order.coupon_lines || []).map((c) => cleanText(c.code, 60)).filter((c): c is string => Boolean(c)),
        refundedTotal: refunded,
      },
    },
    lines: items.map((item) => {
      const quantity = toNumberOrNull(item.quantity);
      const subtotal = toNumberOrNull(item.subtotal);
      const total = toNumberOrNull(item.total);
      // WooCommerce `price` is already net of discount (total ÷ quantity). The
      // pre-discount unit price is subtotal ÷ quantity; the discount is carried
      // separately, so quantity × price − discount equals the line total once.
      const unitPrice =
        subtotal !== null && quantity !== null && quantity > 0 ? Math.round((subtotal / quantity) * 10000) / 10000 : toNumberOrNull(item.price);
      return {
        sourceLineReference: item.id !== undefined ? `line:${item.id}` : null,
        sku: cleanText(item.sku, 200),
        description: cleanText(item.name, 500),
        externalProductId:
          item.variation_id && String(item.variation_id) !== "0" ? `variation:${item.variation_id}` : item.product_id ? `product:${item.product_id}` : null,
        quantity: quantity === null ? Number.NaN : quantity,
        unitPrice,
        discountAmount: subtotal !== null && total !== null && subtotal > total ? Math.round((subtotal - total) * 100) / 100 : null,
        taxAmount: toNumberOrNull(item.total_tax),
        lineTotal: total,
      };
    }),
  };
}

export function normalizeShopifyOrder(input: PlatformOrderInput<ShopifyOrder>): OrderCandidate {
  const storeKey = requireStoreKey(input.storeKey);
  const order = input.order;
  if (!order || order.id === undefined || order.id === null || order.id === "") throw new OrderSourceParseError("Shopify order has no id.");
  if (order.cancelled_at) throw new OrderSourceParseError(`Shopify order ${order.id} is cancelled; it is not an order to fulfil.`);
  const financial = String(order.financial_status || "").toLowerCase();
  if (SHOPIFY_REFUSED_FINANCIAL.has(financial)) throw new OrderSourceParseError(`Shopify order ${order.id} is ${financial}; it is not an order to fulfil.`);
  const items = Array.isArray(order.line_items) ? order.line_items : [];
  if (!items.length) throw new OrderSourceParseError(`Shopify order ${order.id} has no line items.`);
  const customerEmail = order.customer?.email || order.email;
  const shipping =
    toNumberOrNull(order.total_shipping_price_set?.shop_money?.amount) ?? sum((order.shipping_lines || []).map((l) => toNumberOrNull(l.price)));
  const refunded = sum(
    (order.refunds || []).flatMap((r) => (r.transactions || []).filter((t) => !t.kind || t.kind === "refund").map((t) => toNumberOrNull(t.amount)))
  );
  return {
    source: "shopify",
    context: "B2C",
    sourceChannel: `web_store:${storeKey}`,
    catalogSystem: `shopify:${storeKey}`,
    externalCustomerId: order.customer?.id ? String(order.customer.id) : null,
    purpose: input.purpose ?? "fulfilment",
    sourceKey: `${storeKey}:order:${order.id}`,
    sourceReference: `Shopify ${storeKey}`,
    sourceStatus: financial || null,
    externalOrderNumber: cleanText(order.name ?? order.order_number, 120),
    customerReference: cleanText(order.customer?.id ? `shopify:${storeKey}:customer:${order.customer.id}` : customerEmail, 300),
    orderDate: toIsoDateOrNull(order.created_at),
    currency: cleanText(order.currency, 10),
    notes: cleanText(order.note, 4000),
    pricesIncludeTax: typeof order.taxes_included === "boolean" ? order.taxes_included : null,
    supplied: {
      subtotal: toNumberOrNull(order.subtotal_price),
      discountTotal: toNumberOrNull(order.total_discounts),
      taxTotal: toNumberOrNull(order.total_tax),
      shippingTotal: shipping,
      total: toNumberOrNull(order.total_price),
    },
    extraction: {
      method: "structured",
      sourceFacts: {
        couponCodes: (order.discount_codes || []).map((c) => cleanText(c.code, 60)).filter((c): c is string => Boolean(c)),
        refundedTotal: refunded,
      },
    },
    lines: items.map((item) => {
      const quantity = toNumberOrNull(item.quantity);
      const allocated = sum((item.discount_allocations || []).map((d) => toNumberOrNull(d.amount)));
      const discount = allocated ?? toNumberOrNull(item.total_discount);
      return {
        sourceLineReference: item.id !== undefined ? `line:${item.id}` : null,
        externalProductId: item.variant_id ? `variant:${item.variant_id}` : item.product_id ? `product:${item.product_id}` : null,
        sku: cleanText(item.sku, 200),
        description: cleanText(item.name || item.title, 500),
        quantity: quantity === null ? Number.NaN : quantity,
        unitPrice: toNumberOrNull(item.price),
        discountAmount: discount && discount > 0 ? discount : null,
        taxAmount: sum((item.tax_lines || []).map((t) => toNumberOrNull(t.price))),
      };
    }),
  };
}

export const wooCommerceOrderAdapter: OrderSourceAdapter<PlatformOrderInput<WooOrder>> = {
  source: "woocommerce",
  connected: false,
  normalize: normalizeWooCommerceOrder,
};

export const shopifyOrderAdapter: OrderSourceAdapter<PlatformOrderInput<ShopifyOrder>> = {
  source: "shopify",
  connected: false,
  normalize: normalizeShopifyOrder,
};
