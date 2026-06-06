"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  AutonomousBusinessIntelligencePayload,
  CopilotAnswer,
  Explainable,
} from "@/lib/vyron-autonomous-business-intelligence";

export function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export function ExplainBlock({ e }: { e: Explainable }) {
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
      <div>Formula: {e.formula}</div>
      <div className="mt-1">Confidence: {e.confidence}%</div>
    </div>
  );
}

export function AutonomousNav() {
  const links = [
    ["/vyron-command-centre", "Command Centre"],
    ["/vyron-command-centre/business-health", "Business Health"],
    ["/vyron-command-centre/early-warning", "Early Warning"],
    ["/vyron-command-centre/root-cause", "Root Cause"],
    ["/vyron-command-centre/decisions", "Decisions"],
    ["/vyron-command-centre/actions", "Actions"],
    ["/vyron-command-centre/performance", "Org Performance"],
    ["/vyron-command-centre/knowledge", "Knowledge"],
    ["/vyron-command-centre/predictive-risk", "Predictive Risk"],
    ["/vyron-command-centre/copilot", "Ask VYRON"],
    ["/vyron-command-centre/scorecards", "Scorecards"],
    ["/vyron-command-centre/strategic", "Strategic"],
  ] as const;
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {links.map(([href, label]) => (
        <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black hover:bg-violet-50">
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function CommandCentreClient({ data }: { data: AutonomousBusinessIntelligencePayload }) {
  const statusColor = { healthy: "border-emerald-200 bg-emerald-50", watch: "border-amber-200 bg-amber-50", critical: "border-red-200 bg-red-50" };
  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-slate-950 p-8 text-white">
        <div className="text-xs font-black uppercase text-violet-300">Business Health</div>
        <div className="mt-2 text-6xl font-black">{data.businessHealth.overallScore}</div>
        <p className="mt-2 text-sm text-slate-400">Autonomous decision-support · all domains on one screen</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.commandCentre.map((d) => (
          <Link
            key={d.key}
            href={d.href}
            className={`rounded-[2rem] border-2 p-6 shadow-sm transition hover:shadow-md ${statusColor[d.status]}`}
          >
            <div className="flex justify-between">
              <h3 className="font-black text-slate-900">{d.label}</h3>
              <span className="text-xs font-black uppercase">{d.status}</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {d.metrics.map((m) => (
                <div key={m.label} className="flex justify-between gap-2">
                  <dt className="font-bold text-slate-600">{m.label}</dt>
                  <dd className="font-black text-slate-900">{m.value}</dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BusinessHealthClient({ health }: { health: AutonomousBusinessIntelligencePayload["businessHealth"] }) {
  const items = [
    ["Financial", health.financialHealth],
    ["Inventory", health.inventoryHealth],
    ["Procurement", health.procurementHealth],
    ["Supplier", health.supplierHealth],
    ["Production", health.productionHealth],
    ["Recovery", health.recoveryHealth],
    ["Compliance", health.complianceHealth],
  ];
  return (
    <section className="grid gap-6">
      <div className="rounded-[2rem] bg-violet-600 p-8 text-white text-center">
        <div className="text-xs font-black uppercase opacity-80">Overall Business Health</div>
        <div className="text-7xl font-black">{health.overallScore}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{l}</div>
            <div className="mt-2 text-3xl font-black">{v}</div>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EarlyWarningClient({ warnings }: { warnings: AutonomousBusinessIntelligencePayload["earlyWarnings"] }) {
  const horizons = [30, 90, 365] as const;
  return (
    <div className="space-y-8">
      {horizons.map((h) => (
        <section key={h}>
          <h2 className="text-xl font-black">{h === 30 ? "30 Days" : h === 90 ? "90 Days" : "12 Months"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {warnings
              .filter((w) => w.horizonDays === h)
              .map((w) => (
                <article key={w.id} className="rounded-2xl bg-white p-5 shadow-sm">
                  <span className="text-xs font-black uppercase text-red-600">{w.category} · {w.severity}</span>
                  <h3 className="mt-1 font-black">{w.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{w.message}</p>
                  <p className="mt-2 font-black text-red-700">{money(w.projectedImpact)} impact</p>
                  <ExplainBlock e={w} />
                  {w.href ? (
                    <Link href={w.href} className="mt-2 inline-block text-xs font-black text-violet-700">
                      View →
                    </Link>
                  ) : null}
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RootCauseClient({ causes }: { causes: AutonomousBusinessIntelligencePayload["rootCauses"] }) {
  return (
    <div className="space-y-4">
      {causes.map((c) => (
        <article key={c.id} className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="font-black text-violet-700">{c.kpiLabel}</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="font-black text-slate-500">What changed</dt>
              <dd className="mt-1">{c.whatChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-slate-500">Why</dt>
              <dd className="mt-1">{c.whyChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-slate-500">Where</dt>
              <dd className="mt-1">{c.whereChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-slate-500">Financial impact</dt>
              <dd className="mt-1 font-black text-red-700">{money(c.financialImpact)}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">Action: {c.recommendedAction}</p>
          <ExplainBlock e={c} />
        </article>
      ))}
    </div>
  );
}

export function DecisionsClient({ decisions }: { decisions: AutonomousBusinessIntelligencePayload["decisions"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {decisions.map((d) => (
        <article key={d.id} className="rounded-2xl bg-white p-5 shadow-sm">
          <span className="text-xs font-black uppercase text-slate-400">{d.decisionType.replace(/_/g, " ")}</span>
          <h3 className="mt-1 font-black">{d.title}</h3>
          <p className="mt-2 text-sm text-slate-600">{d.rationale}</p>
          <p className="mt-2 font-black text-emerald-700">{money(d.expectedBenefitAnnual)}/yr</p>
          <ExplainBlock e={d} />
          {d.href ? (
            <Link href={d.href} className="mt-2 inline-block text-xs font-black text-violet-700">
              Execute →
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ActionsClient({ actions }: { actions: AutonomousBusinessIntelligencePayload["actions"] }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-black uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Recommendation</th>
            <th className="px-4 py-3">Owner</th>
            <th className="px-4 py-3">Due</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Expected</th>
            <th className="px-4 py-3">Actual</th>
            <th className="px-4 py-3">Done %</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-4 py-3 font-bold">{a.recommendation}</td>
              <td className="px-4 py-3">{a.owner}</td>
              <td className="px-4 py-3">{a.dueDate}</td>
              <td className="px-4 py-3 capitalize">{a.status}</td>
              <td className="px-4 py-3">{money(a.expectedBenefit)}</td>
              <td className="px-4 py-3">{money(a.actualBenefit)}</td>
              <td className="px-4 py-3 font-black">{a.completionPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrgPerformanceClient({ rows }: { rows: AutonomousBusinessIntelligencePayload["orgPerformance"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <Link key={r.roleArea} href={r.href} className="rounded-2xl bg-white p-6 shadow-sm hover:ring-2 hover:ring-violet-300">
          <h3 className="font-black">{r.roleArea}</h3>
          <div className="mt-2 text-4xl font-black text-violet-700">{r.score}</div>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {r.highlights.map((h) => (
              <li key={h}>• {h}</li>
            ))}
          </ul>
        </Link>
      ))}
    </div>
  );
}

export function KnowledgeClient({ entries }: { entries: AutonomousBusinessIntelligencePayload["knowledge"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {entries.map((k) => (
        <article key={k.id} className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="font-black text-violet-800">{k.domain}</h3>
          <p className="mt-2 text-sm leading-7">{k.summary}</p>
          <ul className="mt-3 space-y-1 text-xs font-bold text-slate-600">
            {k.signals.map((s) => (
              <li key={s}>→ {s}</li>
            ))}
          </ul>
          <ExplainBlock e={k} />
        </article>
      ))}
    </div>
  );
}

export function PredictiveRiskClient({ risks }: { risks: AutonomousBusinessIntelligencePayload["predictiveRisks"] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {risks.map((r) => (
        <article key={r.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="font-black">{r.title}</h3>
          <p className="mt-2 text-3xl font-black text-red-700">{r.probabilityPct}%</p>
          <p className="text-sm text-slate-500">{r.horizonDays}d horizon · {money(r.projectedImpact)}</p>
          <ExplainBlock e={r} />
          {r.href ? (
            <Link href={r.href} className="mt-2 inline-block text-xs font-black text-violet-700">
              Mitigate →
            </Link>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ScorecardsClient({ cards }: { cards: AutonomousBusinessIntelligencePayload["scorecards"] }) {
  const types = [...new Set(cards.map((c) => c.type))];
  return (
    <div className="space-y-8">
      {types.map((t) => (
        <section key={t}>
          <h2 className="text-xl font-black">{t}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cards
              .filter((c) => c.type === t)
              .map((c) => (
                <Link key={c.entityLabel} href={c.href || "#"} className="rounded-2xl bg-white p-5 shadow-sm hover:bg-violet-50">
                  <div className="font-black">{c.entityLabel}</div>
                  <div className="mt-2 text-3xl font-black">{c.overallScore}</div>
                  {c.metrics.map((m) => (
                    <div key={m.label} className="mt-1 flex justify-between text-xs font-bold text-slate-600">
                      <span>{m.label}</span>
                      <span>{m.value}</span>
                    </div>
                  ))}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function StrategicClient({ s }: { s: AutonomousBusinessIntelligencePayload["strategic"] }) {
  return (
    <section className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Projected savings", s.projectedSavings],
          ["Projected leakage", s.projectedLeakage],
          ["Projected recovery", s.projectedRecovery],
          ["Profit impact", s.projectedProfitImpact],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-xs font-black uppercase text-slate-400">{l}</div>
            <div className="mt-2 text-2xl font-black">{money(Number(v))}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-black">Top risks</h2>
          <ol className="mt-4 space-y-2">
            {s.topRisks.map((r, i) => (
              <li key={r.title} className="rounded-xl bg-red-50 p-4">
                <span className="font-black text-red-800">{i + 1}. {r.title}</span>
                <p className="text-sm text-red-900">{r.detail}</p>
                <p className="font-black text-red-700">{money(r.value)}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className="text-xl font-black">Top opportunities</h2>
          <ol className="mt-4 space-y-2">
            {s.topOpportunities.map((o, i) => (
              <li key={o.title} className="rounded-xl bg-emerald-50 p-4">
                <span className="font-black text-emerald-900">{i + 1}. {o.title}</span>
                <p className="text-sm text-emerald-800">{o.detail}</p>
                <p className="font-black text-emerald-700">{money(o.value)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function CopilotClient({ presets }: { presets: CopilotAnswer[] }) {
  const [answer, setAnswer] = useState<CopilotAnswer | null>(presets[0] || null);
  const [busy, setBusy] = useState(false);

  async function ask(q: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/vyron-command-centre/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (data.ok) setAnswer(data.answer);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p.question}
            type="button"
            disabled={busy}
            onClick={() => ask(p.question)}
            className="block w-full rounded-xl bg-white p-4 text-left text-sm font-bold shadow-sm hover:bg-violet-50 disabled:opacity-50"
          >
            {p.question}
          </button>
        ))}
      </div>
      <div className="rounded-[2rem] bg-gradient-to-br from-violet-700 to-indigo-950 p-8 text-white">
        <h2 className="text-2xl font-black">Ask VYRON</h2>
        {answer ? (
          <>
            <p className="mt-4 text-sm leading-8 text-violet-100">{answer.answer}</p>
            <div className="mt-6 rounded-xl bg-white/10 p-4 text-xs">
              <div>Formula: {answer.formula}</div>
              <div className="mt-1">Confidence: {answer.confidence}%</div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
