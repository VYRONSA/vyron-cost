"use client";

import Link from "next/link";
import type { AiFinancialIntelligencePayload } from "@/lib/vyron-ai-financial-intelligence";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

function ScoreRing({ label, score, href }: { label: string; score: number; href?: string }) {
  const inner = (
    <div className="rounded-[2rem] bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 text-4xl font-black text-slate-950">{score}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AiCfoCommandCentreClient({ data }: { data: AiFinancialIntelligencePayload }) {
  const { scores, leakage, narratives, forecast, alerts } = data;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "finance",
        title: "Ai Cfo Command Centre",
        subtitle: "Premium VYRON COST workflow for ai cfo command centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-10">
            <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 p-8 text-white">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">VYRON Intelligence Score</div>
              <div className="mt-3 flex flex-wrap items-end gap-6">
                <div className="text-6xl font-black">{scores.overallScore}</div>
                <div className="text-sm font-semibold text-slate-300">Enterprise financial decision readiness · 0–100</div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Financial", scores.financialHealth, "/finance-intelligence"],
                  ["Procurement", scores.procurementHealth, "/ai-procurement-manager"],
                  ["Inventory", scores.inventoryHealth, "/inventory"],
                  ["Production", scores.productionHealth, "/manufacturing"],
                  ["Recovery", scores.recoveryHealth, "/recovery-opportunities"],
                  ["Risk", scores.riskScore, "/risk-centre"],
                ].map(([l, v, h]) => (
                  <div key={String(l)} className="rounded-xl bg-white/10 p-3">
                    <div className="text-[10px] font-black uppercase text-violet-200">{l}</div>
                    <div className="text-2xl font-black">{v}</div>
                    <Link href={String(h)} className="text-[10px] font-bold text-[#A855F7] hover:underline">
                      Drill down →
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <ScoreRing label="Financial Health" score={scores.financialHealth} href="/finance-intelligence" />
              <ScoreRing label="Procurement Health" score={scores.procurementHealth} href="/ai-procurement-manager" />
              <ScoreRing label="Inventory Health" score={scores.inventoryHealth} href="/inventory" />
              <ScoreRing label="Production Health" score={scores.productionHealth} href="/manufacturing" />
              <ScoreRing label="Recovery Health" score={scores.recoveryHealth} href="/recovery-opportunities" />
              <ScoreRing label="Risk Score" score={scores.riskScore} href="/risk-centre" />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Monthly leakage", leakage.monthlyLeakage],
                ["Annual leakage", leakage.annualLeakage],
                ["Recovered", leakage.recoveredLeakage],
                ["Potential", leakage.potentialLeakage],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-2xl bg-red-50 p-5">
                  <div className="text-xs font-black uppercase text-red-700">{label}</div>
                  <div className="mt-2 text-2xl font-black text-red-900">{money(Number(val))}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/ai-cfo-command-centre/leakage" className="rounded-xl vyron-grad-surface px-4 py-2 text-sm font-semibold text-white">
                Profit leakage detail →
              </Link>
              <Link href="/boardroom-insights" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
                Boardroom insights →
              </Link>
              <Link href="/ai-cfo-command-centre/timeline" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black">
                Executive timeline →
              </Link>
            </div>

            <section className="grid gap-4 lg:grid-cols-2">
              {narratives.map((n) => (
                <article key={n.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
                  <h3 className="font-black text-slate-900">{n.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{n.body}</p>
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                    <div>Formula: {n.formula}</div>
                    <div className="mt-1">Confidence: {n.confidence}%</div>
                  </div>
                </article>
              ))}
            </section>

            {alerts.length ? (
              <section>
                <h2 className="text-xl font-black">Executive alerts</h2>
                <div className="mt-4 space-y-2">
                  {alerts.map((a) => (
                    <div key={a.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-100 bg-white p-4">
                      <div>
                        <span className="text-xs font-black uppercase text-red-600">{a.severity}</span>
                        <div className="font-black">{a.title}</div>
                        <p className="text-sm text-slate-600">{a.message}</p>
                      </div>
                      {a.href ? (
                        <Link href={a.href} className="text-sm font-black text-violet-700">
                          View →
                        </Link>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black">AI forecast summary</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-xs font-black uppercase text-slate-400">Cash 30d</div>
                  <div className="text-xl font-black">{money(forecast.cashRequirement30)}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-slate-400">Cash 90d</div>
                  <div className="text-xl font-black">{money(forecast.cashRequirement90)}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase text-slate-400">Cost inflation (annual)</div>
                  <div className="text-xl font-black">{money(forecast.costInflationAnnual)}</div>
                </div>
              </div>
              <Link href="/enterprise/forecasting" className="mt-4 inline-block text-sm font-black text-violet-700">
                Full forecasting →
              </Link>
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
