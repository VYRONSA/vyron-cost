"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, formatQty, type ReportFilter } from "@/lib/vyron-report-exports";

/**
 * Customer & Product GP Report.
 *
 * One report, four cuts of the same figures: by customer, by product, by
 * invoice and by month. All of them come from getCustomerGpReport(), the
 * existing company-scoped GP engine, so a customer total and a product total
 * for the same period always reconcile to the same revenue and gross profit.
 *
 * The view and the date range live in the URL. A report a client is reading can
 * be shared or bookmarked and comes back showing the same cut of the same
 * period, and the export carries whichever view is on screen.
 */

export type GpCustomerRow = {
  customerId: string | null;
  customerName: string;
  customerGroup: string;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
  qtySold: number;
  invoiceCount: number;
  productCount: number;
};

export type GpProductRow = {
  productId: string | null;
  productName: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
  avgSellingPrice: number;
  avgCostPrice: number;
};

export type GpInvoiceRow = {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  revenue: number;
  cost: number;
  gp: number;
  gpPct: number;
};

export type GpMonthRow = { month: string; revenue: number; cost: number; gp: number; gpPct: number };

export type GpReportData = {
  metrics: { revenue: number; costOfSales: number; grossProfit: number; gpPct: number; qtySold: number };
  byCustomer: GpCustomerRow[];
  byProduct: GpProductRow[];
  byInvoice: GpInvoiceRow[];
  byMonth: GpMonthRow[];
};

type View = "customer" | "product" | "invoice" | "month";

const VIEWS: Array<{ key: View; label: string; title: string }> = [
  { key: "customer", label: "By Customer", title: "Customer GP Report" },
  { key: "product", label: "By Product", title: "Product GP Report" },
  { key: "invoice", label: "By Invoice", title: "Invoice GP Report" },
  { key: "month", label: "By Month", title: "Monthly GP Report" },
];

const ALL = "__all__";

export default function CustomerProductGpReportClient({
  data,
  companyName,
  generatedAt,
  from,
  to,
  view,
  error,
}: {
  data: GpReportData;
  companyName: string;
  generatedAt: string;
  from: string;
  to: string;
  view: View;
  error: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState(ALL);
  const [category, setCategory] = useState(ALL);

  const navigate = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      setPending(true);
      router.replace(`/reports/gp?${next.toString()}`);
      window.setTimeout(() => setPending(false), 900);
    },
    [params, router]
  );

  const customers = useMemo(
    () => [...new Set(data.byCustomer.map((c) => c.customerName).filter(Boolean))].sort(),
    [data.byCustomer]
  );
  const categories = useMemo(
    () => [...new Set(data.byProduct.map((p) => p.category).filter((c) => c && c !== "Unassigned"))].sort(),
    [data.byProduct]
  );

  const term = search.trim().toLowerCase();

  const customerRows = useMemo(
    () =>
      data.byCustomer.filter((r) => {
        if (customer !== ALL && r.customerName !== customer) return false;
        if (term && !`${r.customerName} ${r.customerGroup}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [data.byCustomer, customer, term]
  );

  const productRows = useMemo(
    () =>
      data.byProduct.filter((r) => {
        if (category !== ALL && r.category !== category) return false;
        if (term && !`${r.productName} ${r.category}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [data.byProduct, category, term]
  );

  const invoiceRows = useMemo(
    () =>
      data.byInvoice.filter((r) => {
        if (customer !== ALL && r.customerName !== customer) return false;
        if (term && !`${r.invoiceNumber} ${r.customerName}`.toLowerCase().includes(term)) return false;
        return true;
      }),
    [data.byInvoice, customer, term]
  );

  const monthRows = data.byMonth;

  /** Totals always come from the rows on screen, so the footer cannot disagree. */
  const totals = useMemo(() => {
    const rows: Array<{ revenue: number; cost: number }> =
      view === "customer" ? customerRows : view === "product" ? productRows : view === "invoice" ? invoiceRows : monthRows;
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    const gp = revenue - cost;
    return { revenue, cost, gp, gpPct: revenue > 0 ? (gp / revenue) * 100 : 0, count: rows.length };
  }, [view, customerRows, productRows, invoiceRows, monthRows]);

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    list.push({ key: "view", label: "View", value: VIEWS.find((v) => v.key === view)?.label || view });
    if (from) list.push({ key: "from", label: "From", value: from });
    if (to) list.push({ key: "to", label: "To", value: to });
    if (customer !== ALL && view !== "product" && view !== "month")
      list.push({ key: "customer", label: "Customer", value: customer });
    if (category !== ALL && view === "product") list.push({ key: "category", label: "Category", value: category });
    if (term) list.push({ key: "search", label: "Search", value: search.trim() });
    return list;
  }, [view, from, to, customer, category, term, search]);

  const period = useMemo(() => ({ kind: "range" as const, from: from || null, to: to || null }), [from, to]);
  const activeView = VIEWS.find((v) => v.key === view) || VIEWS[0];

  const columnsAndRows = useCallback(() => {
    if (view === "customer") {
      return {
        columns: [
          { key: "customer", label: "Customer" },
          { key: "group", label: "Group" },
          { key: "invoices", label: "Invoices" },
          { key: "products", label: "Products" },
          { key: "qty", label: "Qty Sold" },
          { key: "revenue", label: "Revenue" },
          { key: "cost", label: "Cost of Sales" },
          { key: "gp", label: "Gross Profit" },
          { key: "gp_pct", label: "GP %" },
        ],
        rows: customerRows.map((r) => [
          r.customerName,
          r.customerGroup,
          String(r.invoiceCount),
          String(r.productCount),
          formatQty(r.qtySold),
          formatMoney(r.revenue),
          formatMoney(r.cost),
          formatMoney(r.gp),
          `${r.gpPct.toFixed(1)}%`,
        ]),
      };
    }
    if (view === "product") {
      return {
        columns: [
          { key: "product", label: "Product" },
          { key: "category", label: "Category" },
          { key: "qty", label: "Qty Sold" },
          { key: "avg_price", label: "Avg Selling Price" },
          { key: "avg_cost", label: "Avg Cost Price" },
          { key: "revenue", label: "Revenue" },
          { key: "cost", label: "Cost of Sales" },
          { key: "gp", label: "Gross Profit" },
          { key: "gp_pct", label: "GP %" },
        ],
        rows: productRows.map((r) => [
          r.productName,
          r.category,
          formatQty(r.qty),
          formatMoney(r.avgSellingPrice),
          formatMoney(r.avgCostPrice),
          formatMoney(r.revenue),
          formatMoney(r.cost),
          formatMoney(r.gp),
          `${r.gpPct.toFixed(1)}%`,
        ]),
      };
    }
    if (view === "invoice") {
      return {
        columns: [
          { key: "invoice", label: "Invoice" },
          { key: "date", label: "Invoice Date" },
          { key: "customer", label: "Customer" },
          { key: "revenue", label: "Revenue" },
          { key: "cost", label: "Cost of Sales" },
          { key: "gp", label: "Gross Profit" },
          { key: "gp_pct", label: "GP %" },
        ],
        rows: invoiceRows.map((r) => [
          r.invoiceNumber,
          r.invoiceDate,
          r.customerName,
          formatMoney(r.revenue),
          formatMoney(r.cost),
          formatMoney(r.gp),
          `${r.gpPct.toFixed(1)}%`,
        ]),
      };
    }
    return {
      columns: [
        { key: "month", label: "Month" },
        { key: "revenue", label: "Revenue" },
        { key: "cost", label: "Cost of Sales" },
        { key: "gp", label: "Gross Profit" },
        { key: "gp_pct", label: "GP %" },
      ],
      rows: monthRows.map((r) => [
        r.month,
        formatMoney(r.revenue),
        formatMoney(r.cost),
        formatMoney(r.gp),
        `${r.gpPct.toFixed(1)}%`,
      ]),
    };
  }, [view, customerRows, productRows, invoiceRows, monthRows]);

  const getExportPayload = useCallback(() => {
    const { columns, rows } = columnsAndRows();
    return buildReportPayload({
      reportKey: `gp-${view}`,
      title: activeView.title,
      companyName,
      generatedAt,
      period,
      filters: activeFilters,
      summary: [
        { label: "Revenue", value: formatMoney(totals.revenue) },
        { label: "Cost of Sales", value: formatMoney(totals.cost) },
        { label: "Gross Profit", value: formatMoney(totals.gp) },
        { label: "GP %", value: `${totals.gpPct.toFixed(1)}%` },
        { label: activeView.label.replace("By ", "") + "s", value: String(totals.count) },
      ],
      columns,
      rows,
    });
  }, [columnsAndRows, view, activeView, companyName, generatedAt, period, activeFilters, totals]);

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";
  const num = "px-3 py-2 whitespace-nowrap text-right tabular-nums";
  const gpClass = (v: number) => `${num} font-black ${v < 0 ? "text-rose-700" : "text-emerald-700"}`;

  const isEmpty =
    !error &&
    ((view === "customer" && data.byCustomer.length === 0) ||
      (view === "product" && data.byProduct.length === 0) ||
      (view === "invoice" && data.byInvoice.length === 0) ||
      (view === "month" && data.byMonth.length === 0));

  return (
    <ReportDocument
      reportKey={`gp-${view}`}
      title={activeView.title}
      subtitle="Revenue, cost of sales and gross profit from recognised customer invoices."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      onRefresh={() => navigate({})}
      refreshing={pending}
      error={error}
      isEmpty={isEmpty}
      emptyMessage="No recognised customer invoices fall in the selected period."
      summary={[
        { label: "Revenue", value: formatMoney(totals.revenue) },
        { label: "Cost of Sales", value: formatMoney(totals.cost) },
        { label: "Gross Profit", value: formatMoney(totals.gp) },
        { label: "GP %", value: `${totals.gpPct.toFixed(1)}%` },
        { label: activeView.label.replace("By ", "") + "s", value: String(totals.count) },
      ]}
      controls={
        <>
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">View</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => navigate({ view: v.key })}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                    v.key === view ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">From</span>
            <input type="date" defaultValue={from} onChange={(e) => navigate({ from: e.target.value })} className={controlClass} />
          </label>
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">To</span>
            <input type="date" defaultValue={to} onChange={(e) => navigate({ to: e.target.value })} className={controlClass} />
          </label>
          {view === "customer" || view === "invoice" ? (
            <label className="min-w-[200px]">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Customer</span>
              <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={controlClass}>
                <option value={ALL}>All customers</option>
                {customers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {view === "product" ? (
            <label className="min-w-[180px]">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
                <option value={ALL}>All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {view !== "month" ? (
            <label className="min-w-[200px]">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or number…"
                className={controlClass}
              />
            </label>
          ) : null}
        </>
      }
    >
      {view === "customer" ? (
        <ReportTable minWidth={1120}>
          <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
            <tr>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Group</th>
              <th className="px-3 py-2.5 text-right">Invoices</th>
              <th className="px-3 py-2.5 text-right">Products</th>
              <th className="px-3 py-2.5 text-right">Qty Sold</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Cost of Sales</th>
              <th className="px-3 py-2.5 text-right">Gross Profit</th>
              <th className="px-3 py-2.5 text-right">GP %</th>
            </tr>
          </thead>
          <tbody>
            {customerRows.map((r) => (
              <tr key={`${r.customerId ?? "unmapped"}::${r.customerName}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 font-black text-slate-900">{r.customerName}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.customerGroup}</td>
                <td className={`${num} text-slate-900`}>{r.invoiceCount}</td>
                <td className={`${num} text-slate-900`}>{r.productCount}</td>
                <td className={`${num} text-slate-900`}>{formatQty(r.qtySold)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.revenue)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.cost)}</td>
                <td className={`${num} font-black text-slate-900`}>{formatMoney(r.gp)}</td>
                <td className={gpClass(r.gpPct)}>{r.gpPct.toFixed(1)}%</td>
              </tr>
            ))}
            {customerRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                  No customers match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
              <td className="px-3 py-2.5" colSpan={5}>
                Totals — {totals.count} customer{totals.count === 1 ? "" : "s"}
              </td>
              <td className={num}>{formatMoney(totals.revenue)}</td>
              <td className={num}>{formatMoney(totals.cost)}</td>
              <td className={num}>{formatMoney(totals.gp)}</td>
              <td className={num}>{totals.gpPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </ReportTable>
      ) : view === "product" ? (
        <ReportTable minWidth={1160}>
          <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5 text-right">Qty Sold</th>
              <th className="px-3 py-2.5 text-right">Avg Selling Price</th>
              <th className="px-3 py-2.5 text-right">Avg Cost Price</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Cost of Sales</th>
              <th className="px-3 py-2.5 text-right">Gross Profit</th>
              <th className="px-3 py-2.5 text-right">GP %</th>
            </tr>
          </thead>
          <tbody>
            {productRows.map((r) => (
              <tr key={`${r.productId ?? "unmapped"}::${r.productName}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 font-black text-slate-900">{r.productName}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.category}</td>
                <td className={`${num} text-slate-900`}>{formatQty(r.qty)}</td>
                <td className={`${num} text-slate-900`}>{formatMoney(r.avgSellingPrice)}</td>
                <td className={`${num} text-slate-900`}>{formatMoney(r.avgCostPrice)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.revenue)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.cost)}</td>
                <td className={`${num} font-black text-slate-900`}>{formatMoney(r.gp)}</td>
                <td className={gpClass(r.gpPct)}>{r.gpPct.toFixed(1)}%</td>
              </tr>
            ))}
            {productRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                  No products match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
              <td className="px-3 py-2.5" colSpan={5}>
                Totals — {totals.count} product{totals.count === 1 ? "" : "s"}
              </td>
              <td className={num}>{formatMoney(totals.revenue)}</td>
              <td className={num}>{formatMoney(totals.cost)}</td>
              <td className={num}>{formatMoney(totals.gp)}</td>
              <td className={num}>{totals.gpPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </ReportTable>
      ) : view === "invoice" ? (
        <ReportTable minWidth={980}>
          <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
            <tr>
              <th className="px-3 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Invoice Date</th>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Cost of Sales</th>
              <th className="px-3 py-2.5 text-right">Gross Profit</th>
              <th className="px-3 py-2.5 text-right">GP %</th>
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map((r) => (
              <tr key={`${r.invoiceNumber}::${r.customerName}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{r.invoiceNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.invoiceDate}</td>
                <td className="px-3 py-2 font-semibold text-slate-800">{r.customerName}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.revenue)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.cost)}</td>
                <td className={`${num} font-black text-slate-900`}>{formatMoney(r.gp)}</td>
                <td className={gpClass(r.gpPct)}>{r.gpPct.toFixed(1)}%</td>
              </tr>
            ))}
            {invoiceRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                  No invoices match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
              <td className="px-3 py-2.5" colSpan={3}>
                Totals — {totals.count} invoice{totals.count === 1 ? "" : "s"}
              </td>
              <td className={num}>{formatMoney(totals.revenue)}</td>
              <td className={num}>{formatMoney(totals.cost)}</td>
              <td className={num}>{formatMoney(totals.gp)}</td>
              <td className={num}>{totals.gpPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </ReportTable>
      ) : (
        <ReportTable minWidth={720}>
          <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
            <tr>
              <th className="px-3 py-2.5">Month</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5 text-right">Cost of Sales</th>
              <th className="px-3 py-2.5 text-right">Gross Profit</th>
              <th className="px-3 py-2.5 text-right">GP %</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.map((r) => (
              <tr key={r.month} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{r.month}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.revenue)}</td>
                <td className={`${num} font-semibold text-slate-900`}>{formatMoney(r.cost)}</td>
                <td className={`${num} font-black text-slate-900`}>{formatMoney(r.gp)}</td>
                <td className={gpClass(r.gpPct)}>{r.gpPct.toFixed(1)}%</td>
              </tr>
            ))}
            {monthRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                  No months in the selected period.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
              <td className="px-3 py-2.5">Totals — {totals.count} month{totals.count === 1 ? "" : "s"}</td>
              <td className={num}>{formatMoney(totals.revenue)}</td>
              <td className={num}>{formatMoney(totals.cost)}</td>
              <td className={num}>{formatMoney(totals.gp)}</td>
              <td className={num}>{totals.gpPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </ReportTable>
      )}
    </ReportDocument>
  );
}
