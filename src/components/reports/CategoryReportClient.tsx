"use client";

import { useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import StatusPill from "@/components/StatusPill";
import { Category, Ingredient, Product, Recipe, Supplier, statusTone } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function CategoryReportClient({
  categories,
  products,
  ingredients,
  suppliers,
  recipes,
}: {
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  recipes: Recipe[];
}) {
  const [search, setSearch] = useState("");

  const rows = useMemo(() => categories.map((category) => ({
    ...category,
    productCount: products.filter((item) => item.category === category.category_name).length,
    ingredientCount: ingredients.filter((item) => item.category === category.category_name).length,
    supplierCount: suppliers.filter((item) => item.category === category.category_name).length,
    recipeCount: recipes.filter((item) => item.category === category.category_name).length,
  })), [categories, products, ingredients, suppliers, recipes]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.category_name, row.category_type, row.description || "", row.status]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "reports",
        title: "Category Report",
        subtitle: "Premium VYRON COST workflow for category report.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <ReportTableShell
            title="Category Usage Report"
            subtitle="Category usage across products, ingredients, suppliers and recipes."
            search={search}
            onSearch={setSearch}
            resultCount={filtered.length}
          >
            <div className="overflow-x-auto rounded-3xl border border-slate-100">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                  <div>Category</div><div>Type</div><div>Products</div><div>Ingredients</div><div>Suppliers</div><div>Recipes</div><div>Status</div><div>Description</div>
                </div>
                {filtered.map((row) => (
                  <div key={row.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-4 text-sm">
                    <div className="font-black text-[#F8FAFC]">{row.category_name}</div>
                    <div>{row.category_type}</div>
                    <div>{row.productCount}</div>
                    <div>{row.ingredientCount}</div>
                    <div>{row.supplierCount}</div>
                    <div>{row.recipeCount}</div>
                    <div><StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill></div>
                    <div className="text-slate-500">{row.description || "No description"}</div>
                  </div>
                ))}
              </div>
            </div>
          </ReportTableShell>
    </VyronPremiumPageShell>
  );
}
