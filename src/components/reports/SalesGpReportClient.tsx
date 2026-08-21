"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney } from "@/lib/vyron-report-exports";
import type { ReportFilter } from "@/lib/vyron-report-exports";

export type SalesInvoiceRow = {
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  sales: number;
  cost: number;
  gp: number;
  gpPct: number;
};

export type SalesGpData = {
  metrics: { revenue: number; costOfSales: number; grossProfit: number; gpPct: number };
  invoices: SalesInvoiceRow[];
};

/**
 * Customer Sales & GP Report.
 *
 * Date range lives in the URL so a report a client is looking at can be shared,
 * reloaded or bookmarked and still show the same period. Changing the range
 * navigates once; there is no polling and no refetch loop.
 */
export default function SalesGpReportClient({
  data,
  companyName,
  generatedAt,
  from,
  to,
  error,
}: {
  data: SalesGpData;
  companyName: string;
  generatedAt: string;
  from: string;
  to: string;
  error: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");

  const applyRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const next = new URLSearchParams(params.toString());
      if (nextFrom) next.set("from", nextFrom);
      else next.delete("from");
      if (nextTo) next.set("to", nextTo);
      else next.delete("to");
      setPending(true);
      router.replace(`/reports/sales?${next.toString()}`);
      // The server component re-renders; clear the spinner on the next paint.
      window.setTimeout(() => setPending(false), 900);
    },
    [params, router]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.invoices;
    return data.invoices.filter((i) =>
      `${i.invoiceNumber} ${i.customerName}`.toLowerCase().includes(term)
    );
  }, [data.invoices, search]);

  const totals = useMemo(() => {
    const sales = filtered.reduce((s, i) => s + i.sales, 0);
    const cost = filtered.reduce((s, i) => s + i.cost, 0);
    const gp = sales - cost;
    return { sales, cost, gp, gpPct: sales > 0 ? (gp / sales) * 100 : 0 };
  }, [filtered]);

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (from) list.push({ key: "from", label: "From", value: from });
    if (to) list.push({ key: "to", label: "To", value: to });
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    return list;
  }, [from, to, search]);

  const period = useMemo(() => ({ kind: "range" as const, from: from || null, to: to || null }), [from, to]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "sales",
        title: "Customer Sales & GP Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Revenue", value: formatMoney(totals.sales) },
          { label: "Cost of Sales", value: formatMoney(totals.cost) },
          { label: "Gross Profit", value: formatMoney(totals.gp) },
          { label: "GP %", value: `${totals.gpPct.toFixed(1)}%` },
          { label: "Invoices", value: String(filtered.length) },
        ],
        columns: [
          { key: "invoice", label: "Invoice" },
          { key: "customer", label: "Customer" },
          { key: "date", label: "Invoice Date" },
          { key: "sales", label: "Sales" },
          { key: "cost", label: "Cost" },
          { key: "gp", label: "Gross Profit" },
          { key: "gp_pct", label: "GP %" },
        ],
        rows: filtered.map((i) => [
          i.invoiceNumber,
          i.customerName,
          i.invoiceDate,
          formatMoney(i.sales),
          formatMoney(i.cost),
          formatMoney(i.gp),
          `${i.gpPct.toFixed(1)}%`,
        ]),
      }),
    [filtered, totals, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="sales"
      title="Customer Sales & GP Report"
      subtitle="Sales, cost of sales and gross profit by customer invoice."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      onRefresh={() => applyRange(from, to)}
      refreshing={pending}
      error={error}
      isEmpty={!error && data.invoices.length === 0}
      emptyMessage="No customer invoices fall in the selected period."
      summary={[
        { label: "Revenue", value: formatMoney(totals.sales) },
        { label: "Cost of Sales", value: formatMoney(totals.cost) },
        { label: "Gross Profit", value: formatMoney(totals.gp) },
        { label: "GP %", value: `${totals.gpPct.toFixed(1)}%` },
        { label: "Invoices", value: String(filtered.length) },
      ]}
      controls={
        <>
          <label className="min-w-[160px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">From</span>
            <input
              type="date"
              defaultValue={from}
              onChange={(e) => applyRange(e.target.value, to)}
              className={controlClass}
            />
          </label>
          <label className="min-w-[160px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">To</span>
            <input
              type="date"
              defaultValue={to}
              onChange={(e) => applyRange(from, e.target.value)}
              className={controlClass}
            />
          </label>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Invoice or customer…"
              className={controlClass}
            />
          </label>
        </>
      }
    >
      <ReportTable minWidth={1000}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Invoice</th>
            <th className="px-3 py-2.5">Customer</th>
            <th className="px-3 py-2.5">Invoice Date</th>
            <th className="px-3 py-2.5 text-right">Sales</th>
            <th className="px-3 py-2.5 text-right">Cost</th>
            <th className="px-3 py-2.5 text-right">Gross Profit</th>
            <th className="px-3 py-2.5 text-right">GP %</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.invoiceNumber} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{i.invoiceNumber}</td>
              <td className="px-3 py-2 font-semibold text-slate-800">{i.customerName}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{i.invoiceDate}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {formatMoney(i.sales)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {formatMoney(i.cost)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {formatMoney(i.gp)}
              </td>
              <td
                className={`px-3 py-2 whitespace-nowrap text-right font-black tabular-nums ${
                  i.gpPct < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {i.gpPct.toFixed(1)}%
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? (
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
              Totals — {filtered.length} invoice{filtered.length === 1 ? "" : "s"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totals.sales)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totals.cost)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(totals.gp)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{totals.gpPct.toFixed(1)}%</td>
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
