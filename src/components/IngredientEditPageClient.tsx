"use client";

import { ArrowLeft, Leaf, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { calculateTrueUnitCost, formatMoney, Ingredient } from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

type IngredientForm = {
  ingredient_name: string;
  category: string;
  purchase_unit: string;
  recipe_unit: string;
  purchase_cost: string;
  previous_cost: string;
  yield_type: string;
  yield_percent: string;
  current_alert: string;
};

function ingredientToForm(item: Ingredient): IngredientForm {
  return {
    ingredient_name: item.ingredient_name,
    category: item.category,
    purchase_unit: item.purchase_unit,
    recipe_unit: item.recipe_unit,
    purchase_cost: String(item.purchase_cost ?? 0),
    previous_cost: String(item.previous_cost ?? 0),
    yield_type: item.yield_type || "Standard",
    yield_percent: String(item.yield_percent ?? 100),
    current_alert: item.current_alert || "",
  };
}

export default function IngredientEditPageClient({ ingredient, companyId }: { ingredient: Ingredient; companyId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<IngredientForm>(() => ingredientToForm(ingredient));
  const [message, setMessage] = useState("");

  const previewTrueCost = useMemo(() => calculateTrueUnitCost(Number(form.purchase_cost), Number(form.yield_percent)), [form.purchase_cost, form.yield_percent]);
  const movement = useMemo(() => {
    const previous = Number(form.previous_cost || 0);
    const current = Number(form.purchase_cost || 0);
    if (!previous || previous <= 0) return 0;
    return ((current - previous) / previous) * 100;
  }, [form.previous_cost, form.purchase_cost]);

  function updateForm(field: keyof IngredientForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveIngredient() {
    if (!form.ingredient_name.trim()) {
      setMessage("Please enter an ingredient name.");
      return;
    }

    const payload = {
      company_id: companyId,
      ingredient_name: form.ingredient_name.trim(),
      category: form.category || "Uncategorised",
      purchase_unit: form.purchase_unit || "kg",
      recipe_unit: form.recipe_unit || "kg",
      purchase_cost: Number(form.purchase_cost),
      previous_cost: Number(form.previous_cost),
      yield_type: form.yield_type || "Standard",
      yield_percent: Number(form.yield_percent),
      current_alert: form.current_alert || null,
      true_unit_cost: previewTrueCost,
      updated_at: new Date().toISOString(),
    };

    if (supabase && companyId !== "demo-company" && !ingredient.id.startsWith("demo")) {
      const { error } = await supabase.from("vyron_cost_ingredients").update(payload).eq("id", ingredient.id);
      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Ingredient saved. Returning to ingredients...");
    setTimeout(() => router.push("/ingredients"), 450);
  }

  async function deleteIngredient() {
    if (supabase && !ingredient.id.startsWith("demo")) await supabase.from("vyron_cost_ingredients").delete().eq("id", ingredient.id);
    router.push("/ingredients");
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-violet-400";
  const labelClass = "text-xs font-black uppercase tracking-[0.08em] text-slate-500";

  return (
    <section className="mx-auto max-w-4xl">
      <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <Link href="/ingredients" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-violet-700"><ArrowLeft size={16} /> Back to Ingredients</Link>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Leaf size={24} /></div>
          <div>
            <h2 className="text-3xl font-black text-slate-950">Edit Ingredient</h2>
            <p className="text-xs font-semibold text-slate-500">Simple layout. Extra help is hidden below.</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-violet-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">True Unit Cost</div>
            <div className="mt-1 text-3xl font-black text-violet-700">{formatMoney(previewTrueCost)}</div>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Movement</div>
            <div className={`mt-1 text-3xl font-black ${movement > 5 ? "text-red-600" : "text-emerald-700"}`}>{movement.toFixed(1)}%</div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">1. Basic</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label>
                <div className={labelClass}>Ingredient Name *</div>
                <input className={inputClass} value={form.ingredient_name} onChange={(event) => updateForm("ingredient_name", event.target.value)} placeholder="All spice" />
              </label>
              <label>
                <div className={labelClass}>Category *</div>
                <select className={inputClass} value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                  <option>Uncategorised</option><option>Spices</option><option>Dry Goods</option><option>Protein</option><option>Vegetables</option><option>Dairy</option><option>Packaging</option><option>Other</option>
                </select>
              </label>
              <label>
                <div className={labelClass}>Yield Type</div>
                <select className={inputClass} value={form.yield_type} onChange={(event) => updateForm("yield_type", event.target.value)}>
                  <option>Standard</option><option>Trim Loss</option><option>Cook Loss</option><option>Drain Loss</option><option>Weight Gain</option><option>Weight Loss</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">2. Cost</div>
            <div className="grid gap-3 md:grid-cols-4">
              <label><div className={labelClass}>Supplier Cost *</div><input type="number" className={inputClass} value={form.purchase_cost} onChange={(event) => updateForm("purchase_cost", event.target.value)} placeholder="215.80" /></label>
              <label><div className={labelClass}>Previous</div><input type="number" className={inputClass} value={form.previous_cost} onChange={(event) => updateForm("previous_cost", event.target.value)} placeholder="198.50" /></label>
              <label><div className={labelClass}>Yield % *</div><input type="number" className={inputClass} value={form.yield_percent} onChange={(event) => updateForm("yield_percent", event.target.value)} placeholder="100" /></label>
              <label><div className={labelClass}>True Cost</div><input value={previewTrueCost.toFixed(2)} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700 outline-none" /></label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">3. Units</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label><div className={labelClass}>Supplier Unit *</div><input className={inputClass} value={form.purchase_unit} onChange={(event) => updateForm("purchase_unit", event.target.value)} placeholder="kg" /></label>
              <label><div className={labelClass}>Recipe Unit *</div><input className={inputClass} value={form.recipe_unit} onChange={(event) => updateForm("recipe_unit", event.target.value)} placeholder="g" /></label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-4">
            <div className="mb-3 text-sm font-black text-slate-950">4. Notes</div>
            <input className={inputClass} value={form.current_alert} onChange={(event) => updateForm("current_alert", event.target.value)} placeholder="Imported from invoice / Excel / PDF" />
          </div>

          <details className="rounded-2xl bg-violet-50 p-4">
            <summary className="cursor-pointer text-sm font-black text-violet-800">Need help?</summary>
            <div className="mt-3 space-y-2 text-xs font-semibold leading-5 text-slate-600">
              <p><b>Supplier Cost:</b> invoice price excluding VAT.</p>
              <p><b>Previous Cost:</b> last price used for movement.</p>
              <p><b>Yield %:</b> 100 no loss, 95 means 5% loss.</p>
              <p><b>Units:</b> buy in kg, use in g.</p>
            </div>
          </details>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={saveIngredient} className="inline-flex flex-1 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white transition hover:brightness-110">
              <Save size={18} /> Save Ingredient
            </button>
            <button type="button" onClick={deleteIngredient} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
              <Trash2 size={18} /> Delete
            </button>
          </div>

          {message && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{message}</div>}
        </div>
      </div>
    </section>
  );
}
