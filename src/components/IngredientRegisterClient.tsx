"use client";

import { Edit3, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  calculateTrueUnitCost,
  CostIngredient,
  formatMoney,
} from "@/lib/vyron-cost-core-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

const emptyForm = {
  ingredient_name: "",
  category: "",
  purchase_unit: "kg",
  recipe_unit: "g",
  purchase_cost: "0",
  previous_cost: "0",
  yield_type: "Standard",
  yield_percent: "100",
  current_alert: "",
};

export default function IngredientRegisterClient({
  initialIngredients,
}: {
  initialIngredients: CostIngredient[];
}) {
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return ingredients;

    return ingredients.filter((item) =>
      [
        item.ingredient_name,
        item.category || "",
        item.purchase_unit || "",
        item.recipe_unit || "",
        item.current_alert || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [ingredients, search]);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(item: CostIngredient) {
    setEditingId(item.id);
    setForm({
      ingredient_name: item.ingredient_name || "",
      category: item.category || "",
      purchase_unit: item.purchase_unit || "kg",
      recipe_unit: item.recipe_unit || "g",
      purchase_cost: String(item.purchase_cost || 0),
      previous_cost: String(item.previous_cost || 0),
      yield_type: item.yield_type || "Standard",
      yield_percent: String(item.yield_percent || 100),
      current_alert: item.current_alert || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveIngredient() {
    if (!form.ingredient_name.trim()) {
      setMessage("Ingredient name is required.");
      return;
    }

    const purchaseCost = Number(form.purchase_cost || 0);
    const yieldPercent = Number(form.yield_percent || 100);
    const trueUnitCost = calculateTrueUnitCost(purchaseCost, yieldPercent);

    const payload = {
      ingredient_name: form.ingredient_name.trim(),
      category: form.category.trim() || "Uncategorised",
      purchase_unit: form.purchase_unit.trim() || "kg",
      recipe_unit: form.recipe_unit.trim() || "g",
      purchase_cost: purchaseCost,
      previous_cost: Number(form.previous_cost || 0),
      yield_type: form.yield_type.trim() || "Standard",
      yield_percent: yieldPercent,
      true_unit_cost: trueUnitCost,
      current_alert: form.current_alert.trim() || null,
    };

    if (supabase && !editingId?.startsWith("demo")) {
      if (editingId) {
        const { data, error } = await supabase
          .from("vyron_cost_ingredients")
          .update(payload)
          .eq("id", editingId)
          .select("*")
          .single();

        if (error || !data) {
          setMessage(error?.message || "Could not update ingredient.");
          return;
        }

        setIngredients((current) =>
          current.map((item) => (item.id === editingId ? (data as CostIngredient) : item))
        );
      } else {
        const { data, error } = await supabase
          .from("vyron_cost_ingredients")
          .insert(payload)
          .select("*")
          .single();

        if (error || !data) {
          setMessage(error?.message || "Could not add ingredient.");
          return;
        }

        setIngredients((current) =>
          [...current, data as CostIngredient].sort((a, b) =>
            a.ingredient_name.localeCompare(b.ingredient_name)
          )
        );
      }
    } else {
      if (editingId) {
        setIngredients((current) =>
          current.map((item) =>
            item.id === editingId ? ({ ...item, id: editingId, ...payload } as CostIngredient) : item
          )
        );
      } else {
        setIngredients((current) =>
          [
            ...current,
            {
              id: crypto.randomUUID(),
              ...payload,
            } as CostIngredient,
          ].sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name))
        );
      }
    }

    setMessage(editingId ? "Ingredient updated." : "Ingredient added.");
    resetForm();
  }

  async function deleteIngredient(id: string) {
    setIngredients((current) => current.filter((item) => item.id !== id));

    if (supabase && !id.startsWith("demo")) {
      await supabase.from("vyron_cost_ingredients").delete().eq("id", id);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "ingredients",
        title: "Ingredient Register",
        subtitle: "Premium VYRON COST workflow for ingredient register.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.35fr]">
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <Plus size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900">
                    {editingId ? "Edit Ingredient" : "Add Ingredient"}
                  </h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Raw ingredient setup for BOM costing.
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="text-sm font-black text-slate-600">
                  Ingredient Name
                  <input
                    value={form.ingredient_name}
                    onChange={(event) => updateForm("ingredient_name", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <label className="text-sm font-black text-slate-600">
                  Category
                  <input
                    value={form.category}
                    onChange={(event) => updateForm("category", event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Purchase Unit
                    <input
                      value={form.purchase_unit}
                      onChange={(event) => updateForm("purchase_unit", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Recipe Unit
                    <input
                      value={form.recipe_unit}
                      onChange={(event) => updateForm("recipe_unit", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm font-black text-slate-600">
                    Purchase Cost
                    <input
                      type="number"
                      value={form.purchase_cost}
                      onChange={(event) => updateForm("purchase_cost", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Previous Cost
                    <input
                      type="number"
                      value={form.previous_cost}
                      onChange={(event) => updateForm("previous_cost", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Yield %
                    <input
                      type="number"
                      value={form.yield_percent}
                      onChange={(event) => updateForm("yield_percent", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-violet-400"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={saveIngredient}
                  className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white"
                >
                  {editingId ? "Save Ingredient" : "Add Ingredient"}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-2xl bg-slate-100 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-slate-700"
                  >
                    Cancel Edit
                  </button>
                )}

                {message && (
                  <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#7E22CE]">
                    {message}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
              <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Ingredient Register</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    Search, open, edit and delete ingredients.
                  </p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <Search size={18} className="text-violet-700" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ingredients..."
                    className="w-64 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <div className="grid grid-cols-7 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                  <div>Name</div>
                  <div>Category</div>
                  <div>Unit</div>
                  <div>Cost</div>
                  <div>True Cost</div>
                  <div>Open</div>
                  <div>Actions</div>
                </div>

                {filtered.map((item) => (
                  <div key={item.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-4 text-sm">
                    <div className="font-black text-slate-900">{item.ingredient_name}</div>
                    <div className="font-bold text-slate-500">{item.category || "Uncategorised"}</div>
                    <div className="font-bold text-slate-500">{item.purchase_unit || "kg"}</div>
                    <div className="font-black text-slate-900">{formatMoney(item.purchase_cost)}</div>
                    <div className="font-black text-violet-700">{formatMoney(item.true_unit_cost)}</div>
                    <div>
                      <Link href={`/ingredients/${item.id}`} className="font-black text-violet-700">
                        Open →
                      </Link>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-xl bg-violet-50 p-2 text-violet-700"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteIngredient(item.id)}
                        className="rounded-xl bg-red-50 p-2 text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
