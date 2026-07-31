"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";
import { LaunchReadinessSnapshot, formatLaunchMoney } from "@/lib/vyron-launch-readiness-data";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function CommercialLaunchCentreClient({ snapshot }: { snapshot: LaunchReadinessSnapshot }) {
  const checks = [
    ["Products loaded", snapshot.productCount, "/products"],
    ["Products under GP", snapshot.productsUnderGp, "/product-profitability"],
    ["Suppliers loaded", snapshot.supplierCount, "/suppliers"],
    ["High risk suppliers", snapshot.highRiskSuppliers, "/supplier-scorecards"],
    ["Leakage findings", snapshot.leakageFindings, "/financial-leakage"],
    ["Invoice queue", snapshot.invoiceCount, "/invoice-processing"],
    ["Unmatched invoice lines", snapshot.unmatchedInvoiceLines, "/invoice-processing"],
    ["Forecast risk products", snapshot.forecastRiskProducts, "/forecasting"],
  ];

  return (
    <VyronPremiumPageShell
      config={{
        title: "Commercial Launch Centre",
        subtitle: "Premium VYRON COST workflow for commercial launch centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-6">
            <div className="rounded-[2rem] bg-[#07110d] p-6 text-white shadow-[0_18px_55px_rgba(6,20,14,0.24)]">
              <Rocket size={34} className="text-[#A855F7]" />
              <h2 className="mt-5 text-3xl font-black">Commercial Launch Centre</h2>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-7 text-slate-300">
                Readiness score, launch blockers and client demo confidence for Handcrafted Foods.
              </p>
              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Readiness Score</div>
                  <div className="mt-2 text-5xl font-black text-[#A855F7]">{snapshot.readinessScore}%</div>
                </div>
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Monthly Recovery</div>
                  <div className="mt-2 text-5xl font-black text-white">{formatLaunchMoney(snapshot.realisticMonthlyRecovery)}</div>
                </div>
                <div className="rounded-3xl bg-white/10 p-5">
                  <div className="text-xs font-black uppercase text-slate-400">Annual Recovery</div>
                  <div className="mt-2 text-5xl font-black text-white">{formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12)}</div>
                </div>
              </div>
            </div>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {checks.map(([label, value, href]) => (
                <Link key={String(label)} href={String(href)} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:bg-[#A855F7]/10">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
                  <div className="mt-3 text-4xl font-black text-[#F8FAFC]">{String(value)}</div>
                  <div className="mt-3 text-sm font-black text-[#7E22CE]">Open →</div>
                </Link>
              ))}
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
