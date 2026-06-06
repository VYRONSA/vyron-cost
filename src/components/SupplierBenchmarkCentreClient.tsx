"use client";

import Link from "next/link";
import { SupplierIntelRow, formatSupplierSpend } from "@/lib/vyron-supplier-intelligence-data";

export default function SupplierBenchmarkCentreClient({ rows }: { rows: SupplierIntelRow[] }) {
  const benchmarks = rows.map((row, index) => {
    const possibleSaving = Number(row.negotiation_opportunity || 0);
    const benchmarkPrice = Number(row.current_spend || 0) > 0 ? Number(row.current_spend || 0) * 0.94 : 0;
    return {
      id: row.id || `bench-${index}`,
      supplier: row.supplier_name,
      category: row.category,
      currentSpend: Number(row.current_spend || 0),
      benchmarkSpend: benchmarkPrice,
      saving: possibleSaving,
      risk: Number(row.supplier_risk_score || 0),
      href: row.href || "/suppliers",
    };
  });

  const totalSaving = benchmarks.reduce((sum, row) => sum + row.saving, 0);

  return (
    <section className="grid gap-6">
      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Benchmark Savings</div>
          <div className="mt-3 text-4xl font-black text-emerald-700">{formatSupplierSpend(totalSaving)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Suppliers Compared</div>
          <div className="mt-3 text-4xl font-black text-[#07110d]">{benchmarks.length}</div>
        </div>
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Rule</div>
          <div className="mt-3 text-3xl font-black">Benchmark before buying</div>
        </div>
      </section>

      <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-emerald-300">
          <div className="col-span-2">Supplier</div>
          <div>Category</div>
          <div>Current Spend</div>
          <div>Benchmark</div>
          <div>Saving</div>
          <div>Risk</div>
        </div>
        {benchmarks.map((row) => (
          <Link key={row.id} href={row.href} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm transition hover:bg-emerald-50">
            <div className="col-span-2 font-black text-[#07110d]">{row.supplier}</div>
            <div>{row.category}</div>
            <div>{formatSupplierSpend(row.currentSpend)}</div>
            <div>{formatSupplierSpend(row.benchmarkSpend)}</div>
            <div className="font-black text-emerald-700">{formatSupplierSpend(row.saving)}</div>
            <div className="font-black text-red-700">{row.risk}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
