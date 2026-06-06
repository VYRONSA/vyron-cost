"use client";

import { ArrowRight, Calculator, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BomHeader, BomLine, calcGp, calcLineCost, calcSuggestedPrice, formatMoney } from "@/lib/vyron-cost-bom-data";
import { CostIngredient } from "@/lib/vyron-cost-core-data";
import { supabase } from "@/lib/supabase";

type DraftLine = Omit<BomLine, "id" | "bom_id" | "line_cost"> & { temp_id: string };
const lineTypes = ["Ingredient", "Packaging", "Labour", "Overhead", "Wastage"];

function newLine(sortOrder: number, type = "Ingredient"): DraftLine {
  return {
    temp_id: crypto.randomUUID(),
    line_type: type,
    ingredient_id: null,
    line_name: type === "Ingredient" ? "" : type,
    quantity: 0,
    unit: type === "Packaging" ? "unit" : type === "Labour" ? "hour" : type === "Overhead" ? "batch" : "kg",
    unit_cost: 0,
    wastage_percent: 0,
    sort_order: sortOrder,
  };
}

export default function BomBuilderClient({
  ingredients,
  existingBom,
  existingLines,
}: {
  ingredients: CostIngredient[];
  existingBom?: BomHeader | null;
  existingLines?: BomLine[];
}) {
  const [bomName, setBomName] = useState(existingBom?.bom_name || "");
  const [category, setCategory] = useState(existingBom?.category || "Handcrafted Pies");
  const [yieldQty, setYieldQty] = useState(String(existingBom?.yield_qty || 1));
  const [yieldUnit, setYieldUnit] = useState(existingBom?.yield_unit || "unit");
  const [targetGp, setTargetGp] = useState(String(existingBom?.target_gp || 40));
  const [sellingPrice, setSellingPrice] = useState(String(existingBom?.selling_price || 0));
  const [status, setStatus] = useState(existingBom?.status || "Draft");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const [lines, setLines] = useState<DraftLine[]>(
    existingLines?.length
      ? existingLines.map((line, index) => ({
          temp_id: line.id || crypto.randomUUID(),
          line_type: line.line_type || "Ingredient",
          ingredient_id: line.ingredient_id || null,
          line_name: line.line_name || "",
          quantity: Number(line.quantity || 0),
          unit: line.unit || "unit",
          unit_cost: Number(line.unit_cost || 0),
          wastage_percent: Number(line.wastage_percent || 0),
          sort_order: line.sort_order ?? index,
        }))
      : [newLine(0)]
  );

  const filteredIngredients = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return ingredients;
    return ingredients.filter((item) =>
      [item.ingredient_name, item.category || "", item.purchase_unit || "", item.recipe_unit || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [ingredients, itemSearch]);

  const totalCost = useMemo(() => lines.reduce((sum, line) => sum + calcLineCost(line), 0), [lines]);
  const numericYield = Number(yieldQty || 0);
  const numericSelling = Number(sellingPrice || 0);
  const numericTargetGp = Number(targetGp || 0);
  const costPerUnit = numericYield > 0 ? totalCost / numericYield : totalCost;
  // Demo stabilisation rule: the visible Selling Price field on this BOM screen is the batch/product selling price.
  // Therefore Actual GP and Suggested Price must compare against the full BOM total cost, not only Cost / Unit.
  const actualGp = calcGp(numericSelling, totalCost);
  const suggestedPrice = calcSuggestedPrice(totalCost, numericTargetGp);

  function updateLine(tempId: string, field: keyof DraftLine, value: string | number | null) {
    setLines((current) => current.map((line) => (line.temp_id === tempId ? { ...line, [field]: value } : line)));
  }

  function selectIngredient(tempId: string, ingredientId: string) {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    if (!ingredient) return;

    setLines((current) =>
      current.map((line) =>
        line.temp_id === tempId
          ? {
              ...line,
              ingredient_id: ingredient.id,
              line_name: ingredient.ingredient_name,
              unit: ingredient.recipe_unit || ingredient.purchase_unit || "kg",
              unit_cost: Number(ingredient.true_unit_cost || ingredient.purchase_cost || 0),
            }
          : line
      )
    );
  }

  function validate() {
    if (!bomName.trim()) return "BOM name is required.";
    if (!numericYield || numericYield <= 0) return "Yield quantity must be more than 0.";
    const bad = lines.find((line) => !line.line_name.trim() || Number(line.quantity || 0) <= 0);
    if (bad) return "Every line must have a name and quantity greater than 0.";
    return "";
  }

  async function recalcLinkedProducts(bomId: string) {
    if (!supabase) return 0;
    const { data } = await supabase.from("vyron_cost_products").select("id,selling_price,target_gp").eq("linked_bom_id", bomId);
    if (!data?.length) return 0;

    for (const product of data) {
      const gp = calcGp(Number(product.selling_price || 0), totalCost);
      const price = calcSuggestedPrice(totalCost, Number(product.target_gp || 40));
      await supabase.from("vyron_cost_products").update({ total_cost: totalCost, cost_per_unit: costPerUnit, calculated_gp: gp, suggested_selling_price: price }).eq("id", product.id);
    }
    return data.length;
  }

  async function saveBom() {
    setMessage("");
    setErrorMessage("");
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        bom_name: bomName.trim(),
        category,
        yield_qty: numericYield,
        yield_unit: yieldUnit || "unit",
        target_gp: numericTargetGp,
        selling_price: numericSelling,
        total_cost: totalCost,
        cost_per_unit: costPerUnit,
        calculated_gp: actualGp,
        suggested_selling_price: suggestedPrice,
        status,
        updated_at: new Date().toISOString(),
      };

      let bomId = existingBom?.id && !existingBom.id.startsWith("demo") ? existingBom.id : null;

      if (bomId) {
        const { error } = await supabase.from("vyron_cost_boms").update(payload).eq("id", bomId);
        if (error) throw error;
        const { error: deleteError } = await supabase.from("vyron_cost_bom_lines").delete().eq("bom_id", bomId);
        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase.from("vyron_cost_boms").insert(payload).select("id").single();
        if (error) throw error;
        bomId = data.id;
      }

      const lineRows = lines.map((line, index) => ({
        bom_id: bomId,
        line_type: line.line_type,
        ingredient_id: line.ingredient_id || null,
        line_name: line.line_name.trim(),
        quantity: Number(line.quantity || 0),
        unit: line.unit || "unit",
        unit_cost: Number(line.unit_cost || 0),
        wastage_percent: Number(line.wastage_percent || 0),
        sort_order: index,
      }));

      const { error: lineError } = await supabase.from("vyron_cost_bom_lines").insert(lineRows);
      if (lineError) throw lineError;

      const count = await recalcLinkedProducts(bomId as string);
      setMessage(`BOM saved. ${count} linked product${count === 1 ? "" : "s"} recalculated.`);
    } catch (error: any) {
      setErrorMessage(error?.message || "BOM save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">BOM Builder</h2>
            <p className="text-sm font-semibold text-slate-500">Ingredients, packaging, labour, overhead, wastage and yield.</p>
          </div>
          <button onClick={saveBom} disabled={saving} className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-6 py-4 text-sm font-black uppercase tracking-[0.12em] text-white disabled:opacity-60">
            <Save size={18} /> {saving ? "Saving..." : "Save BOM"}
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-6">
          <input value={bomName} onChange={(e) => setBomName(e.target.value)} placeholder="BOM / Recipe Name" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none xl:col-span-2" />
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <input type="number" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} placeholder="Yield" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <input value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)} placeholder="Yield Unit" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <input type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="Selling Price" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <input type="number" value={targetGp} onChange={(e) => setTargetGp(e.target.value)} placeholder="Target GP %" className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border border-slate-200 px-4 py-3 font-semibold outline-none">
            <option>Draft</option><option>Review</option><option>Approved</option><option>Archived</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        {[
          ["Total Cost", formatMoney(totalCost), "text-slate-900"],
          ["Cost / Unit", formatMoney(costPerUnit), "text-violet-700"],
          ["Actual GP", `${actualGp.toFixed(1)}%`, actualGp < numericTargetGp ? "text-red-600" : "text-emerald-600"],
          ["Suggested Batch Price", formatMoney(suggestedPrice), "text-emerald-600"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className={`mt-2 text-3xl font-black ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      {message && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-700">{message}</div>}
      {errorMessage && <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{errorMessage}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">Cost Lines</h2>
              <input
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search ingredients / packaging while selecting..."
                className="mt-3 w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {lineTypes.map((type) => (
                <button key={type} type="button" onClick={() => setLines((c) => [...c, newLine(c.length, type)])} className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
                  <Plus size={14} /> {type}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <div className="min-w-[1050px]">
              <div className="grid grid-cols-[125px_290px_90px_90px_110px_90px_120px_55px] bg-slate-50 px-3 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                <div>Type</div><div>Line</div><div>Qty</div><div>Unit</div><div>Unit Cost</div><div>Waste %</div><div>Line Cost</div><div></div>
              </div>

              {lines.map((line) => (
                <div key={line.temp_id} className="grid grid-cols-[125px_290px_90px_90px_110px_90px_120px_55px] items-center border-t border-slate-100 px-3 py-2 text-sm">
                  <select value={line.line_type} onChange={(e) => updateLine(line.temp_id, "line_type", e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none">
                    {lineTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>

                  {line.line_type === "Ingredient" || line.line_type === "Packaging" ? (
                    <select value={line.ingredient_id || ""} onChange={(e) => selectIngredient(line.temp_id, e.target.value)} className="mx-2 h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none">
                      <option value="">Choose item...</option>
                      {filteredIngredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.ingredient_name}</option>)}
                    </select>
                  ) : (
                    <input value={line.line_name} onChange={(e) => updateLine(line.temp_id, "line_name", e.target.value)} className="mx-2 h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" />
                  )}

                  <input type="number" value={line.quantity} onChange={(e) => updateLine(line.temp_id, "quantity", Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" />
                  <input value={line.unit} onChange={(e) => updateLine(line.temp_id, "unit", e.target.value)} className="mx-2 h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" />
                  <input type="number" value={line.unit_cost} onChange={(e) => updateLine(line.temp_id, "unit_cost", Number(e.target.value))} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" />
                  <input type="number" value={line.wastage_percent} onChange={(e) => updateLine(line.temp_id, "wastage_percent", Number(e.target.value))} className="mx-2 h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold outline-none" />
                  <div className="text-right text-sm font-black text-slate-900">{formatMoney(calcLineCost(line))}</div>
                  <button type="button" onClick={() => setLines((c) => c.filter((x) => x.temp_id !== line.temp_id))} className="ml-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-[2rem] bg-white p-5 shadow-[0_18px_50px_rgba(81,63,190,0.08)]">
          <Calculator size={28} className="text-violet-700" />
          <h2 className="mt-5 text-2xl font-black text-slate-900">Formula</h2>
          <div className="mt-5 space-y-4 text-sm font-semibold leading-7 text-slate-600">
            <p><b>Line Cost</b> = Qty × Unit Cost × Waste.</p>
            <p><b>Total Cost</b> = all cost lines.</p>
            <p><b>Cost / Unit</b> = Total Cost ÷ Yield.</p>
            <p><b>Actual GP</b> = Selling Price − Total Cost ÷ Selling Price.</p>
            <p><b>Suggested Batch Price</b> = Total Cost ÷ (1 - Target GP%).</p>
          </div>
          <Link href="/recipes" className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white">
            Back to Recipes <ArrowRight size={16} />
          </Link>
        </aside>
      </div>
    </section>
  );
}
