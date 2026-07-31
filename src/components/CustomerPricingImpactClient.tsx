"use client";

import { useState } from "react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerPricingImpactClient({ products }: { products: ProductIntelligenceRow[] }) {
  const [increase, setIncrease] = useState(5);
  const rows = products.slice(0, 10).map((product) => {
    const oldPrice = Number(product.selling_price || 0);
    const newPrice = oldPrice * (1 + increase / 100);
    const monthlyUnits = Number(product.monthly_units_estimate || 100);
    return {
      product,
      oldPrice,
      newPrice,
      monthlyImpact: (newPrice - oldPrice) * monthlyUnits,
    };
  });
  const monthly = rows.reduce((sum, row) => sum + row.monthlyImpact, 0);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "customers",
        title: "Customer Pricing Impact",
        subtitle: "Premium VYRON COST workflow for customer pricing impact.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <h2 className="text-3xl font-black">Customer Pricing Impact</h2>
              <p className="mt-3 text-sm font-semibold text-slate-300">Model selling price changes before sending updated price lists to clients.</p>
              <label className="mt-5 block max-w-sm text-sm font-black text-[#A855F7]">
                Price increase %
                <input type="number" value={increase} onChange={(e) => setIncrease(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none" />
              </label>
            </div>

            <section className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[2rem] bg-[#A855F7]/10 p-6">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#7E22CE]">Monthly Revenue Impact</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">{money(monthly)}</div>
              </div>
              <div className="rounded-[2rem] bg-white p-6">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Annualised</div>
                <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{money(monthly * 12)}</div>
              </div>
            </section>

            <div className="overflow-hidden rounded-[2rem] bg-white">
              <div className="grid grid-cols-5 bg-[#07110d] px-5 py-4 text-xs font-black uppercase text-[#A855F7]">
                <div className="col-span-2">Product</div>
                <div>Old Price</div>
                <div>New Price</div>
                <div>Monthly Impact</div>
              </div>
              {rows.map((row) => (
                <div key={row.product.id} className="grid grid-cols-5 border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2 font-black">{row.product.product_name}</div>
                  <div>{money(row.oldPrice)}</div>
                  <div className="font-black text-[#7E22CE]">{money(row.newPrice)}</div>
                  <div>{money(row.monthlyImpact)}</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
