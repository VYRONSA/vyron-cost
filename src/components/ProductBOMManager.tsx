"use client";

import { Calculator, Edit3, Layers, Plus, ShieldCheck, Sparkles, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import {
  buildProductCostFields,
  calculateGpPercent,
  calculateLineCost,
  calculateSuggestedPrice,
  formatMoney,
  isCostLineForProduct,
  Product,
  ProductCostLine,
  sumProductCostLineTotal,
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

async function syncProductCostFromLines(
  product: Product,
  lineList: ProductCostLine[],
  companyId: string
) {
  if (!supabase || companyId === "demo-company" || product.id.startsWith("product")) return;

  const costPrice = sumProductCostLineTotal(lineList, product);
  const derived = buildProductCostFields(
    Number(product.selling_price),
    Number(product.target_gp),
    costPrice
  );

  await supabase
    .from("vyron_cost_products")
    .update({
      ...derived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", product.id)
    .eq("company_id", companyId);
}

function inputClass() {
  return "mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";
}

function labelClass() {
  return "text-xs font-black uppercase tracking-[0.14em] text-slate-500";
}

export default function ProductBOMManager({
  product,
  initialLines,
  companyId,
  readOnly = false,
}: {
  product: Product;
  initialLines: ProductCostLine[];
  companyId: string;
  readOnly?: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [form, setForm] = useState(emptyLineForm);
  const [message, setMessage] = useState("");

  const productLines = lines.filter((line) => isCostLineForProduct(line, product));

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
    if (readOnly) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function addLine() {
    if (readOnly) return;
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
      line_cost: previewLineCost,
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

      const nextLines = [...lines, data as ProductCostLine];
      setLines(nextLines);
      await syncProductCostFromLines(product, nextLines, companyId);
    } else {
      const nextLines = [
        ...lines,
        {
          id: crypto.randomUUID(),
          ...payload,
        } as ProductCostLine,
      ];
      setLines(nextLines);
    }

    setForm(emptyLineForm);
    setMessage("Product cost line added.");
  }

  async function deleteLine(id: string) {
    if (readOnly) return;
    const nextLines = lines.filter((line) => line.id !== id);
    setLines(nextLines);

    if (supabase && !id.startsWith("pcl")) {
      await supabase
        .from("vyron_cost_product_cost_lines")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      await syncProductCostFromLines(product, nextLines, companyId);
    }
  }

  const isBelowTarget = totals.gp < Number(product.target_gp);
  const label = labelClass();

  return (
    <section className="mt-6 grid gap-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-[#07110d] p-7 text-white shadow-[0_22px_65px_rgba(15,23,42,0.24)]">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#A855F7]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-52 w-52 rounded-full bg-[#A855F7]/10 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#CBD5E1]">
              <Sparkles size={14} /> Cost Driver Analysis
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] md:text-4xl">Understand exactly where product cost originates.</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-violet-100">
              Break product cost into ingredients, packaging, labour, overheads and wastage so every margin movement can be explained and protected.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Profit discipline</div>
            <p className="mt-3 text-lg font-black leading-snug text-white">&ldquo;Profit is often won before stock arrives.&rdquo;</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">Cost lines turn production detail into pricing confidence.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        {[
          { label: "Ingredients", value: formatMoney(totals.Ingredient), tone: "bg-white text-slate-950", icon: Layers },
          { label: "Packaging", value: formatMoney(totals.Packaging), tone: "bg-violet-50 text-violet-800", icon: Layers },
          { label: "Salaries", value: formatMoney(totals.Salary), tone: "bg-white text-slate-950", icon: Layers },
          { label: "Wastage", value: formatMoney(totals.Wastage), tone: "bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]", icon: ShieldCheck },
          { label: "Cost Price", value: formatMoney(totals.costPrice), tone: "bg-[#07110d] text-white", icon: Calculator },
          { label: "Margin", value: `${totals.gp.toFixed(1)}%`, tone: isBelowTarget ? "bg-red-50 text-red-700" : "bg-[#A855F7]/10 text-[#7E22CE]", icon: TrendingUp },
        ].map((card) => (
          <div key={card.label} className={`rounded-[1.6rem] p-5 shadow-[0_18px_45px_rgba(81,63,190,0.08)] ${card.tone}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">{card.label}</div>
              <card.icon size={18} className="opacity-70" />
            </div>
            <div className="mt-2 text-2xl font-black">{card.value}</div>
          </div>
        ))}
      </div>

      {readOnly ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-600">
          Cost lines are read-only. You need product or BOM edit permission to add or change lines.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
        {!readOnly ? (
          <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_18px_55px_rgba(81,63,190,0.08)]">
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#A855F7]/25 bg-[#A855F7]/12 text-[#7E22CE]">
                <Plus size={22} />
              </div>
              <div>
                <div className={label}>Add cost driver</div>
                <h2 className="text-2xl font-black text-slate-950">Add Product Cost Line</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Capture ingredients, packaging, salaries, wastage, overheads or other direct product costs.</p>
              </div>
            </div>

            <div className="grid gap-4">
              <label className={label}>
                Line Type
                <select className={inputClass()} value={form.line_type} onChange={(event) => updateForm("line_type", event.target.value)}>
                  <option>Ingredient</option>
                  <option>Packaging</option>
                  <option>Salary</option>
                  <option>Wastage</option>
                  <option>Overhead</option>
                  <option>Other</option>
                </select>
              </label>

              <label className={label}>
                Line Name
                <input className={inputClass()} value={form.line_name} onChange={(event) => updateForm("line_name", event.target.value)} placeholder="e.g. Beef filling, foil tray, prep labour" />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={label}>
                  Quantity
                  <input type="number" className={inputClass()} value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} />
                </label>

                <label className={label}>
                  Unit
                  <input className={inputClass()} value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className={label}>
                  Unit Cost
                  <input type="number" className={inputClass()} value={form.unit_cost} onChange={(event) => updateForm("unit_cost", event.target.value)} />
                </label>

                <label className={label}>
                  Wastage %
                  <input type="number" className={inputClass()} value={form.wastage_percent} onChange={(event) => updateForm("wastage_percent", event.target.value)} />
                </label>
              </div>

              <div className="relative overflow-hidden rounded-3xl bg-[#07110d] p-5 text-white">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#A855F7]/10 blur-2xl" />
                <div className="relative text-xs font-black uppercase tracking-[0.22em] text-[#A855F7]">Line Cost Preview</div>
                <div className="relative mt-2 text-3xl font-black">{formatMoney(previewLineCost)}</div>
                <p className="relative mt-2 text-xs font-semibold leading-5 text-slate-300">Quantity × unit cost with wastage applied.</p>
              </div>

              <button type="button" onClick={addLine} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_12px_30px_rgba(29,107,255,0.25)] transition hover:from-violet-800 hover:to-fuchsia-700">
                <Plus size={18} />
                Add Cost Line
              </button>

              {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-4 py-3 text-sm font-bold text-[#7E22CE]">{message}</div>}
            </div>
          </div>
        ) : null}

        <div className={`rounded-[2rem] border border-white bg-white p-6 shadow-[0_18px_55px_rgba(81,63,190,0.08)] ${readOnly ? "xl:col-span-2" : ""}`}>
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className={label}>Cost structure</div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Full Product Costing</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Imported lines found: <b>{productLines.length}</b>. These lines drive product cost, GP and suggested selling price.
              </p>
            </div>
            <StatusPill tone={isBelowTarget ? "red" : "emerald"}>
              {isBelowTarget ? "Below Target GP" : "Healthy GP"}
            </StatusPill>
          </div>

          {productLines.length === 0 ? (
            <div className="mb-5 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 px-5 py-6">
              <div className="text-sm font-black text-violet-800">No cost lines captured yet</div>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Add cost lines to turn this product into a live profitability model. Start with the highest-value ingredients, then add packaging, labour, overheads and wastage.
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-3xl border border-slate-100">
            <div className="min-w-[1080px]">
              <div className={`grid ${readOnly ? "grid-cols-7" : "grid-cols-9"} bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]`}>
                <div>Type</div><div>Name</div><div>Qty</div><div>Unit</div><div>Unit Cost</div><div>Waste %</div><div>Line Cost</div>
                {!readOnly ? <><div>Full Edit</div><div>Delete</div></> : null}
              </div>

              {productLines.map((line) => (
                <div key={line.id} className={`grid ${readOnly ? "grid-cols-7" : "grid-cols-9"} items-center border-t border-slate-100 px-5 py-5 text-sm`}>
                  <div><StatusPill tone={line.line_type === "Ingredient" ? "emerald" : line.line_type === "Packaging" ? "amber" : "slate"}>{line.line_type}</StatusPill></div>
                  <div className="font-black text-[#F8FAFC]">{line.line_name}</div>
                  <div>{Number(line.quantity).toFixed(3)}</div>
                  <div>{line.unit}</div>
                  <div>{formatMoney(Number(line.unit_cost))}</div>
                  <div>{Number(line.wastage_percent).toFixed(1)}%</div>
                  <div className="font-black text-[#7E22CE]">{formatMoney(Number(line.line_cost || line.line_cost_imported || 0))}</div>
                  {!readOnly ? (
                    <>
                      <div>
                        <Link href={`/products/${product.id}/cost-lines/${line.id}/edit`} className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">
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
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
