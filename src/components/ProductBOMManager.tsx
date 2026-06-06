"use client";

import { Edit3, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import {
  calculateGpPercent,
  calculateLineCost,
  calculateSuggestedPrice,
  formatMoney,
  Product,
  ProductCostLine,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

const emptyLineForm = {
  line_type: "Ingredient",
  line_name: "",
  quantity: "1",
  unit: "unit",
  unit_cost: "0",
  wastage_percent: "0",
};

function isLineForProduct(line: ProductCostLine, product: Product) {
  return (
    line.product_id === product.id ||
    String(line.product_name || "").trim().toLowerCase() ===
      String(product.product_name || "").trim().toLowerCase()
  );
}

export default function ProductBOMManager({
  product,
  initialLines,
  companyId,
}: {
  product: Product;
  initialLines: ProductCostLine[];
  companyId: string;
}) {
  const [lines, setLines] = useState(initialLines);
  const [form, setForm] = useState(emptyLineForm);
  const [message, setMessage] = useState("");

  const productLines = lines.filter((line) => isLineForProduct(line, product));

  const totals = useMemo(() => {
    const result = {
      Ingredient: 0,
      Packaging: 0,
      Salary: 0,
      Wastage: 0,
      Overhead: 0,
      Other: 0,
    } as Record<string, number>;

    for (const line of productLines) {
      const key = result[line.line_type] === undefined ? "Other" : line.line_type;
      result[key] += Number(line.line_cost || line.line_cost_imported || 0);
    }

    const costPrice = Object.values(result).reduce((sum, value) => sum + value, 0);
    const gp = calculateGpPercent(Number(product.selling_price), costPrice);
    const suggestedPrice = calculateSuggestedPrice(costPrice, Number(product.target_gp));

    return {
      Ingredient: result.Ingredient,
      Packaging: result.Packaging,
      Salary: result.Salary,
      Wastage: result.Wastage,
      Overhead: result.Overhead,
      Other: result.Other,
      costPrice,
      gp,
      suggestedPrice,
    };
  }, [productLines, product.selling_price, product.target_gp]);

  const previewLineCost = useMemo(() => {
    return calculateLineCost(Number(form.quantity), Number(form.unit_cost), Number(form.wastage_percent));
  }, [form.quantity, form.unit_cost, form.wastage_percent]);

  function updateForm(field: keyof typeof emptyLineForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addLine() {
    if (!form.line_name.trim()) {
      setMessage("Please enter a line name.");
      return;
    }

    const payload = {
      company_id: companyId,
      product_id: product.id,
      product_name: product.product_name,
      line_type: form.line_type,
      line_name: form.line_name.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      unit_cost: Number(form.unit_cost),
      wastage_percent: Number(form.wastage_percent),
      line_cost_imported: previewLineCost,
    };

    if (supabase && companyId !== "demo-company") {
      const { data, error } = await supabase
        .from("vyron_cost_product_cost_lines")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        setMessage(error?.message || "Could not add product cost line.");
        return;
      }

      setLines((current) => [...current, data as ProductCostLine]);
    } else {
      setLines((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          ...payload,
          line_cost: previewLineCost,
        } as ProductCostLine,
      ]);
    }

    setForm(emptyLineForm);
    setMessage("Product cost line added.");
  }

  async function deleteLine(id: string) {
    setLines((current) => current.filter((line) => line.id !== id));

    if (supabase && !id.startsWith("pcl")) {
      await supabase.from("vyron_cost_product_cost_lines").delete().eq("id", id);
    }
  }

  return (
    <section className="mt-6 grid gap-6">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Ingredients</div>
          <div className="mt-2 text-2xl font-black">{formatMoney(totals.Ingredient)}</div>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Packaging</div>
          <div className="mt-2 text-2xl font-black">{formatMoney(totals.Packaging)}</div>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Salaries</div>
          <div className="mt-2 text-2xl font-black">{formatMoney(totals.Salary)}</div>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Wastage</div>
          <div className="mt-2 text-2xl font-black">{formatMoney(totals.Wastage)}</div>
        </div>
        <div className="rounded-[1.5rem] bg-[#07110d] p-5 text-white shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Cost Price</div>
          <div className="mt-2 text-2xl font-black">{formatMoney(totals.costPrice)}</div>
        </div>
        <div className="rounded-[1.5rem] bg-[#07110d] p-5 text-white shadow-sm">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Margin</div>
          <div className="mt-2 text-2xl font-black">{totals.gp.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[#07110d]">Add Product Cost Line</h2>
              <p className="text-sm text-slate-500">Add ingredients, packaging, salaries, wastage, overheads or other costs.</p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="text-sm font-black text-slate-600">
              Line Type
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.line_type} onChange={(event) => updateForm("line_type", event.target.value)}>
                <option>Ingredient</option>
                <option>Packaging</option>
                <option>Salary</option>
                <option>Wastage</option>
                <option>Overhead</option>
                <option>Other</option>
              </select>
            </label>

            <label className="text-sm font-black text-slate-600">
              Line Name
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.line_name} onChange={(event) => updateForm("line_name", event.target.value)} />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-black text-slate-600">
                Quantity
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Unit
                <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-black text-slate-600">
                Unit Cost
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.unit_cost} onChange={(event) => updateForm("unit_cost", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Wastage %
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-emerald-400" value={form.wastage_percent} onChange={(event) => updateForm("wastage_percent", event.target.value)} />
              </label>
            </div>

            <div className="rounded-3xl bg-[#07110d] p-5 text-white">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Line Cost Preview</div>
              <div className="mt-2 text-3xl font-black">{formatMoney(previewLineCost)}</div>
            </div>

            <button type="button" onClick={addLine} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black text-[#07110d] transition hover:bg-emerald-400">
              <Plus size={18} />
              Add Cost Line
            </button>

            {message && <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div>}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#07110d]">Full Product Costing</h2>
              <p className="mt-2 text-sm text-slate-500">
                Imported lines found: <b>{productLines.length}</b>
              </p>
            </div>
            <StatusPill tone={totals.gp < Number(product.target_gp) ? "red" : "emerald"}>
              {totals.gp < Number(product.target_gp) ? "Below Target GP" : "Healthy GP"}
            </StatusPill>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
                <div>Type</div><div>Name</div><div>Qty</div><div>Unit</div><div>Unit Cost</div><div>Waste %</div><div>Line Cost</div><div>Full Edit</div><div>Delete</div>
              </div>

              {productLines.map((line) => (
                <div key={line.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div><StatusPill tone={line.line_type === "Ingredient" ? "emerald" : line.line_type === "Packaging" ? "amber" : "slate"}>{line.line_type}</StatusPill></div>
                  <div className="font-black text-[#07110d]">{line.line_name}</div>
                  <div>{Number(line.quantity).toFixed(3)}</div>
                  <div>{line.unit}</div>
                  <div>{formatMoney(Number(line.unit_cost))}</div>
                  <div>{Number(line.wastage_percent).toFixed(1)}%</div>
                  <div className="font-black text-emerald-700">{formatMoney(Number(line.line_cost || line.line_cost_imported || 0))}</div>
                  <div>
                    <Link href={`/products/${product.id}/cost-lines/${line.id}/edit`} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                      <Edit3 size={14} />
                      Open Edit Page
                    </Link>
                  </div>
                  <div>
                    <button type="button" onClick={() => deleteLine(line.id)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
