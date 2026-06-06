"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ProductBOMManager from "@/components/ProductBOMManager";
import {
  calculateGpPercent,
  calculateSuggestedPrice,
  formatMoney,
  Product,
  ProductCostLine,
} from "@/lib/vyron-cost-data";
import { supabase } from "@/lib/supabase";

type ProductForm = {
  product_name: string;
  category: string;
  selling_price: string;
  total_cost: string;
  target_gp: string;
  salary_cost: string;
  packaging_cost: string;
  overhead_cost: string;
  wastage_percent: string;
};

function productToForm(item: Product): ProductForm {
  return {
    product_name: item.product_name,
    category: item.category,
    selling_price: String(item.selling_price ?? 0),
    total_cost: String(item.total_cost ?? 0),
    target_gp: String(item.target_gp ?? 40),
    salary_cost: String(item.salary_cost ?? 0),
    packaging_cost: String(item.packaging_cost ?? 0),
    overhead_cost: String(item.overhead_cost ?? 0),
    wastage_percent: String(item.wastage_percent ?? 0),
  };
}

export default function ProductEditPageClient({
  product,
  costLines,
  companyId,
}: {
  product: Product;
  costLines: ProductCostLine[];
  companyId: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProductForm>(() => productToForm(product));
  const [message, setMessage] = useState("");

  const gpPreview = useMemo(() => {
    return calculateGpPercent(Number(form.selling_price), Number(form.total_cost));
  }, [form.selling_price, form.total_cost]);

  const suggestedPrice = useMemo(() => {
    return calculateSuggestedPrice(Number(form.total_cost), Number(form.target_gp));
  }, [form.total_cost, form.target_gp]);

  function updateForm(field: keyof ProductForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProduct() {
    if (!form.product_name.trim()) {
      setMessage("Please enter a product name.");
      return;
    }

    const payload = {
      company_id: companyId,
      product_name: form.product_name.trim(),
      category: form.category,
      selling_price: Number(form.selling_price),
      total_cost: Number(form.total_cost),
      target_gp: Number(form.target_gp),
      salary_cost: Number(form.salary_cost),
      packaging_cost: Number(form.packaging_cost),
      overhead_cost: Number(form.overhead_cost),
      wastage_percent: Number(form.wastage_percent),
    };

    if (supabase && companyId !== "demo-company" && !product.id.startsWith("product")) {
      const { error } = await supabase
        .from("vyron_cost_products")
        .update(payload)
        .eq("id", product.id);

      if (error) {
        setMessage(error.message);
        return;
      }
    }

    setMessage("Product saved.");
  }

  async function deleteProduct() {
    if (supabase && !product.id.startsWith("product")) {
      await supabase.from("vyron_cost_products").delete().eq("id", product.id);
    }

    router.push("/products");
  }

  const liveProduct: Product = {
    ...product,
    product_name: form.product_name,
    category: form.category,
    selling_price: Number(form.selling_price),
    total_cost: Number(form.total_cost),
    target_gp: Number(form.target_gp),
    salary_cost: Number(form.salary_cost),
    packaging_cost: Number(form.packaging_cost),
    overhead_cost: Number(form.overhead_cost),
    wastage_percent: Number(form.wastage_percent),
  };

  return (
    <section className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.75fr]">
        <div className="rounded-[2rem] border border-white bg-white p-7 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-black text-[#07110d]">Edit Product</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                Product setup plus full costing lines for ingredients, packaging, salaries, wastage and overheads.
              </p>
            </div>

            <Link href="/products" className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
              <ArrowLeft size={16} />
              Back to Products
            </Link>
          </div>

          <div className="grid gap-5">
            <label className="text-sm font-black text-slate-600">
              Product Name
              <input className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.product_name} onChange={(event) => updateForm("product_name", event.target.value)} />
            </label>

            <label className="text-sm font-black text-slate-600">
              Category
              <select className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
                <option>Sushi</option>
                <option>Bowls</option>
                <option>Ready Meals</option>
                <option>Packaging</option>
                <option>Other</option>
              </select>
            </label>

            <div className="grid gap-5 md:grid-cols-3">
              <label className="text-sm font-black text-slate-600">
                Selling Price
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.selling_price} onChange={(event) => updateForm("selling_price", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Cost Price
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.total_cost} onChange={(event) => updateForm("total_cost", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Target GP %
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.target_gp} onChange={(event) => updateForm("target_gp", event.target.value)} />
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-4">
              <label className="text-sm font-black text-slate-600">
                Packaging Cost
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.packaging_cost} onChange={(event) => updateForm("packaging_cost", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Salary Cost
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.salary_cost} onChange={(event) => updateForm("salary_cost", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Overhead Cost
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.overhead_cost} onChange={(event) => updateForm("overhead_cost", event.target.value)} />
              </label>

              <label className="text-sm font-black text-slate-600">
                Wastage %
                <input type="number" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-base font-bold outline-none focus:border-emerald-400" value={form.wastage_percent} onChange={(event) => updateForm("wastage_percent", event.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={saveProduct} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-[#07110d] transition hover:bg-emerald-400">
                Save Product
              </button>

              <button type="button" onClick={deleteProduct} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-6 py-4 text-sm font-black text-red-700 transition hover:bg-red-100">
                <Trash2 size={18} />
                Delete Product
              </button>
            </div>

            {message && <div className="rounded-2xl bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{message}</div>}
          </div>
        </div>

        <aside className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <div className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            PRODUCT GP PREVIEW
          </div>

          <div className="mt-4 text-5xl font-black">{gpPreview.toFixed(1)}%</div>

          <div className="mt-3 text-sm leading-7 text-slate-300">
            Current gross profit based on selling price and cost price field.
          </div>

          <div className="mt-6 rounded-3xl border border-emerald-400/15 bg-white/5 p-5">
            <div className="text-sm font-black text-emerald-300">Suggested Selling Price</div>
            <div className="mt-2 text-3xl font-black">{formatMoney(suggestedPrice)}</div>
            <div className="mt-2 text-sm leading-7 text-slate-300">
              Price needed to reach the selected target GP.
            </div>
          </div>
        </aside>
      </section>

      <ProductBOMManager
        product={liveProduct}
        initialLines={costLines}
        companyId={companyId}
      />
    </section>
  );
}
