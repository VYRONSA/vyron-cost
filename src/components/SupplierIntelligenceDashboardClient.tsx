"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SearchFilterBar from "@/components/SearchFilterBar";
import { formatSupplierSpend, SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-data";

export default function SupplierIntelligenceDashboardClient({ rows }: { rows: SupplierIntelRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.supplier_name,
        row.category,
        row.recommended_action,
        String(row.price_movement_percent),
        String(row.supplier_risk_score),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-black text-[#07110d]">What is Supplier Intelligence?</h2>
        <p className="mt-3 text-sm leading-7 text-emerald-950">
          Supplier Intelligence shows which suppliers are increasing prices, creating margin risk, causing invoice
          irregularities, or presenting negotiation opportunities. Use this page before approving POs, repricing products
          or responding to recovery opportunities.
        </p>
      </div>

      <SearchFilterBar value={search} onChange={setSearch} placeholder="Search suppliers..." resultCount={filtered.length} />

      <div className="overflow-x-auto rounded-[2rem] border border-white bg-white shadow-sm">
        <div className="min-w-[1400px]">
          <div className="grid grid-cols-12 bg-[#08111A] px-5 py-4 text-[10px] font-black uppercase tracking-[0.14em] text-[#B6D934]">
            <div className="col-span-2">Supplier</div>
            <div>Category</div>
            <div>Spend</div>
            <div>Movement</div>
            <div>Ingredients</div>
            <div>Invoices</div>
            <div>Dup Risk</div>
            <div>Variance</div>
            <div>Reliability</div>
            <div>Negotiation</div>
            <div>Risk</div>
            <div>Action</div>
          </div>
          {filtered.map((row) => (
            <Link
              key={row.id}
              href={row.href}
              className="grid grid-cols-12 items-center border-t border-slate-100 px-5 py-4 text-sm transition hover:bg-emerald-50"
            >
              <div className="col-span-2 font-black text-[#07110d]">{row.supplier_name}</div>
              <div>{row.category}</div>
              <div>{formatSupplierSpend(row.current_spend)}</div>
              <div className="font-black text-red-600">{row.price_movement_percent.toFixed(1)}%</div>
              <div>{row.linked_ingredients}</div>
              <div>{row.invoice_count}</div>
              <div>{row.duplicate_invoice_risk}</div>
              <div>{formatSupplierSpend(row.price_variance)}</div>
              <div>{row.reliability_score}</div>
              <div className="font-black text-emerald-700">{formatSupplierSpend(row.negotiation_opportunity)}</div>
              <div className="font-black text-red-600">{row.supplier_risk_score}</div>
              <div className="text-xs font-bold text-slate-600">{row.recommended_action}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
