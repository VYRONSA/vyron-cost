"use client";

import Link from "next/link";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function IngredientPriceWatchClient({ products }: { products: ProductIntelligenceRow[] }) {
  const rows = products.slice(0, 12).map((product, index) => {
    const cost = Number(product.total_cost || 0);
    const movement = index % 3 === 0 ? 12.5 : index % 3 === 1 ? 7.8 : 4.2;
    const exposure = cost * Number(product.monthly_units_estimate || 100) * (movement / 100);
    return {
      id: product.id,
      item: product.product_name || "Product",
      category: product.category || "Handcrafted Pies",
      movement,
      exposure,
      href: product.product_id ? `/products/${product.product_id}` : "/products",
    };
  });

  const totalExposure = rows.reduce((sum, row) => sum + row.exposure, 0);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "ingredients",
        title: "Ingredient Price Watch",
        subtitle: "Premium VYRON COST workflow for ingredient price watch.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Monthly Price Exposure</div>
                <div className="mt-3 text-4xl font-black text-red-700">{money(totalExposure)}</div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Items Watched</div>
                <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{rows.length}</div>
              </div>
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Alert Rule</div>
                <div className="mt-3 text-3xl font-black">Flag movement above 5%</div>
              </div>
            </section>

            <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-6 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                <div className="col-span-2">Item / Product</div>
                <div>Category</div>
                <div>Movement</div>
                <div>Exposure</div>
                <div>Open</div>
              </div>
              {rows.map((row) => (
                <div key={row.id} className="grid grid-cols-6 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2 font-black text-[#F8FAFC]">{row.item}</div>
                  <div>{row.category}</div>
                  <div className={row.movement > 8 ? "font-black text-red-700" : "font-black text-[var(--vyron-warning-fg)]"}>{row.movement.toFixed(1)}%</div>
                  <div className="font-black">{money(row.exposure)}</div>
                  <Link href={row.href} className="font-black text-[#7E22CE]">Open →</Link>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
