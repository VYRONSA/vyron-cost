"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import type { ReportFilter } from "@/lib/vyron-report-exports";
import type { SalesReport } from "@/lib/vyron-customer-sales-reports";

/**
 * Sales by Customer / Item / Date.
 *
 * Every figure comes from /api/reports/sales-by-customer-item, which reads the
 * recorded invoice (or sales order) lines. Unit prices are the prices recorded
 * on those lines at the time of sale; a later price-list change cannot alter
 * them, and this component never looks a price up.
 */

type View = "lines" | "customer" | "item";
type Filters = { source: string; status: string; from: string; to: string; customerId: string; productId: string; search: string };

const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: number) => Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 3 });

// The statuses the invoice and sales-order engines actually use.
const INVOICE_STATUS_VALUES = ["Draft", "Approved", "Posted", "Sent", "Paid", "Cancelled"] as const;
const ORDER_STATUS_VALUES = ["Draft", "Awaiting Approval", "Approved", "Picking", "Packed", "Dispatched", "Partially Invoiced", "Invoiced", "Cancelled"] as const;
const INVOICE_STATUSES: ReadonlyArray<readonly [string, string]> = [
  ["posted", "Posted sales (Posted / Sent / Paid)"],
  ["all", "All invoices"],
  ...INVOICE_STATUS_VALUES.map((s) => [s, s] as const),
];
const ORDER_STATUSES: ReadonlyArray<readonly [string, string]> = [
  ["open", "All except cancelled"],
  ["all", "All orders"],
  ...ORDER_STATUS_VALUES.map((s) => [s, s] as const),
];

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export default function SalesByCustomerItemReportClient({ companyName, generatedAt }: { companyName: string; generatedAt: string }) {
  const { canExport } = useReportsPermissions();
  const [view, setView] = useState<View>("customer");
  const [filters, setFilters] = useState<Filters>({
    source: "invoices",
    status: "posted",
    from: monthStart(generatedAt),
    to: generatedAt.slice(0, 10),
    customerId: "",
    productId: "",
    search: "",
  });
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
      const res = await fetch(`/api/reports/sales-by-customer-item?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The report could not be loaded.");
      setReport(data.report as SalesReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), filters.search ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [filters, load]);

  const set = (key: keyof Filters) => (value: string) =>
    setFilters((prev) => {
      if (key === "source") return { ...prev, source: value, status: value === "orders" ? "open" : "posted" };
      return { ...prev, [key]: value };
    });
  const nameOf = (list: Array<{ id: string; name: string }> | undefined, id: string) => list?.find((o) => o.id === id)?.name || id;
  const statuses = filters.source === "orders" ? ORDER_STATUSES : INVOICE_STATUSES;

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [
      { key: "source", label: "Source", value: filters.source === "orders" ? "Sales orders" : "Customer invoices" },
      { key: "status", label: "Status", value: statuses.find(([v]) => v === filters.status)?.[1] || filters.status },
    ];
    if (filters.customerId) list.push({ key: "customer", label: "Customer", value: nameOf(report?.options.customers, filters.customerId) });
    if (filters.productId) list.push({ key: "product", label: "Product", value: nameOf(report?.options.products, filters.productId) });
    if (filters.search.trim()) list.push({ key: "search", label: "Search", value: filters.search.trim() });
    return list;
  }, [filters, report, statuses]);

  const summary = useMemo(() => {
    const s = report?.summary;
    return [
      { label: "Sales Value (excl. VAT)", value: money(s?.totalValue ?? 0) },
      { label: "Quantity", value: qty(s?.totalQuantity ?? 0) },
      { label: filters.source === "orders" ? "Orders" : "Invoices", value: String(s?.transactions ?? 0) },
      { label: "Average Selling Price", value: s?.averageSellingPrice != null ? money(s.averageSellingPrice) : "Choose one product" },
    ];
  }, [report, filters.source]);

  const period = useMemo(() => ({ kind: "range" as const, from: filters.from || null, to: filters.to || null }), [filters.from, filters.to]);
  const lines = useMemo(() => report?.lines ?? [], [report]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "sales-by-customer-item",
        title: "Sales by Customer / Item / Date",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary,
        columns: [
          { key: "date", label: "Date" },
          { key: "customer", label: "Customer" },
          { key: "code", label: "Customer Code" },
          { key: "reference", label: filters.source === "orders" ? "Order" : "Invoice" },
          { key: "order", label: "Sales Order" },
          { key: "product", label: "Item" },
          { key: "sku", label: "SKU" },
          { key: "qty", label: "Quantity" },
          { key: "price", label: "Unit Selling Price" },
          { key: "discount", label: "Discount %" },
          { key: "value", label: "Line Sales Value" },
        ],
        rows: lines.map((l) => [
          l.date,
          l.customerName,
          l.customerCode || "",
          l.reference,
          l.orderReference || "",
          l.productName,
          l.sku || "",
          String(l.quantity),
          l.unitPrice.toFixed(2),
          l.discountPct ? String(l.discountPct) : "",
          l.lineValue.toFixed(2),
        ]),
      }),
    [lines, summary, activeFilters, companyName, generatedAt, period, filters.source]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";
  const labelClass = "text-[10px] font-black uppercase tracking-[0.14em] text-slate-500";
  const tab = (value: View, label: string) => (
    <button
      type="button"
      onClick={() => setView(value)}
      aria-pressed={view === value}
      className={`rounded-xl px-3 py-2 text-xs font-black ${view === value ? "bg-slate-950 text-white" : "border border-[rgba(11,32,43,0.12)] bg-white text-slate-700"}`}
    >
      {label}
    </button>
  );
  const groupCells = (g: { quantity: number; value: number; transactions: number; averagePrice: number | null; firstDate: string; lastDate: string }) => (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{qty(g.quantity)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{g.averagePrice != null ? money(g.averagePrice) : "—"}</td>
      <td className="px-3 py-2 text-right font-black tabular-nums">{money(g.value)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{g.transactions}</td>
      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">{g.firstDate === g.lastDate ? g.firstDate : `${g.firstDate} – ${g.lastDate}`}</td>
    </>
  );
  const groupHead = (first: string, second: string) => (
    <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
      <tr>
        <th className="px-3 py-2.5">{first}</th>
        <th className="px-3 py-2.5">{second}</th>
        <th className="px-3 py-2.5 text-right">Quantity</th>
        <th className="px-3 py-2.5 text-right">Avg Price</th>
        <th className="px-3 py-2.5 text-right">Sales Value</th>
        <th className="px-3 py-2.5 text-right">{filters.source === "orders" ? "Orders" : "Invoices"}</th>
        <th className="px-3 py-2.5">Dates</th>
      </tr>
    </thead>
  );

  return (
    <ReportDocument
      reportKey="sales-by-customer-item"
      title="Sales by Customer / Item / Date"
      subtitle="Recorded sales at the price on each transaction line. Values exclude VAT."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      summary={summary}
      onRefresh={() => void load(filters)}
      refreshing={loading}
      getExportPayload={canExport ? getExportPayload : undefined}
      error={error}
      isEmpty={!loading && !error && lines.length === 0}
      emptyMessage="No recorded sales match these filters."
      controls={
        <>
          <label className="min-w-[160px]">
            <span className={labelClass}>Source</span>
            <select value={filters.source} onChange={(e) => set("source")(e.target.value)} className={controlClass}>
              <option value="invoices">Customer invoices</option>
              <option value="orders">Sales orders</option>
            </select>
          </label>
          <label className="min-w-[180px]">
            <span className={labelClass}>Status</span>
            <select value={filters.status} onChange={(e) => set("status")(e.target.value)} className={controlClass}>
              {statuses.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClass}>Date from</span>
            <input type="date" value={filters.from} onChange={(e) => set("from")(e.target.value)} className={controlClass} />
          </label>
          <label>
            <span className={labelClass}>Date to</span>
            <input type="date" value={filters.to} onChange={(e) => set("to")(e.target.value)} className={controlClass} />
          </label>
          <label className="min-w-[200px]">
            <span className={labelClass}>Customer</span>
            <select value={filters.customerId} onChange={(e) => set("customerId")(e.target.value)} className={controlClass}>
              <option value="">All customers</option>
              {(report?.options.customers ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px]">
            <span className={labelClass}>Item</span>
            <select value={filters.productId} onChange={(e) => set("productId")(e.target.value)} className={controlClass}>
              <option value="">All items sold</option>
              {(report?.options.products ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="min-w-[180px]">
            <span className={labelClass}>Search</span>
            <input value={filters.search} onChange={(e) => set("search")(e.target.value)} placeholder="Item, SKU, customer, reference…" className={controlClass} />
          </label>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        {tab("customer", "Customer → Items")}
        {tab("item", "Item → Customers")}
        {tab("lines", "Lines by date")}
      </div>

      {view === "lines" ? (
        <ReportTable minWidth={900}>
          <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
            <tr>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">{filters.source === "orders" ? "Order" : "Invoice"}</th>
              <th className="px-3 py-2.5">Item</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5 text-right">Quantity</th>
              <th className="px-3 py-2.5 text-right">Unit Price</th>
              <th className="px-3 py-2.5 text-right">Line Value</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, index) => (
              <tr key={`${l.transactionId}-${index}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{l.date}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-900">{l.customerName}</div>
                  {l.customerCode ? <div className="text-xs text-slate-500">{l.customerCode}</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-900">{l.reference}</div>
                  <div className="text-xs text-slate-500">{[l.orderReference ? `SO ${l.orderReference}` : "", l.status].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="px-3 py-2 font-semibold text-slate-900">{l.productName}</td>
                <td className="px-3 py-2 text-slate-700">{l.sku || "-"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{qty(l.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {money(l.unitPrice)}
                  {l.discountPct ? <div className="text-xs text-slate-500">less {l.discountPct}%</div> : null}
                </td>
                <td className="px-3 py-2 text-right font-black tabular-nums">{money(l.lineValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
              <td className="px-3 py-2.5" colSpan={5}>Totals — {report?.summary.lines ?? 0} lines</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{qty(report?.summary.totalQuantity ?? 0)}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right tabular-nums">{money(report?.summary.totalValue ?? 0)}</td>
            </tr>
          </tfoot>
        </ReportTable>
      ) : null}

      {view === "customer" ? (
        <ReportTable minWidth={860}>
          {groupHead("Customer", "Item")}
          <tbody>
            {(report?.byCustomer ?? []).map((c) => (
              <Fragment key={c.customerId || c.customerName}>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-black text-slate-900">
                  <td className="px-3 py-2" colSpan={2}>
                    {c.customerName}
                    {c.customerCode ? <span className="ml-2 text-xs font-semibold text-slate-500">{c.customerCode}</span> : null}
                  </td>
                  {groupCells(c)}
                </tr>
                {c.items.map((i) => (
                  <tr key={`${c.customerId}-${i.productId || i.productName}`} className="border-t border-slate-100 text-slate-800">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      {i.productName}
                      {i.sku ? <span className="ml-2 text-xs text-slate-500">{i.sku}</span> : null}
                    </td>
                    {groupCells(i)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </ReportTable>
      ) : null}

      {view === "item" ? (
        <ReportTable minWidth={860}>
          {groupHead("Item", "Customer")}
          <tbody>
            {(report?.byProduct ?? []).map((p) => (
              <Fragment key={p.productId || p.productName}>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-black text-slate-900">
                  <td className="px-3 py-2" colSpan={2}>
                    {p.productName}
                    {p.sku ? <span className="ml-2 text-xs font-semibold text-slate-500">{p.sku}</span> : null}
                  </td>
                  {groupCells(p)}
                </tr>
                {p.customers.map((c) => (
                  <tr key={`${p.productId}-${c.customerId || c.customerName}`} className="border-t border-slate-100 text-slate-800">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      {c.customerName}
                      {c.customerCode ? <span className="ml-2 text-xs text-slate-500">{c.customerCode}</span> : null}
                    </td>
                    {groupCells(c)}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </ReportTable>
      ) : null}
    </ReportDocument>
  );
}
