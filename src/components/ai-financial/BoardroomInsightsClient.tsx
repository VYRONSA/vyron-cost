"use client";

import Link from "next/link";
import type { BoardroomInsights } from "@/lib/vyron-ai-financial-intelligence";

function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export default function BoardroomInsightsClient({ boardroom }: { boardroom: BoardroomInsights }) {
  return (
    <section className="grid gap-10">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] bg-emerald-50 p-6">
          <div className="text-xs font-black uppercase text-emerald-800">Projected annual savings</div>
          <div className="mt-2 text-4xl font-black text-emerald-950">{money(boardroom.projectedAnnualSavings)}</div>
        </div>
        <div className="rounded-[2rem] bg-red-50 p-6">
          <div className="text-xs font-black uppercase text-red-800">Projected annual cost increases</div>
          <div className="mt-2 text-4xl font-black text-red-950">{money(boardroom.projectedAnnualCostIncreases)}</div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-black">Top 10 risks</h2>
          <ol className="mt-4 space-y-3">
            {boardroom.topRisks.map((r) => (
              <li key={r.rank} className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-2xl font-black text-red-200">{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-slate-900">{r.title}</div>
                  <p className="text-sm text-slate-600">{r.detail}</p>
                  {r.href ? (
                    <Link href={r.href} className="mt-1 inline-block text-xs font-black text-violet-700">
                      View →
                    </Link>
                  ) : null}
                </div>
                <div className="text-right font-black text-red-700">{money(r.value)}</div>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="text-xl font-black">Top 10 opportunities</h2>
          <ol className="mt-4 space-y-3">
            {boardroom.topOpportunities.map((o) => (
              <li key={o.rank} className="flex gap-4 rounded-2xl bg-white p-4 shadow-sm">
                <span className="text-2xl font-black text-emerald-200">{o.rank}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-slate-900">{o.title}</div>
                  <p className="text-sm text-slate-600">{o.detail}</p>
                  {o.href ? (
                    <Link href={o.href} className="mt-1 inline-block text-xs font-black text-violet-700">
                      View →
                    </Link>
                  ) : null}
                </div>
                <div className="text-right font-black text-emerald-700">{money(o.value)}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="rounded-[2rem] bg-slate-950 p-8 text-white">
        <h2 className="text-xl font-black">Strategic actions required</h2>
        <ul className="mt-4 space-y-3">
          {boardroom.strategicActions.map((action) => (
            <li key={action} className="flex gap-3 text-sm leading-7 text-slate-200">
              <span className="text-violet-400">→</span>
              {action}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
