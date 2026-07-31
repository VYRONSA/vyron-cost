"use client";

import Link from "next/link";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import type { FinanceLeakageCentre } from "@/lib/vyron-finance-intelligence";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function riskClass(level: string) {
  if (level === "Critical") return "border-red-300 bg-red-50 text-red-800";
  if (level === "High") return "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  if (level === "Medium") return "border-[var(--vyron-warning-border)] bg-[var(--vyron-warning-bg)] text-[var(--vyron-warning-fg)]";
  return "border-[#A855F7]/30 bg-[#A855F7]/10 text-[#4D7C0F]";
}

export default function FinanceLeakageCentreClient({ centre }: { centre: FinanceLeakageCentre }) {
  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "recovery",
        badge: "Leakage Intelligence",
        title: "Finance Leakage Command Centre",
        subtitle: "Consolidate leakage risk exposure across categories with direct action pathways.",
        outcomes: ["Quantify monthly and annual leakage pressure", "Prioritize high-risk leakage categories", "Route recovery action from category cards"],
        formulas: ["Annual Impact = Monthly Exposure x 12", "Leakage Risk Score from multi-signal model", "Category Exposure aggregated by leakage type"],
        intelligenceItems: [
          { label: "Risk score", detail: `${centre.leakageRiskScore}` },
          { label: "Category count", detail: `${centre.categories.length} leakage categories active` },
          { label: "Monthly exposure", detail: money(centre.totalMonthlyExposure) },
        ],
      }}
    >
      <section className="mb-0 min-w-0 rounded-[2rem] border border-violet-200 bg-gradient-to-r from-violet-50 to-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Financial Leakage Centre</div>
          <h2 className="mt-1 text-2xl font-black text-slate-900">Leakage risk score: {centre.leakageRiskScore}</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Monthly exposure {money(centre.totalMonthlyExposure)} · Annual projected {money(centre.projectedAnnualImpact)}
          </p>
        </div>
        <span className={`rounded-2xl border px-4 py-2 text-sm font-black ${riskClass(centre.riskLevel)}`}>
          {centre.riskLevel}
        </span>
      </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {centre.categories.map((cat) => (
          <Link
            key={cat.key}
            href={cat.href}
            className={`rounded-2xl border p-4 transition hover:shadow-md ${riskClass(cat.riskLevel)}`}
          >
            <div className="text-xs font-black uppercase opacity-80">{cat.label}</div>
            <div className="mt-2 text-xl font-black">{money(cat.monthlyExposure)}/mo</div>
            <div className="mt-1 text-xs font-bold">{cat.itemCount} item(s) · {cat.riskLevel}</div>
          </Link>
        ))}
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
