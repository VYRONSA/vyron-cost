"use client";

import Link from "next/link";
import SearchFilterBar from "@/components/SearchFilterBar";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatForecastMoney, ForecastSnapshot } from "@/lib/vyron-forecasting-data";
import { useMemo, useState } from "react";

export default function ForecastingClient({ snapshot }: { snapshot: ForecastSnapshot }) {
  const [search, setSearch] = useState("");

  const filteredRisks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return snapshot.marginRisks;
    return snapshot.marginRisks.filter((row) =>
      [row.name, row.category, row.risk].join(" ").toLowerCase().includes(term)
    );
  }, [snapshot.marginRisks, search]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        badge: "Forecast Intelligence",
        title: "Forecast Command Centre",
        subtitle: "Convert supplier inflation and GP movement into forward-looking margin action.",
        outcomes: ["Protect target GP by horizon", "Expose high-risk products early", "Align cost and pricing decisions"],
        formulas: ["Forecast GP = (Selling Price - Forecast Cost) / Selling Price", "Forecast Cost = Current Cost x Inflation Signal", "Risk Count = Products below target GP"],
        intelligenceItems: [
          { label: "Horizon coverage", detail: "30/60/90 views align tactical and strategic pricing actions" },
          { label: "Inflation watch", detail: "Supplier trend overlays highlight cost pressure before erosion" },
          { label: "Action list", detail: `${filteredRisks.length} products currently below target scenarios` },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="grid gap-5 md:grid-cols-3">
        {snapshot.cards.map((card) => (
          <div key={card.horizon} className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{card.label} forecast</div>
            <div className="mt-3 text-4xl font-black text-[#7E22CE]">{card.gpForecast}% GP</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-slate-400">COGS</div>
                <div className="font-black">{formatForecastMoney(card.cogsForecast)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-slate-400">Margin risk</div>
                <div className="font-black text-red-600">{card.marginRiskCount} products</div>
              </div>
            </div>
            <div className="mt-3 text-xs font-bold text-slate-500">Supplier inflation forecast {card.supplierInflationPct}%</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-black text-[#F8FAFC]">GP Forecast Trend</h2>
          <div className="mt-5 h-44 rounded-2xl bg-gradient-to-b from-[#A855F7]/10 to-white p-4">
            <svg viewBox="0 0 360 150" className="h-full w-full">
              <polyline
                fill="none"
                stroke="#B6D934"
                strokeWidth="4"
                points={snapshot.gpTrend
                  .map((value, index) => `${index * 72},${150 - value * 1.8}`)
                  .join(" ")}
              />
            </svg>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-black text-[#F8FAFC]">Supplier Inflation Forecast</h2>
          <div className="mt-5 h-44 rounded-2xl bg-gradient-to-b from-red-50 to-white p-4">
            <svg viewBox="0 0 360 150" className="h-full w-full">
              <polyline
                fill="none"
                stroke="#dc2626"
                strokeWidth="4"
                points={snapshot.inflationTrend
                  .map((value, index) => `${index * 72},${150 - value * 8}`)
                  .join(" ")}
              />
            </svg>
          </div>
        </div>
      </div>

        <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-[#F8FAFC]">Products likely to fall below target GP</h2>
            <p className="mt-2 text-sm text-slate-500">Forecast uses current costs plus supplier inflation movement.</p>
          </div>
        </div>
        <SearchFilterBar value={search} onChange={setSearch} placeholder="Search forecast risk products..." resultCount={filteredRisks.length} />
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-6 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <div className="col-span-2">Product</div>
            <div>Current GP</div>
            <div>Forecast GP</div>
            <div>Target</div>
            <div>Risk</div>
          </div>
          {filteredRisks.map((row) => (
            <Link key={row.id} href={row.href} className="grid grid-cols-6 border-t border-slate-100 px-5 py-4 text-sm transition hover:bg-[#A855F7]/10">
              <div className="col-span-2">
                <div className="font-black text-slate-900">{row.name}</div>
                <div className="text-xs text-slate-500">{row.category}</div>
              </div>
              <div>{row.currentGp}%</div>
              <div className="font-black text-red-600">{row.forecastGp}%</div>
              <div>{row.targetGp}%</div>
              <div className="font-black">{row.risk}</div>
            </Link>
          ))}
        </div>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
