"use client";

import { useMemo, useState } from "react";
import ReportTableShell from "@/components/ReportTableShell";
import StatusPill from "@/components/StatusPill";
import { calculateMovementPercent, formatMoney, Ingredient } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function IngredientReportClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return ingredients;
    return ingredients.filter((ingredient) =>
      [ingredient.ingredient_name, ingredient.category, ingredient.purchase_unit, ingredient.recipe_unit, ingredient.yield_type, ingredient.current_alert || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [ingredients, search]);

  return (
    <ReportTableShell
      title="Ingredient Movement Report"
      subtitle="Ingredient cost movement, yield rules and true usable cost reporting."
      search={search}
      onSearch={setSearch}
      resultCount={filtered.length}
    >
      <div className="overflow-x-auto rounded-3xl border border-slate-100">
        <div className="min-w-[1040px]">
          <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
            <div>Ingredient</div><div>Category</div><div>Purchase Unit</div><div>Recipe Unit</div><div>Current</div><div>True Cost</div><div>Movement</div><div>Status</div>
          </div>
          {filtered.map((ingredient) => {
            const movement = calculateMovementPercent(Number(ingredient.previous_cost), Number(ingredient.purchase_cost));
            const tone = movement > 10 ? "red" : movement > 3 ? "amber" : "emerald";
            return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "ingredients",
        title: "Ingredient Report",
        subtitle: "Premium VYRON COST workflow for ingredient report.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div key={ingredient.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-4 text-sm">
                      <div className="font-black text-[#F8FAFC]">{ingredient.ingredient_name}</div>
                      <div>{ingredient.category}</div>
                      <div>{ingredient.purchase_unit}</div>
                      <div>{ingredient.recipe_unit}</div>
                      <div>{formatMoney(Number(ingredient.purchase_cost))}</div>
                      <div className="font-black text-[#65A30D]">{formatMoney(Number(ingredient.true_unit_cost))}</div>
                      <div>{movement.toFixed(1)}%</div>
                      <div><StatusPill tone={tone}>{tone === "red" ? "High" : tone === "amber" ? "Watch" : "Stable"}</StatusPill></div>
                    </div>
    </VyronPremiumPageShell>
  );
          })}
        </div>
      </div>
    </ReportTableShell>
  );
}
