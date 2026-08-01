"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import type { ProductDemandForecastRow } from "@/lib/vyron-demand-forecasting";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function trendClass(trend: string) {
  if (trend === "Growing") return "bg-violet-100 text-violet-800";
  if (trend === "Declining") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

export default function DemandForecastClient() {
  const [forecasts, setForecasts] = useState<ProductDemandForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demand-forecast", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) {
        setForecasts(data.forecasts || []);
        return;
      }
      setError(data.error || "Could not load forecasts.");
    } catch {
      setError("Could not load forecasts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSnapshot() {
    setSaving(true);
    try {
      const response = await fetch("/api/demand-forecast", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Could not save forecast snapshot.");
        return;
      }
      setForecasts(data.forecasts || []);
    } catch {
      setError("Could not save forecast snapshot.");
    } finally {
      setSaving(false);
    }
  }

  const warnings = forecasts.flatMap((row) => row.warnings);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Demand Forecasting",
        title: "Product Demand Forecast",
        subtitle: "Practical forecasts from store order and delivered demand history.",
        outcomes: [
          "30 / 90 / 180 day demand windows",
          "Weekly and monthly forward forecasts",
          "Growing, stable, and declining trend signals",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSnapshot()}
            className="rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Snapshot"}
          </button>
          <Link href="/store-forecast" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Store Forecast
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {warnings.length ? (
          <section className={VYRON_MASTER.moduleDataSection}>
            <h2 className="mb-3 text-lg font-black text-[#0F172A]">Forecast Warnings</h2>
            <div className="space-y-2">
              {warnings.slice(0, 8).map((warning) => (
                <div
                  key={`${warning.code}-${warning.product_id}`}
                  className="rounded-xl border border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] px-4 py-3 text-sm font-semibold text-[var(--vyron-warning-fg)]"
                >
                  {warning.message}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-[#0F172A]">Product Forecasts</h2>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm font-semibold text-[#64748B]">Calculating forecasts…</div>
          ) : forecasts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-10 text-center text-sm text-[#64748B]">
              No demand history yet. Forecasts appear once store orders are recorded.
            </div>
          ) : (
            <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
              <table className="min-w-full">
                <thead className={VYRON_TABLE.head}>
                  <tr>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-right">30 Day</th>
                    <th className="px-4 py-3 text-right">90 Day</th>
                    <th className="px-4 py-3 text-left">Trend</th>
                    <th className="px-4 py-3 text-right">Next Week</th>
                    <th className="px-4 py-3 text-right">Next Month</th>
                    <th className="px-4 py-3 text-right">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map((row) => (
                    <tr key={row.product_id} className={VYRON_TABLE.row}>
                      <td className="px-4 py-3 font-semibold">{row.product_name}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.demand_30d}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.demand_90d}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${trendClass(row.trend)}`}>
                          {row.trend}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{row.forecast_next_week}</td>
                      <td className="px-4 py-3 text-right font-bold">{row.forecast_next_month}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.confidence_level}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnterpriseScrollContainer>
          )}
        </section>

        {forecasts.length ? (
          <section className={`${VYRON_MASTER.moduleDataSection} text-sm text-[#64748B]`}>
            Forecast revenue next month (indicative):{" "}
            <strong className="text-[#0F172A]">
              {formatMoney(forecasts.reduce((sum, row) => sum + row.forecast_next_month * row.unit_revenue, 0))}
            </strong>
          </section>
        ) : null}
      </div>
    </VyronPremiumPageShell>
  );
}
