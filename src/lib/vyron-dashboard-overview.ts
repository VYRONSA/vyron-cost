import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerGpReport } from "@/lib/vyron-customer-gp-reporting";

/**
 * The executive dashboard's data — and nothing else.
 *
 * Every figure here is measured from the workspace's own records. Where a
 * figure cannot be measured (no invoices yet, no stock history to compare
 * against) it comes back `null` and the dashboard shows nothing in its place.
 * Nothing is estimated, extrapolated or filled in to make the design look
 * complete: a number on an executive dashboard is either true or absent.
 */

export type DashboardKpi = {
  value: number | null;
  /** Change against the previous month, when there is a previous month to compare with. */
  changePct: number | null;
  /** An absolute change, where that reads better than a percentage. */
  changeAbs: number | null;
};

export type DashboardActivity = {
  kind: "order" | "stock" | "recipe" | "customer";
  title: string;
  detail: string;
  at: string;
  href: string;
};

export type DashboardOverview = {
  totalCostValue: DashboardKpi;
  averageGpPct: DashboardKpi;
  activeProducts: DashboardKpi;
  ordersThisMonth: DashboardKpi;
  /** Up to six months of measured gross profit percentage, oldest first. */
  gpTrend: Array<{ month: string; label: string; gpPct: number }>;
  /** Change in GP percentage points against three months ago, when measurable. */
  gpTrendChangePct: number | null;
  activity: DashboardActivity[];
};

export const EMPTY_OVERVIEW: DashboardOverview = {
  totalCostValue: { value: null, changePct: null, changeAbs: null },
  averageGpPct: { value: null, changePct: null, changeAbs: null },
  activeProducts: { value: null, changePct: null, changeAbs: null },
  ordersThisMonth: { value: null, changePct: null, changeAbs: null },
  gpTrend: [],
  gpTrendChangePct: null,
  activity: [],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const round1 = (n: number) => Math.round(n * 10) / 10;

/** First day of the month, `count` months back from `from`. */
function monthStart(from: Date, back = 0): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - back, 1));
}

function labelForMonth(key: string): string {
  const [year, month] = key.split("-").map((part) => Number(part));
  if (!year || !month) return key;
  return MONTHS[month - 1] || key;
}

export async function getDashboardOverview(
  supabase: SupabaseClient,
  companyId: string,
  options: { now?: Date } = {}
): Promise<DashboardOverview> {
  const now = options.now || new Date();
  const thisMonth = monthStart(now).toISOString();
  const lastMonth = monthStart(now, 1).toISOString();

  const [stockResult, productsResult, newProductsResult, ordersThisResult, ordersLastResult, gpReport] = await Promise.all([
    supabase.from("vyron_cost_stock_items").select("qty_on_hand, current_cost").eq("company_id", companyId),
    supabase.from("vyron_cost_products").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    supabase.from("vyron_cost_products").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", thisMonth),
    supabase.from("vyron_customer_sales_orders").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", thisMonth),
    supabase
      .from("vyron_customer_sales_orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", lastMonth)
      .lt("created_at", thisMonth),
    getCustomerGpReport(supabase, companyId).catch(() => null),
  ]);

  // ---- Total cost value -----------------------------------------------------
  // Stock on hand at its current cost. There is no history of this figure, so
  // there is no month-on-month change to show, and none is invented.
  const stockRows = (stockResult.data || []) as Array<{ qty_on_hand: number | null; current_cost: number | null }>;
  const totalCostValue = stockRows.length
    ? Math.round(stockRows.reduce((sum, row) => sum + Number(row.qty_on_hand || 0) * Number(row.current_cost || 0), 0))
    : null;

  // ---- Gross profit ---------------------------------------------------------
  const byMonth = gpReport?.byMonth || [];
  const sortedMonths = [...byMonth].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const recent = sortedMonths.slice(-6);
  const gpTrend = recent.map((row) => ({ month: String(row.month), label: labelForMonth(String(row.month)), gpPct: round1(Number(row.gpPct || 0)) }));

  const averageGp = gpReport && gpReport.metrics.revenue > 0 ? round1(gpReport.metrics.gpPct) : null;
  // This month against last month, both measured from the same invoices.
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const previousMonthKey = (() => {
    const d = monthStart(now, 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const thisMonthGp = sortedMonths.find((row) => String(row.month).startsWith(currentMonthKey));
  const lastMonthGp = sortedMonths.find((row) => String(row.month).startsWith(previousMonthKey));
  const gpChange = thisMonthGp && lastMonthGp ? round1(Number(thisMonthGp.gpPct || 0) - Number(lastMonthGp.gpPct || 0)) : null;

  // Against three months ago, for the note under the chart.
  const gpTrendChangePct = gpTrend.length >= 4 ? round1(gpTrend[gpTrend.length - 1].gpPct - gpTrend[gpTrend.length - 4].gpPct) : null;

  // ---- Counts ---------------------------------------------------------------
  const activeProducts = typeof productsResult.count === "number" ? productsResult.count : null;
  const newProducts = typeof newProductsResult.count === "number" ? newProductsResult.count : null;
  const ordersThisMonth = typeof ordersThisResult.count === "number" ? ordersThisResult.count : null;
  const ordersLastMonth = typeof ordersLastResult.count === "number" ? ordersLastResult.count : null;
  const ordersChange =
    ordersThisMonth !== null && ordersLastMonth !== null && ordersLastMonth > 0
      ? round1(((ordersThisMonth - ordersLastMonth) / ordersLastMonth) * 100)
      : null;

  return {
    totalCostValue: { value: totalCostValue, changePct: null, changeAbs: null },
    averageGpPct: { value: averageGp, changePct: gpChange, changeAbs: null },
    activeProducts: { value: activeProducts, changePct: null, changeAbs: newProducts && newProducts > 0 ? newProducts : null },
    ordersThisMonth: { value: ordersThisMonth, changePct: ordersChange, changeAbs: null },
    gpTrend,
    gpTrendChangePct,
    activity: await loadRecentActivity(supabase, companyId),
  };
}

/**
 * The four most recent things that actually happened in this workspace.
 * Each row is a real record; nothing is synthesised to fill the list.
 */
async function loadRecentActivity(supabase: SupabaseClient, companyId: string): Promise<DashboardActivity[]> {
  const [orders, movements, products, customers] = await Promise.all([
    supabase
      .from("vyron_customer_sales_orders")
      .select("id, order_number, customer_name, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("vyron_cost_stock_ledger")
      .select("id, movement_type, reference_label, movement_date")
      .eq("company_id", companyId)
      .order("movement_date", { ascending: false })
      .limit(4),
    supabase
      .from("vyron_cost_products")
      .select("id, product_name, updated_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("vyron_customers")
      .select("id, customer_name, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const rows: DashboardActivity[] = [];
  for (const row of (orders.data || []) as Array<{ order_number: string | null; customer_name: string | null; created_at: string }>) {
    if (!row.created_at) continue;
    rows.push({ kind: "order", title: "New order received", detail: row.order_number || row.customer_name || "Sales order", at: row.created_at, href: "/customer-sales-orders" });
  }
  for (const row of (movements.data || []) as Array<{ movement_type: string | null; reference_label: string | null; movement_date: string }>) {
    if (!row.movement_date) continue;
    rows.push({ kind: "stock", title: `Stock ${String(row.movement_type || "movement").toLowerCase()}`, detail: row.reference_label || "Stock movement", at: row.movement_date, href: "/inventory" });
  }
  for (const row of (products.data || []) as Array<{ product_name: string | null; updated_at: string }>) {
    if (!row.updated_at) continue;
    rows.push({ kind: "recipe", title: "Recipe updated", detail: row.product_name || "Product", at: row.updated_at, href: "/products" });
  }
  for (const row of (customers.data || []) as Array<{ customer_name: string | null; created_at: string }>) {
    if (!row.created_at) continue;
    rows.push({ kind: "customer", title: "New customer added", detail: row.customer_name || "Customer", at: row.created_at, href: "/customers" });
  }

  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 4);
}
