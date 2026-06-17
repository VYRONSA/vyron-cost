"use client";

import { useState } from "react";
import { SCENARIO_PRESETS, type ScenarioImpact, type ScenarioInput } from "@/lib/vyron-enterprise-scenarios";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export default function ScenarioModellingClient({ initial }: { initial: ScenarioImpact }) {
  const [input, setInput] = useState<ScenarioInput>(SCENARIO_PRESETS[0].input);
  const [impact, setImpact] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function runScenario(next: ScenarioInput) {
    setBusy(true);
    try {
      const res = await fetch("/api/enterprise/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (data.ok) setImpact(data.impact);
    } finally {
      setBusy(false);
    }
  }

  return (
    <VyronPremiumPageShell
      config={{
        title: "Scenario Modelling",
        subtitle: "Premium VYRON COST workflow for scenario modelling.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="flex flex-wrap gap-2">
              {SCENARIO_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setInput(p.input);
                    runScenario(p.input);
                  }}
                  className="rounded-xl bg-violet-100 px-4 py-2 text-xs font-black text-violet-900 hover:bg-violet-200 disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["Supplier price increase %", "supplierPriceIncreasePct"],
                ["Packaging increase %", "packagingIncreasePct"],
                ["Sales decrease %", "salesDecreasePct"],
              ].map(([label, key]) => (
                <label key={key} className="rounded-2xl bg-white p-4 shadow-sm">
                  <span className="text-xs font-black uppercase text-slate-400">{label}</span>
                  <input
                    type="number"
                    value={input[key as keyof ScenarioInput]}
                    onChange={(e) => setInput({ ...input, [key]: Number(e.target.value) })}
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 font-black"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => runScenario(input)}
              className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-[#F8FAFC] disabled:opacity-50"
            >
              {busy ? "Calculating…" : "Run scenario"}
            </button>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-xs font-black uppercase text-slate-400">GP impact</div>
                <div className="mt-2 text-2xl font-black">
                  {impact.currentGpPct}% → {impact.projectedGpPct}%
                </div>
                <div className={impact.gpChangePts < 0 ? "text-red-600 font-bold" : "text-[#84CC16] font-bold"}>
                  {impact.gpChangePts} pts
                </div>
              </div>
              <div className="rounded-2xl border border-[#A3E635]/20 bg-[#A3E635]/10 p-5">
                <div className="text-xs font-black uppercase text-[#65A30D]">Recovery</div>
                <div className="mt-2 text-2xl font-black">{money(impact.recoveryImpact)}/mo</div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-5">
                <div className="text-xs font-black uppercase text-amber-700">Inventory</div>
                <div className="mt-2 text-2xl font-black">{money(impact.inventoryImpact)}</div>
              </div>
              <div className="rounded-2xl bg-violet-50 p-5">
                <div className="text-xs font-black uppercase text-violet-700">Production cost</div>
                <div className="mt-2 text-2xl font-black">{money(impact.productionCostImpact)}</div>
              </div>
            </div>
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
              <div className="text-xs font-black uppercase text-[#A3E635]">Annual profit impact</div>
              <div className="mt-2 text-4xl font-black">{money(impact.annualProfitImpact)}</div>
              <ul className="mt-4 space-y-2 text-sm font-semibold text-slate-300">
                {impact.narrative.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
