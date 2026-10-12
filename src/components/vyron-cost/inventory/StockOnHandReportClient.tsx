"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import type { ReportFilter } from "@/lib/vyron-report-exports";
import {
  STOCK_ON_HAND_GROUPS,
  filterStockOnHandLines,
  stockOnHandExportTable,
  stockOnHandLineNotes,
  stockOnHandTotals,
  type StockOnHandGroup,
  type StockOnHandReport,
} from "@/lib/vyron-stock-on-hand-view";

const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: number) => Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 6 });
const controlClass = "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

/**
 * Stock on Hand as at a chosen date, rebuilt from the stock ledger (see vyron-stock-on-hand). The
 * figures, totals and export all come from vyron-stock-on-hand-view, so the export matches the screen.
 */
export default function StockOnHandReportClient({ companyName, today }: { companyName: string; today: string }) {
  const { canExport } = useReportsPermissions();
  const [asAt, setAsAt] = useState(today);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState<StockOnHandGroup | "all">("all");
  const [hideZero, setHideZero] = useState(false);
  const [report, setReport] = useState<StockOnHandReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/stock-on-hand?asAt=${encodeURIComponent(date)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "The report could not be loaded.");
      setReport(data.report as StockOnHandReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (asAt) void load(asAt);
  }, [asAt, load]);

  const lines = useMemo(() => report?.lines ?? [], [report]);
  const categories = useMemo(() => [...new Set(lines.map((l) => l.category))].sort(), [lines]);
  const filtered = useMemo(() => filterStockOnHandLines(lines, { search, category, group, hideZero }), [lines, search, category, group, hideZero]);
  const totals = useMemo(() => stockOnHandTotals(filtered), [filtered]);
  const groupTotals = useMemo(
    () => STOCK_ON_HAND_GROUPS.map((g) => ({ ...g, totals: stockOnHandTotals(filtered.filter((l) => l.group === g.key)) })).filter((g) => g.totals.items > 0),
    [filtered]
  );

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (group !== "all") list.push({ key: "group", label: "Stock", value: STOCK_ON_HAND_GROUPS.find((g) => g.key === group)?.label || group });
    if (category) list.push({ key: "category", label: "Category", value: category });
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (hideZero) list.push({ key: "zero", label: "Showing", value: "Non-zero balances only" });
    return list;
  }, [group, category, search, hideZero]);

  const summary = useMemo(
    () => [
      ...groupTotals.map((g) => ({ label: `${g.label} (Net)`, value: money(g.totals.netValue) })),
      { label: "Combined Net Value", value: money(totals.netValue) },
      { label: "Positive Stock Value", value: money(totals.positiveValue) },
      { label: "Negative Balances Value", value: money(totals.negativeValue) },
      { label: "Items / Negative / Not Valued", value: `${totals.items} / ${totals.negative} / ${totals.unvalued}` },
    ],
    [groupTotals, totals]
  );

  const period = useMemo(() => ({ kind: "asAt" as const, date: report?.asAt || asAt }), [report, asAt]);
  const generatedAt = report?.generatedAt || `${today}T00:00:00.000Z`;

  const getExportPayload = useCallback(() => {
    const table = stockOnHandExportTable(filtered);
    return buildReportPayload({
      reportKey: "stock-on-hand",
      title: "Stock on Hand",
      companyName,
      generatedAt,
      period,
      filters: activeFilters,
      summary: [...summary, ...(report?.disclosures || []).map((d, i) => ({ label: `Note ${i + 1}`, value: d }))],
      columns: table.columns,
      rows: table.rows,
    });
  }, [filtered, companyName, generatedAt, period, activeFilters, summary, report]);

  const r = report?.reconciliation;
  const differing = useMemo(() => lines.filter((l) => Math.abs(l.masterDifference) >= 1e-6), [lines]);

  return (
    <ReportDocument
      reportKey="stock-on-hand"
      title="Stock on Hand"
      subtitle="Raw materials and finished goods on hand at the end of the chosen date, rebuilt from the stock ledger."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      summary={summary}
      onRefresh={() => void load(asAt)}
      refreshing={loading}
      getExportPayload={canExport && report ? getExportPayload : undefined}
      error={error}
      isEmpty={!error && !loading && report !== null && lines.length === 0}
      emptyMessage="No stock items exist for this company."
      controls={
        <>
          <label className="min-w-[170px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">As at (end of day)</span>
            <input type="date" value={asAt} max={today} onChange={(e) => setAsAt(e.target.value)} className={controlClass} />
          </label>
          <label className="min-w-[170px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Stock</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as StockOnHandGroup | "all")} className={controlClass}>
              <option value="all">Raw materials and finished goods</option>
              {STOCK_ON_HAND_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[170px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item code, description or category…" className={controlClass} />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} className="h-4 w-4" />
            <span className="text-xs font-black text-slate-700">Hide zero balances</span>
          </label>
        </>
      }
    >
      {report?.disclosures.length ? (
        <div className="mb-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">About these figures</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-semibold">
            {report.disclosures.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ReportTable minWidth={1180}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Item Code / SKU</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Unit</th>
            <th className="px-3 py-2.5 text-right">Qty On Hand</th>
            <th className="px-3 py-2.5 text-right">Unit Cost</th>
            <th className="px-3 py-2.5 text-right">Stock Value</th>
            <th className="px-3 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {groupTotals.map((g) => (
            <Fragment key={g.key}>
              <tr className="border-t-2 border-slate-900 bg-slate-100">
                <td colSpan={8} className="px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900">
                  {g.label}
                </td>
              </tr>
              {filtered
                .filter((l) => l.group === g.key)
                .map((l) => {
                  const notes = stockOnHandLineNotes(l);
                  return (
                    <tr key={l.stockItemId} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{l.itemCode}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{l.description}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.category}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.unit}</td>
                      <td className={`px-3 py-2 whitespace-nowrap text-right tabular-nums ${l.qty < 0 ? "font-black text-red-700" : "text-slate-900"}`}>{qty(l.qty)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">{l.unitCost === null ? "Not available" : money(l.unitCost)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">{l.value === null ? "Not available" : money(l.value)}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-amber-800">{notes.join("; ")}</td>
                    </tr>
                  );
                })}
              <tr className="border-t border-slate-300 bg-slate-50 font-black text-slate-900">
                <td className="px-3 py-2" colSpan={6}>
                  {g.label} — {g.totals.items} item(s), {g.totals.negative} negative, {g.totals.unvalued} not valued
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{money(g.totals.netValue)}</td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-600">
                  Positive {money(g.totals.positiveValue)}; negative {money(g.totals.negativeValue)}
                </td>
              </tr>
            </Fragment>
          ))}
          {filtered.length === 0 && lines.length > 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No stock items match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={6}>
              Combined — {totals.items} item(s), {totals.negative} negative, {totals.unvalued} not valued
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{money(totals.netValue)}</td>
            <td className="px-3 py-2.5 text-xs font-semibold text-slate-600">
              Positive {money(totals.positiveValue)}; negative {money(totals.negativeValue)}
            </td>
          </tr>
        </tfoot>
      </ReportTable>

      {r ? (
        <div className="mt-4 rounded-[18px] border border-[rgba(11,32,43,0.10)] bg-white px-4 py-3 text-sm text-slate-800">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Reconciliation (all items, before filters)</div>
          <ul className="mt-1 space-y-1 font-semibold">
            <li>
              Ledger movements to the end of {report?.asAt}: {r.ledgerRowsToDate} row(s), net quantity {qty(r.movementQtyTotal)}. Item balances total {qty(r.reportQtyTotal)} —{" "}
              {r.reconciled ? "reconciled." : "NOT reconciled."}
            </li>
            <li>
              Stock Master basis (today&apos;s on hand less {r.ledgerRowsAfter} later movement(s)): {qty(r.masterQtyTotal)}; {r.itemsDifferingFromMaster} item(s) differ from the ledger.
            </li>
            {r.costChecked ? <li>Nothing has moved since this date: ledger cost differs from the Stock Master&apos;s average cost for {r.itemsCostDiffersFromMaster} item(s).</li> : null}
          </ul>
          {differing.length ? (
            <ReportTable minWidth={760}>
              <thead className="bg-slate-100 text-xs font-black uppercase tracking-[0.10em] text-slate-700">
                <tr>
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Ledger Qty</th>
                  <th className="px-3 py-2 text-right">Stock Master Qty</th>
                  <th className="px-3 py-2 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {differing.map((l) => (
                  <tr key={l.stockItemId} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-black">{l.itemCode}</td>
                    <td className="px-3 py-1.5">{l.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.qty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.masterQty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.masterDifference)}</td>
                  </tr>
                ))}
              </tbody>
            </ReportTable>
          ) : null}
        </div>
      ) : null}
    </ReportDocument>
  );
}
