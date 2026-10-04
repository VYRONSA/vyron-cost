import { dateInZone, normalizeTitle, round2, type SaleLine, type SaleRefund, type SaleShipping, type StoreSale } from "@/lib/store-sales/types";

/**
 * Shopify Admin GraphQL order → the shared sale model. Pure: no database, no
 * matching, no decisions. Every amount is shop currency (shopMoney).
 */

type Money = { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null | undefined;
type TaxLineNode = { ratePercentage?: number | null; priceSet?: Money };
type DiscountNode = { allocatedAmountSet?: Money };

export type GqlLineItem = {
  id: string;
  sku?: string | null;
  name?: string | null;
  quantity?: number | null;
  currentQuantity?: number | null;
  taxable?: boolean | null;
  variant?: { legacyResourceId?: string | number | null } | null;
  product?: { legacyResourceId?: string | number | null } | null;
  originalUnitPriceSet?: Money;
  discountAllocations?: DiscountNode[] | null;
  taxLines?: TaxLineNode[] | null;
};

export type GqlShippingLine = {
  id?: string | null;
  title?: string | null;
  isRemoved?: boolean | null;
  originalPriceSet?: Money;
  discountAllocations?: DiscountNode[] | null;
  taxLines?: TaxLineNode[] | null;
};

export type GqlOrder = {
  id: string;
  legacyResourceId: string | number;
  name?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
  updatedAt?: string | null;
  test?: boolean | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  displayFinancialStatus?: string | null;
  currencyCode?: string | null;
  taxesIncluded?: boolean | null;
  email?: string | null;
  customer?: { legacyResourceId?: string | number | null; displayName?: string | null; defaultEmailAddress?: { emailAddress?: string | null } | null } | null;
  totalPriceSet?: Money;
  totalTaxSet?: Money;
  totalRefundedSet?: Money;
  lineItems?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }; nodes?: GqlLineItem[] } | null;
  shippingLines?: { nodes?: GqlShippingLine[] } | null;
  refunds?: Array<{ id: string }> | null;
};

export type GqlRefund = {
  id: string;
  legacyResourceId: string | number;
  createdAt?: string | null;
  note?: string | null;
  totalRefundedSet?: Money;
  refundLineItems?: {
    pageInfo?: { hasNextPage?: boolean };
    nodes?: Array<{
      quantity?: number | null;
      lineItem?: { id?: string | null } | null;
      subtotalSet?: Money;
      totalTaxSet?: Money;
    }>;
  } | null;
  refundShippingLines?: { nodes?: Array<{ subtotalAmountSet?: Money; taxAmountSet?: Money }> } | null;
};

export function amount(money: Money): number | null {
  const raw = money?.shopMoney?.amount;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? round2(n) : null;
}

const amountOrZero = (money: Money) => amount(money) ?? 0;
const sumDiscounts = (items: DiscountNode[] | null | undefined) => round2((items || []).reduce((total, d) => total + amountOrZero(d.allocatedAmountSet), 0));
const sumTaxes = (items: TaxLineNode[] | null | undefined) => round2((items || []).reduce((total, t) => total + amountOrZero(t.priceSet), 0));

/** Shopify may apply several taxes to one line; their rates add. No tax line = 0 %. */
function rateOf(taxLines: TaxLineNode[] | null | undefined): number {
  return Math.round((taxLines || []).reduce((total, line) => total + Number(line.ratePercentage || 0), 0) * 10000) / 10000;
}

function legacyId(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function normalizeShopifyRefund(refund: GqlRefund, timeZone: string | null): SaleRefund {
  return {
    refundId: String(refund.legacyResourceId),
    createdAt: refund.createdAt ?? null,
    refundDate: dateInZone(refund.createdAt, timeZone),
    note: refund.note ?? null,
    total: amountOrZero(refund.totalRefundedSet),
    truncated: Boolean(refund.refundLineItems?.pageInfo?.hasNextPage),
    lines: (refund.refundLineItems?.nodes || [])
      .filter((node) => node.lineItem?.id && Number(node.quantity || 0) > 0)
      .map((node) => ({
        lineId: String(node.lineItem!.id),
        quantity: Number(node.quantity || 0),
        subtotal: amountOrZero(node.subtotalSet),
        tax: amountOrZero(node.totalTaxSet),
      })),
    shipping: (refund.refundShippingLines?.nodes || []).map((node) => ({ subtotal: amountOrZero(node.subtotalAmountSet), tax: amountOrZero(node.taxAmountSet) })),
  };
}

export function normalizeShopifyOrder(order: GqlOrder, lineItems: GqlLineItem[], refunds: GqlRefund[], shop: { ianaTimezone?: string | null } = {}): StoreSale {
  const timeZone = shop.ianaTimezone ?? null;
  const normalizedRefunds = refunds.map((r) => normalizeShopifyRefund(r, timeZone)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const refunded = new Map<string, number>();
  for (const refund of normalizedRefunds) for (const line of refund.lines) refunded.set(line.lineId, (refunded.get(line.lineId) || 0) + line.quantity);
  let edited = false;

  const lines: SaleLine[] = lineItems.map((item) => {
    const ordered = Number(item.quantity || 0);
    const current = Number(item.currentQuantity ?? ordered);
    // Units still on the order plus units refunded: what the customer was
    // charged for. Units removed by an edit without a refund were never charged.
    const charged = Math.min(ordered, current + (refunded.get(item.id) || 0));
    if (charged !== ordered) edited = true;
    const share = ordered > 0 ? charged / ordered : 0;
    const variantId = legacyId(item.variant?.legacyResourceId);
    const productId = legacyId(item.product?.legacyResourceId);
    const name = String(item.name || "").trim() || "Shopify item";
    return {
      lineId: item.id,
      sku: item.sku && item.sku.trim() ? item.sku.trim() : null,
      name,
      externalKey: variantId ? `variant:${variantId}` : productId ? `product:${productId}` : `title:${normalizeTitle(name)}`,
      externalProductLabel: variantId ? `variant ${variantId}` : productId ? `product ${productId}` : null,
      orderedQuantity: ordered,
      quantity: charged,
      unitPrice: amountOrZero(item.originalUnitPriceSet),
      discount: round2(sumDiscounts(item.discountAllocations) * share),
      taxRate: rateOf(item.taxLines),
      tax: round2(sumTaxes(item.taxLines) * share),
    };
  });

  const shipping: SaleShipping[] = (order.shippingLines?.nodes || [])
    .filter((line) => !line.isRemoved)
    .map((line) => ({
      title: String(line.title || "Shipping").trim() || "Shipping",
      amount: amountOrZero(line.originalPriceSet),
      discount: sumDiscounts(line.discountAllocations),
      taxRate: rateOf(line.taxLines),
      tax: sumTaxes(line.taxLines),
    }));

  const email = order.customer?.defaultEmailAddress?.emailAddress || order.email || null;
  return {
    channel: "SHOPIFY",
    orderId: String(order.legacyResourceId),
    orderNumber: String(order.name || `#${order.legacyResourceId}`),
    createdAt: order.createdAt ?? null,
    saleDate: dateInZone(order.processedAt || order.createdAt, timeZone),
    test: Boolean(order.test),
    cancelledAt: order.cancelledAt ?? null,
    cancelReason: order.cancelReason ?? null,
    financialStatus: String(order.displayFinancialStatus || "").toUpperCase(),
    currency: order.currencyCode ? String(order.currencyCode).toUpperCase() : null,
    taxesIncluded: Boolean(order.taxesIncluded),
    customer: {
      id: legacyId(order.customer?.legacyResourceId),
      name: order.customer?.displayName ? String(order.customer.displayName) : null,
      email: email ? String(email).trim().toLowerCase() : null,
    },
    lines,
    shipping,
    otherCharges: [],
    totals: { total: amount(order.totalPriceSet), tax: amount(order.totalTaxSet), refunded: amount(order.totalRefundedSet) },
    refunds: normalizedRefunds,
    edited,
  };
}
