"use client";

import Link from "next/link";
import type { VyronFinanceIntelligencePayload } from "@/lib/vyron-finance-intelligence-layer";
import { money } from "./VyronFinanceShared";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

export default function VyronFinanceHubClient({ data }: { data: VyronFinanceIntelligencePayload }) {
  const { executive, healthScores } = data;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "VOLORA Finance Hub",
        subtitle: "Premium VOLORA workflow for vyron finance hub.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <div className="rounded-[2rem] bg-gradient-to-br from-indigo-950 via-slate-950 to-blue-950 p-8 text-white">
              <div className="text-xs font-black uppercase tracking-widest text-blue-300">VOLORA Finance Intelligence Layer</div>
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <div className="text-6xl font-black">{healthScores.overall}</div>
                <div className="text-sm text-slate-300">Overall financial health · feeds VOLORA Finance</div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Liquidity", healthScores.liquidity],
                  ["Profitability", healthScores.profitability],
                  ["Efficiency", healthScores.efficiency],
                  ["Inventory", healthScores.inventoryHealth],
                  ["Recovery", healthScores.recoveryHealth],
                  ["Supplier", healthScores.supplierRisk],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-xl bg-white/10 p-3">
                    <div className="text-[10px] font-black uppercase text-blue-200">{l}</div>
                    <div className="text-2xl font-black">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Revenue", executive.revenue],
                ["Gross profit", executive.gp],
                ["Net profit", executive.netProfit],
                ["Recovery", executive.recovery],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="text-xs font-black uppercase text-slate-400">{label}</div>
                  <div className="mt-2 text-2xl font-black">{money(Number(val))}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                ["/vyron-finance/management-accounts", "Management Accounts", "P&L, balance sheet, cash, variance"],
                ["/vyron-finance/statements", "Financial Statements", "Monthly, quarterly, annual comparatives"],
                ["/vyron-finance/financial-review", "AI Financial Review", `${data.financialReview.length} insights`],
                ["/vyron-finance/audit-intelligence", "Audit Intelligence", `${data.auditIntelligence.length} findings`],
                ["/vyron-finance/cfo-assistant", "AI CFO Assistant", "Explainable Q&A"],
              ].map(([href, title, sub]) => (
                <Link key={String(href)} href={String(href)} className="rounded-[2rem] bg-white p-6 shadow-sm transition hover:shadow-md">
                  <div className="font-black text-slate-900">{title}</div>
                  <p className="mt-2 text-sm text-slate-600">{sub}</p>
                </Link>
              ))}
            </div>
          </section>
    </VyronPremiumPageShell>
  );
}
