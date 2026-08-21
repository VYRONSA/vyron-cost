"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, periodLabel } from "@/components/reports/ReportDocument";
import { calculateGpPercent, calculateSuggestedPrice, formatMoney, type Product } from "@/lib/vyron-cost-data";
import type { ReportFilter, TenantReportExportPayload } from "@/lib/vyron-report-exports";
import { buildReportFileName } from "@/lib/vyron-report-exports";

const ALL = "__all__";

/**
 * Product Margin Report ("Product GP").
 *
 * A product with no selling price is NOT a zero-margin product — it is a
 * product that has not been priced. calculateGpPercent() returns 0 for it,
 * which is the right answer for a single row but the wrong input to an average:
 * folding unpriced products into "Average GP" drags the figure toward zero and
 * misstates the portfolio. Unpriced products are therefore reported separately
 * and excluded from the averages, never silently counted as 0%.
 */
export default function ProductMarginReportClient({
  products,
  companyName,
  generatedAt,
}: {
  products: Product[];
  companyName: string;
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const categories = useMemo(
    () => [...new Set(products.map((p) => String(p.category || "").trim()).filter(Boolean))].sort(),
    [products]
  );

  const rows = useMemo(() => {
    return products.map((product) => {
      const sellingPrice = Number(product.selling_price) || 0;
      const cost = Number(product.total_cost) || 0;
      const targetGp = Number(product.target_gp) || 0;
      const priced = sellingPrice > 0;
      const gpValue = priced ? sellingPrice - cost : 0;
      const gpPercent = calculateGpPercent(sellingPrice, cost);
      const variance = priced ? gpPercent - targetGp : 0;
      const suggested = calculateSuggestedPrice(cost, targetGp);
      const state = !priced ? "Not Priced" : variance < -5 ? "Critical" : variance < 0 ? "Review" : "Healthy";
      return {
        id: String(product.id),
        name: String(product.product_name || "—"),
        category: String(product.category || "—"),
        sellingPrice,
        cost,
        gpValue,
        gpPercent,
        targetGp,
        variance,
        suggested,
        priced,
        state,
      };
    });
  }, [products]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== ALL && row.category !== category) return false;
      if (status !== ALL && row.state !== status) return false;
      if (term && !`${row.name} ${row.category}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, category, status]);

  const stats = useMemo(() => {
    const priced = filtered.filter((r) => r.priced);
    const avgGp = priced.length ? priced.reduce((s, r) => s + r.gpPercent, 0) / priced.length : 0;
    const belowTarget = priced.filter((r) => r.variance < 0);
    // Per-unit price gap only. No assumed sales volume is applied, because none
    // is measured here - an invented unit count would fabricate a rand figure.
    const priceGap = belowTarget.reduce((s, r) => s + Math.max(r.suggested - r.sellingPrice, 0), 0);
    return {
      total: filtered.length,
      priced: priced.length,
      unpriced: filtered.length - priced.length,
      avgGp,
      belowTarget: belowTarget.length,
      priceGap,
    };
  }, [filtered]);

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (category !== ALL) list.push({ key: "category", label: "Category", value: category });
    if (status !== ALL) list.push({ key: "status", label: "Status", value: status });
    return list;
  }, [search, category, status]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback((): TenantReportExportPayload => {
    return {
      reportKey: "product-margins",
      title: "Product Margin Report",
      subtitle: periodLabel(period) || "",
      fileName: buildReportFileName("product-margins", companyName, generatedAt),
      generatedAt,
      branding: { companyName, tradingName: null },
      filters: activeFilters,
      summary: [
        { label: "Products", value: String(stats.total) },
        { label: "Priced Products", value: String(stats.priced) },
        { label: "Unpriced Products", value: String(stats.unpriced) },
        { label: "Average GP %", value: `${stats.avgGp.toFixed(1)}%` },
        { label: "Below Target GP", value: String(stats.belowTarget) },
        { label: "Price Gap (per unit)", value: formatMoney(stats.priceGap) },
      ],
      columns: [
        { key: "product", label: "Product" },
        { key: "category", label: "Category" },
        { key: "selling_price", label: "Selling Price" },
        { key: "cost", label: "Cost" },
        { key: "gp_value", label: "GP" },
        { key: "gp_percent", label: "GP %" },
        { key: "target_gp", label: "Target GP %" },
        { key: "variance", label: "Variance" },
        { key: "status", label: "Status" },
      ],
      rows: filtered.map((r) => [
        r.name,
        r.category,
        r.priced ? formatMoney(r.sellingPrice) : "Not priced",
        formatMoney(r.cost),
        r.priced ? formatMoney(r.gpValue) : "—",
        r.priced ? `${r.gpPercent.toFixed(1)}%` : "—",
        `${r.targetGp.toFixed(1)}%`,
        r.priced ? `${r.variance.toFixed(1)}%` : "—",
        r.state,
      ]),
    };
  }, [filtered, stats, activeFilters, companyName, generatedAt, period]);

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="product-margins"
      title="Product Margin Report"
      subtitle="Product-level cost, selling price, gross profit and price-review status."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      isEmpty={products.length === 0}
      emptyMessage="No products are loaded for this company, so no margin can be reported."
      summary={[
        { label: "Products", value: String(stats.total) },
        { label: "Priced", value: String(stats.priced) },
        { label: "Unpriced", value: String(stats.unpriced) },
        { label: "Average GP", value: `${stats.avgGp.toFixed(1)}%` },
        { label: "Below Target", value: String(stats.belowTarget) },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product or category…"
              className={controlClass}
            />
          </label>
          <label className="min-w-[170px]">
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
          <label className="min-w-[150px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={controlClass}>
              <option value={ALL}>All statuses</option>
              {["Healthy", "Review", "Critical", "Not Priced"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </>
      }
    >
      <ReportTable minWidth={1080}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Product</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5 text-right">Selling Price</th>
            <th className="px-3 py-2.5 text-right">Cost</th>
            <th className="px-3 py-2.5 text-right">GP</th>
            <th className="px-3 py-2.5 text-right">GP %</th>
            <th className="px-3 py-2.5 text-right">Target GP</th>
            <th className="px-3 py-2.5 text-right">Variance</th>
            <th className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">{row.name}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{row.category}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {row.priced ? formatMoney(row.sellingPrice) : <span className="text-slate-400">Not priced</span>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {formatMoney(row.cost)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {row.priced ? formatMoney(row.gpValue) : "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {row.priced ? `${row.gpPercent.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-600">
                {row.targetGp.toFixed(1)}%
              </td>
              <td
                className={`px-3 py-2 whitespace-nowrap text-right font-black tabular-nums ${
                  !row.priced ? "text-slate-400" : row.variance < 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {row.priced ? `${row.variance.toFixed(1)}%` : "—"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                    row.state === "Critical"
                      ? "bg-rose-50 text-rose-700"
                      : row.state === "Review"
                        ? "bg-amber-50 text-amber-800"
                        : row.state === "Not Priced"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {row.state}
                </span>
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No products match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={2}>
              Totals — {stats.total} product{stats.total === 1 ? "" : "s"} ({stats.priced} priced)
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">
              {formatMoney(filtered.reduce((s, r) => s + r.sellingPrice, 0))}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">
              {formatMoney(filtered.reduce((s, r) => s + r.cost, 0))}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">
              {formatMoney(filtered.reduce((s, r) => s + r.gpValue, 0))}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{stats.avgGp.toFixed(1)}%</td>
            <td className="px-3 py-2.5" colSpan={3} />
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
