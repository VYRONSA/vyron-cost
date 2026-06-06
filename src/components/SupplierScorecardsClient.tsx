"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import StatusPill from "@/components/StatusPill";
import { formatSupplierSpend, SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-data";

function riskTone(score: number): "red" | "amber" | "emerald" {
  if (score >= 80) return "red";
  if (score >= 60) return "amber";
  return "emerald";
}

export default function SupplierScorecardsClient({ rows }: { rows: SupplierIntelRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.supplier_name, row.category, row.recommended_action].join(" ").toLowerCase().includes(term));
  }, [rows, search]);

  return (
    <section className="grid gap-6">
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search supplier scorecards..." resultCount={filtered.length} />
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => (
          <Link key={row.id} href={row.href} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-1 hover:bg-emerald-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-[#07110d]">{row.supplier_name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{row.category}</p>
              </div>
              <StatusPill tone={riskTone(row.supplier_risk_score)}>{row.supplier_risk_score}</StatusPill>
            </div>

            <div className="mt-6 grid gap-3">
              <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-bold text-slate-500">Spend</span>
                <span className="font-black">{formatSupplierSpend(row.current_spend)}</span>
              </div>
              <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="font-bold text-slate-500">Movement</span>
                <span className="font-black text-red-700">{row.price_movement_percent.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between rounded-2xl bg-emerald-50 px-4 py-3 text-sm">
                <span className="font-bold text-emerald-800">Negotiation</span>
                <span className="font-black text-emerald-700">{formatSupplierSpend(row.negotiation_opportunity)}</span>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold leading-6 text-slate-600">
                {row.recommended_action}
              </div>
            </div>
          </Link>
        ))}
      </section>
    </section>
  );
}
