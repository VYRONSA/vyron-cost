"use client";

import { ArrowDown, ArrowUp, ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import PaginatedTableControls from "@/components/PaginatedTableControls";
import StatusPill from "@/components/StatusPill";
import { formatMoney } from "@/lib/vyron-cost-data";
import { ProductIntelligenceRow } from "@/lib/vyron-product-intelligence-data";

const PAGE_SIZE = 10;

function tone(level: string | null): "red" | "amber" | "emerald" | "slate" {
  const value = String(level || "").toLowerCase();
  if (value.includes("critical")) return "red";
  if (value.includes("high") || value.includes("medium")) return "amber";
  return "emerald";
}

function statusLabel(row: ProductIntelligenceRow) {
  if (Number(row.gp_gap || 0) > 0) return "Below GP";
  if (String(row.risk_level).toLowerCase().includes("medium")) return "Watch";
  return "Healthy";
}

export default function ProductProfitabilityClient({ rows }: { rows: ProductIntelligenceRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const withSelling = useMemo(() => rows.filter((r) => Number(r.selling_price || 0) > 0), [rows]);

  const lowest = useMemo(
    () => [...withSelling].sort((a, b) => Number(a.actual_gp || 0) - Number(b.actual_gp || 0)).slice(0, 5),
    [withSelling]
  );

  const highest = useMemo(
    () => [...withSelling].sort((a, b) => Number(b.actual_gp || 0) - Number(a.actual_gp || 0)).slice(0, 5),
    [withSelling]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.product_name || "", row.category || ""].join(" ").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="grid gap-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-[2rem] border border-red-200 bg-red-50/60 p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-red-800">
            <ArrowDown size={16} />
            Lowest GP Products
          </div>
          <div className="mt-4 space-y-3">
            {lowest.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                <div className="font-black text-[#07110d]">{row.product_name}</div>
                <div className="text-right">
                  <div className="font-black text-red-700">{Number(row.actual_gp || 0).toFixed(1)}% GP</div>
                  <div className="text-xs text-slate-500">Gap {Number(row.gp_gap || 0).toFixed(1)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50/60 p-6">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-800">
            <ArrowUp size={16} />
            Highest GP Products
          </div>
          <div className="mt-4 space-y-3">
            {highest.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                <div className="font-black text-[#07110d]">{row.product_name}</div>
                <div className="font-black text-emerald-700">{Number(row.actual_gp || 0).toFixed(1)}% GP</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-white bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/40 px-4 py-3">
          <Search size={20} className="text-emerald-700" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search imported products..."
            className="w-full bg-transparent text-sm font-black outline-none"
          />
          <div className="rounded-full bg-[#07110d] px-4 py-2 text-xs font-black text-emerald-300">
            {filtered.length} SKUs
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="min-w-[1200px]">
          <div className="grid grid-cols-9 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
            <div className="col-span-2">Product</div>
            <div>Sell</div>
            <div>Cost</div>
            <div>GP %</div>
            <div>Target</div>
            <div>Gap</div>
            <div>Suggested</div>
            <div>Status</div>
          </div>
          {paged.map((row) => (
            <div key={row.id} className="grid grid-cols-9 items-center border-t border-slate-100 px-5 py-5 text-sm">
              <div className="col-span-2">
                <div className="font-black text-[#07110d]">{row.product_name}</div>
                <div className="text-xs text-slate-500">{row.category}</div>
              </div>
              <div>{formatMoney(Number(row.selling_price || 0))}</div>
              <div>{formatMoney(Number(row.total_cost || 0))}</div>
              <div className={Number(row.gp_gap || 0) > 0 ? "font-black text-red-700" : "font-black text-emerald-700"}>
                {Number(row.actual_gp || 0).toFixed(1)}%
              </div>
              <div>{Number(row.target_gp || 0).toFixed(1)}%</div>
              <div className={Number(row.gp_gap || 0) > 0 ? "font-black text-red-700" : ""}>
                {Number(row.gp_gap || 0).toFixed(1)}%
              </div>
              <div className="font-black">{formatMoney(Number(row.suggested_price || 0))}</div>
              <div className="flex items-center gap-2">
                <StatusPill tone={tone(row.risk_level)}>{statusLabel(row)}</StatusPill>
                <Link href="/recovery-opportunities" className="text-emerald-700">
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <PaginatedTableControls page={page} pageCount={pageCount} setPage={setPage} total={filtered.length} />
        </div>
      </div>
    </section>
  );
}
