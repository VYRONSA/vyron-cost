"use client";

import Link from "next/link";
import { ArrowRight, Factory, PackageCheck } from "lucide-react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ProductionPlanningClient({ products }: { products: ProductIntelligenceRow[] }) {
  const productionRows = products.slice(0, 12).map((product, index) => {
    const monthlyUnits = Number(product.monthly_units_estimate || 120 + index * 15);
    const weeklyUnits = Math.ceil(monthlyUnits / 4.33);
    const batchSize = product.category?.toLowerCase().includes("large") ? 12 : 24;
    const batches = Math.ceil(weeklyUnits / batchSize);
    const ingredientBudget = Number(product.total_cost || 0) * weeklyUnits;
    return { product, weeklyUnits, batchSize, batches, ingredientBudget };
  });

  const totalBudget = productionRows.reduce((sum, row) => sum + row.ingredientBudget, 0);
  const totalBatches = productionRows.reduce((sum, row) => sum + row.batches, 0);

  return (
    <section className="grid gap-6">
      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <Factory className="text-emerald-700" size={30} />
          <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Weekly Batches</div>
          <div className="mt-2 text-4xl font-black text-[#07110d]">{totalBatches}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <PackageCheck className="text-emerald-700" size={30} />
          <div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Ingredient Budget</div>
          <div className="mt-2 text-4xl font-black text-emerald-700">{money(totalBudget)}</div>
        </div>
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Planning Basis</div>
          <div className="mt-2 text-3xl font-black">BOM × Forecast Demand</div>
          <p className="mt-2 text-sm font-semibold text-slate-300">Client demo planning model for Handcrafted Foods.</p>
        </div>
      </section>

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
            <div className="col-span-2">Product</div>
            <div>Weekly Units</div>
            <div>Batch Size</div>
            <div>Batches</div>
            <div>Ingredient Budget</div>
            <div>Open</div>
          </div>

          {productionRows.map((row) => (
            <div key={row.product.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
              <div className="col-span-2">
                <div className="font-black text-[#07110d]">{row.product.product_name}</div>
                <div className="text-xs font-bold text-slate-500">{row.product.category}</div>
              </div>
              <div>{row.weeklyUnits}</div>
              <div>{row.batchSize}</div>
              <div className="font-black text-emerald-700">{row.batches}</div>
              <div className="font-black">{money(row.ingredientBudget)}</div>
              <Link href={row.product.product_id ? `/products/${row.product.product_id}` : "/products"} className="inline-flex items-center gap-2 text-sm font-black text-emerald-700">
                Product <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
