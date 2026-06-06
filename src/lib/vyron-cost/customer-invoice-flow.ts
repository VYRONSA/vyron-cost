export type LocalInvoiceStatus = "Draft" | "Approved" | "Posted" | "Sent" | "Paid" | "Cancelled" | "Reversed";

export type LocalInvoiceLine = {
  id: string;
  productId: string;
  qty: number;
  sellingPrice: number;
};

export type LocalCustomerInvoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  invoiceDate: string;
  status: LocalInvoiceStatus;
  lines: LocalInvoiceLine[];
  note?: string;
  stockPosted?: boolean;
  postedAt?: string;
  additionalEmails?: string;
  emailedAt?: string;
};

export type LocalXeroQueueItem = {
  id: string;
  type: "Sales Invoice";
  name: string;
  reference: string;
  value: number;
  status: "Ready" | "Synced" | "Needs Review" | "Failed";
  note: string;
  destination: string;
};

export type LocalCustomerHistory = {
  totalSales: number;
  lastInvoiceDate: string | null;
  invoiceCount: number;
  averageInvoiceValue: number;
};

const XERO_QUEUE_KEY = "vyron-cost-xero-sync-queue-v1";
const CUSTOMER_HISTORY_KEY = "vyron-cost-customer-history-v1";
const LEDGER_KEY = "vyron-cost-inventory-ledger-v1";

export function computeInvoiceTotals(
  invoice: LocalCustomerInvoice,
  productCost: (productId: string) => number
) {
  let sales = 0;
  let cogs = 0;
  for (const line of invoice.lines) {
    sales += line.qty * line.sellingPrice;
    cogs += line.qty * productCost(line.productId);
  }
  return { sales, cogs, gp: sales - cogs };
}

export function postInvoiceLocally(
  invoice: LocalCustomerInvoice,
  productName: (productId: string) => string,
  productCost: (productId: string) => number,
  currentStock: Record<string, number>
) {
  if (invoice.stockPosted) {
    return { invoice, warnings: ["Invoice already posted. Stock was not deducted again."], stock: currentStock };
  }

  const warnings: string[] = [];
  const stock = { ...currentStock };

  for (const line of invoice.lines) {
    const available = stock[line.productId] ?? 0;
    const next = available - line.qty;
    stock[line.productId] = next;
    if (next < 0) {
      warnings.push(`${productName(line.productId)}: stock went negative (${next}).`);
    }

    appendLedgerEntry({
      type: "SALE",
      reference: invoice.invoiceNumber,
      product: productName(line.productId),
      quantity: -line.qty,
      reason: "Customer Invoice",
      date: invoice.invoiceDate,
    });
  }

  const totals = computeInvoiceTotals(invoice, productCost);
  queueXeroLocally({
    id: crypto.randomUUID(),
    type: "Sales Invoice",
    name: invoice.invoiceNumber,
    reference: invoice.invoiceNumber,
    value: totals.sales,
    status: "Ready",
    note: "Ready to sync to Xero Sales Invoice.",
    destination: "Xero Sales Invoice",
  });

  updateCustomerHistoryLocally(invoice.customerId, totals.sales, invoice.invoiceDate);

  const posted: LocalCustomerInvoice = {
    ...invoice,
    status: "Posted",
    stockPosted: true,
    postedAt: new Date().toISOString(),
    note: "Posted. Finished goods stock reduced, ledger updated, customer history updated, Xero queue created.",
  };

  return { invoice: posted, warnings, stock };
}

function appendLedgerEntry(entry: {
  type: string;
  reference: string;
  product: string;
  quantity: number;
  reason: string;
  date: string;
}) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(LEDGER_KEY);
  const rows = raw ? (JSON.parse(raw) as unknown[]) : [];
  rows.unshift({ id: crypto.randomUUID(), ...entry, createdAt: new Date().toISOString() });
  window.localStorage.setItem(LEDGER_KEY, JSON.stringify(rows.slice(0, 500)));
}

export function queueXeroLocally(item: LocalXeroQueueItem) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(XERO_QUEUE_KEY);
  const rows: LocalXeroQueueItem[] = raw ? JSON.parse(raw) : [];
  if (rows.some((row) => row.reference === item.reference && row.type === item.type)) return;
  window.localStorage.setItem(XERO_QUEUE_KEY, JSON.stringify([item, ...rows]));
}

export function readXeroQueueLocally(): LocalXeroQueueItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(XERO_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalXeroQueueItem[];
  } catch {
    return [];
  }
}

export function updateCustomerHistoryLocally(customerId: string, salesValue: number, invoiceDate: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(CUSTOMER_HISTORY_KEY);
  const map: Record<string, LocalCustomerHistory> = raw ? JSON.parse(raw) : {};
  const current = map[customerId] || { totalSales: 0, lastInvoiceDate: null, invoiceCount: 0, averageInvoiceValue: 0 };
  const totalSales = Math.round((current.totalSales + salesValue) * 100) / 100;
  const invoiceCount = current.invoiceCount + 1;
  map[customerId] = {
    totalSales,
    invoiceCount,
    lastInvoiceDate: invoiceDate,
    averageInvoiceValue: invoiceCount ? Math.round((totalSales / invoiceCount) * 100) / 100 : 0,
  };
  window.localStorage.setItem(CUSTOMER_HISTORY_KEY, JSON.stringify(map));
}

export function readCustomerHistoryLocally(customerId: string): LocalCustomerHistory {
  if (typeof window === "undefined") {
    return { totalSales: 0, lastInvoiceDate: null, invoiceCount: 0, averageInvoiceValue: 0 };
  }
  const raw = window.localStorage.getItem(CUSTOMER_HISTORY_KEY);
  if (!raw) return { totalSales: 0, lastInvoiceDate: null, invoiceCount: 0, averageInvoiceValue: 0 };
  try {
    const map = JSON.parse(raw) as Record<string, LocalCustomerHistory>;
    return map[customerId] || { totalSales: 0, lastInvoiceDate: null, invoiceCount: 0, averageInvoiceValue: 0 };
  } catch {
    return { totalSales: 0, lastInvoiceDate: null, invoiceCount: 0, averageInvoiceValue: 0 };
  }
}

export function buildMailtoLink(params: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}) {
  const query = [
    params.cc?.length ? `cc=${encodeURIComponent(params.cc.join(","))}` : "",
    params.bcc?.length ? `bcc=${encodeURIComponent(params.bcc.join(","))}` : "",
    `subject=${encodeURIComponent(params.subject)}`,
    `body=${encodeURIComponent(params.body)}`,
  ]
    .filter(Boolean)
    .join("&");
  return `mailto:${encodeURIComponent(params.to.join(","))}?${query}`;
}
