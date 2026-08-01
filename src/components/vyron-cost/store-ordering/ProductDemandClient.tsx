"use client";


import EnterpriseScrollContainer from "@/components/vyron-ui/EnterpriseScrollContainer";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER, VYRON_TABLE } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import type { ProductDemandRow } from "@/lib/vyron-store-order-commercial";

const PERIODS = [7, 30, 90] as const;

export default function ProductDemandClient() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [top, setTop] = useState<ProductDemandRow[]>([]);
  const [bottom, setBottom] = useState<ProductDemandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/store-orders/commercial/product-demand?days=${days}`);
        const data = await response.json();
        if (!data.ok) {
          setError(data.error || "Could not load product demand.");
          return;
        }
        setTop((data.top || []) as ProductDemandRow[]);
        setBottom((data.bottom || []) as ProductDemandRow[]);
      } catch {
        setError("Could not load product demand.");
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  function renderTable(rows: ProductDemandRow[], emptyMessage: string) {
    return (
      <EnterpriseScrollContainer className="rounded-2xl border border-[#E2E8F0]">
        <table className="min-w-full">
          <thead className={VYRON_TABLE.head}>
            <tr>
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-right">Qty Ordered</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Orders</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.product_id} className={`${VYRON_TABLE.row} ${VYRON_TABLE.rowHover}`}>
                  <td className="px-4 py-3 font-semibold text-[#0F172A]">{row.product_name}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.quantity.toLocaleString("en-ZA")}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold">{formatStoreOrderMoney(row.revenue)}</td>
                  <td className="px-4 py-3 text-right text-sm">{row.order_count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </EnterpriseScrollContainer>
    );
  }

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Product Demand",
        subtitle: "Top and bottom ordered finished goods across store orders.",
        outcomes: [
          "Spot fast-moving products by period",
          "Identify slow movers for range review",
          "Filter demand over 7, 30 or 90 days",
        ],
      }}
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setDays(period)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${
                days === period ? "bg-[#0F172A] text-white" : "border border-[#E2E8F0] bg-white text-[#334155]"
              }`}
            >
              {period} days
            </button>
          ))}
        </div>

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0F172A]">Top Ordered Products</h2>
          {renderTable(top, "No product demand in this period.")}
        </section>

        <section className={VYRON_MASTER.moduleDataSection}>
          <h2 className="mb-4 text-lg font-black text-[#0F172A]">Bottom Ordered Products</h2>
          {renderTable(bottom, "No slow movers in this period.")}
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
