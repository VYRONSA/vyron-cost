"use client";

import Link from "next/link";
import type { ProfitLeakageIntelligence } from "@/lib/vyron-ai-financial-intelligence";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export default function AiProfitLeakageClient({ leakage }: { leakage: ProfitLeakageIntelligence }) {
  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        title: "Ai Profit Leakage",
        subtitle: "Premium VYRON COST workflow for ai profit leakage.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Monthly leakage", leakage.monthlyLeakage],
                ["Annual leakage", leakage.annualLeakage],
                ["Recovered", leakage.recoveredLeakage],
                ["Potential", leakage.potentialLeakage],
                ["Missed recovery", leakage.missedRecovery],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="text-xs font-black uppercase text-slate-400">{label}</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{money(Number(val))}</div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Leakage category</th>
                    <th className="px-6 py-4">Monthly</th>
                    <th className="px-6 py-4">Annual</th>
                    <th className="px-6 py-4" />
                  </tr>
                </thead>
                <tbody>
                  {leakage.lines.map((line) => (
                    <tr key={line.key} className="border-t border-slate-100">
                      <td className="px-6 py-4 font-bold text-slate-900">{line.label}</td>
                      <td className="px-6 py-4 font-black text-red-700">{money(line.monthlyExposure)}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700">{money(line.annualExposure)}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={line.href} className="text-xs font-black text-violet-700 hover:underline">
                          Investigate →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
