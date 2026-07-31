"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useModulePermissions } from "@/hooks/useModulePermissions";
import {
  buildProductCostFields,
  calculateLineCost,
  formatMoney,
  Product,
  ProductCostLine,
  sumProductCostLineTotal,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

type CostLineForm = {
  line_type: string;
  line_name: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  wastage_percent: string;
};

function lineToForm(line: ProductCostLine): CostLineForm {
  return {
    line_type: line.line_type,
    line_name: line.line_name,
    quantity: String(line.quantity ?? 1),
    unit: line.unit || "unit",
    unit_cost: String(line.unit_cost ?? 0),
    wastage_percent: String(line.wastage_percent ?? 0),
  };
}

export default function ProductCostLineEditPageClient({
  product,
  line,
  companyId,
}: {
  product: Product;
  line: ProductCostLine;
  companyId: string;
}) {
  const router = useRouter();
  const { canEdit, canDelete } = useModulePermissions("products");
  const { canEdit: canEditBom } = useModulePermissions("boms");
  const canEditLine = canEdit || canEditBom;
  const [form, setForm] = useState<CostLineForm>(() => lineToForm(line));
  const [message, setMessage] = useState("");

  const previewLineCost = useMemo(() => {
    return calculateLineCost(
      Number(form.quantity),
      Number(form.unit_cost),
      Number(form.wastage_percent)
    );
  }, [form.quantity, form.unit_cost, form.wastage_percent]);

  function updateForm(field: keyof CostLineForm, value: string) {
    if (!canEditLine) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function syncParentProductCost() {
    if (!supabase || companyId === "demo-company" || product.id.startsWith("product")) return;

    const { data: rows } = await supabase
      .from("vyron_cost_product_cost_lines")
      .select("*")
      .eq("company_id", companyId)
      .eq("product_id", product.id);

    const costPrice = sumProductCostLineTotal((rows || []) as ProductCostLine[], product);
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

  async function saveLine() {
    if (!canEditLine) {
      setMessage("You do not have permission to edit cost lines.");
      return;
    }
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

    if (supabase && companyId !== "demo-company" && !line.id.startsWith("pcl")) {
      const { error } = await supabase
        .from("vyron_cost_product_cost_lines")
        .update(payload)
        .eq("id", line.id)
        .eq("company_id", companyId);

      if (error) {
        setMessage(error.message);
        return;
      }

      await syncParentProductCost();
    }

    setMessage("Product cost line saved. Returning to product...");
    setTimeout(() => router.push(`/products/${product.id}/edit`), 450);
  }

  async function deleteLine() {
    if (!canDelete && !canEditLine) {
      setMessage("You do not have permission to delete cost lines.");
      return;
    }
    if (supabase && !line.id.startsWith("pcl")) {
      await supabase
        .from("vyron_cost_product_cost_lines")
        .delete()
        .eq("id", line.id)
        .eq("company_id", companyId);
      await syncParentProductCost();
    }

    router.push(`/products/${product.id}/edit`);
  }

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Cost Line Edit Page",
        subtitle: "Premium VYRON COST workflow for product cost line edit page.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
            <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-black text-[#F8FAFC]">Edit Product Cost Line</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    Full edit page for product ingredients, packaging, salaries, wastage, overheads and other costs.
                  </p>
                </div>

                <Link href={`/products/${product.id}/edit`} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
                  <ArrowLeft size={16} />
                  Back to Product
                </Link>
              </div>

              <div className="grid gap-5">
                <label className="text-sm font-black text-slate-600">
                  Line Type
                  <select disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.line_type} onChange={(event) => updateForm("line_type", event.target.value)}>
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
                  <input disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.line_name} onChange={(event) => updateForm("line_name", event.target.value)} />
                </label>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Quantity
                    <input type="number" disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.quantity} onChange={(event) => updateForm("quantity", event.target.value)} />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Unit
                    <input disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} />
                  </label>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Unit Cost
                    <input type="number" disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.unit_cost} onChange={(event) => updateForm("unit_cost", event.target.value)} />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Wastage %
                    <input type="number" disabled={!canEditLine} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-violet-400 disabled:bg-slate-50" value={form.wastage_percent} onChange={(event) => updateForm("wastage_percent", event.target.value)} />
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  {canEditLine ? (
                    <button type="button" onClick={saveLine} className="inline-flex items-center gap-2 rounded-2xl border border-transparent vyron-grad-surface px-6 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
                      <Save size={18} />
                      Save Cost Line
                    </button>
                  ) : null}

                  {canDelete || canEditLine ? (
                    <button type="button" onClick={deleteLine} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
                      <Trash2 size={18} />
                      Delete Cost Line
                    </button>
                  ) : null}
                </div>

                {message && <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-4 text-sm font-black text-[#7E22CE]">{message}</div>}
              </div>
            </div>

            <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A855F7]">
                LINE COST PREVIEW
              </div>

              <div className="mt-4 text-5xl font-black">{formatMoney(previewLineCost)}</div>

              <div className="mt-3 text-sm leading-7 text-slate-300">
                Quantity × unit cost plus wastage allowance.
              </div>

              <div className="mt-6 rounded-3xl border border-[#A855F7]/20 bg-white/5 p-5">
                <div className="text-sm font-black text-[#A855F7]">Product</div>
                <div className="mt-2 text-xl font-black">{product.product_name}</div>
              </div>
            </aside>
          </section>
    </VyronPremiumPageShell>
  );
}
