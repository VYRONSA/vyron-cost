"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import {
  calculateGpPercent,
  calculateSuggestedPrice,
  formatMoney,
  Recipe,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type RecipeForm = {
  recipe_name: string;
  recipe_type: string;
  yield_qty: string;
  total_cost: string;
  selling_price: string;
  target_gp: string;
  status: string;
  version_note: string;
};

function recipeToForm(item: Recipe): RecipeForm {
  return {
    recipe_name: item.recipe_name,
    recipe_type: item.recipe_type,
    yield_qty: String(item.yield_qty ?? 1),
    total_cost: String(item.total_cost ?? 0),
    selling_price: String(item.selling_price ?? 0),
    target_gp: String(item.target_gp ?? 40),
    status: item.status || "Approved",
    version_note: item.version_note || "",
  };
}

export default function RecipeEditPageClient({
  recipe,
  companyId,
}: {
  recipe: Recipe;
  companyId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<RecipeForm>(() => recipeToForm(recipe));
  const [message, setMessage] = useState("");
  const deleteConfirm = useConfirmDelete("Delete this recipe? This action cannot be undone.");

  const gpPreview = useMemo(() => {
    return calculateGpPercent(Number(form.selling_price), Number(form.total_cost));
  }, [form.selling_price, form.total_cost]);

  const suggestedPrice = useMemo(() => {
    return calculateSuggestedPrice(Number(form.total_cost), Number(form.target_gp));
  }, [form.total_cost, form.target_gp]);

  function updateForm(field: keyof RecipeForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveRecipe() {
    if (!form.recipe_name.trim()) {
      setMessage("Please enter a recipe name.");
      return;
    }

    const payload = {
      company_id: companyId,
      recipe_name: form.recipe_name.trim(),
      recipe_type: form.recipe_type,
      yield_qty: Number(form.yield_qty),
      total_cost: Number(form.total_cost),
      selling_price: Number(form.selling_price),
      target_gp: Number(form.target_gp),
      status: form.status,
      version_note: form.version_note || null,
    };

    if (supabase && companyId !== "demo-company" && !recipe.id.startsWith("recipe")) {
      const { error } = await supabase
        .from("vyron_cost_recipes")
        .update(payload)
        .eq("id", recipe.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Recipe saved. Returning to recipes...");
    setTimeout(() => router.push("/recipes"), 450);
  }

  function requestDeleteRecipe() {
    deleteConfirm.requestDelete(async () => {
      if (supabase && !recipe.id.startsWith("recipe")) {
        await supabase.from("vyron_cost_recipes").delete().eq("id", recipe.id);
      }
      router.push("/recipes");
    });
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Recipe Edit Page",
        subtitle: "Premium VYRON COST workflow for recipe edit page.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
            <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-[#F8FAFC]">Edit Recipe</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    Full-page recipe editing workspace for recipe type, yield, cost, selling price, GP target and version notes.
                  </p>
                </div>

                <Link href="/recipes" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
                  ← Back
                </Link>
              </div>

              <div className="grid gap-5">
                <label className="text-sm font-black text-slate-600">
                  Recipe Name
                  <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.recipe_name} onChange={(event) => updateForm("recipe_name", event.target.value)} />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Recipe Type
                    <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.recipe_type} onChange={(event) => updateForm("recipe_type", event.target.value)}>
                      <option>Finished Product</option>
                      <option>Sub Recipe</option>
                      <option>Prep Recipe</option>
                      <option>Batch Recipe</option>
                    </select>
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Status
                    <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
                      <option>Approved</option>
                      <option>Version Review</option>
                      <option>GP Risk</option>
                      <option>Draft</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-4">
                  <label className="text-sm font-black text-slate-600">
                    Yield Qty
                    <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.yield_qty} onChange={(event) => updateForm("yield_qty", event.target.value)} />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Total Cost
                    <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.total_cost} onChange={(event) => updateForm("total_cost", event.target.value)} />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Selling Price
                    <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.selling_price} onChange={(event) => updateForm("selling_price", event.target.value)} />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Target GP %
                    <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400" value={form.target_gp} onChange={(event) => updateForm("target_gp", event.target.value)} />
                  </label>
                </div>

                <label className="text-sm font-black text-slate-600">
                  Version Note
                  <textarea className="mt-2 min-h-36 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-medium outline-none focus:border-violet-400" value={form.version_note} onChange={(event) => updateForm("version_note", event.target.value)} />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={saveRecipe} className="inline-flex items-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-6 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
                    <Save size={18} />
                    Save Recipe
                  </button>

                  <button type="button" onClick={requestDeleteRecipe} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
                    <Trash2 size={18} />
                    Delete Recipe
                  </button>
                </div>

                {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-black text-[#7E22CE]">{message}</div>}
              </div>
            </div>

            <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A855F7]">
                RECIPE GP PREVIEW
              </div>

              <div className="mt-4 text-5xl font-black">{gpPreview.toFixed(1)}%</div>

              <div className="mt-3 text-sm leading-7 text-slate-300">
                Current GP based on selling price and total cost.
              </div>

              <div className="mt-6 rounded-3xl border border-[#A855F7]/20 bg-white/5 p-5">
                <div className="text-sm font-black text-[#A855F7]">Suggested Selling Price</div>
                <div className="mt-2 text-3xl font-black">{formatMoney(suggestedPrice)}</div>
                <div className="mt-2 text-sm leading-7 text-slate-300">
                  Price needed to reach the selected target GP.
                </div>
              </div>
            </aside>
          </section>
      <ConfirmDeleteDialog
        open={deleteConfirm.open}
        confirming={deleteConfirm.confirming}
        message={deleteConfirm.message}
        onCancel={deleteConfirm.cancel}
        onConfirm={() => void deleteConfirm.confirm()}
      />
    </VyronPremiumPageShell>
  );
}
