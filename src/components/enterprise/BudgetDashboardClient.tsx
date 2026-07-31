"use client";

import { useState } from "react";
import type { BudgetDashboard, BudgetPeriod } from "@/lib/vyron-enterprise-budget";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export default function BudgetDashboardClient({ dashboard }: { dashboard: BudgetDashboard }) {
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const rows = dashboard.rows.filter((r) => r.periodType === period);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Budget Dashboard",
        subtitle: "Premium VYRON COST workflow for budget dashboard.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="flex flex-wrap gap-2">
              {(["monthly", "quarterly", "annual"] as BudgetPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-xl px-4 py-2 text-xs font-black capitalize ${period === p ? "bg-violet-600 text-white" : "bg-slate-100"}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-black uppercase text-slate-400">Budget</div>
                <div className="mt-2 text-2xl font-black">{money(dashboard.byPeriod[period].budget)}</div>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-black uppercase text-slate-400">Actual</div>
                <div className="mt-2 text-2xl font-black">{money(dashboard.byPeriod[period].actual)}</div>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-black uppercase text-slate-400">Variance</div>
                <div className={`mt-2 text-2xl font-black ${dashboard.byPeriod[period].actual > dashboard.byPeriod[period].budget ? "text-red-600" : "text-[#84CC16]"}`}>
                  {money(dashboard.byPeriod[period].actual - dashboard.byPeriod[period].budget)}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[2rem] bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-left text-[10px] font-black uppercase text-[#A855F7]">
                    <th className="p-4">Category</th>
                    <th className="p-4">Period</th>
                    <th className="p-4">Budget</th>
                    <th className="p-4">Actual</th>
                    <th className="p-4">Variance</th>
                    <th className="p-4">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="p-4 font-black">{r.categoryLabel}</td>
                      <td className="p-4">{r.periodLabel}</td>
                      <td className="p-4">{money(r.budget)}</td>
                      <td className="p-4">{money(r.actual)}</td>
                      <td className={`p-4 font-bold ${r.variance > 0 ? "text-red-600" : "text-[#84CC16]"}`}>{money(r.variance)}</td>
                      <td className="p-4">{r.variancePct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
