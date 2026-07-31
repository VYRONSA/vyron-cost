"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Car,
  Clock,
  MapPin,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import type { VyronCoreCommandCentrePayload } from "@/lib/vyron-workforce-digital-twin";
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

export default function VyronCoreCommandCentreClient({ data }: { data: VyronCoreCommandCentrePayload }) {
  const { headline, modules, twins, heatmap, forecasts, attritionForecast, trends, aiExecutiveSummary, healthScores } = data;

  return (
    <VyronPremiumPageShell
      config={{
        badge: "VYRON CORE",
        title: "Workforce Command Centre",
        subtitle: "Unify workforce cost, productivity, risk, and digital twin intelligence for executive action.",
        outcomes: ["Track workforce health and leakage", "Expose cross-module operational risk", "Drive action from unified executive view"],
        formulas: ["Workforce Health = Composite department scores", "Predicted Leakage from cost and risk signals", "Productivity Index from digital twin operations"],
        intelligenceItems: [
          { label: "Twin profiles", detail: `${twins.length} workforce digital twin profiles active` },
          { label: "Forecast coverage", detail: `${forecasts.length} active forecast records` },
          { label: "Department scores", detail: `${healthScores.length} department health entries` },
        ],
      }}
    >
      <section className="grid gap-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Labour Cost", money(headline.labourCost), "Monthly workforce spend"],
          ["Productivity", `${headline.productivity}%`, "Digital twin productivity index"],
          ["Workforce Health", `${headline.workforceHealth}/100`, "Composite health score"],
          ["Risk", `${headline.risk}/100`, "Workforce risk exposure"],
          ["Predicted Leakage", money(headline.predictedLeakage), "Overtime · travel · field gaps"],
        ].map(([label, value, note]) => (
          <div
            key={label}
            className="rounded-[2rem] border border-violet-100 bg-white p-5 shadow-[0_10px_40px_rgba(15,23,42,0.06)]"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600">{label}</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{note}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 p-8 text-white shadow-[0_24px_80px_rgba(30,27,75,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">VYRON CORE</div>
            <h2 className="mt-2 text-4xl font-black">Executive Command Centre</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
              Workforce Digital Twin — clocking, field operations, travel, cost and risk intelligence unified for executive decisions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ["/vyron-core/forecasting", "Forecasting"],
              ["/vyron-core/simulations", "Simulations"],
              ["/risk-centre", "Risk Centre"],
              ["/finance-intelligence", "Cost Intelligence"],
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
          <KpiTile label="Digital twin profiles" value={String(twins.length)} />
          <KpiTile label="Field staff active" value={String(modules.fieldOperations.activeFieldStaff)} />
          <KpiTile label="On-time clocking" value={`${modules.clocking.onTimeRate}%`} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CommandCentreCard title="Clocking Intelligence" subtitle="Attendance · hours · overtime" href="/vyron-core/command-centre" accent="bg-gradient-to-br from-indigo-800 to-violet-900">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="On-time rate" value={`${modules.clocking.onTimeRate}%`} />
            <KpiTile label="Late arrivals" value={String(modules.clocking.lateArrivals)} />
            <KpiTile label="Overtime hrs" value={String(modules.clocking.overtimeHours)} />
            <KpiTile label="Avg hours" value={String(modules.clocking.avgHoursWorked)} />
            <KpiTile label="Absenteeism" value={`${modules.clocking.absenteeismRate}%`} />
            <KpiTile label="Missed clock-outs" value={String(modules.clocking.missedClockOuts)} />
          </div>
        </CommandCentreCard>

        <CommandCentreCard title="Field Operations" subtitle="Visits · jobs · coverage" href="/vyron-core/command-centre" accent="bg-gradient-to-br from-[#24183F] to-[#1a1033]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Active staff" value={String(modules.fieldOperations.activeFieldStaff)} />
            <KpiTile label="Visits done" value={String(modules.fieldOperations.visitsCompleted)} />
            <KpiTile label="Scheduled" value={String(modules.fieldOperations.visitsScheduled)} />
            <KpiTile label="Completion" value={`${modules.fieldOperations.completionRate}%`} />
            <KpiTile label="Avg visit" value={`${modules.fieldOperations.avgVisitDurationMins}m`} />
            <KpiTile label="Open jobs" value={String(modules.fieldOperations.openJobs)} />
          </div>
        </CommandCentreCard>

        <CommandCentreCard title="Travel Intelligence" subtitle="Km · claims · routes" href="/vyron-core/forecasting" accent="bg-gradient-to-br from-violet-900 to-fuchsia-950">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Km / month" value={String(modules.travelIntelligence.totalKmMonth)} />
            <KpiTile label="Claims" value={money(modules.travelIntelligence.claimValueMonth)} />
            <KpiTile label="Km / visit" value={String(modules.travelIntelligence.avgKmPerVisit)} />
            <KpiTile label="Breaches" value={String(modules.travelIntelligence.policyBreaches)} />
            <KpiTile label="Route score" value={`${modules.travelIntelligence.routeEfficiencyScore}%`} />
            <KpiTile label="Idle travel" value={`${modules.travelIntelligence.idleTravelPct}%`} />
          </div>
        </CommandCentreCard>

        <CommandCentreCard title="Cost & Risk Intelligence" subtitle="Labour · leakage · compliance" href="/financial-leakage" accent="bg-gradient-to-br from-fuchsia-800 to-red-950">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Labour cost" value={money(modules.costIntelligence.labourCostMonth)} />
            <KpiTile label="Overtime" value={money(modules.costIntelligence.overtimeCost)} />
            <KpiTile label="Agency" value={money(modules.costIntelligence.agencyCost)} />
            <KpiTile label="Variance" value={`${modules.costIntelligence.costVariancePct}%`} />
            <KpiTile label="Compliance" value={String(modules.riskIntelligence.complianceFlags)} />
            <KpiTile label="Leakage" value={money(modules.riskIntelligence.predictedLeakage)} />
          </div>
          <div className="mt-4 rounded-2xl bg-white/10 p-4">
            <div className="text-[10px] font-black uppercase opacity-75">Predicted leakage trend</div>
            <ExecutiveSparkChart data={trends.leakageTrend} colour="#fcd34d" formatValue={(n) => money(n)} />
          </div>
        </CommandCentreCard>
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-xl font-black text-slate-950">Labour cost & productivity trends</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">6-month workforce cost and productivity index</p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-black uppercase text-slate-400">Labour cost</div>
              <ExecutiveSparkChart data={trends.labourCostTrend} colour="#6366f1" height={100} formatValue={(n) => money(n)} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase text-slate-400">Productivity index</div>
              <ExecutiveSparkChart data={trends.productivityTrend} colour="#8b5cf6" height={100} variant="line" formatValue={(n) => `${n.toFixed(1)}%`} />
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">Attrition forecasting</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">Predicted monthly attrition % from digital twin signals</p>
            </div>
            <Link href="/vyron-core/forecasting" className="text-sm font-black text-violet-700">
              Full forecasts →
            </Link>
          </div>
          <div className="mt-6 h-40">
            <ExecutiveSparkChart data={attritionForecast} colour="#3b82f6" height={140} variant="line" formatValue={(n) => `${n.toFixed(1)}%`} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <h3 className="text-xl font-black text-[#F8FAFC]">Workforce risk heatmap</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">Clocking · field ops · travel · cost · risk by area</p>
          <div className="mt-6">
            <ExecutiveHeatmap cells={heatmap} />
          </div>
        </div>

        <div className="rounded-[2rem] bg-gradient-to-b from-slate-900 to-violet-950 p-6 text-white">
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-violet-300" size={24} />
            <h3 className="text-xl font-black">AI Executive Summary</h3>
          </div>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">{aiExecutiveSummary.summary}</p>
          <ul className="mt-4 space-y-2">
            {aiExecutiveSummary.bullets.map((bullet) => (
              <li key={bullet} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-violet-100">
                {bullet}
              </li>
            ))}
          </ul>
          <div className="mt-5 max-h-[280px] space-y-3 overflow-y-auto">
            {aiExecutiveSummary.insights.map((item) => (
              <div key={item.id} className="rounded-xl bg-white/10 p-3">
                <span
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                    item.severity === "high" ? "bg-red-500/30 text-red-200" : item.severity === "medium" ? "bg-fuchsia-500/30 text-fuchsia-100" : "bg-slate-500/30"
                  }`}
                >
                  {item.category}
                </span>
                {item.href ? (
                  <Link href={item.href} className="mt-2 block text-sm font-bold text-violet-100 hover:text-white">
                    {item.message}
                  </Link>
                ) : (
                  <p className="mt-2 text-sm font-bold text-slate-200">{item.message}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">Workforce Digital Twin</h3>
            <p className="text-sm font-semibold text-slate-500">{twins.length} employee profiles — clocking, field, travel, cost and attrition signals</p>
          </div>
          <Link href="/vyron-core/simulations" className="rounded-2xl vyron-grad-surface px-5 py-3 text-sm font-semibold text-white">
            Run simulation →
          </Link>
        </div>
        <div className="mt-5 overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-3 border-b border-slate-100 px-2 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            <div>Employee</div>
            <div>Department</div>
            <div>Clock %</div>
            <div>Productivity</div>
            <div>Health</div>
            <div>Risk</div>
            <div>Attrition</div>
            <div>Cost/hr</div>
          </div>
          {twins.map((t) => (
            <div
              key={t.id}
              className="grid min-w-[900px] grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr_0.7fr] items-center gap-3 border-b border-slate-50 px-2 py-3 text-sm"
            >
              <div>
                <div className="font-black text-slate-900">{t.employeeName}</div>
                <div className="text-xs font-semibold text-slate-500">{t.role}</div>
              </div>
              <div className="font-semibold text-slate-600">{t.department}</div>
              <div className="font-black text-violet-700">{t.clockInRate}%</div>
              <div className="font-black text-[#7E22CE]">{t.productivityIndex}%</div>
              <div className="font-black">{t.healthScore}</div>
              <div className={`font-black ${t.riskScore >= 40 ? "text-red-600" : "text-slate-700"}`}>{t.riskScore}</div>
              <div className={`font-black ${t.attritionProbability >= 0.2 ? "text-fuchsia-600" : "text-slate-700"}`}>
                {(t.attritionProbability * 100).toFixed(0)}%
              </div>
              <div className="font-black text-slate-700">{money(t.costPerHour)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-slate-950">Department health scores</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {healthScores.map((h) => (
            <div key={h.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="font-black text-slate-900">{h.department}</div>
                <div className="text-2xl font-black text-violet-700">{Math.round(h.score)}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-bold text-slate-500">
                <span>Clock {Math.round(h.clockingScore)}</span>
                <span>Field {Math.round(h.fieldOpsScore)}</span>
                <span>Travel {Math.round(h.travelScore)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
        <h3 className="text-xl font-black text-slate-950">Active forecasts</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {forecasts.slice(0, 9).map((f) => (
            <div key={f.id} className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="text-[10px] font-black uppercase text-violet-600">{f.forecastType.replace(/_/g, " ")}</div>
              <div className="mt-1 text-lg font-black text-slate-900">
                {f.forecastType === "labour_cost" || f.forecastType === "leakage" ? money(f.forecastValue) : f.forecastValue.toFixed(1)}
                {f.forecastType === "productivity" || f.forecastType === "workforce_health" ? "%" : f.forecastType === "attrition" ? "%" : ""}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                {f.periodLabel} · {f.confidence}% confidence
              </div>
            </div>
          ))}
        </div>
      </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Clocking", href: "/vyron-core/command-centre", Icon: Clock },
          { label: "Field Ops", href: "/vyron-core/command-centre", Icon: MapPin },
          { label: "Travel", href: "/vyron-core/forecasting", Icon: Car },
          { label: "Cost", href: "/finance-intelligence", Icon: Wallet },
          { label: "Risk", href: "/risk-centre", Icon: ShieldAlert },
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
      </section>
    </VyronPremiumPageShell>
  );
}
