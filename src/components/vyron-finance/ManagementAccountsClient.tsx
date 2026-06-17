"use client";

import type { ManagementAccountsPayload } from "@/lib/vyron-finance-intelligence-layer";
import { money, StatementTable } from "./VyronFinanceShared";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function ManagementAccountsClient({ data }: { data: ManagementAccountsPayload }) {
  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Management Accounts",
        subtitle: "Premium VYRON COST workflow for management accounts.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <StatementTable lines={data.incomeStatement} title="Income Statement" />
            <div className="grid gap-8 lg:grid-cols-2">
              <StatementTable lines={data.balanceSheet} title="Balance Sheet" />
              <StatementTable lines={data.cashFlowSummary} title="Cash Flow Summary" />
            </div>

            <div>
              <h2 className="text-xl font-black">Cost analysis</h2>
              <div className="mt-4 overflow-hidden rounded-[2rem] bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">% of COS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costAnalysis.map((c) => (
                      <tr key={c.category} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-bold">{c.category}</td>
                        <td className="px-4 py-3 font-black">{money(c.amount)}</td>
                        <td className="px-4 py-3">{c.pctOfCogs.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-[2rem] bg-[#A3E635]/10 p-6">
                <h2 className="font-black text-[#4D7C0F]">Recovery analysis</h2>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt>Verified</dt>
                    <dd className="font-black">{money(data.recoveryAnalysis.verified)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Potential</dt>
                    <dd className="font-black">{money(data.recoveryAnalysis.potential)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Recovered</dt>
                    <dd className="font-black">{money(data.recoveryAnalysis.recovered)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Open opportunities</dt>
                    <dd className="font-black">{data.recoveryAnalysis.openCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Monthly P&L benefit</dt>
                    <dd className="font-black">{money(data.recoveryAnalysis.monthlyBenefit)}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h2 className="text-xl font-black">Variance analysis</h2>
                <div className="mt-4 space-y-3">
                  {data.varianceAnalysis.map((v) => (
                    <div key={v.category} className="rounded-2xl bg-white p-4 shadow-sm">
                      <div className="flex justify-between font-black">
                        <span>{v.category}</span>
                        <span className={v.variance > 0 ? "text-red-600" : "text-[#84CC16]"}>{v.variancePct.toFixed(1)}%</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">{v.rootCause}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        Budget {money(v.budget)} · Actual {money(v.actual)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
