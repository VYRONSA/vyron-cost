"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { useReportsPermissions } from "@/hooks/useModulePermissions";
import type { ReportFilter } from "@/lib/vyron-report-exports";
import {
  STOCK_ON_HAND_GROUPS,
  STOCK_ON_HAND_SECTIONS,
  filterStockOnHandLines,
  stockOnHandExportTable,
  stockOnHandLineNotes,
  stockOnHandSummary,
  stockOnHandTotals,
  type StockOnHandGroup,
  type StockOnHandReport,
} from "@/lib/vyron-stock-on-hand-view";

const money = (v: number) => `R${Number(v || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: number) => Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 6 });
const controlClass = "mt-1 w-full rounded-xl border border-[rgba(11,32,43,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";
const UNAVAILABLE = "History unavailable";

/**
 * Stock on Hand as at a chosen date, rebuilt from the stock ledger (see vyron-stock-on-hand). The
 * figures, totals, notes and export all come from vyron-stock-on-hand-view, so the export matches the screen.
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
  const sectionTotals = useMemo(
    () => STOCK_ON_HAND_SECTIONS.map((s) => ({ ...s, totals: stockOnHandTotals(filtered.filter(s.matches)) })).filter((s) => s.totals.items > 0),
    [filtered]
  );
  const rawTotals = useMemo(() => stockOnHandTotals(filtered.filter((l) => l.group === "raw_materials")), [filtered]);
  const established = report?.historyAvailable !== false;

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (group !== "all") list.push({ key: "group", label: "Stock", value: STOCK_ON_HAND_GROUPS.find((g) => g.key === group)?.label || group });
    if (category) list.push({ key: "category", label: "Category", value: category });
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (hideZero) list.push({ key: "zero", label: "Showing", value: "Non-zero balances only" });
    return list;
  }, [group, category, search, hideZero]);

  const summary = useMemo(() => (report ? stockOnHandSummary(report, filtered) : []), [report, filtered]);
  // On screen the as-at date and basis are already in the report header; the exports keep them.
  const screenSummary = useMemo(() => summary.filter((m) => m.label !== "As At" && m.label !== "Basis"), [summary]);
  const period = useMemo(() => ({ kind: "asAt" as const, date: report?.asAt || asAt }), [report, asAt]);
  const generatedAt = report?.generatedAt || `${today}T00:00:00.000Z`;

  const getExportPayload = useCallback(() => {
    const table = stockOnHandExportTable(filtered);
    // Eleven columns do not fit a portrait page legibly.
    return {
      ...buildReportPayload({
        reportKey: "stock-on-hand",
        title: "Stock on Hand",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [...summary, ...(report?.disclosures || []).map((d, i) => ({ label: `Note ${i + 1} (${d.level === "critical" ? "Critical" : d.level === "warning" ? "Warning" : "Information"})`, value: d.text }))],
        columns: table.columns,
        rows: table.rows,
      }),
      pdfOrientation: "landscape" as const,
    };
  }, [filtered, companyName, generatedAt, period, activeFilters, summary, report]);

  const r = report?.reconciliation;
  const differing = useMemo(() => lines.filter((l) => l.masterDifference !== null && Math.abs(l.masterDifference) >= 1e-6), [lines]);
  const critical = report?.disclosures.filter((d) => d.level === "critical") ?? [];
  const other = report?.disclosures.filter((d) => d.level !== "critical") ?? [];

  return (
    <ReportDocument
      reportKey="stock-on-hand"
      title="Stock on Hand"
      subtitle="Ledger balances of raw materials and finished goods at the end of the chosen date, reconstructed from recorded stock movements — not a physical count."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      summary={screenSummary}
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
      {critical.length ? (
        <div role="alert" data-testid="soh-critical" className="mb-4 rounded-[18px] border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-red-800">Historical stock cannot be established</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-semibold">
            {critical.map((d) => (
              <li key={d.text}>{d.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {other.length ? (
        <div data-testid="soh-disclosures" className="mb-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">How to read these figures</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-semibold">
            {other.map((d) => (
              <li key={d.text}>
                {d.level === "warning" ? <span className="mr-1 font-black text-amber-800">Incomplete:</span> : null}
                {d.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ReportTable minWidth={1280}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Item Code / SKU</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Unit</th>
            <th className="px-3 py-2.5 text-right">Ledger Balance</th>
            <th className="px-3 py-2.5 text-right">Verified Count</th>
            <th className="px-3 py-2.5 text-right">Unit Cost</th>
            <th className="px-3 py-2.5 text-right">Ledger Value</th>
            <th className="px-3 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sectionTotals.map((g) => (
            <Fragment key={g.key}>
              <tr className="border-t-2 border-slate-900 bg-slate-100">
                <td colSpan={9} className="px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-900">
                  {g.label}
                </td>
              </tr>
              {filtered
                .filter(g.matches)
                .map((l) => (
                  <tr key={l.stockItemId} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{l.itemCode}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{l.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.category}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.unit}</td>
                    <td className={`px-3 py-2 whitespace-nowrap text-right tabular-nums ${l.qty === null ? "font-black text-red-700" : l.qty < 0 ? "font-black text-red-700" : "text-slate-900"}`}>
                      {l.qty === null ? UNAVAILABLE : qty(l.qty)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">{l.verifiedQty === null ? "—" : qty(l.verifiedQty)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">{l.unitCost === null ? "Not available" : money(l.unitCost)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                      {l.qty === null ? UNAVAILABLE : l.value === null ? "Not available" : money(l.value)}
                    </td>
                    <td className="px-3 py-2 text-xs font-semibold text-amber-800">
                      {[...stockOnHandLineNotes(l), ...(l.lastCount && l.verifiedQty === null ? [`Last counted ${l.lastCount.date}: ${qty(l.lastCount.countedQty)}`] : [])].join("; ")}
                    </td>
                  </tr>
                ))}
              <tr className="border-t border-slate-300 bg-slate-50 font-black text-slate-900">
                <td className="px-3 py-2" colSpan={7}>
                  {g.label} — {g.totals.items} item(s), {g.totals.negative} negative, {g.totals.unvalued} not valued
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{established ? money(g.totals.netValue) : "Not established"}</td>
                <td className="px-3 py-2 text-xs font-semibold text-slate-600">
                  {established ? `Positive ${money(g.totals.positiveValue)}; negative ${money(g.totals.negativeValue)}` : ""}
                </td>
              </tr>
              {g.key === "packaging" || (g.key === "ingredients" && !sectionTotals.some((s) => s.key === "packaging")) ? (
                <tr className="border-t-2 border-slate-400 bg-slate-100 font-black text-slate-900">
                  <td className="px-3 py-2" colSpan={7}>
                    Raw Materials — {rawTotals.items} item(s), {rawTotals.negative} negative, {rawTotals.unvalued} not valued
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{established ? money(rawTotals.netValue) : "Not established"}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-600">
                    {established ? `Positive ${money(rawTotals.positiveValue)}; negative ${money(rawTotals.negativeValue)}` : ""}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {filtered.length === 0 && lines.length > 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No stock items match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={7}>
              Combined — {totals.items} item(s), {totals.negative} negative, {totals.unvalued} not valued
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{established ? money(totals.netValue) : "Not established"}</td>
            <td className="px-3 py-2.5 text-xs font-semibold text-slate-600">
              {established ? `Positive ${money(totals.positiveValue)}; negative ${money(totals.negativeValue)}` : ""}
            </td>
          </tr>
        </tfoot>
      </ReportTable>

      {r && established ? (
        <div data-testid="soh-reconciliation" className="mt-4 rounded-[18px] border border-[rgba(11,32,43,0.10)] bg-white px-4 py-3 text-sm text-slate-800">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Reconciliation (all items, before filters)</div>
          <ul className="mt-1 space-y-1 font-semibold">
            <li>
              Arithmetic check: {r.ledgerRowsToDate} recorded movement(s) to the end of {report?.asAt} net to {qty(r.movementQtyTotal)}; the item balances total {qty(r.reportQtyTotal)} —{" "}
              {r.reconciled ? "they agree." : "they DO NOT agree."} This confirms the report adds up the recorded movements. It does not confirm that the ledger is complete or that physical stock agreed.
            </li>
            <li>
              Physical counts: {r.itemsVerified} item(s) verified by a posted count dated {report?.asAt}
              {r.itemsVerified ? `; ${r.itemsVerifiedDiffering} of them differ from the ledger balance.` : "."}
            </li>
            <li>
              Stock Master basis (today&apos;s on hand less {r.ledgerRowsAfter} later movement(s)): {qty(r.masterQtyTotal)}; {r.itemsDifferingFromMaster} item(s) differ from the ledger.
            </li>
            {r.costChecked ? <li>Nothing has moved since this date: the ledger cost differs from the Stock Master&apos;s average cost for {r.itemsCostDiffersFromMaster} item(s).</li> : null}
          </ul>
          {differing.length ? (
            <ReportTable minWidth={760}>
              <thead className="bg-slate-100 text-xs font-black uppercase tracking-[0.10em] text-slate-700">
                <tr>
                  <th className="px-3 py-2">Item Code</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Ledger Balance</th>
                  <th className="px-3 py-2 text-right">Stock Master Qty</th>
                  <th className="px-3 py-2 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {differing.map((l) => (
                  <tr key={l.stockItemId} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-black">{l.itemCode}</td>
                    <td className="px-3 py-1.5">{l.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.qty ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.masterQty)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{qty(l.masterDifference ?? 0)}</td>
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
