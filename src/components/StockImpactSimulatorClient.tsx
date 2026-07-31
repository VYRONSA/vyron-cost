"use client";

import { useState } from "react";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StockImpactSimulatorClient({ products }: { products: ProductIntelligenceRow[] }) {
  const [wastePercent, setWastePercent] = useState(3);
  const [stockVariance, setStockVariance] = useState(2);

  const monthlyCost = products.reduce((sum, p) => sum + Number(p.total_cost || 0) * Number(p.monthly_units_estimate || 100), 0);
  const wasteLoss = monthlyCost * (wastePercent / 100);
  const varianceLoss = monthlyCost * (stockVariance / 100);
  const annual = (wasteLoss + varianceLoss) * 12;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "inventory",
        title: "Stock Impact Simulator",
        subtitle: "Premium VYRON COST workflow for stock impact simulator.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
            <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <h2 className="text-2xl font-black text-[#F8FAFC]">Simulator</h2>
              <label className="mt-5 block text-sm font-black text-slate-600">
                Waste %
                <input type="number" value={wastePercent} onChange={(e) => setWastePercent(Number(e.target.value))} className="mt-2 w-full rounded-2xl border px-4 py-3 font-bold" />
              </label>
              <label className="mt-5 block text-sm font-black text-slate-600">
                Stock variance %
                <input type="number" value={stockVariance} onChange={(e) => setStockVariance(Number(e.target.value))} className="mt-2 w-full rounded-2xl border px-4 py-3 font-bold" />
              </label>
            </div>

            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Stock Impact</div>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Monthly Waste Loss</div>
                  <div className="mt-2 text-3xl font-black">{money(wasteLoss)}</div>
                </div>
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Monthly Variance</div>
                  <div className="mt-2 text-3xl font-black">{money(varianceLoss)}</div>
                </div>
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Annual Impact</div>
                  <div className="mt-2 text-3xl font-black text-[#A855F7]">{money(annual)}</div>
                </div>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
