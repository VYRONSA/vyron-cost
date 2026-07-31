"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  AutonomousBusinessIntelligencePayload,
  CopilotAnswer,
  Explainable,
} from "@/lib/vyron-autonomous-business-intelligence";
import { AutonomousPremiumShell } from "@/components/autonomous/AutonomousPremiumShell";
import { VYRON_BTN, VYRON_STATUS, VYRON_SURFACE, VYRON_TABLE } from "@/components/vyron-ui";

const BI_CARD = `${VYRON_SURFACE.dark} p-5 shadow-[0_2px_16px_rgba(0,0,0,0.14)]`;
const BI_CARD_LG = `${VYRON_SURFACE.dark} p-6 shadow-[0_2px_16px_rgba(0,0,0,0.14)]`;
const BI_NAV = `${VYRON_BTN.secondary} px-3 py-2 text-xs font-black`;
const BI_HERO = `${VYRON_SURFACE.darkShell} bg-gradient-to-br from-[#1e1635] via-[#252040] to-[#1a1033] p-8`;
const BI_SECTION = "text-xl font-black text-[#F8FAFC]";

export function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

export function ExplainBlock({ e }: { e: Explainable }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#1e1635] p-3 text-xs font-bold text-[#94A3B8]">
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
        <Link key={href} href={href} className={BI_NAV}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function CommandCentreClient({ data }: { data: AutonomousBusinessIntelligencePayload }) {
  const statusColor = {
    healthy: `border-2 ${VYRON_STATUS.lime}`,
    watch: `border-2 ${VYRON_STATUS.warning}`,
    critical: "border-2 border-red-400/30 bg-red-500/10",
  };
  return (
    <AutonomousPremiumShell
      title="VYRON Autonomous Command Centre"
      subtitle="Autonomous decision-support across finance, inventory, procurement, production and recovery — all domains on one executive screen."
      outcomes={[
        "See overall business health score instantly",
        "Drill into each intelligence domain",
        "Act on watch and critical signals",
        "Navigate to root cause and decisions",
      ]}
    >
      <div className={BI_HERO}>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#A855F7]">Business Health</div>
        <div className="mt-2 text-6xl font-black text-[#F8FAFC]">{data.businessHealth.overallScore}</div>
        <p className="mt-2 text-sm font-semibold text-[#CBD5E1]">Live autonomous score across all VYRON COST domains</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.commandCentre.map((d) => (
          <Link
            key={d.key}
            href={d.href}
            className={`rounded-[2rem] p-6 shadow-sm transition hover:border-violet-400/30 ${statusColor[d.status]}`}
          >
            <div className="flex justify-between">
              <h3 className="font-black text-[#F8FAFC]">{d.label}</h3>
              <span className={`text-xs font-black uppercase ${d.status === "healthy" ? "text-[#A855F7]" : d.status === "watch" ? "text-[var(--vyron-warning-fg)]" : "text-red-300"}`}>{d.status}</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {d.metrics.map((m) => (
                <div key={m.label} className="flex justify-between gap-2">
                  <dt className="font-bold text-[#94A3B8]">{m.label}</dt>
                  <dd className="font-black text-[#F8FAFC]">{m.value}</dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>
    </AutonomousPremiumShell>
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
    <AutonomousPremiumShell
      title="Business Health Intelligence"
      subtitle="Financial, inventory, procurement, supplier, production, recovery and compliance health — scored and ranked for action."
      outcomes={[
        "Monitor overall business health score",
        "Compare domain health side by side",
        "Spot weak domains before they compound",
        "Drill into early warnings and root causes",
      ]}
    >
      <div className={`${BI_HERO} text-center`}>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-[#94A3B8]">Overall Business Health</div>
        <div className="text-7xl font-black text-[#F8FAFC]">{health.overallScore}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([l, v]) => (
          <div key={String(l)} className={BI_CARD}>
            <div className="text-xs font-black uppercase tracking-[0.12em] text-violet-300">{l}</div>
            <div className="mt-2 text-3xl font-black text-[#F8FAFC]">{v}</div>
            <div className="mt-2 h-2 rounded-full bg-[#1e1635]">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${v}%` }} />
            </div>
          </div>
        ))}
      </div>
    </AutonomousPremiumShell>
  );
}

export function EarlyWarningClient({ warnings }: { warnings: AutonomousBusinessIntelligencePayload["earlyWarnings"] }) {
  const horizons = [30, 90, 365] as const;
  return (
    <AutonomousPremiumShell
      title="Early Warning Intelligence"
      subtitle="30, 90 and 365-day predictive warnings across margin, stock, procurement and supplier risk."
      outcomes={[
        "See projected impact by time horizon",
        "Prioritise critical warnings first",
        "Follow explainable confidence scores",
        "Jump to source pages to act",
      ]}
    >
    <div className="grid gap-8">
      {horizons.map((h) => (
        <section key={h}>
          <h2 className={BI_SECTION}>{h === 30 ? "30 Days" : h === 90 ? "90 Days" : "12 Months"}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {warnings
              .filter((w) => w.horizonDays === h)
              .map((w) => (
                <article key={w.id} className={BI_CARD}>
                  <span className="text-xs font-black uppercase text-red-300">{w.category} · {w.severity}</span>
                  <h3 className="mt-1 font-black text-[#F8FAFC]">{w.title}</h3>
                  <p className="mt-2 text-sm text-[#CBD5E1]">{w.message}</p>
                  <p className="mt-2 font-black text-red-300">{money(w.projectedImpact)} impact</p>
                  <ExplainBlock e={w} />
                  {w.href ? (
                    <Link href={w.href} className="mt-2 inline-block text-xs font-black text-violet-300">
                      View →
                    </Link>
                  ) : null}
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function RootCauseClient({ causes }: { causes: AutonomousBusinessIntelligencePayload["rootCauses"] }) {
  return (
    <AutonomousPremiumShell
      title="Root Cause Intelligence"
      subtitle="What changed, why it changed, where it happened and the financial impact — with recommended actions."
      outcomes={["Understand KPI movement drivers", "See financial impact per root cause", "Get recommended corrective actions", "Review explainable confidence"]}
    >
    <div className="grid gap-4">
      {causes.map((c) => (
        <article key={c.id} className={BI_CARD_LG}>
          <h3 className="font-black text-violet-300">{c.kpiLabel}</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="font-black text-[#94A3B8]">What changed</dt>
              <dd className="mt-1 text-[#CBD5E1]">{c.whatChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-[#94A3B8]">Why</dt>
              <dd className="mt-1 text-[#CBD5E1]">{c.whyChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-[#94A3B8]">Where</dt>
              <dd className="mt-1 text-[#CBD5E1]">{c.whereChanged}</dd>
            </div>
            <div>
              <dt className="font-black text-[#94A3B8]">Financial impact</dt>
              <dd className="mt-1 font-black text-red-300">{money(c.financialImpact)}</dd>
            </div>
          </dl>
          <p className={`mt-4 rounded-xl p-3 text-sm font-bold ${VYRON_STATUS.lime}`}>Action: {c.recommendedAction}</p>
          <ExplainBlock e={c} />
        </article>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function DecisionsClient({ decisions }: { decisions: AutonomousBusinessIntelligencePayload["decisions"] }) {
  return (
    <AutonomousPremiumShell
      title="Decision Intelligence"
      subtitle="Ranked autonomous decisions with rationale, expected annual benefit and execution links."
      outcomes={["Review AI-recommended decisions", "See expected annual benefit", "Understand decision rationale", "Execute linked workflows"]}
    >
    <div className="grid gap-4 md:grid-cols-2">
      {decisions.map((d) => (
        <article key={d.id} className={BI_CARD}>
          <span className="text-xs font-black uppercase text-[#94A3B8]">{d.decisionType.replace(/_/g, " ")}</span>
          <h3 className="mt-1 font-black text-[#F8FAFC]">{d.title}</h3>
          <p className="mt-2 text-sm text-[#CBD5E1]">{d.rationale}</p>
          <p className="mt-2 font-black text-[#A855F7]">{money(d.expectedBenefitAnnual)}/yr</p>
          <ExplainBlock e={d} />
          {d.href ? (
            <Link href={d.href} className="mt-2 inline-block text-xs font-black text-violet-300">
              Execute →
            </Link>
          ) : null}
        </article>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function ActionsClient({ actions }: { actions: AutonomousBusinessIntelligencePayload["actions"] }) {
  return (
    <AutonomousPremiumShell
      title="Action Tracking Centre"
      subtitle="Recommendation ownership, due dates, expected vs actual benefit and completion progress."
      outcomes={["Track recommendation owners", "Monitor due dates and status", "Compare expected vs actual benefit", "Measure completion percentage"]}
    >
    <div className={`overflow-hidden ${VYRON_SURFACE.dark}`}>
      <table className="w-full text-sm text-[#CBD5E1]">
        <thead className={VYRON_TABLE.head}>
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
            <tr key={a.id} className={`border-t border-white/10 ${VYRON_TABLE.rowHover}`}>
              <td className="px-4 py-3 font-bold text-[#F8FAFC]">{a.recommendation}</td>
              <td className="px-4 py-3">{a.owner}</td>
              <td className="px-4 py-3">{a.dueDate}</td>
              <td className="px-4 py-3 capitalize">{a.status}</td>
              <td className="px-4 py-3">{money(a.expectedBenefit)}</td>
              <td className="px-4 py-3">{money(a.actualBenefit)}</td>
              <td className="px-4 py-3 font-black text-[#F8FAFC]">{a.completionPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </AutonomousPremiumShell>
  );
}

export function OrgPerformanceClient({ rows }: { rows: AutonomousBusinessIntelligencePayload["orgPerformance"] }) {
  return (
    <AutonomousPremiumShell
      title="Organisation Performance Intelligence"
      subtitle="Role-area performance scores with highlights and drill-down links."
      outcomes={["Score each functional area", "See role-specific highlights", "Drill into domain pages", "Compare performance across teams"]}
    >
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <Link key={r.roleArea} href={r.href} className={`${BI_CARD_LG} transition hover:border-violet-400/30`}>
          <h3 className="font-black text-[#F8FAFC]">{r.roleArea}</h3>
          <div className="mt-2 text-4xl font-black text-violet-300">{r.score}</div>
          <ul className="mt-3 space-y-1 text-sm text-[#CBD5E1]">
            {r.highlights.map((h) => (
              <li key={h}>• {h}</li>
            ))}
          </ul>
        </Link>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function KnowledgeClient({ entries }: { entries: AutonomousBusinessIntelligencePayload["knowledge"] }) {
  return (
    <AutonomousPremiumShell
      title="Knowledge Intelligence Graph"
      subtitle="Domain summaries, live signals and explainable business knowledge across VYRON COST."
      outcomes={["Browse domain knowledge summaries", "Review live business signals", "Understand cross-domain links", "Use explainable confidence"]}
    >
    <div className="grid gap-4 md:grid-cols-2">
      {entries.map((k) => (
        <article key={k.id} className={BI_CARD}>
          <h3 className="font-black text-violet-300">{k.domain}</h3>
          <p className="mt-2 text-sm leading-7 text-[#CBD5E1]">{k.summary}</p>
          <ul className="mt-3 space-y-1 text-xs font-bold text-[#94A3B8]">
            {k.signals.map((s) => (
              <li key={s}>→ {s}</li>
            ))}
          </ul>
          <ExplainBlock e={k} />
        </article>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function PredictiveRiskClient({ risks }: { risks: AutonomousBusinessIntelligencePayload["predictiveRisks"] }) {
  return (
    <AutonomousPremiumShell
      title="Predictive Risk Intelligence"
      subtitle="Probability-weighted risks with horizon, projected impact and mitigation links."
      outcomes={["See risk probability percentages", "Review projected financial impact", "Understand time horizons", "Open mitigation workflows"]}
    >
    <div className="grid gap-4 md:grid-cols-2">
      {risks.map((r) => (
        <article key={r.id} className={BI_CARD}>
          <h3 className="font-black text-[#F8FAFC]">{r.title}</h3>
          <p className="mt-2 text-3xl font-black text-red-300">{r.probabilityPct}%</p>
          <p className="text-sm text-[#94A3B8]">{r.horizonDays}d horizon · {money(r.projectedImpact)}</p>
          <ExplainBlock e={r} />
          {r.href ? (
            <Link href={r.href} className="mt-2 inline-block text-xs font-black text-violet-300">
              Mitigate →
            </Link>
          ) : null}
        </article>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function ScorecardsClient({ cards }: { cards: AutonomousBusinessIntelligencePayload["scorecards"] }) {
  const types = [...new Set(cards.map((c) => c.type))];
  return (
    <AutonomousPremiumShell
      title="Performance Scorecards"
      subtitle="Entity scorecards by type with overall scores and metric breakdowns."
      outcomes={["Compare entities by scorecard type", "See overall performance scores", "Review metric-level detail", "Open entity drill-downs"]}
    >
    <div className="grid gap-8">
      {types.map((t) => (
        <section key={t}>
          <h2 className={BI_SECTION}>{t}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cards
              .filter((c) => c.type === t)
              .map((c) => (
                <Link key={c.entityLabel} href={c.href || "#"} className={`${BI_CARD} transition hover:border-violet-400/30`}>
                  <div className="font-black text-[#F8FAFC]">{c.entityLabel}</div>
                  <div className="mt-2 text-3xl font-black text-[#F8FAFC]">{c.overallScore}</div>
                  {c.metrics.map((m) => (
                    <div key={m.label} className="mt-1 flex justify-between text-xs font-bold text-[#94A3B8]">
                      <span>{m.label}</span>
                      <span className="text-[#CBD5E1]">{m.value}</span>
                    </div>
                  ))}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
    </AutonomousPremiumShell>
  );
}

export function StrategicClient({ s }: { s: AutonomousBusinessIntelligencePayload["strategic"] }) {
  return (
    <AutonomousPremiumShell
      title="Strategic Intelligence"
      subtitle="Projected savings, leakage, recovery and profit impact with ranked risks and opportunities."
      outcomes={[
        "See projected savings and leakage",
        "Quantify recovery and profit impact",
        "Rank top strategic risks",
        "Prioritise top opportunities",
      ]}
    >
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Projected savings", s.projectedSavings],
          ["Projected leakage", s.projectedLeakage],
          ["Projected recovery", s.projectedRecovery],
          ["Profit impact", s.projectedProfitImpact],
        ].map(([l, v]) => (
          <div key={String(l)} className={BI_CARD}>
            <div className="text-xs font-black uppercase text-[#94A3B8]">{l}</div>
            <div className="mt-2 text-2xl font-black text-[#F8FAFC]">{money(Number(v))}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className={BI_SECTION}>Top risks</h2>
          <ol className="mt-4 space-y-2">
            {s.topRisks.map((r, i) => (
              <li key={r.title} className="rounded-xl border border-red-400/30 bg-red-500/10 p-4">
                <span className="font-black text-red-300">{i + 1}. {r.title}</span>
                <p className="text-sm text-red-200">{r.detail}</p>
                <p className="font-black text-red-300">{money(r.value)}</p>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2 className={BI_SECTION}>Top opportunities</h2>
          <ol className="mt-4 space-y-2">
            {s.topOpportunities.map((o, i) => (
              <li key={o.title} className={`rounded-xl p-4 ${VYRON_STATUS.lime}`}>
                <span className="font-black">{i + 1}. {o.title}</span>
                <p className="text-sm opacity-90">{o.detail}</p>
                <p className="font-black text-[#A855F7]">{money(o.value)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
    </AutonomousPremiumShell>
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
    <AutonomousPremiumShell
      title="Ask VYRON — Autonomous Copilot"
      subtitle="Natural-language business intelligence with explainable formulas and confidence scores."
      outcomes={[
        "Ask questions in plain language",
        "Get explainable answers with formulas",
        "Use preset executive questions",
        "Review confidence on every response",
      ]}
    >
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p.question}
            type="button"
            disabled={busy}
            onClick={() => ask(p.question)}
            className={`block w-full ${BI_CARD} text-left text-sm font-bold text-[#CBD5E1] transition hover:border-violet-400/30 disabled:opacity-50`}
          >
            {p.question}
          </button>
        ))}
      </div>
      <div className={BI_HERO}>
        <h2 className="text-2xl font-black text-[#F8FAFC]">Ask VYRON</h2>
        {answer ? (
          <>
            <p className="mt-4 text-sm leading-8 text-[#CBD5E1]">{answer.answer}</p>
            <div className="mt-6 rounded-xl border border-white/10 bg-[#252040]/80 p-4 text-xs text-[#94A3B8]">
              <div>Formula: {answer.formula}</div>
              <div className="mt-1">Confidence: {answer.confidence}%</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
    </AutonomousPremiumShell>
  );
}
