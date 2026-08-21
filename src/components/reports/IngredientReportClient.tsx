"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import { calculateMovementPercent, formatMoney, type Ingredient } from "@/lib/vyron-cost-data";
import type { ReportFilter } from "@/lib/vyron-report-exports";

const ALL = "__all__";

/**
 * Ingredient Movement Report.
 *
 * Movement is only meaningful where a previous cost was recorded. An ingredient
 * that has never been repriced has no movement to report, so it is shown as
 * "Not measured" and left out of the average rather than counted as 0%.
 */
export default function IngredientReportClient({
  ingredients,
  companyName,
  generatedAt,
}: {
  ingredients: Ingredient[];
  companyName: string;
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);

  const categories = useMemo(
    () => [...new Set(ingredients.map((i) => String(i.category || "").trim()).filter(Boolean))].sort(),
    [ingredients]
  );

  const rows = useMemo(
    () =>
      ingredients.map((ing) => {
        const previous = Number(ing.previous_cost) || 0;
        const current = Number(ing.purchase_cost) || 0;
        const measured = previous > 0;
        const movement = measured ? calculateMovementPercent(previous, current) : 0;
        const state = !measured ? "Not measured" : movement > 10 ? "High" : movement > 3 ? "Watch" : "Stable";
        return {
          id: String(ing.id),
          name: String(ing.ingredient_name || "—"),
          category: String(ing.category || "—"),
          purchaseUnit: String(ing.purchase_unit || "—"),
          recipeUnit: String(ing.recipe_unit || "—"),
          current,
          trueCost: Number(ing.true_unit_cost) || 0,
          movement,
          measured,
          state,
        };
      }),
    [ingredients]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== ALL && r.category !== category) return false;
      if (term && !`${r.name} ${r.category} ${r.purchaseUnit}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, category]);

  const stats = useMemo(() => {
    const measured = filtered.filter((r) => r.measured);
    const avg = measured.length ? measured.reduce((s, r) => s + r.movement, 0) / measured.length : 0;
    return {
      total: filtered.length,
      measured: measured.length,
      inflation: measured.filter((r) => r.movement > 5).length,
      avg,
      trueCost: filtered.reduce((s, r) => s + r.trueCost, 0),
    };
  }, [filtered]);

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (category !== ALL) list.push({ key: "category", label: "Category", value: category });
    return list;
  }, [search, category]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "ingredient-movement",
        title: "Ingredient Movement Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Ingredients", value: String(stats.total) },
          { label: "Movement Measured", value: String(stats.measured) },
          { label: "Above 5% Movement", value: String(stats.inflation) },
          { label: "Average Movement", value: stats.measured ? `${stats.avg.toFixed(1)}%` : "Not measured" },
          { label: "Combined True Cost", value: formatMoney(stats.trueCost) },
        ],
        columns: [
          { key: "ingredient", label: "Ingredient" },
          { key: "category", label: "Category" },
          { key: "purchase_unit", label: "Purchase Unit" },
          { key: "recipe_unit", label: "Recipe Unit" },
          { key: "current_cost", label: "Current Cost" },
          { key: "true_cost", label: "True Unit Cost" },
          { key: "movement", label: "Movement" },
          { key: "status", label: "Status" },
        ],
        rows: filtered.map((r) => [
          r.name,
          r.category,
          r.purchaseUnit,
          r.recipeUnit,
          formatMoney(r.current),
          formatMoney(r.trueCost),
          r.measured ? `${r.movement.toFixed(1)}%` : "Not measured",
          r.state,
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="ingredient-movement"
      title="Ingredient Movement Report"
      subtitle="Ingredient cost movement, yield rules and true usable cost."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      isEmpty={ingredients.length === 0}
      emptyMessage="No ingredients are loaded for this company."
      summary={[
        { label: "Ingredients", value: String(stats.total) },
        { label: "Measured", value: String(stats.measured) },
        { label: "Above 5%", value: String(stats.inflation) },
        { label: "Avg Movement", value: stats.measured ? `${stats.avg.toFixed(1)}%` : "Not measured" },
        { label: "True Cost", value: formatMoney(stats.trueCost) },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ingredient or category…"
              className={controlClass}
            />
          </label>
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
        </>
      }
    >
      <ReportTable minWidth={1040}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Ingredient</th>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">Purchase Unit</th>
            <th className="px-3 py-2.5">Recipe Unit</th>
            <th className="px-3 py-2.5 text-right">Current Cost</th>
            <th className="px-3 py-2.5 text-right">True Unit Cost</th>
            <th className="px-3 py-2.5 text-right">Movement</th>
            <th className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">{r.name}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.category}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.purchaseUnit}</td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-600">{r.recipeUnit}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900">
                {formatMoney(r.current)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-black tabular-nums text-slate-900">
                {formatMoney(r.trueCost)}
              </td>
              <td
                className={`px-3 py-2 whitespace-nowrap text-right font-black tabular-nums ${
                  !r.measured ? "text-slate-400" : r.movement > 5 ? "text-rose-700" : "text-slate-900"
                }`}
              >
                {r.measured ? `${r.movement.toFixed(1)}%` : "Not measured"}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                    r.state === "High"
                      ? "bg-rose-50 text-rose-700"
                      : r.state === "Watch"
                        ? "bg-amber-50 text-amber-800"
                        : r.state === "Not measured"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {r.state}
                </span>
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No ingredients match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </ReportTable>
    </ReportDocument>
  );
}
