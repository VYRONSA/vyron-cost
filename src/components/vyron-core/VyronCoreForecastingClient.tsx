"use client";

import Link from "next/link";
import type { VyronCoreCommandCentrePayload } from "@/lib/vyron-workforce-digital-twin";
import ExecutiveSparkChart from "@/components/ExecutiveSparkChart";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const FORECAST_LABELS: Record<string, string> = {
  labour_cost: "Labour Cost",
  productivity: "Productivity",
  attrition: "Attrition",
  leakage: "Predicted Leakage",
  workforce_health: "Workforce Health",
};

export default function VyronCoreForecastingClient({ data }: { data: VyronCoreCommandCentrePayload }) {
  const types = Array.from(new Set(data.forecasts.map((f) => f.forecastType)));

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        badge: "VYRON CORE",
        title: "Workforce Forecast Command Centre",
        subtitle: "Review labour, leakage, productivity, attrition, and health forecasts from digital twin signals.",
        outcomes: ["Anticipate workforce cost pressure", "Forecast attrition and productivity trends", "Align labour planning to risk forecasts"],
        formulas: ["Forecast Value by type and period", "Attrition Curve from workforce signal model", "Confidence % included per forecast scenario"],
        intelligenceItems: [
          { label: "Forecast types", detail: `${types.length} forecast models available` },
          { label: "Forecast rows", detail: `${data.forecasts.length} records in this view` },
          { label: "Attrition points", detail: `${data.attritionForecast.length} timeline points loaded` },
        ],
      }}
    >
      <section className="grid gap-8">
        <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-8 text-white">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">VYRON CORE</div>
        <h2 className="mt-2 text-3xl font-black">Workforce Forecasting</h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
          Labour cost, productivity, attrition, leakage and health forecasts from the digital twin foundation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {types.map((type) => {
          const rows = data.forecasts.filter((f) => f.forecastType === type);
          const chartData = rows.map((r) => ({ label: r.periodLabel, value: r.forecastValue }));
          const isMoney = type === "labour_cost" || type === "leakage";
          return (
            <section key={type} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <h3 className="text-xl font-black text-slate-950">{FORECAST_LABELS[type] || type}</h3>
              <div className="mt-4 h-36">
                <ExecutiveSparkChart
                  data={chartData}
                  height={120}
                  colour={type === "attrition" ? "#3b82f6" : "#1d6bff"}
                  variant="line"
                  formatValue={(n) => (isMoney ? money(n) : `${n.toFixed(1)}${type === "productivity" || type === "workforce_health" ? "%" : type === "attrition" ? "%" : ""}`)}
                />
              </div>
              <ul className="mt-4 space-y-2">
                {rows.map((r) => (
                  <li key={r.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
                    <span>{r.periodLabel}</span>
                    <span className="text-violet-700">
                      {isMoney ? money(r.forecastValue) : r.forecastValue.toFixed(1)}
                      {type === "productivity" || type === "workforce_health" || type === "attrition" ? "%" : ""}
                      <span className="ml-2 text-slate-400">({r.confidence}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-slate-950">Attrition forecast curve</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">6-month attrition probability trend from twin attrition signals</p>
        <div className="mt-6 h-48">
          <ExecutiveSparkChart data={data.attritionForecast} height={160} colour="#3b82f6" variant="line" formatValue={(n) => `${n.toFixed(1)}%`} />
        </div>
      </section>

        <Link href="/vyron-core/command-centre" className="inline-flex w-fit rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
        ← Back to Executive Command Centre
        </Link>
      </section>
    </VyronPremiumPageShell>
  );
}
