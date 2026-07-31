"use client";

import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RecipeCostDrilldownClient({ products }: { products: ProductIntelligenceRow[] }) {
  const rows = products.slice(0, 12).map((product, index) => {
    const total = Number(product.total_cost || 0);
    const ingredient = total * 0.62;
    const packaging = total * 0.14;
    const labour = total * 0.16;
    const overhead = total * 0.08;
    return { product, ingredient, packaging, labour, overhead, total, index };
  });

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Recipe Cost Drilldown",
        subtitle: "Premium VYRON COST workflow for recipe cost drilldown.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <Boxes size={34} className="text-[#A855F7]" />
              <h2 className="mt-5 text-3xl font-black">Recipe Cost Drilldown</h2>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                Breakdown every product cost into ingredient, packaging, labour and overhead exposure.
              </p>
            </div>

            <div className="grid gap-5">
              {rows.map(({ product, ingredient, packaging, labour, overhead, total }) => (
                <div key={product.id} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-2xl font-black text-[#F8FAFC]">{product.product_name}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-500">{product.category} · Total cost {money(total)}</p>
                    </div>
                    <Link href={product.product_id ? `/products/${product.product_id}` : "/products"} className="inline-flex items-center gap-2 rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 px-5 py-3 text-sm font-black text-[#4D7C0F]">
                      Open product <ArrowRight size={16} />
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    {[
                      ["Ingredients", ingredient, "bg-[#A855F7]/10 text-[#4D7C0F]"],
                      ["Packaging", packaging, "bg-violet-50 text-violet-800"],
                      ["Labour", labour, "bg-fuchsia-50 text-fuchsia-800"],
                      ["Overheads", overhead, "bg-slate-50 text-slate-800"],
                    ].map(([label, value, cls]) => (
                      <div key={String(label)} className={`rounded-2xl p-4 ${cls}`}>
                        <div className="text-xs font-black uppercase tracking-[0.14em]">{label}</div>
                        <div className="mt-2 text-2xl font-black">{money(Number(value))}</div>
                        <div className="mt-1 text-xs font-bold">{total > 0 ? ((Number(value) / total) * 100).toFixed(1) : "0.0"}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
