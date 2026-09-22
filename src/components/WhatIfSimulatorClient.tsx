import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/vyron-cost-data";
import { WhatIfScenario } from "@/lib/vyron-demo-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function WhatIfSimulatorClient({ scenario }: { scenario: WhatIfScenario }) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "What If Simulator",
        subtitle: "Premium VOLORA workflow for what if simulator.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2.5rem] border border-[#2C5A6B]/25 bg-[#061722] p-8 text-white">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#2C5A6B]">Demo scenario</div>
              <div className="mt-4 text-3xl font-black">
                {scenario.ingredient} cost +{scenario.increasePercent}%
              </div>
              <div className="mt-2 text-sm text-slate-400">Impact on GP, annual profit and recommended selling price.</div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Current GP</div>
                <div className="mt-2 flex items-center gap-2 text-3xl font-black text-[#163A48]">
                  <TrendingUp size={22} />
                  {scenario.currentGp.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">New GP</div>
                <div className="mt-2 flex items-center gap-2 text-3xl font-black text-red-700">
                  <TrendingDown size={22} />
                  {scenario.newGp.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-[2rem] bg-red-50 p-6">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-red-800">Annual Impact</div>
                <div className="mt-2 text-3xl font-black text-red-900">{formatMoney(scenario.annualImpact)}</div>
              </div>
              <div className="rounded-[2rem] bg-[#061722] p-6 text-white">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#2C5A6B]">Suggested Price</div>
                <div className="mt-2 text-3xl font-black">{formatMoney(scenario.suggestedPrice)}</div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(11,32,43,0.06)]">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#163A48]">Products affected</div>
              <div className="mt-4 flex flex-wrap gap-3">
                {scenario.productsAffected.map((product) => (
                  <span key={product} className="rounded-full border border-[#2C5A6B]/25 bg-[#2C5A6B]/10 px-4 py-2 text-sm font-black text-[#2F7C40]">
                    {product}
                  </span>
                ))}
              </div>
              <Link
                href="/product-profitability"
                className="mt-6 inline-flex rounded-full bg-[#061722] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#2C5A6B]"
              >
                Open product profitability
              </Link>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
