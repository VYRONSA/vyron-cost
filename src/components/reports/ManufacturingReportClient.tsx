"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, formatQty, type ReportFilter } from "@/lib/vyron-report-exports";
import type { ManufacturingBatchRow } from "@/lib/vyron-reports-data";

/**
 * Manufacturing Report.
 *
 * Reads vyron_manufacturing_batches for the active company. Where no batches
 * have been produced the report says so rather than printing fixture batches,
 * which is what the previous page did.
 */
export default function ManufacturingReportClient({
  rows,
  companyName,
  generatedAt,
  from,
  to,
  error,
}: {
  rows: ManufacturingBatchRow[];
  companyName: string;
  generatedAt: string;
  from: string;
  to: string;
  error: string | null;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => `${r.batchNumber} ${r.productName} ${r.status}`.toLowerCase().includes(term));
  }, [rows, search]);

  const stats = useMemo(
    () => ({
      batches: filtered.length,
      produced: filtered.reduce((s, r) => s + r.actualQty, 0),
      cost: filtered.reduce((s, r) => s + r.batchCost, 0),
      variance: filtered.reduce((s, r) => s + r.varianceQty, 0),
    }),
    [filtered]
  );

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
        reportKey: "manufacturing",
        title: "Manufacturing Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Batches", value: String(stats.batches) },
          { label: "Quantity Produced", value: formatQty(stats.produced) },
          { label: "Yield Variance", value: formatQty(stats.variance) },
          { label: "Batch Cost", value: formatMoney(stats.cost) },
        ],
        columns: [
          { key: "batch", label: "Batch" },
          { key: "product", label: "Product" },
          { key: "date", label: "Batch Date" },
          { key: "status", label: "Status" },
          { key: "planned", label: "Planned Qty" },
          { key: "actual", label: "Actual Qty" },
          { key: "variance", label: "Variance" },
          { key: "cost", label: "Batch Cost" },
          { key: "unit_cost", label: "Unit Cost" },
        ],
        rows: filtered.map((r) => [
          r.batchNumber,
          r.productName,
          r.batchDate || "—",
          r.status,
          formatQty(r.plannedQty),
          formatQty(r.actualQty),
          formatQty(r.varianceQty),
          formatMoney(r.batchCost),
          formatMoney(r.unitCost),
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="manufacturing"
      title="Manufacturing Report"
      subtitle="Batch history, yield variance and finished goods production cost."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      error={error}
      isEmpty={!error && rows.length === 0}
      emptyMessage="No manufacturing batches have been recorded for this company in the selected period."
      summary={[
        { label: "Batches", value: String(stats.batches) },
        { label: "Produced", value: formatQty(stats.produced) },
        { label: "Yield Variance", value: formatQty(stats.variance) },
        { label: "Batch Cost", value: formatMoney(stats.cost) },
      ]}
      controls={
        <label className="min-w-[240px]">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Batch, product or status…"
            className={controlClass}
          />
        </label>
      }
    >
      <ReportTable minWidth={1080}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Batch</th>
            <th className="px-3 py-2.5">Product</th>
            <th className="px-3 py-2.5">Batch Date</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5 text-right">Planned</th>
            <th className="px-3 py-2.5 text-right">Actual</th>
            <th className="px-3 py-2.5 text-right">Variance</th>
            <th className="px-3 py-2.5 text-right">Batch Cost</th>
            <th className="px-3 py-2.5 text-right">Unit Cost</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{r.batchNumber}</td>
              <td className="px-3 py-2 font-semibold text-slate-800">{r.productName}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.batchDate || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.status}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatQty(r.plannedQty)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatQty(r.actualQty)}</td>
              <td
                className={`px-3 py-2 text-right font-black tabular-nums ${
                  r.varianceQty < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {formatQty(r.varianceQty)}
              </td>
              <td className="px-3 py-2 text-right font-black tabular-nums text-slate-900">
                {formatMoney(r.batchCost)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatMoney(r.unitCost)}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No batches match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </ReportTable>
    </ReportDocument>
  );
}
