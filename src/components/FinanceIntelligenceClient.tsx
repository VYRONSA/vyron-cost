"use client";

import Link from "next/link";
import type { FinanceIntelligenceKpis, FinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function riskClass(level: string) {
  if (level === "Critical") return "bg-red-100 text-red-800 border-red-200";
  if (level === "High") return "bg-orange-100 text-orange-800 border-orange-200";
  if (level === "Medium") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export default function FinanceIntelligenceClient({
  kpis,
  leakage,
}: {
  kpis: FinanceIntelligenceKpis;
  leakage: FinanceLeakageCentre;
}) {
  const kpiCards = [
    ["Spend This Month", money(kpis.spendThisMonth), "/purchase-orders"],
    ["Spend This Year", money(kpis.spendThisYear), "/purchase-orders"],
    ["Inventory Value", money(kpis.inventoryValue), "/inventory"],
    ["Production Cost", money(kpis.productionCost), "/manufacturing"],
    ["Potential Recovery", money(kpis.potentialRecovery), "/recovery-opportunities"],
    ["Verified Recovery", money(kpis.verifiedRecovery), "/recovery-opportunities"],
    ["Recovered Value", money(kpis.recoveredValue), "/recovery-pipeline"],
    ["Supplier Inflation Impact", money(kpis.supplierInflationImpact), "/supplier-intelligence"],
    ["Projected Annual Cost Impact", money(kpis.projectedAnnualCostImpact), "/financial-leakage"],
  ] as const;

  return (
    <section className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiCards.map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-violet-950 p-8 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase text-violet-300">Leakage Risk Score</div>
            <div className="mt-2 text-5xl font-black">{leakage.leakageRiskScore}</div>
          </div>
          <span className={`rounded-2xl border px-4 py-2 text-sm font-black ${riskClass(leakage.riskLevel)}`}>
            {leakage.riskLevel}
          </span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase text-violet-200">Monthly exposure</div>
            <div className="text-2xl font-black">{money(leakage.totalMonthlyExposure)}</div>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase text-violet-200">Projected annual impact</div>
            <div className="text-2xl font-black">{money(leakage.projectedAnnualImpact)}</div>
          </div>
        </div>
        <Link href="/financial-leakage" className="mt-6 inline-block text-sm font-black text-emerald-300 hover:underline">
          Open Financial Leakage Centre →
        </Link>
      </div>
    </section>
  );
}
