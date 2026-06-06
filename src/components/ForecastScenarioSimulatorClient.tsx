"use client";

import { useMemo, useState } from "react";
import { ForecastSnapshot, formatForecastMoney } from "@/lib/vyron-forecasting-data";

export default function ForecastScenarioSimulatorClient({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [supplierIncrease, setSupplierIncrease] = useState(8);
  const [labourIncrease, setLabourIncrease] = useState(4);
  const [packagingIncrease, setPackagingIncrease] = useState(5);
  const [sellingIncrease, setSellingIncrease] = useState(0);

  const baseCogs = snapshot.cards[0]?.cogsForecast || 0;
  const baseGp = snapshot.cards[0]?.gpForecast || 0;

  const scenario = useMemo(() => {
    const costPressure = supplierIncrease * 0.45 + labourIncrease * 0.25 + packagingIncrease * 0.3;
    const gpAfterPressure = baseGp - costPressure * 0.42 + sellingIncrease * 0.55;
    const cogs = baseCogs * (1 + costPressure / 100);
    return {
      costPressure,
      gpAfterPressure,
      cogs,
      risk: gpAfterPressure < 35 ? "Critical" : gpAfterPressure < 45 ? "High" : "Watch",
    };
  }, [supplierIncrease, labourIncrease, packagingIncrease, sellingIncrease, baseCogs, baseGp]);

  const controls: Array<{ label: string; value: number; setter: (value: number) => void }> = [
    { label: "Supplier increase %", value: supplierIncrease, setter: setSupplierIncrease },
    { label: "Labour increase %", value: labourIncrease, setter: setLabourIncrease },
    { label: "Packaging increase %", value: packagingIncrease, setter: setPackagingIncrease },
    { label: "Selling price increase %", value: sellingIncrease, setter: setSellingIncrease },
  ];

  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h2 className="text-2xl font-black text-[#07110d]">Scenario Controls</h2>
        <div className="mt-6 grid gap-5">
          {controls.map(({ label, value, setter }) => (
            <label key={label} className="text-sm font-black text-slate-600">
              {label}
              <input
                type="number"
                value={Number(value)}
                onChange={(event) => setter(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Forecast Result</div>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl bg-white/10 p-5">
            <div className="text-xs font-black uppercase text-slate-400">Cost pressure</div>
            <div className="mt-2 text-4xl font-black text-emerald-300">{scenario.costPressure.toFixed(1)}%</div>
          </div>
          <div className="rounded-3xl bg-white/10 p-5">
            <div className="text-xs font-black uppercase text-slate-400">Forecast GP</div>
            <div className="mt-2 text-4xl font-black text-white">{scenario.gpAfterPressure.toFixed(1)}%</div>
          </div>
          <div className="rounded-3xl bg-white/10 p-5">
            <div className="text-xs font-black uppercase text-slate-400">Forecast COGS</div>
            <div className="mt-2 text-4xl font-black text-white">{formatForecastMoney(scenario.cogs)}</div>
          </div>
          <div className="rounded-3xl bg-white/10 p-5">
            <div className="text-xs font-black uppercase text-slate-400">Risk</div>
            <div className="mt-2 text-4xl font-black text-red-300">{scenario.risk}</div>
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold leading-7 text-slate-300">
          Use this in a client meeting to show how supplier, labour and packaging increases affect GP before the cost is actually paid.
        </p>
      </div>
    </section>
  );
}
