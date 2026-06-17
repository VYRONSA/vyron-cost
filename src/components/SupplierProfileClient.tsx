"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ExecutiveSparkChart from "@/components/ExecutiveSparkChart";
import type { SupplierIntelligenceProfile } from "@/lib/vyron-supplier-intelligence-centre";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function riskColour(level: string) {
  if (level === "Critical") return "text-red-800 bg-red-50 border-red-200";
  if (level === "High") return "text-orange-800 bg-orange-50 border-orange-200";
  if (level === "Medium") return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-[#4D7C0F] bg-[#A3E635]/10 border-[#A3E635]/25";
}

type ChartPeriod = "monthly" | "quarterly" | "yearly";

export default function SupplierProfileClient({ profile }: { profile: SupplierIntelligenceProfile }) {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("monthly");
  const chartData = useMemo(() => {
    if (chartPeriod === "quarterly") return profile.priceHistory.quarterly;
    if (chartPeriod === "yearly") return profile.priceHistory.yearly;
    return profile.priceHistory.monthly;
  }, [chartPeriod, profile.priceHistory]);

  const s = profile.supplier;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "suppliers",
        title: "Supplier Profile",
        subtitle: "Premium VYRON COST workflow for supplier profile.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">Supplier Profile</div>
                <h2 className="mt-1 text-3xl font-black text-slate-900">{s.supplierName}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">
                  {s.category} · {s.isActive ? "Active" : "Inactive"} · {s.paymentTerms || "Terms on file"}
                </p>
              </div>
              <div className={`rounded-2xl border px-4 py-2 text-sm font-black ${riskColour(profile.scorecard.riskLevel)}`}>
                Risk: {profile.scorecard.riskLevel} ({profile.scorecard.riskScore})
              </div>
            </div>

            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                ["Contact", s.contactEmail || s.invoiceEmail || "—"],
                ["Phone", s.contactPhone || "—"],
                ["VAT", s.vatNumber || "—"],
                ["Account", s.accountNumber || "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                  <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                ["This Month", profile.spend.thisMonth],
                ["This Year", profile.spend.thisYear],
                ["Lifetime", profile.spend.lifetime],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[2rem] bg-white p-6 shadow-sm">
                  <div className="text-xs font-black uppercase text-slate-400">Spend · {label}</div>
                  <div className="mt-2 text-3xl font-black text-slate-900">{money(Number(value))}</div>
                </div>
              ))}
            </section>

            <section className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-violet-950 p-6 text-white">
              <h3 className="text-lg font-black">Supplier Scorecard</h3>
              <div className="mt-4 flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-xs font-black uppercase text-violet-200">Overall Score</div>
                  <div className="text-5xl font-black">{profile.scorecard.overallScore}</div>
                  <div className="text-sm text-violet-200">out of 100</div>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ["Price Stability", profile.scorecard.priceStability],
                    ["Delivery", profile.scorecard.deliveryScore],
                    ["Invoice Accuracy", profile.scorecard.invoiceAccuracy],
                    ["PO Compliance", profile.scorecard.poCompliance],
                    ["Risk (inverse)", 100 - profile.scorecard.riskScore],
                  ].map(([label, score]) => (
                    <div key={String(label)} className="rounded-xl bg-white/10 p-3">
                      <div className="text-[10px] font-black uppercase text-violet-200">{label}</div>
                      <div className="mt-1 text-2xl font-black">{score}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-slate-900">Price History</h3>
                  <div className="flex gap-2">
                    {(["monthly", "quarterly", "yearly"] as ChartPeriod[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setChartPeriod(p)}
                        className={`rounded-xl px-3 py-1 text-xs font-black capitalize ${
                          chartPeriod === p ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <ExecutiveSparkChart data={chartData.length ? chartData : [{ label: "—", value: 0 }]} height={140} colour="#7c3aed" />
                </div>
                {profile.priceHistory.latest ? (
                  <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
                    <div>
                      <span className="text-slate-400">Item</span>
                      <div className="font-black">{profile.priceHistory.latest.itemName}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Previous</span>
                      <div className="font-black">{money(profile.priceHistory.latest.previousPrice)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Current</span>
                      <div className="font-black">{money(profile.priceHistory.latest.currentPrice)}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Change</span>
                      <div className={`font-black ${profile.priceHistory.latest.percentage >= 0 ? "text-red-600" : "text-[#84CC16]"}`}>
                        {money(profile.priceHistory.latest.difference)} ({profile.priceHistory.latest.percentage.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">Inflation Engine</h3>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-red-50 p-4">
                    <div className="text-xs font-black uppercase text-red-700">Largest Increase</div>
                    <div className="mt-1 font-black text-red-900">
                      {profile.inflation.largestIncrease
                        ? `${profile.inflation.largestIncrease.itemName} · ${profile.inflation.largestIncrease.percentage.toFixed(1)}%`
                        : "None detected"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-4">
                    <div className="text-xs font-black uppercase text-amber-700">Most Frequent Increase</div>
                    <div className="mt-1 font-black text-amber-900">
                      {profile.inflation.mostFrequentIncrease
                        ? `${profile.inflation.mostFrequentIncrease.itemName} · ${profile.inflation.mostFrequentIncrease.count}×`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <div className="text-xs font-black uppercase text-slate-500">Highest Annual Inflation</div>
                    <div className="mt-1 text-2xl font-black">{profile.inflation.highestAnnualInflation.toFixed(1)}%</div>
                    <div className="text-xs font-bold text-slate-500">{profile.inflation.increaseCount} increases on record</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-slate-900">Benchmarking</h3>
              <div className="mt-4 space-y-4">
                {profile.benchmarks.length ? (
                  profile.benchmarks.map((b) => (
                    <div key={b.itemName} className="rounded-xl border border-slate-100 p-4">
                      <div className="font-black text-slate-900">{b.itemName}</div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {b.suppliers.map((sup) => (
                          <div key={`${sup.supplierName}-${sup.price}`} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <span className="font-bold">{sup.supplierName}</span>
                            <span className="font-black">{money(sup.price)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold text-slate-600">
                        <span>Difference: {money(b.difference)}</span>
                        <span className="text-[#65A30D]">Potential saving: {money(b.potentialSaving)}/mo est.</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm font-bold text-slate-500">No cross-supplier benchmarks yet — add price history for shared items.</p>
                )}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {(
                [
                  ["PO Variance", profile.variances.po],
                  ["Invoice Variance", profile.variances.invoice],
                  ["GRN Variance", profile.variances.grn],
                ] as const
              ).map(([title, v]) => (
                <div key={title} className="rounded-[2rem] bg-white p-5 shadow-sm">
                  <div className="text-xs font-black uppercase text-slate-400">{title}</div>
                  <div className={`mt-2 inline-block rounded-lg border px-2 py-0.5 text-xs font-black ${riskColour(v.risk)}`}>{v.risk}</div>
                  <div className="mt-3 text-2xl font-black">{v.frequency}×</div>
                  <div className="text-sm font-bold text-slate-600">{money(v.value)}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black">Performance</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Orders", profile.performance.orders],
                    ["Receipts", profile.performance.receipts],
                    ["Invoices", profile.performance.invoices],
                    ["On-time %", `${profile.performance.onTimePct}%`],
                    ["On-time deliveries", profile.performance.onTimeDeliveries],
                    ["Partial deliveries", profile.performance.partialDeliveries],
                    ["Back orders", profile.performance.backOrders],
                    ["Rejected", profile.performance.rejectedDeliveries],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[10px] font-black uppercase text-slate-400">{k}</div>
                      <div className="font-black text-slate-900">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                <h3 className="text-lg font-black">Risk Engine</h3>
                <ul className="mt-4 space-y-2">
                  {profile.risk.factors.length ? (
                    profile.risk.factors.map((f) => (
                      <li key={f.factor} className="rounded-xl border border-slate-100 p-3 text-sm">
                        <div className="flex justify-between font-black">
                          <span>{f.factor}</span>
                          <span className="text-red-600">+{f.weight}</span>
                        </div>
                        <p className="mt-1 text-slate-600">{f.detail}</p>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm font-bold text-[#65A30D]">No elevated risk factors.</li>
                  )}
                </ul>
              </div>
            </section>

            <section className="rounded-[2rem] bg-[#A3E635]/10 p-6">
              <h3 className="text-lg font-black text-[#4D7C0F]">Savings Opportunities</h3>
              <div className="mt-4 space-y-2">
                {profile.savingsOpportunities.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-4">
                    <div>
                      <div className="text-xs font-black uppercase text-[#65A30D]">{o.type}</div>
                      <div className="font-black text-slate-900">{o.title}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-[#65A30D]">{money(o.potentialAnnual)}/yr</div>
                      <div className="text-xs font-bold text-slate-500">{o.confidence}% confidence</div>
                      {o.href ? (
                        <Link href={o.href} className="text-xs font-black text-violet-700 hover:underline">
                          Open in AI Procurement →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black">Timeline</h3>
              <ol className="mt-4 space-y-2 border-l-2 border-violet-200 pl-4">
                {profile.timeline.slice(0, 25).map((ev) => (
                  <li key={ev.id} className="relative text-sm">
                    <span className="absolute -left-[1.35rem] top-1 h-2 w-2 rounded-full bg-violet-500" />
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      {ev.type} · {new Date(ev.at).toLocaleString("en-ZA")}
                    </div>
                    {ev.href ? (
                      <Link href={ev.href} className="font-black text-violet-700 hover:underline">
                        {ev.title}
                      </Link>
                    ) : (
                      <div className="font-black text-slate-900">{ev.title}</div>
                    )}
                    <p className="text-slate-600">{ev.detail}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[2rem] bg-white p-5 shadow-sm">
                <h3 className="font-black text-slate-900">Purchase Orders</h3>
                <ul className="mt-3 space-y-2">
                  {profile.documents.purchaseOrders.slice(0, 8).map((d) => (
                    <li key={d.id}>
                      <Link href={d.href} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold hover:bg-violet-50">
                        <span>{d.label}</span>
                        <span>{money(d.total)}</span>
                      </Link>
                    </li>
                  ))}
                  {!profile.documents.purchaseOrders.length ? <li className="text-sm text-slate-500">None linked</li> : null}
                </ul>
              </div>
              <div className="rounded-[2rem] bg-white p-5 shadow-sm">
                <h3 className="font-black text-slate-900">Invoices</h3>
                <ul className="mt-3 space-y-2">
                  {profile.documents.invoices.slice(0, 8).map((d) => (
                    <li key={d.id}>
                      <Link href={d.href} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold hover:bg-violet-50">
                        <span>{d.label}</span>
                        <span>{money(d.total)}</span>
                      </Link>
                    </li>
                  ))}
                  {!profile.documents.invoices.length ? <li className="text-sm text-slate-500">None linked</li> : null}
                </ul>
              </div>
              <div className="rounded-[2rem] bg-white p-5 shadow-sm">
                <h3 className="font-black text-slate-900">GRNs</h3>
                <ul className="mt-3 space-y-2">
                  {profile.documents.grns.slice(0, 8).map((d) => (
                    <li key={d.id}>
                      <Link href={d.href} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold hover:bg-violet-50">
                        <span>{d.label}</span>
                        <span>{d.status}</span>
                      </Link>
                    </li>
                  ))}
                  {!profile.documents.grns.length ? <li className="text-sm text-slate-500">None linked</li> : null}
                </ul>
              </div>
              <div className="rounded-[2rem] bg-white p-5 shadow-sm">
                <h3 className="font-black text-slate-900">Contracts</h3>
                <ul className="mt-3 space-y-2">
                  {profile.documents.contracts.slice(0, 8).map((d) => (
                    <li key={d.id}>
                      <Link href={d.href} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold hover:bg-violet-50">
                        <span>{d.label}</span>
                        <span>{d.status}</span>
                      </Link>
                    </li>
                  ))}
                  {!profile.documents.contracts.length ? <li className="text-sm text-slate-500">None linked</li> : null}
                </ul>
              </div>
            </section>

            {profile.aiRecommendations.length ? (
              <section className="rounded-[2rem] border border-indigo-200 bg-indigo-50 p-6">
                <h3 className="font-black text-indigo-950">AI Procurement Integration</h3>
                <ul className="mt-3 space-y-2">
                  {profile.aiRecommendations.map((r) => (
                    <li key={r.recommendationKey}>
                      <Link href={r.href} className="block rounded-xl bg-white p-3 text-sm font-bold hover:shadow">
                        {r.title} — {money(r.potentialBenefitAnnual)}/yr · {r.confidenceScore}%
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {profile.auditTrail.length ? (
              <section className="rounded-[2rem] bg-slate-50 p-6">
                <h3 className="font-black text-slate-900">Audit Trail</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {profile.auditTrail.map((a) => (
                    <li key={a.id} className="rounded-lg bg-white p-3">
                      <span className="font-black">{a.eventType}</span> — {a.detail}
                      <div className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString("en-ZA")}</div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
    </VyronPremiumPageShell>
  );
}
