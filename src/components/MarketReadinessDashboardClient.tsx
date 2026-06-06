"use client";

import Link from "next/link";
import { LaunchReadinessSnapshot, formatLaunchMoney } from "@/lib/vyron-launch-readiness-data";

export default function MarketReadinessDashboardClient({ snapshot }: { snapshot: LaunchReadinessSnapshot }) {
  const items = [
    ["Readiness Score", `${snapshot.readinessScore}%`, "/commercial-launch"],
    ["Monthly Recovery", formatLaunchMoney(snapshot.realisticMonthlyRecovery), "/financial-leakage"],
    ["Annual Recovery", formatLaunchMoney(snapshot.realisticMonthlyRecovery * 12), "/executive-dashboard"],
    ["Products Under GP", String(snapshot.productsUnderGp), "/product-profitability"],
    ["High Risk Suppliers", String(snapshot.highRiskSuppliers), "/supplier-scorecards"],
    ["Forecast Risks", String(snapshot.forecastRiskProducts), "/forecasting"],
  ];

  return (
    <section className="grid gap-6">
      <div className="grid gap-5 md:grid-cols-3">
        {items.map(([label, value, href]) => (
          <Link key={label} href={href} className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:bg-emerald-50">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{label}</div>
            <div className="mt-3 text-4xl font-black text-[#07110d]">{value}</div>
            <div className="mt-3 text-sm font-black text-emerald-700">Open →</div>
          </Link>
        ))}
      </div>

      <div className="rounded-[2rem] bg-[#07110d] p-6 text-white">
        <h2 className="text-3xl font-black">Market Ready Positioning</h2>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-300">
          VYRON COST is positioned as an AI Profit Recovery & Cost Intelligence Platform for food manufacturers, not just a costing calculator.
        </p>
      </div>
    </section>
  );
}
