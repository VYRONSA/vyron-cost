"use client";

import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import type { StorePerformanceRow, StoreScorecardRow } from "@/lib/vyron-store-order-commercial";

export default function StorePerformanceClient() {
  const [performance, setPerformance] = useState<StorePerformanceRow[]>([]);
  const [scorecards, setScorecards] = useState<StoreScorecardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/store-orders/commercial/performance");
        const data = await response.json();
        if (!data.ok) {
          setError(data.error || "Could not load store performance.");
          return;
        }
        setPerformance((data.performance || []) as StorePerformanceRow[]);
        setScorecards((data.scorecards || []) as StoreScorecardRow[]);
      } catch {
        setError("Could not load store performance.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Store Performance",
        subtitle: "Rank stores by revenue, margin and ordering activity this month.",
        outcomes: [
          "Compare store revenue and gross margin",
          "Identify top ordered products per store",
          "Review 90-day store scorecards",
        ],
      }}
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0F172A]">Store Rankings — This Month</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Gross Margin</th>
                  <th className="px-4 py-3 text-right">AOV</th>
                  <th className="px-4 py-3 text-left">Top Products</th>
                  <th className="px-4 py-3 text-left">Last Order</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading store performance…
                    </td>
                  </tr>
                ) : performance.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No store orders this month.
                    </td>
                  </tr>
                ) : (
                  performance.map((row) => (
                    <tr key={row.store_id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3 font-black text-[#0F172A]">#{row.rank}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A]">{row.store_name}</div>
                        <div className="text-xs text-[#64748B]">{row.store_code}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{row.orders_this_month}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold">{formatStoreOrderMoney(row.revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatStoreOrderMoney(row.gross_margin)}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatStoreOrderMoney(row.average_order_value)}</td>
                      <td className="px-4 py-3 text-sm text-[#334155]">
                        {row.top_products.length
                          ? row.top_products.map((p) => p.product_name).join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.last_order_date || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0F172A]">Store Scorecards — 90 Days</h2>
          <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0]">
            <table className="min-w-full">
              <thead className={VYRON_TABLE.head}>
                <tr>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-right">Margin %</th>
                  <th className="px-4 py-3 text-right">Products</th>
                  <th className="px-4 py-3 text-left">Last Order</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      Loading scorecards…
                    </td>
                  </tr>
                ) : scorecards.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                      No scorecard data yet.
                    </td>
                  </tr>
                ) : (
                  scorecards.map((row) => (
                    <tr key={row.store_id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A]">{row.store_name}</div>
                        <div className="text-xs text-[#64748B]">{row.store_code}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold">{formatStoreOrderMoney(row.revenue)}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.orders}</td>
                      <td className="px-4 py-3 text-right text-sm">{formatStoreOrderMoney(row.margin)}</td>
                      <td className="px-4 py-3 text-right text-sm">{row.margin_pct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-sm">{row.products_ordered}</td>
                      <td className="px-4 py-3 text-sm text-[#64748B]">{row.last_order || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
