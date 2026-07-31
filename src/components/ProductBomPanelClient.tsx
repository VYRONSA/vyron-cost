"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/vyron-cost-data";
import type { ProductBomSummary } from "@/lib/vyron-product-bom";
import { linkProductToRecipe } from "@/lib/vyron-product-bom";
import type { Recipe } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ProductBomPanelClient({
  initial,
  recipes,
  companyId,
}: {
  initial: ProductBomSummary;
  recipes: Recipe[];
  companyId: string;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [recipeId, setRecipeId] = useState(initial.linkedRecipe?.id || "");
  const [message, setMessage] = useState("");

  async function updateFromBom() {
    if (!recipeId) {
      setMessage("Select a linked BOM/recipe first.");
      return;
    }
    await linkProductToRecipe(summary.product.id, recipeId, companyId);
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe) return;
    const bomCost = Number(recipe.total_cost || summary.bomCost);
    const selling = Number(summary.product.selling_price || 0);
    const gp = selling > 0 ? ((selling - bomCost) / selling) * 100 : 0;
    setSummary((current) => ({
      ...current,
      linkedRecipe: recipe,
      bomCost,
      calculatedGp: gp,
      suggestedSellingPrice: bomCost / (1 - Number(summary.product.target_gp || 40) / 100),
      marginStatus: gp >= Number(summary.product.target_gp || 40) ? "Healthy" : "Review",
    }));
    setMessage("Product cost updated from linked BOM.");
    router.refresh();
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Bom Panel",
        subtitle: "Premium VYRON COST workflow for product bom panel.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Linked BOM / Recipe</h2>
            <p className="mt-2 text-sm text-slate-500">Finished product type · link BOM · update cost · recalculate GP</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase text-slate-400">Linked recipe</div>
                <div className="mt-1 font-black">
                  {summary.linkedRecipe ? (
                    <Link href={`/recipes/${summary.linkedRecipe.id}`} className="text-[#7E22CE]">
                      {summary.linkedRecipe.recipe_name}
                    </Link>
                  ) : (
                    "No BOM linked yet"
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase text-slate-400">BOM cost</div>
                <div className="mt-1 font-black text-violet-700">{formatMoney(summary.bomCost)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase text-slate-400">Calculated GP</div>
                <div className="mt-1 font-black">{summary.calculatedGp.toFixed(1)}%</div>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-xs font-black uppercase text-slate-400">Suggested price</div>
                <div className="mt-1 font-black">{formatMoney(summary.suggestedSellingPrice)}</div>
              </div>
            </div>

            <label className="mt-4 block text-sm font-black text-slate-600">
              Link / change BOM
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold"
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
              >
                <option value="">Select recipe / BOM</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.recipe_name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={updateFromBom} className="rounded-xl border border-transparent vyron-grad-surface px-4 py-2 text-xs font-black text-[#F8FAFC]">
                Update cost from BOM
              </button>
              {summary.linkedRecipe ? (
                <Link href={`/recipes/${summary.linkedRecipe.id}/edit`} className="rounded-xl bg-[#08111A] px-4 py-2 text-xs font-black text-[#B6D934]">
                  Edit BOM
                </Link>
              ) : null}
            </div>
            {message ? <div className="mt-3 text-sm font-black text-[#7E22CE]">{message}</div> : null}
          </div>
    </VyronPremiumPageShell>
  );
}
