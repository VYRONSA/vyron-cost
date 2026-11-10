/**
 * Period performance: Sales, Purchases and Gross Profit by day, week or month,
 * Month-to-Date, and the Top 10 fastest-moving products.
 *
 * Nothing here calculates GP. Sales, cost of sales and GP come from
 * getCustomerGpReport() (the single company-scoped GP engine every other report
 * uses: issued invoices only — Posted, Sent, Paid or stock posted — so Draft
 * and Cancelled are excluded there). This module only groups its per-invoice
 * figures into periods. Purchases come from the supplier invoice register
 * (imported invoices plus those approved in Invoice Intelligence); Draft and
 * Cancelled are excluded here. All values are excluding VAT.
 *
 * The functions below are pure so the grouping can be tested without a database.
 */

export type Granularity = "day" | "week" | "month";

export type SalesInvoiceInput = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  revenue: number;
  cost: number;
  gp: number;
  qtySold: number;
};

export type PurchaseInvoiceInput = {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  invoiceDate: string | null;
  status: string | null;
  subtotal: number | null;
  href: string;
};

export type ProductMovementInput = {
  productId: string | null;
  productName: string;
  qty: number;
  revenue: number;
  costMissing?: boolean;
};

export type PeriodBucket = {
  key: string;
  label: string;
  from: string;
  to: string;
  sales: number;
  costOfSales: number;
  grossProfit: number;
  gpPct: number;
  purchases: number;
  salesInvoices: number;
  purchaseInvoices: number;
};

export type FastMover = {
  rank: number;
  productId: string | null;
  itemCode: string;
  description: string;
  unitsSold: number;
  salesValue: number;
  costMissing: boolean;
};

/** Supplier invoice statuses that are not purchases. */
export const EXCLUDED_PURCHASE_STATUSES = ["draft", "cancelled", "void", "voided", "rejected"];

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function isCountedPurchase(status: string | null | undefined): boolean {
  return !EXCLUDED_PURCHASE_STATUSES.includes(String(status || "").trim().toLowerCase());
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in South Africa (the business's calendar), as YYYY-MM-DD. */
export function todaySast(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Period containing `iso`. Weeks run Monday to Sunday. */
export function periodOf(iso: string, granularity: Granularity): { key: string; from: string; to: string; label: string } {
  const date = iso.slice(0, 10);
  if (granularity === "day") {
    const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-ZA", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" });
    return { key: date, from: date, to: date, label };
  }
  if (granularity === "week") {
    const d = new Date(`${date}T00:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
    const from = addDays(date, -offset);
    const to = addDays(from, 6);
    const fmt = (x: string) => new Date(`${x}T00:00:00Z`).toLocaleDateString("en-ZA", { timeZone: "UTC", day: "2-digit", month: "short" });
    return { key: from, from, to, label: `Week of ${fmt(from)} – ${fmt(to)} ${to.slice(0, 4)}` };
  }
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const to = addDays(next.toISOString().slice(0, 10), -1);
  const label = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-ZA", { timeZone: "UTC", month: "long", year: "numeric" });
  return { key: from.slice(0, 7), from, to, label };
}

export function buildPeriodBuckets(
  sales: SalesInvoiceInput[],
  purchases: PurchaseInvoiceInput[],
  granularity: Granularity,
  range: { from: string; to: string }
): PeriodBucket[] {
  const buckets = new Map<string, PeriodBucket>();
  const bucketFor = (date: string) => {
    const p = periodOf(date, granularity);
    let b = buckets.get(p.key);
    if (!b) {
      b = { key: p.key, label: p.label, from: p.from, to: p.to, sales: 0, costOfSales: 0, grossProfit: 0, gpPct: 0, purchases: 0, salesInvoices: 0, purchaseInvoices: 0 };
      buckets.set(p.key, b);
    }
    return b;
  };
  const inRange = (d: string) => d >= range.from && d <= range.to;

  for (const inv of sales) {
    const date = String(inv.invoiceDate || "").slice(0, 10);
    if (!isIsoDate(date) || !inRange(date)) continue;
    const b = bucketFor(date);
    b.sales += Number(inv.revenue || 0);
    b.costOfSales += Number(inv.cost || 0);
    b.grossProfit += Number(inv.gp || 0);
    b.salesInvoices += 1;
  }
  for (const inv of purchases) {
    const date = String(inv.invoiceDate || "").slice(0, 10);
    if (!isIsoDate(date) || !inRange(date) || !isCountedPurchase(inv.status)) continue;
    const b = bucketFor(date);
    b.purchases += Number(inv.subtotal || 0);
    b.purchaseInvoices += 1;
  }
  return [...buckets.values()]
    .map((b) => ({
      ...b,
      sales: round2(b.sales),
      costOfSales: round2(b.costOfSales),
      grossProfit: round2(b.grossProfit),
      purchases: round2(b.purchases),
      gpPct: b.sales ? round2((b.grossProfit / b.sales) * 100) : 0,
    }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

export function totalsOf(buckets: PeriodBucket[]) {
  const t = buckets.reduce(
    (acc, b) => ({
      sales: acc.sales + b.sales,
      costOfSales: acc.costOfSales + b.costOfSales,
      grossProfit: acc.grossProfit + b.grossProfit,
      purchases: acc.purchases + b.purchases,
      salesInvoices: acc.salesInvoices + b.salesInvoices,
      purchaseInvoices: acc.purchaseInvoices + b.purchaseInvoices,
    }),
    { sales: 0, costOfSales: 0, grossProfit: 0, purchases: 0, salesInvoices: 0, purchaseInvoices: 0 }
  );
  return {
    ...t,
    sales: round2(t.sales),
    costOfSales: round2(t.costOfSales),
    grossProfit: round2(t.grossProfit),
    purchases: round2(t.purchases),
    gpPct: t.sales ? round2((t.grossProfit / t.sales) * 100) : 0,
  };
}

/**
 * Month-to-date window and the same number of days in the previous month, so
 * the comparison is like-for-like (1–10 Nov against 1–10 Oct, clipped to the
 * last day of a shorter month).
 */
export function mtdWindows(today: string) {
  const current = { from: `${today.slice(0, 7)}-01`, to: today };
  const day = Number(today.slice(8, 10));
  const prevStart = new Date(`${current.from}T00:00:00Z`);
  prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
  const prevFrom = prevStart.toISOString().slice(0, 10);
  const prevMonthEnd = addDays(current.from, -1);
  const prevTo = addDays(prevFrom, day - 1) > prevMonthEnd ? prevMonthEnd : addDays(prevFrom, day - 1);
  return { current, previous: { from: prevFrom, to: prevTo } };
}

/**
 * Top N products by units sold on issued customer invoices. Ties are broken by
 * sales value, then description, so the order is stable. Purchases, production
 * and stock movements are never counted as sales.
 */
export function rankFastMovers(products: ProductMovementInput[], codes: Map<string, string>, limit = 10): FastMover[] {
  return products
    .filter((p) => Number(p.qty) > 0)
    .sort((a, b) => Number(b.qty) - Number(a.qty) || Number(b.revenue) - Number(a.revenue) || a.productName.localeCompare(b.productName))
    .slice(0, limit)
    .map((p, i) => ({
      rank: i + 1,
      productId: p.productId,
      itemCode: (p.productId && codes.get(p.productId)) || "—",
      description: p.productName,
      unitsSold: Math.round(Number(p.qty) * 10000) / 10000,
      salesValue: round2(p.revenue),
      costMissing: Boolean(p.costMissing),
    }));
}
