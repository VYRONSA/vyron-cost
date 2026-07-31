"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import {
  calculateGpPercent,
  formatMoney,
  Recipe,
  statusTone,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  recipe_name: "",
  recipe_type: "Finished Product",
  category: "Sushi",
  yield_qty: "1",
  total_cost: "0",
  selling_price: "0",
  target_gp: "40",
  status: "Approved",
  version_note: "",
};

export default function RecipesManager({
  initialRecipes,
  companyId,
}: {
  initialRecipes: Recipe[];
  companyId: string;
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [message, setMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(recipes.map((recipe) => recipe.category || "Uncategorised"))).sort()],
    [recipes]
  );

  const types = useMemo(
    () => ["All", ...Array.from(new Set(recipes.map((recipe) => recipe.recipe_type))).sort()],
    [recipes]
  );

  const filteredRecipes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return recipes.filter((recipe) => {
      const matchesCategory = categoryFilter === "All" || (recipe.category || "Uncategorised") === categoryFilter;
      const matchesType = typeFilter === "All" || recipe.recipe_type === typeFilter;
      if (!matchesCategory || !matchesType) return false;
      if (!term) return true;
      return (
      [
        recipe.recipe_name,
        recipe.recipe_type,
        recipe.category || "",
        recipe.status,
        recipe.version_note || "",
        String(recipe.total_cost),
        String(recipe.selling_price || ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
      );
    });
  }, [recipes, search, categoryFilter, typeFilter]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addRecipe() {
    if (!form.recipe_name.trim()) {
      setMessage("Please enter a recipe name.");
      return;
    }

    const payload = {
      company_id: companyId,
      recipe_name: form.recipe_name.trim(),
      recipe_type: form.recipe_type,
      category: form.category,
      yield_qty: Number(form.yield_qty),
      total_cost: Number(form.total_cost),
      selling_price: Number(form.selling_price),
      target_gp: Number(form.target_gp),
      status: form.status,
      version_note: form.version_note || null,
    };

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase.from("vyron_cost_recipes").insert(payload).select("*").single();

      if (error || !data) {
        setMessage(error?.message || "Could not save recipe.");
        return;
      }

      setRecipes((current) =>
        [...current, data as Recipe].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name))
      );
    } else {
      setRecipes((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            ...payload,
          } as Recipe,
        ].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name))
      );
    }

    setForm(emptyForm);
    setMessage("Recipe added.");
  }

  async function deleteRecipe(id: string) {
    setRecipes((current) => current.filter((item) => item.id !== id));

    if (supabase && !id.startsWith("recipe")) {
      await supabase.from("vyron_cost_recipes").delete().eq("id", id);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-3 text-[#84CC16]"><Plus size={20} /></div>
          <div>
            <h2 className="text-2xl font-black text-[#F8FAFC]">Add New Recipe</h2>
            <p className="text-sm text-slate-500">Create recipes and assign categories.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Recipe Name
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.recipe_name} onChange={(event) => updateForm("recipe_name", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Category
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-violet-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />
          </label>

          <button type="button" onClick={addRecipe} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
            <Plus size={18} />
            Add Recipe
          </button>

          {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#7E22CE]">{message}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-[#F8FAFC]">Recipe Register</h2>
          <p className="mt-2 text-sm text-slate-500">Search recipes by name, type, category, status, cost or notes.</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
            {types.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black">
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>

        <SearchFilterBar
          value={search}
          onChange={setSearch}
          placeholder="Search recipes..."
          resultCount={filteredRecipes.length}
        />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
              <div className="col-span-2">Recipe</div><div>Type</div><div>Category</div><div>Cost</div><div>Price</div><div>Status</div><div>Full Edit</div><div>Delete</div>
            </div>

            {filteredRecipes.map((recipe) => {
              const gp = calculateGpPercent(Number(recipe.selling_price || 0), Number(recipe.total_cost));
              const status = Number(recipe.selling_price || 0) > 0 && gp < Number(recipe.target_gp || 40) ? "GP Risk" : recipe.status;

              return (
                <div key={recipe.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2">
                    <Link href={`/recipes/${recipe.id}`} className="font-black text-[#F8FAFC] hover:text-[#7E22CE]">
                      {recipe.recipe_name}
                    </Link>
                    <div className="mt-1 text-xs text-slate-500">{recipe.version_note || "No version note"}</div>
                  </div>
                  <div className="font-bold text-slate-600">{recipe.recipe_type}</div>
                  <div>{recipe.category || "Uncategorised"}</div>
                  <div>{formatMoney(Number(recipe.total_cost))}</div>
                  <div>{Number(recipe.selling_price || 0) > 0 ? formatMoney(Number(recipe.selling_price)) : "N/A"}</div>
                  <div><StatusPill tone={statusTone(status)}>{status}</StatusPill></div>
                  <div>
                    <Link href={`/recipes/${recipe.id}/edit`} className="inline-flex items-center gap-2 rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-2 text-xs font-black text-[#7E22CE]">
                      <Edit3 size={14} />
                      Edit
                    </Link>
                  </div>
                  <div>
                    <button type="button" onClick={() => deleteRecipe(recipe.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
