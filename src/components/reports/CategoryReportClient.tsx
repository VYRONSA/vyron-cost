"use client";

import { useCallback, useMemo, useState } from "react";
import ReportDocument, { ReportTable, buildReportPayload } from "@/components/reports/ReportDocument";
import type { Category, Ingredient, Product, Recipe, Supplier } from "@/lib/vyron-cost-data";
import type { ReportFilter } from "@/lib/vyron-report-exports";

/**
 * Category Usage Report.
 *
 * The report answers "which categories are in use, and where", so the category
 * universe is the union of the category master AND every category actually
 * referenced by a product, ingredient, supplier or recipe. Driving it from the
 * master table alone produced an empty report for any company that categorises
 * its records without maintaining a separate category master — which is the
 * common case. Rows are marked so an operator can see which categories exist
 * only as free text and ought to be added to the master.
 */
export default function CategoryReportClient({
  categories,
  products,
  ingredients,
  suppliers,
  recipes,
  companyName,
  generatedAt,
}: {
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  recipes: Recipe[];
  companyName: string;
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [unmasteredOnly, setUnmasteredOnly] = useState(false);

  const rows = useMemo(() => {
    const masterNames = new Set(
      categories.map((c) => String(c.category_name || "").trim()).filter(Boolean)
    );

    const used = new Set<string>();
    const collect = (values: Array<string | null | undefined>) => {
      for (const v of values) {
        const name = String(v || "").trim();
        if (name) used.add(name);
      }
    };
    collect(products.map((p) => p.category));
    collect(ingredients.map((i) => i.category));
    collect(suppliers.map((s) => s.category));
    collect(recipes.map((r) => r.category));

    const all = [...new Set([...masterNames, ...used])].sort((a, b) => a.localeCompare(b));

    return all.map((name) => {
      const productCount = products.filter((p) => String(p.category || "").trim() === name).length;
      const ingredientCount = ingredients.filter((i) => String(i.category || "").trim() === name).length;
      const supplierCount = suppliers.filter((s) => String(s.category || "").trim() === name).length;
      const recipeCount = recipes.filter((r) => String(r.category || "").trim() === name).length;
      return {
        name,
        inMaster: masterNames.has(name),
        productCount,
        ingredientCount,
        supplierCount,
        recipeCount,
        total: productCount + ingredientCount + supplierCount + recipeCount,
      };
    });
  }, [categories, products, ingredients, suppliers, recipes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (unmasteredOnly && r.inMaster) return false;
      if (term && !r.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, search, unmasteredOnly]);

  const stats = useMemo(
    () => ({
      categories: filtered.length,
      inMaster: filtered.filter((r) => r.inMaster).length,
      unmastered: filtered.filter((r) => !r.inMaster).length,
      products: filtered.reduce((s, r) => s + r.productCount, 0),
      ingredients: filtered.reduce((s, r) => s + r.ingredientCount, 0),
    }),
    [filtered]
  );

  const activeFilters = useMemo<ReportFilter[]>(() => {
    const list: ReportFilter[] = [];
    if (search.trim()) list.push({ key: "search", label: "Search", value: search.trim() });
    if (unmasteredOnly) list.push({ key: "unmastered", label: "Showing", value: "Not in category master" });
    return list;
  }, [search, unmasteredOnly]);

  const period = useMemo(() => ({ kind: "asAt" as const, date: generatedAt.slice(0, 10) }), [generatedAt]);

  const getExportPayload = useCallback(
    () =>
      buildReportPayload({
        reportKey: "category-usage",
        title: "Category Usage Report",
        companyName,
        generatedAt,
        period,
        filters: activeFilters,
        summary: [
          { label: "Categories In Use", value: String(stats.categories) },
          { label: "In Category Master", value: String(stats.inMaster) },
          { label: "Not In Master", value: String(stats.unmastered) },
          { label: "Products Categorised", value: String(stats.products) },
          { label: "Ingredients Categorised", value: String(stats.ingredients) },
        ],
        columns: [
          { key: "category", label: "Category" },
          { key: "in_master", label: "In Master" },
          { key: "products", label: "Products" },
          { key: "ingredients", label: "Ingredients" },
          { key: "suppliers", label: "Suppliers" },
          { key: "recipes", label: "Recipes" },
          { key: "total", label: "Total Records" },
        ],
        rows: filtered.map((r) => [
          r.name,
          r.inMaster ? "Yes" : "No",
          String(r.productCount),
          String(r.ingredientCount),
          String(r.supplierCount),
          String(r.recipeCount),
          String(r.total),
        ]),
      }),
    [filtered, stats, activeFilters, companyName, generatedAt, period]
  );

  const controlClass =
    "mt-1 w-full rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none";

  return (
    <ReportDocument
      reportKey="category-usage"
      title="Category Usage Report"
      subtitle="Category usage across products, ingredients, suppliers and recipes."
      companyName={companyName}
      period={period}
      generatedAt={generatedAt}
      filters={activeFilters}
      getExportPayload={getExportPayload}
      isEmpty={rows.length === 0}
      emptyMessage="No categories are in use on any product, ingredient, supplier or recipe for this company."
      summary={[
        { label: "Categories In Use", value: String(stats.categories) },
        { label: "In Master", value: String(stats.inMaster) },
        { label: "Not In Master", value: String(stats.unmastered) },
        { label: "Products", value: String(stats.products) },
        { label: "Ingredients", value: String(stats.ingredients) },
      ]}
      controls={
        <>
          <label className="min-w-[220px]">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Category name…"
              className={controlClass}
            />
          </label>
          <label className="flex items-center gap-2 pb-2">
            <input
              type="checkbox"
              checked={unmasteredOnly}
              onChange={(e) => setUnmasteredOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs font-black text-slate-700">Only categories missing from the master</span>
          </label>
        </>
      }
    >
      <ReportTable minWidth={900}>
        <thead className="bg-slate-950 text-xs font-black uppercase tracking-[0.10em] text-white">
          <tr>
            <th className="px-3 py-2.5">Category</th>
            <th className="px-3 py-2.5">In Master</th>
            <th className="px-3 py-2.5 text-right">Products</th>
            <th className="px-3 py-2.5 text-right">Ingredients</th>
            <th className="px-3 py-2.5 text-right">Suppliers</th>
            <th className="px-3 py-2.5 text-right">Recipes</th>
            <th className="px-3 py-2.5 text-right">Total Records</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.name} className="border-t border-slate-100 hover:bg-slate-50/70">
              <td className="px-3 py-2 font-black text-slate-900">{r.name}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                    r.inMaster ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {r.inMaster ? "Yes" : "Not in master"}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{r.productCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{r.ingredientCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{r.supplierCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-900">{r.recipeCount}</td>
              <td className="px-3 py-2 text-right font-black tabular-nums text-slate-900">{r.total}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-10 text-center text-sm font-bold text-slate-500">
                No categories match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-900 bg-slate-50 font-black text-slate-900">
            <td className="px-3 py-2.5" colSpan={2}>
              Totals — {stats.categories} categor{stats.categories === 1 ? "y" : "ies"}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{stats.products}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{stats.ingredients}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">
              {filtered.reduce((s, r) => s + r.supplierCount, 0)}
            </td>
            <td className="px-3 py-2.5 text-right tabular-nums">{filtered.reduce((s, r) => s + r.recipeCount, 0)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{filtered.reduce((s, r) => s + r.total, 0)}</td>
          </tr>
        </tfoot>
      </ReportTable>
    </ReportDocument>
  );
}
