"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { formatMoney, Ingredient, Recipe, RecipeItem } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

export default function CostingEngineManager({
  recipes,
  ingredients,
  initialItems,
  companyId,
}: {
  recipes: Recipe[];
  ingredients: Ingredient[];
  initialItems: RecipeItem[];
  companyId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id || "");
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id || "");
  const [quantity, setQuantity] = useState("0.1");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const selectedIngredient = ingredients.find((item) => item.id === ingredientId);
  const selectedRecipe = recipes.find((item) => item.id === recipeId);
  const previewCost = Number(quantity || 0) * Number(selectedIngredient?.true_unit_cost || 0);

  const selectedRecipeItems = items.filter((item) => item.recipe_id === recipeId);
  const filteredItems = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return selectedRecipeItems;
    return selectedRecipeItems.filter((item) =>
      [item.ingredient_name_snapshot, item.unit, String(item.quantity), String(item.line_cost)]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [selectedRecipeItems, search]);

  const recipeTotal = selectedRecipeItems.reduce((sum, item) => sum + Number(item.line_cost || 0), 0);

  async function addItem() {
    if (!selectedIngredient || !selectedRecipe) {
      setMessage("Select a recipe and ingredient.");
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

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_recipe_items").insert(payload).select("*").single();
      if (error || !data) {
        setMessage(error?.message || "Could not add recipe line.");
        return;
      }
      setItems((current) => [...current, data as RecipeItem]);
    } else {
      setItems((current) => [...current, { id: crypto.randomUUID(), ...payload, line_cost: previewCost } as RecipeItem]);
    }

    setMessage("Recipe line added.");
  }

  async function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    if (supabase && !id.startsWith("ri")) {
      await supabase.from("vyron_cost_recipe_items").delete().eq("id", id);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-3 text-[#84CC16]"><Plus size={20} /></div>
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">Add Costing Line</h2>
            <p className="text-sm text-slate-500">Use full edit pages for existing costing lines.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Recipe
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.recipe_name}</option>)}
            </select>
          </label>

          <label className="text-sm font-black text-slate-600">
            Ingredient
            <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>
              {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.ingredient_name} — {formatMoney(Number(ingredient.true_unit_cost))}</option>)}
            </select>
          </label>

          <label className="text-sm font-black text-slate-600">
            Quantity
            <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>

          <div className="rounded-3xl bg-[#07110d] p-5 text-white">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A3E635]">Line Cost Preview</div>
            <div className="mt-2 text-3xl font-black">{formatMoney(previewCost)}</div>
          </div>

          <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A3E635]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
            <Plus size={18} />
            Add Costing Line
          </button>

          {message && <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3 text-sm font-bold text-[#65A30D]">{message}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">{selectedRecipe?.recipe_name || "Recipe"} Costing Lines</h2>
            <p className="mt-2 text-sm text-slate-500">Current calculated total: <b>{formatMoney(recipeTotal)}</b></p>
          </div>
          <StatusPill tone="emerald">{selectedRecipeItems.length} Lines</StatusPill>
        </div>

        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search recipe costing lines..." resultCount={filteredItems.length} />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
              <div>Ingredient</div><div>Qty</div><div>Unit</div><div>True Unit Cost</div><div>Line Cost</div><div>Full Edit</div><div>Delete</div>
            </div>
            {filteredItems.map((item) => (
              <div key={item.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                <div className="font-black text-[#F8FAFC]">{item.ingredient_name_snapshot}</div>
                <div>{Number(item.quantity).toFixed(3)}</div>
                <div>{item.unit}</div>
                <div>{formatMoney(Number(item.true_unit_cost))}</div>
                <div className="font-black text-[#65A30D]">{formatMoney(Number(item.line_cost))}</div>
                <div>
                  <Link href={`/cost-calculator/${item.id}/edit`} className="inline-flex items-center gap-2 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]">
                    <Edit3 size={14} />
                    Open Edit Page
                  </Link>
                </div>
                <div>
                  <button type="button" onClick={() => deleteItem(item.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
