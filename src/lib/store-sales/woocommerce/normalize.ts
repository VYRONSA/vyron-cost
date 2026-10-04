import { normalizeTitle, round2, type SaleLine, type SaleRefund, type SaleShipping, type StoreSale } from "@/lib/store-sales/types";

/**
 * WooCommerce REST v3 order (+ its refunds) → the shared sale model. Pure.
 *
 * WooCommerce reports line, shipping and fee amounts EXCLUDING tax, with the
 * tax beside them, whether or not the shop displays tax-inclusive prices. The
 * sale is therefore recorded on an ex-VAT basis (taxesIncluded = false); the
 * VAT VOLORA computes is checked against WooCommerce's `total_tax`.
 */

type WooTaxEntry = { id?: number | string; total?: string | number; subtotal?: string | number };
type WooMeta = { key?: string; value?: unknown };

export type WooLineItem = {
  id: number | string;
  name?: string;
  product_id?: number | string;
  variation_id?: number | string;
  quantity?: number | string;
  subtotal?: string;
  subtotal_tax?: string;
  total?: string;
  total_tax?: string;
  taxes?: WooTaxEntry[];
  sku?: string | null;
  price?: number | string;
  meta_data?: WooMeta[];
};

export type WooOrder = {
  id: number | string;
  number?: string;
  status?: string;
  currency?: string;
  date_created?: string | null;
  date_created_gmt?: string | null;
  date_modified_gmt?: string | null;
  prices_include_tax?: boolean;
  customer_id?: number | string;
  billing?: { first_name?: string; last_name?: string; company?: string; email?: string };
  total?: string;
  total_tax?: string;
  line_items?: WooLineItem[];
  tax_lines?: Array<{ rate_id?: number | string; rate_percent?: number | string | null; label?: string }>;
  shipping_lines?: Array<{ id?: number | string; method_title?: string; total?: string; total_tax?: string; taxes?: WooTaxEntry[] }>;
  fee_lines?: Array<{ name?: string; total?: string; total_tax?: string; taxes?: WooTaxEntry[] }>;
  refunds?: Array<{ id?: number | string; total?: string }>;
};

export type WooRefund = {
  id: number | string;
  date_created?: string | null;
  date_created_gmt?: string | null;
  amount?: string;
  reason?: string | null;
  line_items?: WooLineItem[];
};

export const WOO_STATUSES = ["PROCESSING", "COMPLETED", "REFUNDED", "PENDING", "ON_HOLD", "CANCELLED", "FAILED", "TRASH", "CHECKOUT_DRAFT"];

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const money = (value: unknown) => round2(num(value));
const gmt = (value: string | null | undefined) => (value ? (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`) : null);
/** WooCommerce's date_created is already in the store's own time zone. */
const localDate = (value: string | null | undefined, fallback: string | null | undefined) => (value ? value.slice(0, 10) : fallback ? fallback.slice(0, 10) : new Date().toISOString().slice(0, 10));

/**
 * The rate of one line from its per-rate tax entries and the order's tax_lines.
 * No tax charged → 0. Tax charged at a rate the order does not state → null
 * (the sale stops rather than inferring a rate from amounts).
 */
function rateOf(taxes: WooTaxEntry[] | undefined, totalTax: number, rates: Map<string, number | null>): number | null {
  const charged = (taxes || []).filter((t) => num(t.total) !== 0);
  if (!charged.length) return totalTax !== 0 ? null : 0;
  let rate = 0;
  for (const entry of charged) {
    const percent = rates.get(String(entry.id));
    if (percent === null || percent === undefined) return null;
    rate += percent;
  }
  return Math.round(rate * 10000) / 10000;
}

function lineKey(item: WooLineItem): { key: string; label: string | null } {
  const variation = num(item.variation_id);
  const product = num(item.product_id);
  if (variation > 0) return { key: `variation:${variation}`, label: `variation ${variation}` };
  if (product > 0) return { key: `product:${product}`, label: `product ${product}` };
  return { key: `title:${normalizeTitle(item.name)}`, label: null };
}

export function normalizeWooRefund(refund: WooRefund): SaleRefund {
  const lines: SaleRefund["lines"] = [];
  for (const item of refund.line_items || []) {
    const original = (item.meta_data || []).find((m) => m.key === "_refunded_item_id")?.value;
    const quantity = Math.abs(num(item.quantity));
    // An amount-only line refund (no quantity) is money not itemised: the planner credits it as such.
    if (!original || quantity === 0) continue;
    lines.push({ lineId: String(original), quantity, subtotal: Math.abs(money(item.total)), tax: Math.abs(money(item.total_tax)) });
  }
  const total = Math.abs(money(refund.amount));
  return {
    refundId: String(refund.id),
    createdAt: gmt(refund.date_created_gmt),
    refundDate: localDate(refund.date_created, refund.date_created_gmt),
    note: refund.reason || null,
    total,
    truncated: false,
    lines,
    // WooCommerce does not itemise refunded shipping: it is part of the amount the planner credits as not itemised.
    shipping: [],
  };
}

export function normalizeWooOrder(order: WooOrder, refunds: WooRefund[]): StoreSale {
  const rates = new Map<string, number | null>(
    (order.tax_lines || []).map((t) => [String(t.rate_id), t.rate_percent === null || t.rate_percent === undefined || t.rate_percent === "" ? null : num(t.rate_percent)])
  );
  const status = String(order.status || "")
    .toUpperCase()
    .replace(/-/g, "_");

  const lines: SaleLine[] = (order.line_items || []).map((item) => {
    const quantity = num(item.quantity);
    const subtotal = money(item.subtotal);
    const total = money(item.total);
    const totalTax = money(item.total_tax);
    const { key, label } = lineKey(item);
    return {
      lineId: String(item.id),
      sku: item.sku && String(item.sku).trim() ? String(item.sku).trim() : null,
      name: String(item.name || "").trim() || "WooCommerce item",
      externalKey: key,
      externalProductLabel: label,
      orderedQuantity: quantity,
      quantity,
      unitPrice: quantity > 0 ? Math.round((subtotal / quantity) * 10000) / 10000 : 0,
      discount: subtotal > total ? round2(subtotal - total) : 0,
      taxRate: rateOf(item.taxes, totalTax, rates),
      tax: totalTax,
    };
  });

  const shipping: SaleShipping[] = (order.shipping_lines || []).map((line) => ({
    title: String(line.method_title || "Shipping").trim() || "Shipping",
    amount: money(line.total),
    discount: 0,
    taxRate: rateOf(line.taxes, money(line.total_tax), rates),
    tax: money(line.total_tax),
  }));

  const name = order.billing?.company || [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(" ");
  const customerId = num(order.customer_id) > 0 ? String(order.customer_id) : null;
  const email = order.billing?.email ? String(order.billing.email).trim().toLowerCase() : null;
  const normalizedRefunds = refunds.map(normalizeWooRefund).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return {
    channel: "WOOCOMMERCE",
    orderId: String(order.id),
    orderNumber: `#${order.number || order.id}`,
    createdAt: gmt(order.date_created_gmt),
    saleDate: localDate(order.date_created, order.date_created_gmt),
    test: false,
    cancelledAt: status === "CANCELLED" ? gmt(order.date_modified_gmt) || new Date().toISOString() : null,
    cancelReason: status === "CANCELLED" ? "cancelled in WooCommerce" : null,
    financialStatus: status,
    currency: order.currency ? String(order.currency).toUpperCase() : null,
    taxesIncluded: false,
    customer: { id: customerId, name: name ? String(name).trim() : null, email },
    lines,
    shipping,
    otherCharges: (order.fee_lines || []).map((fee) => ({
      title: String(fee.name || "Fee").trim() || "Fee",
      amount: money(fee.total),
      discount: 0,
      taxRate: rateOf(fee.taxes, money(fee.total_tax), rates),
      tax: money(fee.total_tax),
    })),
    totals: {
      total: order.total === undefined ? null : money(order.total),
      tax: order.total_tax === undefined ? null : money(order.total_tax),
      refunded: round2(normalizedRefunds.reduce((t, r) => t + r.total, 0)),
    },
    refunds: normalizedRefunds,
    edited: false,
  };
}
