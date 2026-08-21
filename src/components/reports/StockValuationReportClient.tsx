"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, formatQty, type ReportFilter } from "@/lib/vyron-report-exports";
import type { StockValuationRow } from "@/lib/vyron-reports-data";

const ALL = "__all__";

/**
 * Complete Stock Valuation.
 *
 * Reads vyron_cost_stock_items for the active company. The previous page
 * rendered twenty fixture balances from vyron-cost/manufacturing-data, so every
 * tenant saw the same invented stock.
 */
export default function StockValuationReportClient({
  rows,
  companyName,
  generatedAt,
  error,
}: {
  rows: StockValuationRow[];
  companyName: string;
  generatedAt: string;
  error: string | null;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [onHandOnly, setOnHandOnly] = useState(false);

  const types = useMemo(
    () => [...new Set(rows.map((r) => r.entityType).filter((t) => t && t !== "—"))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== ALL && r.entityType !== type) return false;
      if (onHandOnly && r.qtyOnHand <= 0) return false;
      if (term && !`${r.description} ${r.itemCode} ${r.entityType}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, type, onHandOnly]);

  const stats = useMemo(
    () => ({
      items: filtered.length,
      withStock: filtered.filter((r) => r.qtyOnHand > 0).length,
      value: filtered.reduce((s, r) => s + r.inventoryValue, 0),
      qty: filtered.reduce((s, r) => s + r.qtyOnHand, 0),
    }),
    [filtered]
  );

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (type !== ALL) list.push({ key: "type", label: "Item Type", value: type });
    if (onHandOnly) list.push({ key: "on_hand", label: "Showing", value: "Items with stock on hand" });
    return list;
  }, [search, type, onHandOnly]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "inventory-stock",
        title: "Complete Stock Valuation",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Stock Items", value: String(stats.items) },
          { label: "Items With Stock", value: String(stats.withStock) },
          { label: "Total Quantity", value: formatQty(stats.qty) },
          { label: "Stock Value", value: formatMoney(stats.value) },
        ],
        columns: [
          { key: "item_code", label: "Item Code" },
          { key: "description", label: "Description" },
          { key: "type", label: "Type" },
          { key: "unit", label: "Unit" },
          { key: "qty", label: "Qty On Hand" },
          { key: "cost", label: "Unit Cost" },
          { key: "value", label: "Stock Value" },
          { key: "status", label: "Status" },
        ],
        rows: filtered.map((r) => [
          r.itemCode,
          r.description,
          r.entityType,
          r.unit,
          formatQty(r.qtyOnHand),
          formatMoney(r.averageCost),
          formatMoney(r.inventoryValue),
          r.stockStatus,
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="inventory-stock"
      title="Complete Stock Valuation"
      subtitle="Raw materials, packaging and finished goods with quantity on hand and stock value."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      error={error}
      isEmpty={!error && rows.length === 0}
      emptyMessage="No stock items exist for this company."
      summary={[
        { label: "Stock Items", value: String(stats.items) },
        { label: "With Stock", value: String(stats.withStock) },
        { label: "Total Quantity", value: formatQty(stats.qty) },
        { label: "Stock Value", value: formatMoney(stats.value) },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item code or description…"
              className={controlClass}
            />
          </label>
          <label className="min-w-[170px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Item type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={controlClass}>
              <option value={ALL}>All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={onHandOnly}
              onChange={(e) => setOnHandOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs font-black text-slate-700">Only items with stock on hand</span>
          </label>
        </>
      }
    >
      <ReportTable minWidth={1040}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Item Code</th>
            <th className="px-3 py-2.5">Description</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Unit</th>
            <th className="px-3 py-2.5 text-right">Qty On Hand</th>
            <th className="px-3 py-2.5 text-right">Unit Cost</th>
            <th className="px-3 py-2.5 text-right">Stock Value</th>
            <th className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 whitespace-nowrap font-black text-slate-900">{r.itemCode}</td>
              <td className="px-3 py-2 font-semibold text-slate-800">{r.description}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.entityType}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.unit}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">
                {formatQty(r.qtyOnHand)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">
                {formatMoney(r.averageCost)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {formatMoney(r.inventoryValue)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.stockStatus}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No stock items match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={4}>
              Totals — {stats.items} item{stats.items === 1 ? "" : "s"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatQty(stats.qty)}</td>
            <td className="px-3 py-2.5" />
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(stats.value)}</td>
            <td className="px-3 py-2.5" />
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
