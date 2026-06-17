"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Boxes,
  BrainCircuit,
  ClipboardList,
  Factory,
  Package,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { ExecutiveCommandCentrePayload } from "@/lib/vyron-executive-command-centre";
import ExecutiveSparkChart from "@/components/ExecutiveSparkChart";
import ExecutiveHeatmap from "@/components/ExecutiveHeatmap";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";

function money(value: number) {
  return `R${Number(value || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function CommandCentreCard({
  title,
  subtitle,
  href,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-[2rem] p-6 text-white shadow-[0_18px_55px_rgba(0,0,0,0.12)] ${accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] opacity-80">{subtitle}</div>
          <h3 className="mt-1 text-2xl font-black">{title}</h3>
        </div>
        <Link href={href} className="rounded-2xl bg-white/20 px-4 py-2 text-xs font-black backdrop-blur hover:bg-white/30">
          Open →
        </Link>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
      <div className="text-[10px] font-black uppercase tracking-[0.1em] opacity-75">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  );
}

export default function ExecutiveCommandCentreClient({ data }: { data: ExecutiveCommandCentrePayload }) {
  const { headline, procurement, inventory, manufacturing, recovery, ai, trends, heatmap, aiFeed, supplierIntelligence } = data;

  return (
    <VyronPremiumPageShell
      config={{
        visualVariant: "executive",
        title: "Executive Command Centre",
        subtitle: "Premium VYRON COST workflow for executive command centre.",
        formulas: ["GP % = (Price - Cost) / Price"],
      }}
    >
      <section className="grid gap-8">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Manufacturing Today", String(headline.manufacturingToday), "/manufacturing/history", "Units produced today"],
                ["Finished Goods Produced", String(headline.finishedGoodsProduced), "/manufacturing/finished-goods", "Units this month"],
                ["Sales Today", money(headline.salesToday), "/customer-invoices", "Posted invoice sales"],
                ["Inventory Value", money(headline.inventoryValue), "/inventory-intelligence", "Raw materials + finished goods"],
                ["Recovery Opportunities", String(headline.recoveryOpportunities), "/financial-leakage", "Open recovery cases"],
                ["Supplier Inflation", `${headline.supplierInflation}%`, "/document-intelligence/price-history/supplier", "Price movement exposure"],
              ].map(([label, value, href, note]) => (
                <Link
                  key={label}
                  href={href}
                  className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:border-violet-300"
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{label}</div>
                  <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
                </Link>
              ))}
            </div>

            <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-8 text-white shadow-[0_24px_80px_rgba(30,27,75,0.35)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">VYRON COST</div>
                  <h2 className="mt-2 text-4xl font-black">Executive Command Centre</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
                    CEO / CFO / Owner view — procurement, inventory, manufacturing, recovery and AI intelligence in one place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["/finance-intelligence", "Finance"],
                    ["/purchase-orders", "Procurement"],
                    ["/inventory", "Inventory"],
                    ["/manufacturing", "Manufacturing"],
                    ["/supplier-intelligence", "Suppliers"],
                    ["/financial-leakage", "Recovery"],
                    ["/ai-procurement-manager", "AI Procurement"],
                    ["/board-pack-centre", "Board Pack"],
                  ].map(([href, label]) => (
                    <Link
                      key={href}
                      href={href}
                      className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black text-white backdrop-blur hover:bg-white/20"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <KpiTile label="Open AI recommendations" value={String(ai.openRecommendations)} />
                <KpiTile label="High risk alerts" value={String(ai.highRiskAlerts)} />
                <KpiTile label="Active opportunities" value={String(ai.opportunities)} />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <CommandCentreCard title="Procurement Command Centre" subtitle="Spend · PO · inflation" href="/purchase-orders" accent="bg-gradient-to-br from-indigo-800 to-violet-900">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiTile label="Spend today" value={money(procurement.spendToday)} />
                  <KpiTile label="Spend this month" value={money(procurement.spendThisMonth)} />
                  <KpiTile label="PO variances" value={String(procurement.poVariances)} />
                  <KpiTile label="Supplier inflation" value={`${procurement.supplierInflation}%`} />
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-4">
                  <div className="text-[10px] font-black uppercase opacity-75">Spend trend (14 days)</div>
                  <ExecutiveSparkChart data={trends.spendTrend} colour="#c4b5fd" formatValue={(n) => money(n)} />
                </div>
              </CommandCentreCard>

              <CommandCentreCard title="Inventory Command Centre" subtitle="Valuation · stock risk" href="/inventory-intelligence" accent="bg-gradient-to-br from-[#24183F] to-[#1a1033]">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <KpiTile label="Inventory value" value={money(inventory.inventoryValue)} />
                  <KpiTile label="Low stock" value={String(inventory.lowStock)} />
                  <KpiTile label="Overstock" value={String(inventory.overstock)} />
                  <KpiTile label="Slow moving" value={String(inventory.slowMoving)} />
                  <KpiTile label="Negative stock" value={String(inventory.negativeStockRisks)} />
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-4">
                  <div className="text-[10px] font-black uppercase opacity-75">Inventory value trend</div>
                  <ExecutiveSparkChart data={trends.inventoryValueTrend} colour="#6ee7b7" variant="line" formatValue={(n) => money(n)} />
                </div>
              </CommandCentreCard>

              <CommandCentreCard title="Manufacturing Command Centre" subtitle="Cost · yield · wastage" href="/manufacturing" accent="bg-gradient-to-br from-violet-900 to-fuchsia-950">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <KpiTile label="Today" value={String(manufacturing.productionToday)} />
                  <KpiTile label="FG produced" value={String(manufacturing.finishedGoodsProduced)} />
                  <KpiTile label="Production cost" value={money(manufacturing.productionCost)} />
                  <KpiTile label="Yield %" value={`${manufacturing.yieldPct}%`} />
                  <KpiTile label="Wastage %" value={`${manufacturing.wastagePct}%`} />
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-4">
                  <div className="text-[10px] font-black uppercase opacity-75">Production performance (avg yield % by week)</div>
                  <ExecutiveSparkChart data={trends.productionPerformanceTrend} colour="#f0abfc" variant="line" formatValue={(n) => `${n.toFixed(1)}%`} />
                </div>
              </CommandCentreCard>

              <CommandCentreCard title="Recovery Command Centre" subtitle="Identify · verify · recover" href="/financial-leakage" accent="bg-gradient-to-br from-amber-800 to-red-950">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiTile label="Potential recovery" value={money(recovery.potentialRecovery)} />
                  <KpiTile label="Verified recovery" value={money(recovery.verifiedRecovery)} />
                  <KpiTile label="Recovered value" value={money(recovery.recoveredValue)} />
                  <KpiTile label="Open opportunities" value={String(recovery.openOpportunities)} />
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-4">
                  <div className="text-[10px] font-black uppercase opacity-75">Recovery trend (weekly)</div>
                  <ExecutiveSparkChart data={trends.recoveryTrend} colour="#fcd34d" formatValue={(n) => money(n)} />
                </div>
              </CommandCentreCard>
            </div>

            <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-950">Supplier inflation graph</h3>
                  <p className="text-sm font-semibold text-slate-500">Cumulative price movement % by week from price history</p>
                </div>
                <Link href="/document-intelligence/price-history/supplier" className="text-sm font-black text-violet-700">
                  Price history →
                </Link>
              </div>
              <div className="mt-6 h-40">
                <ExecutiveSparkChart data={trends.supplierInflationTrend} colour="#6366f1" height={140} formatValue={(n) => `${n.toFixed(1)}%`} />
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <h3 className="text-xl font-black text-[#F8FAFC]">Executive risk heatmap</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">Cross-functional exposure by area and metric</p>
                <div className="mt-6">
                  <ExecutiveHeatmap cells={heatmap} />
                </div>
              </div>

              <div className="rounded-[2rem] bg-gradient-to-b from-slate-900 to-violet-950 p-6 text-white">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="text-violet-300" size={24} />
                  <h3 className="text-xl font-black">AI Intelligence Feed</h3>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-400">Production · procurement · recovery · inventory</p>
                <ul className="mt-5 max-h-[420px] space-y-3 overflow-y-auto">
                  {aiFeed.length === 0 ? (
                    <li className="text-sm font-semibold text-slate-400">No active alerts — system is stable.</li>
                  ) : (
                    aiFeed.map((item) => (
                      <li key={item.id} className="rounded-xl bg-white/10 p-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                              item.severity === "high" ? "bg-red-500/30 text-red-200" : item.severity === "medium" ? "bg-amber-500/30 text-amber-100" : "bg-slate-500/30"
                            }`}
                          >
                            {item.category}
                          </span>
                        </div>
                        {item.href ? (
                          <Link href={item.href} className="mt-2 block text-sm font-bold leading-6 text-violet-100 hover:text-white">
                            {item.message}
                          </Link>
                        ) : (
                          <p className="mt-2 text-sm font-bold leading-6 text-slate-200">{item.message}</p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Procurement", href: "/purchase-orders", Icon: ClipboardList },
                { label: "Inventory", href: "/inventory", Icon: Boxes },
                { label: "Manufacturing", href: "/manufacturing", Icon: Factory },
                { label: "Recovery", href: "/recovery-opportunities", Icon: Banknote },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:border-violet-200"
                >
                  <div className="flex items-center gap-3">
                    <item.Icon className="text-violet-600" size={22} />
                    <span className="font-black text-slate-900">{item.label}</span>
                  </div>
                  <ArrowRight size={16} className="text-slate-400" />
                </Link>
              ))}
            </section>

            {supplierIntelligence ? (
              <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Supplier Intelligence</div>
                    <h3 className="mt-1 text-2xl font-black text-slate-900">Top suppliers by inflation, risk & savings</h3>
                  </div>
                  <Link href="/supplier-intelligence" className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-black text-white">
                    Open centre →
                  </Link>
                </div>
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-red-600">Top inflation</div>
                    <ul className="mt-2 space-y-2 text-sm font-bold">
                      {supplierIntelligence.topInflationSuppliers.map((s) => (
                        <li key={s.supplierId}>
                          <Link href={s.href} className="text-violet-700 hover:underline">
                            {s.supplierName} — {s.inflationPct.toFixed(1)}%
                          </Link>
                        </li>
                      ))}
                      {!supplierIntelligence.topInflationSuppliers.length ? (
                        <li className="text-slate-500">No data</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-orange-600">Top risk</div>
                    <ul className="mt-2 space-y-2 text-sm font-bold">
                      {supplierIntelligence.topRiskSuppliers.map((s) => (
                        <li key={s.supplierId}>
                          <Link href={s.href} className="text-violet-700 hover:underline">
                            {s.supplierName} — {s.riskLevel} ({s.riskScore})
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-[#84CC16]">Top savings</div>
                    <ul className="mt-2 space-y-2 text-sm font-bold">
                      {supplierIntelligence.topSavingsOpportunities.map((s) => (
                        <li key={s.supplierId}>
                          <Link href={s.href} className="text-violet-700 hover:underline">
                            {s.supplierName} — {money(s.amount)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {supplierIntelligence.scoreTrend.length > 0 ? (
                  <div className="mt-6">
                    <div className="text-[10px] font-black uppercase text-slate-400">Supplier score trends</div>
                    <ExecutiveSparkChart data={supplierIntelligence.scoreTrend} height={100} colour="#059669" />
                  </div>
                ) : null}
              </section>
            ) : null}

            {data.procurementAi ? (
              <section className="rounded-[2rem] bg-gradient-to-r from-indigo-700 to-violet-800 p-6 text-white">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-200">AI Procurement Manager</div>
                    <h3 className="mt-2 text-2xl font-black">See It. Understand It. Fix It.</h3>
                  </div>
                  <Link href="/ai-procurement-manager" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-indigo-900">
                    Open AI procurement →
                  </Link>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-white/10 p-4">
                    <div className="text-[10px] font-black uppercase text-indigo-200">Health score</div>
                    <div className="mt-2 text-3xl font-black">{data.procurementAi.healthScore}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <div className="text-[10px] font-black uppercase text-indigo-200">Potential savings</div>
                    <div className="mt-2 text-2xl font-black">{money(data.procurementAi.potentialSavings)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <div className="text-[10px] font-black uppercase text-indigo-200">Realized savings</div>
                    <div className="mt-2 text-2xl font-black">{money(data.procurementAi.realizedSavings)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    <div className="text-[10px] font-black uppercase text-indigo-200">High risk items</div>
                    <div className="mt-2 text-3xl font-black">{data.procurementAi.highRiskItems}</div>
                  </div>
                </div>
                {data.procurementAi.topRecommendations.length > 0 ? (
                  <ul className="mt-6 space-y-2">
                    {data.procurementAi.topRecommendations.map((rec) => (
                      <li key={rec.recommendation_key}>
                        <Link
                          href={`/ai-procurement-manager/${encodeURIComponent(rec.recommendation_key)}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/20"
                        >
                          <span>
                            <span className="text-indigo-200">{rec.category}</span> — {rec.title}
                          </span>
                          <span>{money(rec.potential_benefit_annual)}/yr · {rec.confidence_score}%</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Monthly leakage watch", value: "—", Icon: ShieldAlert, href: "/financial-leakage" },
                { label: "AI procurement", value: String(ai.openRecommendations), Icon: Sparkles, href: "/ai-procurement-manager" },
                { label: "Finished goods", value: money(inventory.inventoryValue), Icon: Package, href: "/manufacturing/finished-goods" },
                { label: "Recovery pipeline", value: String(recovery.openOpportunities), Icon: TrendingUp, href: "/recovery-pipeline" },
              ].map((card) => (
                <Link key={card.label} href={card.href} className="rounded-[2rem] bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)] transition hover:shadow-md">
                  <card.Icon className="text-violet-600" size={26} />
                  <div className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{card.label}</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{card.value}</div>
                </Link>
              ))}
            </section>
          </section>
    </VyronPremiumPageShell>
  );
}
