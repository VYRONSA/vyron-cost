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
        subtitle: "Premium VYRON COST workflow for what if simulator.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2.5rem] border border-[#A855F7]/25 bg-[#07110d] p-8 text-white">
              <div className="text-xs font-black uppercase tracking-[0.25em] text-[#A855F7]">Demo scenario</div>
              <div className="mt-4 text-3xl font-black">
                {scenario.ingredient} cost +{scenario.increasePercent}%
              </div>
              <div className="mt-2 text-sm text-slate-400">Impact on GP, annual profit and recommended selling price.</div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-sm">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Current GP</div>
                <div className="mt-2 flex items-center gap-2 text-3xl font-black text-[#7E22CE]">
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
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
                <div className="text-xs font-black uppercase tracking-[0.2em] text-[#A855F7]">Suggested Price</div>
                <div className="mt-2 text-3xl font-black">{formatMoney(scenario.suggestedPrice)}</div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-[#7E22CE]">Products affected</div>
              <div className="mt-4 flex flex-wrap gap-3">
                {scenario.productsAffected.map((product) => (
                  <span key={product} className="rounded-full border border-[#A855F7]/25 bg-[#A855F7]/10 px-4 py-2 text-sm font-black text-[#4D7C0F]">
                    {product}
                  </span>
                ))}
              </div>
              <Link
                href="/product-profitability"
                className="mt-6 inline-flex rounded-full bg-[#07110d] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#A855F7]"
              >
                Open product profitability
              </Link>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
