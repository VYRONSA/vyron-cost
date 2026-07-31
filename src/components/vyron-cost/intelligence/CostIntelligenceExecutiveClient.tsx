"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  RefreshCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { VyronPremiumPageShell } from "@/components/vyron-premium/VyronPremiumPageShell";
import { VYRON_MASTER } from "@/components/vyron-ui";
import type { CostAiInsight, CostAiInsightDashboard } from "@/lib/vyron-cost-ai-insights";

const M = VYRON_MASTER;

function priorityClass(priority: string) {
  if (priority === "Critical") return "border-rose-200 bg-rose-50 text-rose-800";
  if (priority === "High") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900";
  if (priority === "Medium") return "border-violet-200 bg-violet-50 text-violet-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function typeIcon(type: string) {
  if (type === "Demand Increase") return TrendingUp;
  if (type === "Demand Decline") return TrendingDown;
  return AlertTriangle;
}

function InsightCard({ insight }: { insight: CostAiInsight }) {
  const Icon = typeIcon(insight.insight_type);
  const body = (
    <article className="rounded-2xl border border-[#E2E8F0] bg-white p-5 transition hover:border-[#1D6BFF]/30 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1D6BFF]/10 text-[#1D6BFF]">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">
              {insight.insight_type}
            </div>
            <h3 className="mt-1 font-bold text-[#0F172A]">{insight.title}</h3>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${priorityClass(insight.priority)}`}>
          {insight.priority}
        </span>
      </div>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">Problem</dt>
          <dd className="mt-1 font-medium text-[#334155]">{insight.problem}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#94A3B8]">Impact</dt>
          <dd className="mt-1 font-medium text-[#334155]">{insight.impact}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#1D6BFF]">Recommendation</dt>
          <dd className="mt-1 font-semibold text-[#0F172A]">{insight.recommendation}</dd>
        </div>
      </dl>

      {insight.href ? (
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#1D6BFF]">
          View detail <ArrowRight size={14} />
        </span>
      ) : null}
    </article>
  );

  if (insight.href) {
    return (
      <Link href={insight.href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

function InsightSection({
  title,
  subtitle,
  insights,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  insights: CostAiInsight[];
  emptyMessage: string;
}) {
  return (
    <section className={M.moduleDataSection}>
      <div className="mb-4">
        <h2 className="text-lg font-black text-[#0F172A]">{title}</h2>
        <p className="mt-1 text-sm font-medium text-[#64748B]">{subtitle}</p>
      </div>
      {insights.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E2E8F0] px-4 py-8 text-center text-sm font-medium text-[#64748B]">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.insight_key} insight={insight} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function CostIntelligenceExecutiveClient({ companyName }: { companyName: string }) {
  const [dashboard, setDashboard] = useState<CostAiInsightDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cost-ai-insights", { cache: "no-store" });
      const data = await response.json();
      if (data.ok) {
        setDashboard(data.dashboard);
        return;
      }
      setError(data.error || "Could not load cost intelligence.");
    } catch {
      setError("Could not load cost intelligence.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refreshInsights() {
    setSaving(true);
    try {
      const response = await fetch("/api/cost-ai-insights", { method: "POST" });
      const data = await response.json();
      if (!data.ok) {
        setError(data.error || "Could not refresh insights.");
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setError("Could not refresh insights.");
    } finally {
      setSaving(false);
    }
  }

  const stats = dashboard?.stats;

  return (
    <VyronPremiumPageShell
      config={{
        badge: "AI Cost Intelligence",
        title: "Cost Intelligence Command Centre",
        subtitle: `Deterministic business intelligence for ${companyName} — demand, margin, supplier, inventory and procurement signals.`,
        outcomes: [
          "Priority-ranked insights from live operational data",
          "Problem, impact and recommendation on every signal",
          "No external AI — rules-based decision support",
        ],
      }}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void refreshInsights()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1D6BFF] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <RefreshCcw size={16} className={saving ? "animate-spin" : ""} />
            {saving ? "Refreshing…" : "Refresh Insights"}
          </button>
          <Link href="/demand-forecast" className="rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-bold text-[#334155]">
            Demand Forecast
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Total Insights" value={loading ? "…" : String(stats?.totalInsights ?? 0)} icon={BrainCircuit} />
          <KpiCard label="Critical" value={loading ? "…" : String(stats?.criticalCount ?? 0)} accent="#2563EB" icon={AlertTriangle} />
          <KpiCard label="High" value={loading ? "…" : String(stats?.highCount ?? 0)} accent="#C026D3" icon={AlertTriangle} />
          <KpiCard label="Medium" value={loading ? "…" : String(stats?.mediumCount ?? 0)} accent="#1D6BFF" icon={Sparkles} />
          <KpiCard label="Low" value={loading ? "…" : String(stats?.lowCount ?? 0)} accent="#64748B" icon={Sparkles} />
        </section>

        {loading ? (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-4 py-12 text-center text-sm font-semibold text-[#64748B]">
            Analysing store orders, forecasts, inventory, production and procurement…
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-2">
              <InsightSection
                title="Top Risks"
                subtitle="Highest-priority threats to margin, supply and fulfilment."
                insights={dashboard?.topRisks ?? []}
                emptyMessage="No material risks detected on current data."
              />
              <InsightSection
                title="Top Opportunities"
                subtitle="Demand growth and procurement savings to capture."
                insights={dashboard?.topOpportunities ?? []}
                emptyMessage="No opportunities flagged yet — load more order and procurement history."
              />
            </div>

            <InsightSection
              title="Margin Watchlist"
              subtitle="Products below target gross profit."
              insights={dashboard?.marginWatchlist ?? []}
              emptyMessage="All tracked products are at or above target GP."
            />

            <InsightSection
              title="Supplier Watchlist"
              subtitle="Lead time, delivery and price movement signals."
              insights={dashboard?.supplierWatchlist ?? []}
              emptyMessage="No supplier risk signals on current master and PO data."
            />

            <InsightSection
              title="Demand Watchlist"
              subtitle="Growing and declining product demand from store order behaviour."
              insights={dashboard?.demandWatchlist ?? []}
              emptyMessage="Insufficient store order history for demand trend insights."
            />
          </>
        )}

        <section className={M.moduleDataSection}>
          <h2 className="text-lg font-black text-[#0F172A]">Data sources</h2>
          <p className="mt-1 text-sm font-medium text-[#64748B]">
            Insights are generated deterministically from operational modules — no external AI APIs.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: "Store Orders", href: "/store-orders" },
              { label: "Demand Forecast", href: "/demand-forecast" },
              { label: "Production Planning", href: "/production-planning" },
              { label: "Inventory", href: "/inventory/stock" },
              { label: "Procurement", href: "/procurement" },
              { label: "Purchase Orders", href: "/purchase-orders" },
              { label: "Product Margins", href: "/reports/product-margins" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-[#E2E8F0] bg-[#F6F7FB] px-4 py-2 text-sm font-semibold text-[#334155] hover:border-[#1D6BFF]/30 hover:text-[#1D6BFF]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </VyronPremiumPageShell>
  );
}

function KpiCard({
  label,
  value,
  accent = "#0F172A",
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: string;
  icon: typeof BrainCircuit;
}) {
  return (
    <div className={`${M.moduleDataSection} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748B]">{label}</div>
          <div className="mt-2 text-2xl font-bold" style={{ color: accent }}>
            {value}
          </div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center ${M.iconSubtle}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
