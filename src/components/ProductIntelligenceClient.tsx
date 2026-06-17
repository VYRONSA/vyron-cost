"use client";

import { ArrowUpRight, Search, ShieldAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function tone(level: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(level || "").toLowerCase();
  if (value.includes("critical") || value.includes("high")) return "red";
  if (value.includes("medium")) return "amber";
  if (value.includes("low")) return "emerald";
  return "slate";
}

export default function ProductIntelligenceClient({
  rows,
}: {
  rows: ProductIntelligenceRow[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((row) =>
      [
        row.product_name || "",
        row.category || "",
        row.risk_level || "",
        row.action_required || "",
        String(row.selling_price || ""),
        String(row.total_cost || ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "products",
        title: "Product Intelligence",
        subtitle: "Premium VYRON COST workflow for product intelligence.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3 rounded-[1.5rem] border border-[#A3E635]/20 bg-[#A3E635]/10 px-4 py-3">
                <Search size={20} className="text-[#65A30D]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search product intelligence..."
                  className="w-full bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-400"
                />
                <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-[#A3E635]">
                  {filtered.length} products
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="min-w-[1180px]">
                <div className="grid grid-cols-10 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
                  <div>Product</div>
                  <div>Category</div>
                  <div>Cost</div>
                  <div>Price</div>
                  <div>Target</div>
                  <div>Actual</div>
                  <div>Gap</div>
                  <div>Suggested</div>
                  <div>Risk</div>
                  <div>Action</div>
                </div>

                {filtered.map((row) => (
                  <div key={row.id} className="grid grid-cols-10 items-center border-t border-slate-100 px-5 py-5 text-sm">
                    <div>
                      <div className="font-black text-[#F8FAFC]">{row.product_name}</div>
                      <div className="mt-1 text-xs font-bold text-slate-400">{formatMoney(Number(row.monthly_risk_value || 0))} risk</div>
                    </div>
                    <div>{row.category}</div>
                    <div>{formatMoney(Number(row.total_cost || 0))}</div>
                    <div>{formatMoney(Number(row.selling_price || 0))}</div>
                    <div>{Number(row.target_gp || 0).toFixed(1)}%</div>
                    <div className="font-black text-[#65A30D]">{Number(row.actual_gp || 0).toFixed(1)}%</div>
                    <div className={Number(row.gp_gap || 0) > 0 ? "font-black text-red-700" : "font-black text-[#65A30D]"}>
                      {Number(row.gp_gap || 0).toFixed(1)}%
                    </div>
                    <div className="font-black">{formatMoney(Number(row.suggested_price || 0))}</div>
                    <div><StatusPill tone={tone(row.risk_level)}>{row.risk_level || "Low"}</StatusPill></div>
                    <div>
                      <Link
                        href={row.product_id ? `/products/${row.product_id}/edit` : "/products"}
                        className="inline-flex items-center gap-2 rounded-full border border-[#A3E635]/25 bg-[#A3E635]/10 px-3 py-2 text-xs font-black text-[#65A30D]"
                      >
                        <Zap size={14} />
                        {row.action_required || "Monitor"}
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <section className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_20px_60px_rgba(6,20,14,0.28)]">
                <div className="rounded-2xl bg-[#A3E635]/12 p-3 text-[#A3E635] w-fit">
                  <ShieldAlert size={24} />
                </div>

                <div className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[#A3E635]">
                  AI ACTION
                </div>

                <div className="mt-2 text-3xl font-black">
                  PRICE REVIEW
                </div>

                <div className="mt-4 text-sm leading-7 text-slate-300">
                  Products below target GP should move into approval workflow before price changes go live.
                </div>
              </div>

              <div className="rounded-[2rem] border border-white bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-[#65A30D]">
                  NEXT ENGINE
                </div>

                <div className="mt-2 text-3xl font-black text-[#F8FAFC]">
                  AUTO APPROVALS
                </div>

                <div className="mt-4 text-sm leading-7 text-slate-500">
                  Next we connect this risk list directly to Approvals so managers can accept price changes from one queue.
                </div>
              </div>
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
