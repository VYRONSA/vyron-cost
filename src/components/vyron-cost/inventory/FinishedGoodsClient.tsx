"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCurrency, formatNumber, type FinishedGoodSummary } from "@/lib/vyron-cost/stock-engine";
import { poApiWorkspaceContext } from "@/lib/vyron-po-api-context";
import {
  VyronPremiumEmptyState,
  VyronPremiumFormulaCard,
  VyronPremiumHeroBanner,
  VyronPremiumSectionHeading,
} from "@/components/vyron-premium/VyronPremiumSprint";

export default function FinishedGoodsClient() {
  const [items, setItems] = useState<FinishedGoodSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const { query } = poApiWorkspaceContext();
    fetch(`/api/inventory/finished-goods${query}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.items)) {
          setItems(d.items as FinishedGoodSummary[]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalValue = items.reduce((sum, item) => sum + item.stock_value, 0);
  const totalUnits = items.reduce((sum, item) => sum + item.current_stock, 0);
  const lowStock = items.filter((item) => item.status === "Low Stock").length;
  const fastest = [...items].sort((a, b) => b.sales_velocity_30_days - a.sales_velocity_30_days)[0];

  return (
    <div className="grid gap-8">
      <VyronPremiumHeroBanner
        visualVariant="inventory"
        badge="Premium Inventory Workspace"
        title="Finished Goods Intelligence"
        subtitle="On-hand finished goods value, velocity and low-stock risk from the inventory intelligence layer."
        outcomes={[
          "Monitor total finished goods value",
          "See units on hand and low-stock count",
          "Identify fastest-moving products",
          "Drill into stock detail per SKU",
        ]}
        quotes={[
          { label: "Inventory", quote: "Inventory is cash wearing a disguise." },
          { label: "Velocity", quote: "What gets measured gets protected." },
        ]}
      />

      <VyronPremiumFormulaCard
        variant="light"
        eyebrow="Valuation"
        title="Finished goods formulas"
        formulas={[
          { label: "Stock Value", formula: "On-hand qty × weighted average unit cost" },
          { label: "Velocity", formula: "Units sold (30 days) ÷ average on-hand qty" },
          { label: "Low Stock", formula: "On-hand qty below reorder threshold" },
        ]}
        className="max-w-2xl"
      />

      <VyronPremiumSectionHeading eyebrow="Live metrics" title="Finished goods snapshot" />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Finished Goods Value" value={loading ? "…" : formatCurrency(totalValue)} />
        <MetricCard title="Units In Stock" value={loading ? "…" : formatNumber(totalUnits)} />
        <MetricCard title="Low Stock Products" value={loading ? "…" : String(lowStock)} />
        <MetricCard title="Fastest Mover" value={fastest?.product_name ?? "—"} />
      </div>

      <div className="rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(76,29,149,0.10)]">
        <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-black text-slate-950">Finished Goods Intelligence</h2>
            <p className="text-sm font-medium text-slate-600">Manufactured stock ready for customer sale, with cost, value and days-cover intelligence.</p>
          </div>
          <Link href="/manufacturing-intelligence" className="rounded-full bg-purple-700 px-5 py-2 text-sm font-black text-white shadow-lg shadow-purple-700/20">Open Manufacturing</Link>
        </div>

        {!loading && items.length === 0 ? (
          <VyronPremiumEmptyState
            steps={[
              "Create products and link them to BOMs.",
              "Run and complete a manufacturing batch.",
              "Post finished goods output to inventory.",
              "Return here to monitor value and velocity.",
            ]}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <Link key={item.id} href={`/products/${item.id}`} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-black text-slate-950">{item.product_name}</p>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{item.sku}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeClass(item.status)}`}>{item.status}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <SmallMetric label="Stock" value={formatNumber(item.current_stock)} />
                <SmallMetric label="Cost" value={formatCurrency(item.average_unit_cost)} />
                <SmallMetric label="Value" value={formatCurrency(item.stock_value)} />
                <SmallMetric label="Days Cover" value={`${item.days_cover} days`} />
              </div>

              <div className="mt-5 rounded-2xl bg-purple-50 p-4 text-sm font-semibold text-purple-900">
                AI: {recommendation(item.status, item.product_name)}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_16px_50px_rgba(76,29,149,0.10)]"><p className="text-xs font-black uppercase tracking-[0.18em] text-purple-700">{title}</p><p className="mt-3 text-2xl font-black text-slate-950">{value}</p></div>;
}
function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-slate-950">{value}</p></div>;
}
function badgeClass(status: string) {
  if (status === "Low Stock") return "bg-rose-100 text-rose-800";
  if (status === "Overstocked") return "bg-amber-100 text-amber-800";
  if (status === "Watch") return "bg-indigo-100 text-indigo-800";
  return "bg-[#A3E635]/12 text-[#4D7C0F]";
}
function recommendation(status: string, product: string) {
  if (status === "Low Stock") return `${product} is below safe cover. Recommend manufacturing within 48 hours.`;
  if (status === "Overstocked") return `${product} has high cover. Slow production or promote to customers.`;
  if (status === "Watch") return `${product} is moving fast. Monitor customer invoices before next production run.`;
  return `${product} stock is healthy. Maintain current production rhythm.`;
}
