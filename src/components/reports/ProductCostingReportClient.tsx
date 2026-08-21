"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { formatMoney, type ProductCostLine } from "@/lib/vyron-cost-data";
import type { ReportFilter } from "@/lib/vyron-report-exports";

const ALL = "__all__";

/**
 * Product Costing Lines Report.
 *
 * When no BOM cost lines have been captured the report shows the empty state
 * rather than a page of zero totals. Zeros read as "every line costs nothing",
 * which is a different and much worse claim than "nothing has been captured".
 */
export default function ProductCostingReportClient({
  lines,
  companyName,
  generatedAt,
}: {
  lines: ProductCostLine[];
  companyName: string;
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [lineType, setLineType] = useState(ALL);

  const lineTypes = useMemo(
    () => [...new Set(lines.map((l) => String(l.line_type || "").trim()).filter(Boolean))].sort(),
    [lines]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (lineType !== ALL && String(l.line_type || "") !== lineType) return false;
      if (!term) return true;
      return [l.product_name || "", l.line_type, l.line_name, l.unit, l.source_sheet || ""]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [lines, search, lineType]);

  const lineCost = (l: ProductCostLine) => Number(l.line_cost || l.line_cost_imported || 0);

  const stats = useMemo(
    () => ({
      total: filtered.length,
      ingredients: filtered.filter((l) => l.line_type === "Ingredient").length,
      packaging: filtered.filter((l) => l.line_type === "Packaging").length,
      value: filtered.reduce((s, l) => s + lineCost(l), 0),
    }),
    [filtered]
  );

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (lineType !== ALL) list.push({ key: "line_type", label: "Line Type", value: lineType });
    return list;
  }, [search, lineType]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "product-costings",
        title: "Product Costing Lines Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Cost Lines", value: String(stats.total) },
          { label: "Ingredient Lines", value: String(stats.ingredients) },
          { label: "Packaging Lines", value: String(stats.packaging) },
          { label: "Total Line Value", value: formatMoney(stats.value) },
        ],
        columns: [
          { key: "product", label: "Product" },
          { key: "line_type", label: "Type" },
          { key: "line_name", label: "Line" },
          { key: "quantity", label: "Qty" },
          { key: "unit", label: "Unit" },
          { key: "unit_cost", label: "Unit Cost" },
          { key: "wastage", label: "Waste %" },
          { key: "line_cost", label: "Line Cost" },
          { key: "source", label: "Source" },
        ],
        rows: filtered.map((l) => [
          String(l.product_name || "Linked Product"),
          String(l.line_type || "—"),
          String(l.line_name || "—"),
          Number(l.quantity || 0).toFixed(3),
          String(l.unit || "—"),
          formatMoney(Number(l.unit_cost || 0)),
          `${Number(l.wastage_percent || 0).toFixed(1)}%`,
          formatMoney(lineCost(l)),
          String(l.source_sheet || "Manual"),
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="product-costings"
      title="Product Costing Lines Report"
      subtitle="BOM costing lines for ingredients, packaging, salaries, wastage and overheads."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      isEmpty={lines.length === 0}
      emptyMessage="No BOM costing lines have been captured for this company yet. Import or build a product costing to populate this report."
      summary={[
        { label: "Cost Lines", value: String(stats.total) },
        { label: "Ingredient Lines", value: String(stats.ingredients) },
        { label: "Packaging Lines", value: String(stats.packaging) },
        { label: "Line Value", value: formatMoney(stats.value) },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product, line or source…"
              className={controlClass}
            />
          </label>
          <label className="min-w-[180px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Line type</span>
            <select value={lineType} onChange={(e) => setLineType(e.target.value)} className={controlClass}>
              <option value={ALL}>All line types</option>
              {lineTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <ReportTable minWidth={1120}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Product</th>
            <th className="px-3 py-2.5">Type</th>
            <th className="px-3 py-2.5">Line</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5">Unit</th>
            <th className="px-3 py-2.5 text-right">Unit Cost</th>
            <th className="px-3 py-2.5 text-right">Waste %</th>
            <th className="px-3 py-2.5 text-right">Line Cost</th>
            <th className="px-3 py-2.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => (
            <tr key={String(l.id)} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">{l.product_name || "Linked Product"}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{l.line_type}</td>
              <td className="px-3 py-2 font-semibold text-slate-700">{l.line_name}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-700">
                {Number(l.quantity || 0).toFixed(3)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.unit}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-900">
                {formatMoney(Number(l.unit_cost || 0))}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-600">
                {Number(l.wastage_percent || 0).toFixed(1)}%
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {formatMoney(lineCost(l))}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-600">{l.source_sheet || "Manual"}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No cost lines match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={7}>
              Total line value — {stats.total} line{stats.total === 1 ? "" : "s"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(stats.value)}</td>
            <td className="px-3 py-2.5" />
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
