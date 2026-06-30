"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import { formatStoreOrderMoney } from "@/components/vyron-cost/store-ordering/store-order-ui";
import type { StoreOrderCommercialDashboard } from "@/lib/vyron-store-order-commercial";

const WIDGETS: {
  key: keyof StoreOrderCommercialDashboard;
  label: string;
  href: string;
  format?: "money";
}[] = [
  { key: "ordersToday", label: "Orders Today", href: "/store-orders" },
  { key: "revenueToday", label: "Revenue Today", href: "/store-orders", format: "money" },
  { key: "pendingApproval", label: "Pending Approval", href: "/store-orders/approvals" },
  { key: "picking", label: "Picking", href: "/store-orders/picking" },
  { key: "readyForDispatch", label: "Ready for Dispatch", href: "/store-orders/dispatch" },
  { key: "delivered", label: "Delivered", href: "/store-orders/dispatch" },
];

export default function StoreOrderDashboardClient() {
  const [dashboard, setDashboard] = useState<StoreOrderCommercialDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/store-orders/commercial/dashboard");
        const data = await response.json();
        if (!data.ok) {
          setError(data.error || "Could not load order dashboard.");
          return;
        }
        setDashboard(data.dashboard as StoreOrderCommercialDashboard);
      } catch {
        setError("Could not load order dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VyronPremiumPageShell
      config={{
        badge: "Store Ordering",
        title: "Order Dashboard",
        subtitle: "Commercial and operational snapshot for store replenishment.",
        outcomes: [
          "Track today's order volume and revenue",
          "Monitor approval and fulfilment queues",
          "Drill into performance and demand analytics",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/store-performance" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Store Performance
          </Link>
          <Link href="/store-orders/product-demand" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Product Demand
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

        <section className={`${VYRON_MASTER.moduleDataSection} grid gap-4 md:grid-cols-2 xl:grid-cols-3`}>
          {WIDGETS.map((widget) => {
            const value = dashboard?.[widget.key] ?? 0;
            const display =
              widget.format === "money" ? formatStoreOrderMoney(Number(value)) : String(value);
            return (
              <Link
                key={widget.key}
                href={widget.href}
                className="rounded-2xl border border-[#E2E8F0] bg-white p-5 transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">
                  {widget.label}
                </div>
                <div className="mt-2 text-3xl font-black text-[#0F172A]">
                  {loading ? "—" : display}
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}
