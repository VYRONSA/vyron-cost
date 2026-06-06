"use client";

import Link from "next/link";
import { useState } from "react";
import type { EnterpriseForecastPayload, ForecastHorizonKey } from "@/lib/vyron-enterprise-forecasting";

function money(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export default function EnterpriseForecastClient({ forecast }: { forecast: EnterpriseForecastPayload }) {
  const [horizon, setHorizon] = useState<ForecastHorizonKey>("30");

  const valueKey = horizon === "30" ? "horizon30" : horizon === "90" ? "horizon90" : "horizon365";

  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {forecast.horizons.map((h) => (
          <button
            key={h.key}
            type="button"
            onClick={() => setHorizon(h.key)}
            className={`rounded-xl px-4 py-2 text-sm font-black ${horizon === h.key ? "bg-violet-600 text-white" : "bg-slate-100"}`}
          >
            {h.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-red-50 p-5">
          <div className="text-xs font-black uppercase text-red-700">Supplier inflation trend</div>
          <div className="mt-2 text-3xl font-black text-red-800">{forecast.supplierInflationPct}%</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-5">
          <div className="text-xs font-black uppercase text-emerald-700">Recovery opportunity (annual)</div>
          <div className="mt-2 text-3xl font-black text-emerald-800">{money(forecast.recoveryOpportunityAnnual)}</div>
        </div>
      </div>
      <div className="rounded-[2rem] bg-white shadow-sm">
        {forecast.lines.map((line) => (
          <div key={line.key} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 last:border-0">
            <div>
              <div className="font-black text-slate-900">{line.label}</div>
              {line.href ? (
                <Link href={line.href} className="text-xs font-bold text-violet-600 hover:underline">
                  Drill down →
                </Link>
              ) : null}
            </div>
            <div className="text-2xl font-black text-slate-950">{money(line[valueKey])}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
