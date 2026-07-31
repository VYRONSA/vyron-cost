"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  calculateGpPercent,
  calculateSuggestedPrice,
  formatMoney,
  Ingredient,
  Product,
  Recipe,
} from "@/lib/vyron-cost-data";
import { linkProductToRecipe } from "@/lib/vyron-product-bom";
import { supabase } from "@/lib/supabase";

export type BomLine = {
  id: string;
  line_type: "ingredient" | "packaging" | "labour" | "wastage";
  ingredient_id?: string | null;
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  wastage_percent: number;
  line_cost: number;
};

type RecipeForm = {
  recipe_name: string;
  recipe_type: string;
  category: string;
  yield_qty: string;
  selling_price: string;
  target_gp: string;
  status: string;
  version_note: string;
};

function calcLineCost(line: BomLine) {
  const base = Number(line.quantity) * Number(line.unit_cost);
  if (line.line_type === "wastage") {
    return Number((base * (1 + Number(line.wastage_percent || 0) / 100)).toFixed(2));
  }
  return Number(base.toFixed(2));
}

function emptyLine(type: BomLine["line_type"] = "ingredient"): BomLine {
  return {
    id: crypto.randomUUID(),
    line_type: type,
    name: "",
    quantity: 1,
    unit: type === "labour" ? "hour" : "kg",
    unit_cost: 0,
    wastage_percent: type === "wastage" ? 5 : 0,
    line_cost: 0,
  };
}

function recipeToForm(recipe: Recipe): RecipeForm {
  return {
    recipe_name: recipe.recipe_name,
    recipe_type: recipe.recipe_type,
    category: recipe.category || "General",
    yield_qty: String(recipe.yield_qty ?? 1),
    selling_price: String(recipe.selling_price ?? 0),
    target_gp: String(recipe.target_gp ?? 40),
    status: recipe.status || "Approved",
    version_note: recipe.version_note || "",
  };
}

export default function RecipeBomBuilder({
  recipe,
  companyId,
  ingredients,
  initialLines,
  products = [],
}: {
  recipe: Recipe;
  companyId: string;
  ingredients: Ingredient[];
  initialLines: BomLine[];
  products?: Product[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<RecipeForm>(() => recipeToForm(recipe));
  const [lines, setLines] = useState<BomLine[]>(
    initialLines.length ? initialLines : [emptyLine("ingredient"), emptyLine("packaging")]
  );
  const [linkedProductId, setLinkedProductId] = useState("");
  const [message, setMessage] = useState("");

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + calcLineCost(line), 0), [lines]);
  const yieldQty = Math.max(1, Number(form.yield_qty || 1));
  const costPerUnit = totalCost / yieldQty;
  const gpPreview = calculateGpPercent(Number(form.selling_price), totalCost);
  const suggestedPrice = calculateSuggestedPrice(totalCost, Number(form.target_gp));

  const grouped = useMemo(() => {
    const buckets: Record<string, BomLine[]> = {
      ingredient: [],
      packaging: [],
      labour: [],
      wastage: [],
    };
    for (const line of lines) buckets[line.line_type].push(line);
    return buckets;
  }, [lines]);

  function updateForm(field: keyof RecipeForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateLine(id: string, patch: Partial<BomLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const next = { ...line, ...patch };
        next.line_cost = calcLineCost(next);
        return next;
      })
    );
  }

  function addLine(type: BomLine["line_type"]) {
    setLines((current) => [...current, emptyLine(type)]);
  }

  function removeLine(id: string) {
    setLines((current) => (current.length <= 1 ? current : current.filter((line) => line.id !== id)));
  }

  function pickIngredient(lineId: string, ingredientId: string) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;
    updateLine(lineId, {
      ingredient_id: ingredient.id,
      name: ingredient.ingredient_name,
      unit: ingredient.recipe_unit || ingredient.purchase_unit,
      unit_cost: Number(ingredient.true_unit_cost || ingredient.purchase_cost),
    });
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
      category: form.category,
      yield_qty: yieldQty,
      total_cost: Number(totalCost.toFixed(2)),
      selling_price: Number(form.selling_price),
      target_gp: Number(form.target_gp),
      status: form.status,
      version_note: form.version_note || null,
    };

    let recipeId = recipe.id;

    if (supabase && companyId !== "demo-company" && !recipe.id.startsWith("recipe")) {
      const { error } = await supabase.from("vyron_cost_recipes").update(payload).eq("id", recipe.id);
      if (error) {
        setMessage(error.message);
        return;
      }

      await supabase.from("vyron_cost_recipe_items").delete().eq("recipe_id", recipe.id);
      const itemRows = lines
        .filter((line) => line.name.trim())
        .map((line) => ({
          company_id: companyId,
          recipe_id: recipe.id,
          ingredient_id: line.ingredient_id || null,
          ingredient_name_snapshot: line.name,
          quantity: line.quantity,
          unit: line.unit,
          true_unit_cost: line.unit_cost,
          line_cost: calcLineCost(line),
        }));
      if (itemRows.length) {
        await supabase.from("vyron_cost_recipe_items").insert(itemRows);
      }
    }

    setMessage("Recipe and BOM saved.");
    if (linkedProductId) {
      await linkProductToRecipe(linkedProductId, recipeId, companyId);
    }
    setTimeout(() => router.push(`/recipes/${recipeId}`), 400);
  }

  function duplicateBom() {
    setLines((current) =>
      current.map((line) => ({
        ...line,
        id: crypto.randomUUID(),
      }))
    );
    setForm((current) => ({
      ...current,
      recipe_name: `${current.recipe_name} (Copy)`,
      status: "Draft",
    }));
    setMessage("BOM duplicated as draft — save to create new recipe.");
  }

  function approveBom() {
    setForm((current) => ({ ...current, status: "Approved" }));
    setMessage("BOM marked Approved. Save to persist.");
  }

  async function deleteRecipe() {
    if (supabase && !recipe.id.startsWith("recipe")) {
      await supabase.from("vyron_cost_recipe_items").delete().eq("recipe_id", recipe.id);
      await supabase.from("vyron_cost_recipes").delete().eq("id", recipe.id);
    }
    router.push("/recipes");
  }

  function renderLineGroup(title: string, type: BomLine["line_type"]) {
    const groupLines = grouped[type];
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">{title}</h3>
          <button type="button" onClick={() => addLine(type)} className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-3 py-1.5 text-xs font-black text-[#7E22CE]">
            + Add {title.toLowerCase()}
          </button>
        </div>
        <div className="space-y-3">
          {groupLines.map((line) => (
            <div key={line.id} className="rounded-xl border border-white bg-white p-3">
              <div className="grid gap-3 md:grid-cols-6">
                {type === "ingredient" ? (
                  <label className="md:col-span-2 text-xs font-black text-slate-500">
                    Ingredient
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
                      value={line.ingredient_id || ""}
                      onChange={(e) => pickIngredient(line.id, e.target.value)}
                    >
                      <option value="">Select ingredient</option>
                      {ingredients.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.ingredient_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="md:col-span-2 text-xs font-black text-slate-500">
                    Line name
                    <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={line.name} onChange={(e) => updateLine(line.id, { name: e.target.value })} />
                  </label>
                )}
                <label className="text-xs font-black text-slate-500">
                  Qty
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value) })} />
                </label>
                <label className="text-xs font-black text-slate-500">
                  Unit
                  <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} />
                </label>
                <label className="text-xs font-black text-slate-500">
                  Unit cost
                  <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={line.unit_cost} onChange={(e) => updateLine(line.id, { unit_cost: Number(e.target.value) })} />
                </label>
                {type === "wastage" ? (
                  <label className="text-xs font-black text-slate-500">
                    Wastage %
                    <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold" value={line.wastage_percent} onChange={(e) => updateLine(line.id, { wastage_percent: Number(e.target.value) })} />
                  </label>
                ) : (
                  <div className="flex items-end">
                    <div>
                      <div className="text-xs font-black uppercase text-slate-400">Line cost</div>
                      <div className="font-black text-violet-700">{formatMoney(calcLineCost(line))}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-end justify-end">
                  <button type="button" onClick={() => removeLine(line.id)} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-black text-[#F8FAFC]">BOM Builder</h2>
              <p className="mt-2 text-sm text-slate-500">Add ingredients, packaging, labour and wastage lines with live totals.</p>
            </div>
            <Link href={`/recipes/${recipe.id}`} className="text-sm font-black text-[#7E22CE]">
              View recipe
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-slate-600">
              Recipe name
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.recipe_name} onChange={(e) => updateForm("recipe_name", e.target.value)} />
            </label>
            <label className="text-sm font-black text-slate-600">
              Link finished product
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold"
                value={linkedProductId}
                onChange={(e) => setLinkedProductId(e.target.value)}
              >
                <option value="">Select finished product (optional)</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.product_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-black text-slate-600">
              Category
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.category} onChange={(e) => updateForm("category", e.target.value)} />
            </label>
            <label className="text-sm font-black text-slate-600">
              Recipe type
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.recipe_type} onChange={(e) => updateForm("recipe_type", e.target.value)}>
                <option>Finished Product</option>
                <option>Sub Recipe</option>
                <option>Prep Recipe</option>
                <option>Batch Recipe</option>
              </select>
            </label>
            <label className="text-sm font-black text-slate-600">
              Yield qty
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.yield_qty} onChange={(e) => updateForm("yield_qty", e.target.value)} />
            </label>
          </div>
        </div>

        {renderLineGroup("Ingredients", "ingredient")}
        {renderLineGroup("Packaging", "packaging")}
        {renderLineGroup("Labour", "labour")}
        {renderLineGroup("Wastage", "wastage")}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={saveRecipe} className="inline-flex items-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-6 py-4 text-sm font-black text-[#F8FAFC]">
            <Save size={18} />
            Save recipe & BOM
          </button>
          <button type="button" onClick={duplicateBom} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-6 py-4 text-sm font-black text-slate-800">
            Duplicate BOM
          </button>
          <button type="button" onClick={approveBom} className="inline-flex items-center gap-2 rounded-2xl bg-[#08111A] px-6 py-4 text-sm font-black text-[#B6D934]">
            Approve BOM
          </button>
          <button type="button" onClick={deleteRecipe} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700">
            <Trash2 size={18} />
            Delete recipe
          </button>
        </div>
        {message ? <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-black text-[#7E22CE]">{message}</div> : null}
      </div>

      <aside className="space-y-5">
        <div className="rounded-[2rem] bg-[#08111A] p-6 text-white">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-[#B6D934]">Live totals</div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-xs text-white/50">Total cost</div>
              <div className="text-4xl font-black">{formatMoney(totalCost)}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">Cost per unit</div>
              <div className="text-3xl font-black">{formatMoney(costPerUnit)}</div>
            </div>
            <div>
              <div className="text-xs text-white/50">GP preview</div>
              <div className="text-3xl font-black text-[#B6D934]">{gpPreview.toFixed(1)}%</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-sm font-black text-[#B6D934]">Suggested selling price</div>
              <div className="mt-2 text-2xl font-black">{formatMoney(suggestedPrice)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="grid gap-4">
            <label className="text-sm font-black text-slate-600">
              Selling price
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.selling_price} onChange={(e) => updateForm("selling_price", e.target.value)} />
            </label>
            <label className="text-sm font-black text-slate-600">
              Target GP %
              <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.target_gp} onChange={(e) => updateForm("target_gp", e.target.value)} />
            </label>
            <label className="text-sm font-black text-slate-600">
              Status
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" value={form.status} onChange={(e) => updateForm("status", e.target.value)}>
                <option>Approved</option>
                <option>Version Review</option>
                <option>GP Risk</option>
                <option>Draft</option>
              </select>
            </label>
            <label className="text-sm font-black text-slate-600">
              Version note
              <textarea className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium" value={form.version_note} onChange={(e) => updateForm("version_note", e.target.value)} />
            </label>
          </div>
        </div>
      </aside>
    </section>
  );
}
