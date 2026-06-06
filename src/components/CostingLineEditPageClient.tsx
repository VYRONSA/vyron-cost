"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  formatMoney,
  Ingredient,
  Recipe,
  RecipeItem,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

export default function CostingLineEditPageClient({
  line,
  recipes,
  ingredients,
  companyId,
}: {
  line: RecipeItem;
  recipes: Recipe[];
  ingredients: Ingredient[];
  companyId: string;
}) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState(line.recipe_id || recipes[0]?.id || "");
  const [ingredientId, setIngredientId] = useState(
    line.ingredient_id ||
      ingredients.find((item) => item.ingredient_name === line.ingredient_name_snapshot)?.id ||
      ingredients[0]?.id ||
      ""
  );
  const [quantity, setQuantity] = useState(String(line.quantity ?? 0));
  const [message, setMessage] = useState("");

  const selectedIngredient = ingredients.find((item) => item.id === ingredientId);
  const selectedRecipe = recipes.find((item) => item.id === recipeId);

  const previewCost = useMemo(() => {
    return Number(quantity || 0) * Number(selectedIngredient?.true_unit_cost || 0);
  }, [quantity, selectedIngredient]);

  async function saveLine() {
    if (!selectedIngredient || !selectedRecipe) {
      setMessage("Please select a recipe and ingredient.");
      return;
    }

    const payload = {
      company_id: companyId,
      recipe_id: selectedRecipe.id,
      ingredient_id: selectedIngredient.id,
      ingredient_name_snapshot: selectedIngredient.ingredient_name,
      quantity: Number(quantity),
      unit: selectedIngredient.recipe_unit,
      true_unit_cost: Number(selectedIngredient.true_unit_cost),
    };

    if (supabase && companyId !== "demo-company" && !line.id.startsWith("ri")) {
      const { error } = await supabase
        .from("vyron_cost_recipe_items")
        .update(payload)
        .eq("id", line.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Costing line saved. Returning to cost calculator...");
    setTimeout(() => router.push("/cost-calculator"), 450);
  }

  async function deleteLine() {
    if (supabase && !line.id.startsWith("ri")) {
      await supabase.from("vyron_cost_recipe_items").delete().eq("id", line.id);
    }

    router.push("/cost-calculator");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
      <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-black text-[#07110d]">Edit Costing Line</h2>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              Full edit page for recipe ingredient quantity, costing source and line cost.
            </p>
          </div>

          <Link href="/cost-calculator" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
            <ArrowLeft size={16} />
            Back to Cost Calculator
          </Link>
        </div>

        <div className="grid gap-5">
          <label className="text-sm font-black text-slate-600">
            Recipe
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              {recipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.recipe_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-black text-slate-600">
            Ingredient
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.ingredient_name} — {formatMoney(Number(ingredient.true_unit_cost))}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-black text-slate-600">
            Quantity
            <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={saveLine} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-[#07110d] transition hover:bg-emerald-400">
              <Save size={18} />
              Save Costing Line
            </button>

            <button type="button" onClick={deleteLine} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
              <Trash2 size={18} />
              Delete Line
            </button>
          </div>

          {message && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{message}</div>}
        </div>
      </div>

      <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
          LINE COST PREVIEW
        </div>

        <div className="mt-4 text-5xl font-black">{formatMoney(previewCost)}</div>

        <div className="mt-3 text-sm leading-7 text-slate-300">
          Quantity multiplied by the selected ingredient true usable unit cost.
        </div>

        <div className="mt-6 rounded-3xl border border-emerald-400/15 bg-white/5 p-5">
          <div className="text-sm font-black text-emerald-300">Selected Ingredient</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            {selectedIngredient?.ingredient_name || "None selected"}
          </div>
        </div>
      </aside>
    </section>
  );
}
