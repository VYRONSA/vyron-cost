"use client";

import Link from "next/link";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import type {
  AiFinancialIntelligencePayload,
  AiRecommendation,
  IndustryBenchmark,
  StrategicScenario,
} from "@/lib/vyron-ai-financial-intelligence";

function money(n: number) {
  return `R${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0 })}`;
}

function RecCard({ rec }: { rec: AiRecommendation }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 text-xs">
      <div className="font-black text-slate-900">{rec.title}</div>
      <p className="mt-2 text-slate-600">{rec.action}</p>
      <div className="mt-2 font-bold text-slate-500">Formula: {rec.formula}</div>
      <div className="font-bold text-slate-500">Confidence: {rec.confidence}%</div>
      {rec.href ? (
        <Link href={rec.href} className="mt-2 inline-block font-black text-violet-700">
          Act →
        </Link>
      ) : null}
    </div>
  );
}

export function AiBudgetActualClient({ rows }: { rows: AiFinancialIntelligencePayload["budgetActual"] }) {
  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Financial Intelligence",
        title: "Budget vs Actual Intelligence",
        subtitle: "Compare category variance and root cause with guided recommendations.",
        outcomes: ["Spot overspend categories quickly", "Link root cause to recommended action", "Keep budget variance explainable"],
        formulas: ["Variance = Actual - Budget", "Variance % = Variance / Budget", "Confidence reflects recommendation reliability"],
        intelligenceItems: [
          { label: "Rows analysed", detail: `${rows.length} budget categories in view` },
          { label: "Root-cause mode", detail: "Each variance line includes recommended response" },
        ],
      }}
    >
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Budget</th>
            <th className="px-4 py-3">Actual</th>
            <th className="px-4 py-3">Variance</th>
            <th className="px-4 py-3">%</th>
            <th className="px-4 py-3">Trend</th>
            <th className="px-4 py-3">Root cause</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} className="border-t border-slate-100 align-top">
              <td className="px-4 py-4 font-bold">{r.category}</td>
              <td className="px-4 py-4">{money(r.budget)}</td>
              <td className="px-4 py-4">{money(r.actual)}</td>
              <td className={`px-4 py-4 font-black ${r.variance > 0 ? "text-red-600" : "text-[#84CC16]"}`}>
                {money(r.variance)}
              </td>
              <td className="px-4 py-4">{r.variancePct.toFixed(1)}%</td>
              <td className="px-4 py-4 capitalize">{r.trend}</td>
              <td className="px-4 py-4">
                <div className="text-slate-600">{r.rootCause}</div>
                <div className="mt-2">
                  <RecCard rec={r.recommendation} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </VyronPremiumPageShell>
  );
}

export function AiForecastClient({ forecast }: { forecast: AiFinancialIntelligencePayload["forecast"] }) {
  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Financial Intelligence",
        title: "Forecast Intelligence Hub",
        subtitle: "Track cash, inflation, and recovery forecast signals across time horizons.",
        outcomes: ["Prepare 30/90/365 day cash decisions", "Quantify inflation pressure early", "Connect recovery to liquidity planning"],
        formulas: ["Cash Requirement by horizon from forecast lines", "Cost Inflation projection from supplier trend", "Recovery Opportunity annualized from pipeline"],
        intelligenceItems: [
          { label: "Forecast lines", detail: `${forecast.lines.length} metrics across 3 horizons` },
          { label: "Inflation signal", detail: `${forecast.supplierInflationPct.toFixed(1)}% supplier inflation driver` },
        ],
      }}
    >
      <section className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-400">Cash requirement 30d</div>
          <div className="mt-2 text-2xl font-black">{money(forecast.cashRequirement30)}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-400">Cash requirement 90d</div>
          <div className="mt-2 text-2xl font-black">{money(forecast.cashRequirement90)}</div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="text-xs font-black uppercase text-slate-400">Cash requirement 12mo</div>
          <div className="mt-2 text-2xl font-black">{money(forecast.cashRequirement365)}</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Metric</th>
              <th className="px-4 py-3">30 days</th>
              <th className="px-4 py-3">90 days</th>
              <th className="px-4 py-3">12 months</th>
            </tr>
          </thead>
          <tbody>
            {forecast.lines.map((l) => (
              <tr key={l.key} className="border-t border-slate-100">
                <td className="px-4 py-3 font-bold">
                  {l.href ? (
                    <Link href={l.href} className="text-violet-700 hover:underline">
                      {l.label}
                    </Link>
                  ) : (
                    l.label
                  )}
                </td>
                <td className="px-4 py-3 text-center font-black">{money(l.horizon30)}</td>
                <td className="px-4 py-3 text-center font-black">{money(l.horizon90)}</td>
                <td className="px-4 py-3 text-center font-black">{money(l.horizon365)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        <div className="rounded-2xl bg-fuchsia-50 p-5">
        <div className="text-xs font-black uppercase text-fuchsia-800">Cost inflation (annual projection)</div>
        <div className="mt-2 text-2xl font-black text-fuchsia-950">{money(forecast.costInflationAnnual)}</div>
        <p className="mt-2 text-xs text-fuchsia-900">
          Supplier inflation driver: {forecast.supplierInflationPct.toFixed(1)}% · Recovery opportunity:{" "}
          {money(forecast.recoveryOpportunityAnnual)}
        </p>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}

export function AiStrategicScenariosClient({ scenarios }: { scenarios: StrategicScenario[] }) {
  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Financial Intelligence",
        title: "Strategic Scenario Simulator",
        subtitle: "Model supplier, packaging, and volume scenarios with projected financial impact.",
        outcomes: ["Evaluate margin movement by scenario", "Estimate annual profit impacts", "Prioritize scenario-backed recovery actions"],
        formulas: ["Projected GP % from scenario deltas", "Annual Profit Impact from simulated inputs", "Recovery Impact from scenario response"],
        intelligenceItems: [
          { label: "Scenario set", detail: `${scenarios.length} strategic what-if models loaded` },
          { label: "Decision focus", detail: "Each scenario includes narrative impact guidance" },
        ],
      }}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {scenarios.map((s) => (
        <article key={s.label} className="rounded-[2rem] bg-white p-6 shadow-sm">
          <h3 className="text-lg font-black">{s.label}</h3>
          <p className="mt-1 text-xs text-slate-500">
            Supplier {s.input.supplierPct}% · Packaging {s.input.packagingPct}% · Volume {s.input.volumePct}%
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-black uppercase text-slate-400">GP impact</div>
              <div className="font-black">
                {s.impact.currentGpPct}% → {s.impact.projectedGpPct}% ({s.impact.gpChangePts} pts)
              </div>
            </div>
            <div>
              <div className="text-xs font-black uppercase text-slate-400">Annual profit impact</div>
              <div className="font-black">{money(s.impact.annualProfitImpact)}</div>
            </div>
            <div>
              <div className="text-xs font-black uppercase text-slate-400">Recovery</div>
              <div className="font-black">{money(s.impact.recoveryImpact)}</div>
            </div>
            <div>
              <div className="text-xs font-black uppercase text-slate-400">Inventory / production</div>
              <div className="text-sm font-bold text-slate-700">Inventory: {money(s.impact.inventoryImpact)}</div>
              <div className="text-sm font-bold text-slate-700">Production: {money(s.impact.productionCostImpact)}</div>
            </div>
          </div>
          <ul className="mt-4 list-inside list-disc text-sm text-slate-600">
            {s.impact.narrative.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
        ))}
      </div>
    </VyronPremiumPageShell>
  );
}

const INDUSTRY_LABELS: Record<string, string> = {
  food_manufacturing: "Food Manufacturing",
  hospitality: "Hospitality",
  retail: "Retail",
  manufacturing: "Manufacturing",
  distribution: "Distribution",
};

export function AiBenchmarksClient({
  industry,
  multiCompany,
}: {
  industry: IndustryBenchmark[];
  multiCompany: AiFinancialIntelligencePayload["multiCompany"];
}) {
  const industries = ["food_manufacturing", "hospitality", "retail", "manufacturing", "distribution"] as const;

  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Financial Intelligence",
        title: "Industry Benchmark Command Centre",
        subtitle: "Compare internal financial performance to sector benchmarks and group architecture signals.",
        outcomes: ["Benchmark against sector peers", "Highlight better/worse operating zones", "Support multi-company intelligence readiness"],
        formulas: ["Comparison = Your Metric vs Industry Average", "Status mapped to better/worse/neutral", "Group architecture tracks cross-entity capability"],
        intelligenceItems: [
          { label: "Benchmark metrics", detail: `${industry.length} benchmark indicators in current set` },
          { label: "Companies registered", detail: `${multiCompany.companies.length} entities in group architecture` },
        ],
      }}
    >
      <section className="grid gap-10">
        <div className="rounded-[2rem] border border-dashed border-violet-200 bg-violet-50/50 p-6">
        <h2 className="font-black text-violet-950">Multi-company intelligence (architecture ready)</h2>
        <p className="mt-2 text-sm text-violet-900">
          Group ID: {multiCompany.groupId} · {multiCompany.companies.length} entit{multiCompany.companies.length === 1 ? "y" : "ies"} registered
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {multiCompany.features.map((f) => (
            <li key={f} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">
              {f}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {multiCompany.companies.map((c) => (
            <span key={c.companyId} className="rounded-full bg-white px-3 py-1 text-xs font-black">
              {c.label} · {INDUSTRY_LABELS[c.industry] || c.industry}
            </span>
          ))}
        </div>
      </div>

        <div>
        <h2 className="text-xl font-black">Industry benchmarking</h2>
        <p className="mt-1 text-sm text-slate-600">Primary sector: Food Manufacturing — comparisons use live operational metrics.</p>
        <div className="mt-4 overflow-hidden rounded-[2rem] bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Metric</th>
                <th className="px-4 py-3">Your value</th>
                <th className="px-4 py-3">Industry avg</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {industry.map((b) => (
                <tr key={b.label} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold">{b.label}</td>
                  <td className="px-4 py-3 font-black">
                    {b.yourMetric}
                    {b.unit}
                  </td>
                  <td className="px-4 py-3">
                    {b.industryAvg}
                    {b.unit}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    <span
                      className={
                        b.comparison === "better"
                          ? "font-black text-[#84CC16]"
                          : b.comparison === "worse"
                            ? "font-black text-red-600"
                            : "font-black text-fuchsia-600"
                      }
                    >
                      {b.comparison}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {industries.map((id) => (
            <span
              key={id}
              className={`rounded-full px-3 py-1 text-xs font-black ${id === "food_manufacturing" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {INDUSTRY_LABELS[id]}
            </span>
          ))}
        </div>
        </div>
      </section>
    </VyronPremiumPageShell>
  );
}
