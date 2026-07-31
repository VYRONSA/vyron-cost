"use client";

import { Calculator, Save, Wheat } from "lucide-react";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { calculateTrueUnitCost, formatMoney, Ingredient } from "@/lib/vyron-cost-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function YieldEngineAdvancedClient({
  ingredients,
}: {
  ingredients: Ingredient[];
}) {
  const [selectedId, setSelectedId] = useState(ingredients[0]?.id || "");
  const [rawWeight, setRawWeight] = useState("10");
  const [finalWeight, setFinalWeight] = useState("25");
  const [rawCost, setRawCost] = useState("300");
  const [mode, setMode] = useState("cooked_yield");

  const selected = ingredients.find((ingredient) => ingredient.id === selectedId);

  const yieldPercent = useMemo(() => {
    const raw = Number(rawWeight || 0);
    const final = Number(finalWeight || 0);
    if (!raw) return 0;
    return (final / raw) * 100;
  }, [rawWeight, finalWeight]);

  const trueCost = useMemo(() => {
    return calculateTrueUnitCost(Number(rawCost || 0), yieldPercent);
  }, [rawCost, yieldPercent]);

  return (
    <VyronPremiumPageShell
      config={{
        title: "Yield Engine Advanced",
        subtitle: "Premium VYRON COST workflow for yield engine advanced.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.2fr]">
            <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl border border-[#A855F7]/20 bg-[#A855F7]/10 p-3 text-[#7E22CE]">
                  <Wheat size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-[#F8FAFC]">Advanced Yield Calculator</h2>
                  <p className="text-sm text-slate-500">Model cooked yield, prep loss, shrinkage and true usable cost.</p>
                </div>
              </div>

              <div className="grid gap-4">
                <label className="text-sm font-black text-slate-600">
                  Ingredient
                  <select
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-violet-400"
                  >
                    {ingredients.map((ingredient) => (
                      <option key={ingredient.id} value={ingredient.id}>
                        {ingredient.ingredient_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-black text-slate-600">
                  Yield Mode
                  <select
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-violet-400"
                  >
                    <option value="standard">Standard</option>
                    <option value="prep_loss">Prep Loss</option>
                    <option value="cooked_yield">Cooked Yield / Weight Gain</option>
                    <option value="shrinkage">Shrinkage</option>
                    <option value="evaporation">Evaporation</option>
                    <option value="batch_conversion">Batch Conversion</option>
                  </select>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-black text-slate-600">
                    Raw Weight
                    <input type="number" value={rawWeight} onChange={(event) => setRawWeight(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-violet-400" />
                  </label>

                  <label className="text-sm font-black text-slate-600">
                    Final Usable Weight
                    <input type="number" value={finalWeight} onChange={(event) => setFinalWeight(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-violet-400" />
                  </label>
                </div>

                <label className="text-sm font-black text-slate-600">
                  Raw Batch Cost
                  <input type="number" value={rawCost} onChange={(event) => setRawCost(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-violet-400" />
                </label>

                <button type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#A855F7]/30 bg-[#24183F] px-5 py-4 text-sm font-black text-[#F8FAFC] transition hover:bg-[#2a2448]">
                  <Save size={18} />
                  Save Yield Rule Later
                </button>
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#07110d] p-7 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#A855F7]/12 p-3 text-[#A855F7]">
                  <Calculator size={22} />
                </div>
                <div>
                  <h2 className="text-2xl font-black">Yield Intelligence Result</h2>
                  <p className="text-sm text-slate-300">Live true-cost calculation preview.</p>
                </div>
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[#A855F7]/20 bg-white/5 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A855F7]">Ingredient</div>
                  <div className="mt-2 text-2xl font-black">{selected?.ingredient_name || "None"}</div>
                </div>

                <div className="rounded-[1.5rem] border border-[#A855F7]/20 bg-white/5 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A855F7]">Yield Mode</div>
                  <div className="mt-2"><StatusPill tone="emerald">{mode.replaceAll("_", " ")}</StatusPill></div>
                </div>

                <div className="rounded-[1.5rem] border border-[#A855F7]/20 bg-white/5 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A855F7]">Yield %</div>
                  <div className="mt-2 text-4xl font-black">{yieldPercent.toFixed(1)}%</div>
                </div>

                <div className="rounded-[1.5rem] border border-[#A855F7]/20 bg-white/5 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A855F7]">True Usable Cost</div>
                  <div className="mt-2 text-4xl font-black">{formatMoney(trueCost)}</div>
                </div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-[#A855F7]/20 bg-[#A855F7]/10 p-5 text-sm leading-7 text-slate-200">
                Example: if rice increases from 10kg raw to 25kg cooked, yield is 250%. If avocado drops from 10kg whole to 6.5kg usable, yield is 65%. This is what protects the real product GP.
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
