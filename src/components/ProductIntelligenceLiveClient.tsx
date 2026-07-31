"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VyronPremiumEmptyState } from "@/components/vyron-premium/VyronPremiumSprint";
import { formatMoney } from "@/lib/vyron-cost-data";

type ProductRow = {
  id: string;
  product: string;
  category: string | null;
  currentCost: number;
  sellingPrice: number;
  gpPct: number;
  lastManufacturingCost: number;
  monthlySales: number;
  monthlyProfit: number;
  marginErosion: boolean;
};

export default function ProductIntelligenceLiveClient() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/reports/product-intelligence")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setProducts(d.products || []);
        else setError(d.error || "Failed to load product intelligence.");
      })
      .catch(() => setError("Failed to load product intelligence."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-500">Loading product intelligence…</p>;
  if (error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>;

  const erosionCount = products.filter((p) => p.marginErosion).length;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        badge: "Product Intelligence",
        title: "Product Intelligence Live Centre",
        subtitle: "Monitor live cost-to-margin signals across products and manufacturing performance.",
        outcomes: ["Detect margin erosion quickly", "Connect cost, sales, and profit in one view", "Prioritize remediation on low GP products"],
        formulas: ["GP % = (Selling Price - Current Cost) / Selling Price", "Monthly Profit = Monthly Sales - Cost Baseline", "Margin Erosion Flag = GP below threshold"],
        intelligenceItems: [
          { label: "Portfolio coverage", detail: `${products.length} products currently in live feed` },
          { label: "Erosion watch", detail: `${erosionCount} products flagged for margin pressure` },
          { label: "Workflow link", detail: "Manufacturing to invoicing chain remains visible for traceability" },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">Products</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{products.length}</div>
        </div>
        <div className="rounded-[2rem] border border-red-100 bg-red-50/40 p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-red-700">Margin Erosion</div>
          <div className="mt-2 text-3xl font-black text-red-900">{erosionCount}</div>
          <div className="mt-1 text-xs font-semibold text-red-700">GP below 30%</div>
        </div>
        <div className="rounded-[2rem] border border-[#A855F7]/20 bg-[#A855F7]/10 p-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#7E22CE]">Healthy Margins</div>
          <div className="mt-2 text-3xl font-black text-[#4D7C0F]">{products.length - erosionCount}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1000px]">
          <div className="grid grid-cols-8 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
            <div className="col-span-2">Product</div>
            <div>Current Cost</div>
            <div>Selling Price</div>
            <div>GP%</div>
            <div>Last Mfg Cost</div>
            <div>Monthly Sales</div>
            <div>Monthly Profit</div>
          </div>
          {products.length === 0 ? (
            <div className="p-5">
              <VyronPremiumEmptyState
                title="No Product Intelligence Yet"
                steps={[
                  "Sync products and recipe costs",
                  "Run manufacturing and sales updates",
                  "Refresh product intelligence feed",
                ]}
              />
            </div>
          ) : (
            products.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-8 items-center border-t border-slate-100 px-5 py-4 text-sm ${
                  row.marginErosion ? "bg-red-50/30" : ""
                }`}
              >
                <div className="col-span-2">
                  <div className="font-black text-slate-900">{row.product}</div>
                  <div className="text-xs text-slate-500">{row.category || "—"}</div>
                  {row.marginErosion ? (
                    <span className="mt-1 inline-block rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-800">
                      Margin erosion
                    </span>
                  ) : null}
                </div>
                <div>{formatMoney(row.currentCost)}</div>
                <div>{formatMoney(row.sellingPrice)}</div>
                <div className={`font-black ${row.marginErosion ? "text-red-700" : "text-[#7E22CE]"}`}>
                  {row.gpPct.toFixed(1)}%
                </div>
                <div>{formatMoney(row.lastManufacturingCost)}</div>
                <div>{formatMoney(row.monthlySales)}</div>
                <div className="font-black">{formatMoney(row.monthlyProfit)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="text-xs font-semibold text-slate-500">
        Linked workflow: manufacturing cost → finished goods → customer invoice → inventory reduction →{" "}
        <Link href="/integrations/xero/sync-centre" className="text-violet-700 hover:underline">
          Xero queue
        </Link>
        .
      </p>
      </section>
    </VyronPremiumPageShell>
  );
}
