"use client";

import { BranchRiskFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}

export default function WasteControlCentreClient({ branches }: { branches: BranchRiskFinding[] }) {
  const totalWaste = branches.reduce((sum, branch) => sum + Number(branch.wastage_estimate || 0), 0);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Waste Control Centre",
        subtitle: "Premium VYRON COST workflow for waste control centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-6">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Monthly Waste</div>
                <div className="mt-3 text-4xl font-black text-red-700">{money(totalWaste)}</div>
              </div>
              <div className="rounded-[2rem] bg-[#A855F7]/10 p-6">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#7E22CE]">Recoverable</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">{money(totalWaste * 0.65)}</div>
              </div>
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">Target</div>
                <div className="mt-3 text-3xl font-black">Reduce waste by 35%</div>
              </div>
            </section>

            <div className="grid gap-4">
              {branches.map((branch) => (
                <div key={branch.id} className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="text-xl font-black text-[#F8FAFC]">{branch.branch_name}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{branch.risk_level} risk</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-red-700">{money(branch.wastage_estimate)}</div>
                      <div className="text-xs font-bold text-slate-400">monthly wastage</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
