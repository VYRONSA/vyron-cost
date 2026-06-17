"use client";

import Link from "next/link";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { formatSupplierSpend, type SupplierIntelRow } from "@/lib/vyron-supplier-intelligence-shared";

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
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        badge: "Supplier Benchmarking",
        title: "Supplier Benchmark Command Centre",
        subtitle: "Compare supplier spend against benchmark baselines and highlight negotiation upside.",
        outcomes: ["Estimate benchmark savings potential", "Rank suppliers by risk and variance", "Focus negotiation on highest impact suppliers"],
        formulas: ["Benchmark Spend = Current Spend x 0.94", "Saving = Current Spend - Benchmark Spend proxy", "Renewal Focus weighted by risk and variance"],
        intelligenceItems: [
          { label: "Benchmark rows", detail: `${benchmarks.length} suppliers benchmarked` },
          { label: "Total saving", detail: formatSupplierSpend(totalSaving) },
          { label: "Risk overlay", detail: "Supplier risk displayed alongside financial variance" },
        ],
      }}
    >
      <section className="grid gap-6">
        <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Benchmark Savings</div>
          <div className="mt-3 text-4xl font-black text-[#65A30D]">{formatSupplierSpend(totalSaving)}</div>
        </div>
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Suppliers Compared</div>
          <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{benchmarks.length}</div>
        </div>
        <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">Rule</div>
          <div className="mt-3 text-3xl font-black">Benchmark before buying</div>
        </div>
      </section>

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="grid grid-cols-7 bg-[#07110d] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-[#A3E635]">
          <div className="col-span-2">Supplier</div>
          <div>Category</div>
          <div>Current Spend</div>
          <div>Benchmark</div>
          <div>Saving</div>
          <div>Risk</div>
        </div>
        {benchmarks.map((row) => (
          <Link key={row.id} href={row.href} className="grid grid-cols-7 items-center border-t border-slate-100 px-5 py-5 text-sm transition hover:bg-[#A3E635]/10">
            <div className="col-span-2 font-black text-[#F8FAFC]">{row.supplier}</div>
            <div>{row.category}</div>
            <div>{formatSupplierSpend(row.currentSpend)}</div>
            <div>{formatSupplierSpend(row.benchmarkSpend)}</div>
            <div className="font-black text-[#65A30D]">{formatSupplierSpend(row.saving)}</div>
            <div className="font-black text-red-700">{row.risk}</div>
          </Link>
        ))}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
