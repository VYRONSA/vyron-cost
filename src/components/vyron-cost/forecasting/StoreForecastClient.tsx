"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import type { StoreDemandForecastRow } from "@/lib/vyron-demand-forecasting";

function formatMoney(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function StoreForecastClient() {
  const [stores, setStores] = useState<StoreDemandForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/demand-forecast/stores", { cache: "no-store" });
        const data = await response.json();
        if (data.ok) setStores(data.stores || []);
        else setError(data.error || "Could not load store forecasts.");
      } catch {
        setError("Could not load store forecasts.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Demand Forecasting",
        title: "Store Forecast",
        subtitle: "Expected orders, revenue and volume from 90-day store ordering behaviour.",
        outcomes: [
          "Forward-looking monthly expectations per store",
          "Based on delivered and historical order patterns",
          "Non-blocking planning signals only",
        ],
      }}
      actions={
        <Link href="/demand-forecast" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
          Product Forecast
        </Link>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          {loading ? (
            <div className="py-10 text-center text-sm font-semibold text-[#64748B]">Loading store forecasts…</div>
          ) : stores.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-10 text-center text-sm text-[#64748B]">
              No store order history for forecasting yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
              <table className="min-w-full">
                <thead className={VYRON_TABLE.head}>
                  <tr>
                    <th className="px-4 py-3 text-left">Store</th>
                    <th className="px-4 py-3 text-right">Expected Orders</th>
                    <th className="px-4 py-3 text-right">Expected Revenue</th>
                    <th className="px-4 py-3 text-right">Expected Volume</th>
                    <th className="px-4 py-3 text-right">90d Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((row) => (
                    <tr key={row.store_id} className={VYRON_TABLE.row}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.store_name}</div>
                        <div className="text-xs text-[#64748B]">{row.store_code}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold">{row.expected_orders}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatMoney(row.expected_revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.expected_volume}</td>
                      <td className="px-4 py-3 text-right text-sm text-[#64748B]">{row.orders_90d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
