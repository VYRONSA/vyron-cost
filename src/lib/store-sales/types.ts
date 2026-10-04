import { stableHash } from "@/lib/order-engine/normalize";

/**
 * The one sale model every online-store connector produces. A connector only
 * translates its platform's order into this; matching, VAT, posting and
 * refunds are done once, by the shared engine, for every channel.
 */

export const STORE_CHANNELS = ["SHOPIFY", "WOOCOMMERCE"] as const;
export type StoreChannel = (typeof STORE_CHANNELS)[number];

export const CHANNEL_LABEL: Record<StoreChannel, string> = { SHOPIFY: "Shopify", WOOCOMMERCE: "WooCommerce" };

export type SaleLine = {
  /** The platform's own line id (refunds point back to it). */
  lineId: string;
  sku: string | null;
  name: string;
  /** The key a person's product mapping is stored under (variant:<id>, variation:<id>, product:<id>, title:<name>). */
  externalKey: string;
  externalProductLabel: string | null;
  orderedQuantity: number;
  /** Units the customer was charged for (refunded units included: they are credited separately). */
  quantity: number;
  /** Unit price before discount, in the order's price basis (taxesIncluded). */
  unitPrice: number;
  discount: number;
  /** Percent; null = the platform did not state the rate (the sale stops rather than guessing). */
  taxRate: number | null;
  tax: number;
};

export type SaleShipping = { title: string; amount: number; discount: number; taxRate: number | null; tax: number };

export type SaleRefund = {
  refundId: string;
  createdAt: string | null;
  /** YYYY-MM-DD in the store's own time zone. */
  refundDate: string;
  note: string | null;
  total: number;
  truncated: boolean;
  /** Refunded units of an original line, at the store's refunded amount (in the order's price basis) and VAT. */
  lines: Array<{ lineId: string; quantity: number; subtotal: number; tax: number }>;
  shipping: Array<{ subtotal: number; tax: number }>;
};

export type StoreSale = {
  channel: StoreChannel;
  orderId: string;
  /** What the store shows people (#1042). */
  orderNumber: string;
  createdAt: string | null;
  /** YYYY-MM-DD in the store's own time zone. */
  saleDate: string;
  test: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** The store's own status, upper-cased with underscores (PAID, PROCESSING, ON_HOLD …). */
  financialStatus: string;
  currency: string | null;
  /** Unit prices include VAT. */
  taxesIncluded: boolean;
  customer: { id: string | null; name: string | null; email: string | null };
  lines: SaleLine[];
  shipping: SaleShipping[];
  /** Other charges without a product (e.g. WooCommerce fee lines): recorded like shipping. */
  otherCharges: SaleShipping[];
  totals: { total: number | null; tax: number | null; refunded: number | null };
  refunds: SaleRefund[];
  /** Units were removed by an edit, so the store's original total is not comparable. */
  edited: boolean;
};

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function normalizeTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** YYYY-MM-DD of an instant in a time zone; UTC when the zone is unknown. */
export function dateInZone(iso: string | null | undefined, timeZone: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * What the recorded sale depends on. Refunds are deliberately excluded (they
 * are credited separately), so a refund never looks like an edit.
 */
export function saleFingerprint(sale: StoreSale): string {
  return stableHash({
    customer: sale.customer.id ?? sale.customer.email,
    taxesIncluded: sale.taxesIncluded,
    currency: sale.currency,
    lines: sale.lines.map((l) => [l.lineId, l.externalKey, l.quantity, l.unitPrice, l.discount, l.taxRate]),
    shipping: sale.shipping.map((s) => [s.title, s.amount, s.discount, s.taxRate]),
    charges: sale.otherCharges.map((s) => [s.title, s.amount, s.taxRate]),
  });
}
