"use client";

import { BranchRiskFinding } from "@/lib/vyron-leakage-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function BranchPerformanceClient({ branches }: { branches: BranchRiskFinding[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        title: "Branch Performance",
        subtitle: "Premium VYRON COST workflow for branch performance.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-3">
              {branches.slice(0, 3).map((branch) => (
                <div key={branch.id} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{branch.branch_name}</div>
                  <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{Number(branch.leakage_score || 0).toFixed(0)}</div>
                  <p className="mt-2 text-sm font-bold text-slate-500">Leakage score · {branch.risk_level}</p>
                </div>
              ))}
            </section>

            <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                <div className="col-span-2">Branch</div>
                <div>Spend</div>
                <div>Wastage</div>
                <div>GP Erosion</div>
                <div>Efficiency</div>
                <div>Risk</div>
              </div>
              {branches.map((branch) => (
                <div key={branch.id} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm">
                  <div className="col-span-2 font-black text-[#F8FAFC]">{branch.branch_name}</div>
                  <div>{money(branch.spend_total)}</div>
                  <div className="font-black text-red-700">{money(branch.wastage_estimate)}</div>
                  <div>{Number(branch.gp_erosion_percent || 0).toFixed(1)}%</div>
                  <div>{Number(branch.procurement_efficiency || 0).toFixed(0)}%</div>
                  <div className="font-black text-[var(--vyron-warning-fg)]">{branch.risk_level}</div>
                </div>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
