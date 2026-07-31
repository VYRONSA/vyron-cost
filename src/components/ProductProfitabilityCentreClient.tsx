"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number | null | undefined) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function tone(row: ProductIntelligenceRow): "red" | "amber" | "emerald" {
  const risk = String(row.risk_level || "").toLowerCase();
  if (risk.includes("critical") || Number(row.gp_gap || 0) > 10) return "red";
  if (risk.includes("high") || Number(row.gp_gap || 0) > 3) return "amber";
  return "emerald";
}

export default function ProductProfitabilityCentreClient({ rows }: { rows: ProductIntelligenceRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.product_name || "", row.category || "", row.risk_level || "", row.action_required || ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const totalRisk = filtered.reduce((sum, row) => sum + Number(row.monthly_risk_value || 0), 0);
  const belowTarget = filtered.filter((row) => Number(row.gp_gap || 0) > 0).length;
  const avgGp = filtered.length
    ? filtered.reduce((sum, row) => sum + Number(row.actual_gp || 0), 0) / filtered.length
    : 0;
  const suggestedIncrease = filtered.reduce(
    (sum, row) => sum + Math.max(0, Number(row.suggested_price || 0) - Number(row.selling_price || 0)),
    0
  );

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Profitability Centre",
        subtitle: "Premium VYRON COST workflow for product profitability centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <section className="grid gap-5 md:grid-cols-4">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Monthly GP Risk</div>
                <div className="mt-3 text-4xl font-black text-red-700">{money(totalRisk)}</div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Below Target</div>
                <div className="mt-3 text-4xl font-black text-[var(--vyron-warning-fg)]">{belowTarget}</div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Average GP</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">{avgGp.toFixed(1)}%</div>
              </div>
              <div className="rounded-[2rem] bg-[#A855F7]/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-[#7E22CE]">Price Headroom</div>
                <div className="mt-3 text-4xl font-black text-[#7E22CE]">{money(suggestedIncrease)}</div>
              </div>
            </section>

            <div className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <SearchFilterBar value={search} onChange={setSearch} placeholder="Search products, category, risk or action..." resultCount={filtered.length} />
            </div>

            <div className="overflow-x-auto rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-10 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A855F7]">
                  <div className="col-span-2">Product</div>
                  <div>Price</div>
                  <div>Cost</div>
                  <div>Actual GP</div>
                  <div>Target</div>
                  <div>Gap</div>
                  <div>Suggested</div>
                  <div>Risk</div>
                  <div>Action</div>
                </div>

                {filtered.map((row) => (
                  <Link
                    key={row.id}
                    href={row.product_id ? `/products/${row.product_id}` : "/products"}
                    className="grid grid-cols-10 items-center border-t border-slate-100 px-5 py-5 text-sm transition hover:bg-[#A855F7]/10"
                  >
                    <div className="col-span-2">
                      <div className="font-black text-[#F8FAFC]">{row.product_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.category}</div>
                    </div>
                    <div>{money(row.selling_price)}</div>
                    <div>{money(row.total_cost)}</div>
                    <div className="font-black text-[#F8FAFC]">{Number(row.actual_gp || 0).toFixed(1)}%</div>
                    <div>{Number(row.target_gp || 0).toFixed(1)}%</div>
                    <div className={Number(row.gp_gap || 0) > 0 ? "font-black text-red-700" : "font-black text-[#7E22CE]"}>
                      {Number(row.gp_gap || 0).toFixed(1)}%
                    </div>
                    <div className="font-black text-[#7E22CE]">{money(row.suggested_price)}</div>
                    <div><StatusPill tone={tone(row)}>{row.risk_level || "Watch"}</StatusPill></div>
                    <div className="text-xs font-bold text-slate-600">{row.action_required || "Review margin"}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-3 text-[#A855F7]">
                    <TrendingUp size={24} />
                    <span className="text-xs font-black uppercase tracking-[0.18em]">Client explanation</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black">Profitability is judged by GP gap and monthly risk value.</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    Open any product to validate the linked BOM, ingredient cost and suggested selling price.
                  </p>
                </div>
                <Link href="/products" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#F8FAFC]">
                  Open products <ArrowRight size={17} />
                </Link>
              </div>
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
