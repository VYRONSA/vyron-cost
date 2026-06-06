"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import {
  calculateMovementPercent,
  calculateTrueUnitCost,
  formatMoney,
  Ingredient,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const emptyForm = {
  ingredient_name: "",
  category: "Fresh Produce",
  purchase_unit: "kg",
  recipe_unit: "kg usable",
  purchase_cost: "0",
  previous_cost: "0",
  yield_type: "standard",
  yield_percent: "100",
  current_alert: "",
};

export default function IngredientsManager({
  initialIngredients,
  companyId,
}: {
  initialIngredients: Ingredient[];
  companyId: string;
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [message, setMessage] = useState("");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(ingredients.map((item) => item.category))).sort()],
    [ingredients]
  );

  const filteredIngredients = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ingredients.filter((item) => {
      const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
      if (!matchesCategory) return false;
      if (!term) return true;
      return (
      [
        item.ingredient_name,
        item.category,
        item.purchase_unit,
        item.recipe_unit,
        item.yield_type,
        item.current_alert || "",
        String(item.purchase_cost),
        String(item.true_unit_cost),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
      );
    });
  }, [ingredients, search, categoryFilter]);

  const previewTrueCost = useMemo(() => {
    return calculateTrueUnitCost(Number(form.purchase_cost), Number(form.yield_percent));
  }, [form.purchase_cost, form.yield_percent]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addIngredient() {
    if (!form.ingredient_name.trim()) {
      setMessage("Please enter an ingredient name.");
      return;
    }

    const payload = {
      company_id: companyId,
      ingredient_name: form.ingredient_name.trim(),
      category: form.category,
      purchase_unit: form.purchase_unit,
      recipe_unit: form.recipe_unit,
      purchase_cost: Number(form.purchase_cost),
      previous_cost: Number(form.previous_cost),
      yield_type: form.yield_type,
      yield_percent: Number(form.yield_percent),
      current_alert: form.current_alert || null,
    };

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase
        .from("vyron_cost_ingredients")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        setMessage(error?.message || "Could not save ingredient.");
        return;
      }

      setIngredients((current) =>
        [...current, data as Ingredient].sort((a, b) =>
          a.ingredient_name.localeCompare(b.ingredient_name)
        )
      );
    } else {
      setIngredients((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            ...payload,
            true_unit_cost: previewTrueCost,
          } as Ingredient,
        ].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name))
      );
    }

    setForm(emptyForm);
    setMessage("Ingredient added.");
  }

  async function deleteIngredient(id: string) {
    setIngredients((current) => current.filter((item) => item.id !== id));

    if (supabase && !id.startsWith("demo")) {
      await supabase.from("vyron_cost_ingredients").delete().eq("id", id);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
            <Plus size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#07110d]">Add New Ingredient</h2>
            <p className="text-sm text-slate-500">Create ingredients and assign categories.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="text-sm font-black text-slate-600">
            Ingredient Name
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.ingredient_name} onChange={(event) => updateForm("ingredient_name", event.target.value)} />
          </label>

          <label className="text-sm font-black text-slate-600">
            Category
            <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)} />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Current Cost
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.purchase_cost} onChange={(event) => updateForm("purchase_cost", event.target.value)} />
            </label>

            <label className="text-sm font-black text-slate-600">
              Yield %
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.yield_percent} onChange={(event) => updateForm("yield_percent", event.target.value)} />
            </label>
          </div>

          <div className="rounded-3xl bg-[#07110d] p-5 text-white">
            <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Preview</div>
            <div className="mt-2 text-3xl font-black">{formatMoney(previewTrueCost)}</div>
            <div className="mt-1 text-sm text-slate-300">True usable unit cost</div>
          </div>

          <button type="button" onClick={addIngredient} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black text-[#07110d] transition hover:bg-emerald-400">
            <Plus size={18} />
            Add Ingredient
          </button>

          {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-[#07110d]">Ingredient Master</h2>
          <p className="mt-2 text-sm text-slate-500">Search ingredients by name, category, unit, yield, price or notes.</p>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>

        <SearchFilterBar
          value={search}
          onChange={setSearch}
          placeholder="Search ingredients..."
          resultCount={filteredIngredients.length}
        />

        <div className="overflow-x-auto rounded-3xl border border-slate-100">
          <div className="min-w-[1120px]">
            <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
              <div>Ingredient</div><div>Category</div><div>Current</div><div>Yield</div><div>True Cost</div><div>Movement</div><div>Full Edit</div><div>Delete</div>
            </div>

            {filteredIngredients.map((item) => {
              const movement = calculateMovementPercent(Number(item.previous_cost), Number(item.purchase_cost));
              const tone = movement > 10 ? "red" : movement > 3 ? "amber" : "emerald";

              return (
                <div key={item.id} className="grid grid-cols-8 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div>
                    <Link href={`/ingredients/${item.id}`} className="font-black text-[#07110d] hover:text-emerald-700">
                      {item.ingredient_name}
                    </Link>
                    <div className="mt-1 text-xs text-slate-500">{item.purchase_unit} → {item.recipe_unit}</div>
                  </div>
                  <div className="font-bold text-slate-600">{item.category}</div>
                  <div className="font-black">{formatMoney(Number(item.purchase_cost))}</div>
                  <div>{Number(item.yield_percent).toFixed(1)}%</div>
                  <div className="font-black text-emerald-700">{formatMoney(Number(item.true_unit_cost))}</div>
                  <div><StatusPill tone={tone}>{movement >= 0 ? "+" : ""}{movement.toFixed(1)}%</StatusPill></div>
                  <div>
                    <Link href={`/ingredients/${item.id}/edit`} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                      <Edit3 size={14} />
                      Edit
                    </Link>
                  </div>
                  <div>
                    <button type="button" onClick={() => deleteIngredient(item.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
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
